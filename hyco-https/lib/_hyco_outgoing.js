// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

const assert = require('assert').ok;
const Stream = require('stream');
const WS = require('ws');
const util = require('util');
const debug = require('util').debuglog('http');
const { Buffer } = require('buffer');
const {
  ERR_HTTP_HEADERS_SENT,
  ERR_HTTP_INVALID_HEADER_VALUE,
  ERR_HTTP_TRAILER_INVALID,
  ERR_INVALID_HTTP_TOKEN,
  ERR_INVALID_ARG_TYPE,
  ERR_INVALID_CHAR,
  ERR_METHOD_NOT_IMPLEMENTED,
  ERR_STREAM_CANNOT_PIPE,
  ERR_STREAM_WRITE_AFTER_END
} = require('./_hyco_errors').codes;
const outHeadersKey = 'outHeadersKey';
const maxControlChannelMessageSize = 64 * 1024;

// isCookieField performs a case-insensitive comparison of a provided string
// against the word "cookie." As of V8 6.6 this is faster than handrolling or
// using a case-insensitive RegExp.
function isCookieField(s) {
  return s.length === 6 && s.toLowerCase() === 'cookie';
}

const tokenRegExp = /^[\^_`a-zA-Z\-0-9!#$%&'*+.|~]+$/;
/**
 * Verifies that the given val is a valid HTTP token
 * per the rules defined in RFC 7230
 * See https://tools.ietf.org/html/rfc7230#section-3.2.6
 */
function checkIsHttpToken(val) {
  return tokenRegExp.test(val);
}

const headerCharRegex = /[^\t\x20-\x7e\x80-\xff]/;
/**
 * True if val contains an invalid field-vchar
 *  field-value    = *( field-content / obs-fold )
 *  field-content  = field-vchar [ 1*( SP / HTAB ) field-vchar ]
 *  field-vchar    = VCHAR / obs-text
 */
function checkInvalidHeaderChar(val) {
  return headerCharRegex.test(val);
}

const RE_CONN_CLOSE = /(?:^|\W)close(?:$|\W)/i;

function noopPendingOutput(amount) {}

function OutgoingMessage() {
  Stream.call(this);

  // request-id of incoming message for correlation
  this.requestId = null;
  
  // Queue that holds all currently pending data, until the response will be
  // assigned to the socket (until it will its turn in the HTTP pipeline).
  this.output = [];
  this.outputFrameBinary = [];
  this.outputCallbacks = [];

  // `outputSize` is an approximate measure of how much data is queued on this
  // response. `_onPendingData` will be invoked to update similar global
  // per-connection counter. That counter will be used to pause/unpause the
  // TCP socket and HTTP Parser and thus handle the backpressure.
  this.outputSize = 0;

  this.writable = true;

  this._last = false;
  this.chunkedEncoding = false;
  this.shouldKeepAlive = true;
  this.useChunkedEncodingByDefault = true;
  this.sendDate = false;
  this._removedConnection = false;
  this._removedContLen = false;
  this._removedTE = false;

  this._contentLength = null;
  this._hasBody = false;
  
  this.finished = false;
  this._headerSent = false;
  
  this.socket = null;
  this.connection = null;
  this._header = null;
  this[outHeadersKey] = null;
  this._headers = {};

  this._onPendingData = noopPendingOutput;
}
util.inherits(OutgoingMessage, Stream);


Object.defineProperty(OutgoingMessage.prototype, '_headers', {
  get: function() {
    return this.getHeaders();
  },
  set: function(val) {
    if (val == null) {
      this[outHeadersKey] = null;
    } else if (typeof val === 'object') {
      const headers = this[outHeadersKey] = {};
      const keys = Object.keys(val);
      for (var i = 0; i < keys.length; ++i) {
        const name = keys[i];
        headers[name.toLowerCase()] = [name, val[name]];
      }
    }
  }
});

Object.defineProperty(OutgoingMessage.prototype, '_headerNames', {
  get: function() {
    const headers = this[outHeadersKey];
    if (headers) {
      const out = Object.create(null);
      const keys = Object.keys(headers);
      for (var i = 0; i < keys.length; ++i) {
        const key = keys[i];
        const val = headers[key][0];
        out[key] = val;
      }
      return out;
    } else {
      return headers;
    }
  },
  set: function(val) {
    if (typeof val === 'object' && val !== null) {
      const headers = this[outHeadersKey];
      if (!headers)
        return;
      const keys = Object.keys(val);
      for (var i = 0; i < keys.length; ++i) {
        const header = headers[keys[i]];
        if (header)
          header[0] = val[keys[i]];
      }
    }
  }
});



OutgoingMessage.prototype.setTimeout = function setTimeout(msecs, callback) {

  if (callback) {
    this.on('timeout', callback);
  }

  if (!this.socket) {
    this.once('socket', function(socket) {
      socket.setTimeout(msecs);
    });
  } else {
    this.socket.setTimeout(msecs);
  }
  return this;
};


// It's possible that the socket will be destroyed, and removed from
// any messages, before ever calling this.  In that case, just skip
// it, since something else is destroying this connection anyway.
OutgoingMessage.prototype.destroy = function destroy(error) {
  if (this.socket) {
    this.socket.destroy(error);
  } else {
    this.once('socket', function(socket) {
      socket.destroy(error);
    });
  }
};


// This abstract either writing directly to the socket or buffering it.
OutgoingMessage.prototype._send = function _send(data, encoding, callback, fin) {
  if ( data ) {
    this._hasBody = true;
  }
  if (!this._headerSent) {
    this._writeResponsePreamble();
    this._headerSent = true;
  }
  return this._writeRaw(data, encoding, callback, fin);
};


OutgoingMessage.prototype._writeResponsePreamble = _writeResponsePreamble;
function _writeResponsePreamble(callback) {
  const conn = this.connection;
  if (conn && conn.readyState === WS.CLOSED) {
    // The socket was destroyed. If we're still trying to write to it,
    // then we haven't gotten the 'close' event yet.
    return false;
  }

  var hdrs = {};
  for( var k in this._headers) {
      //if ( k === "set-cookie" || k === "etag") continue;
      if ( this._headers[k] instanceof Array ) {
        hdrs[k] = this._headers[k][0];
      } else {
        hdrs[k] = this._headers[k];
      }
  }

  var response = { response : {
     requestId : this.requestId,
     statusCode : this.statusCode,
     statusDescription : this.statusMessage,
     responseHeaders : hdrs,
     body : this._hasBody
  }};
 
  var data = JSON.stringify(response);
  if (conn && conn.readyState === WS.OPEN) {
    if (this.output.length) {
      this._flushOutput(conn);
    }
    return conn.send(data, {binary : false, compress : false }, function ack(error) {
      if ( error ) {
        console.log(error);
      }
    });
  }

  // Buffer, as long as we're not destroyed.
  this.output.push(data);
  this.outputFrameBinary.push(false);
  this.outputCallbacks.push(callback);
  this.outputSize += data.length;
  this._onPendingData(data.length);
  return false;
}

OutgoingMessage.prototype._writeRaw = _writeRaw;
function _writeRaw(data, encoding, callback, fin) {
  const conn = this.connection;
  if (conn && conn.readyState === WS.CLOSED) {
    // The socket was destroyed. If we're still trying to write to it,
    // then we haven't gotten the 'close' event yet.
    return false;
  }

  if (typeof encoding === 'function') {
    callback = encoding;
    encoding = null;
  }

  if (conn && conn.readyState === WS.OPEN) {
    // There might be pending data in the this.output buffer.
    if (this.output.length) {
      this._flushOutput(conn);
    } else if (!data.length && !fin) {
      if (typeof callback === 'function') {
        callback();
      }
      return true;
    }
    // Directly write to socket.
    return conn.send(data, { binary : true, fin : fin }, function ack(error) {
      if ( error ) {
        console.log(error);
      }
    } );
  }
  // Buffer, as long as we're not destroyed.
  this.output.push(data);
  this.outputFrameBinary.push(true);
  this.outputCallbacks.push(callback);
  this.outputSize += data.length;
  this._onPendingData(data.length);
  return false;
}


OutgoingMessage.prototype._storeHeader = _storeHeader;
function _storeHeader(statusCode, statusMessage, headers) {
  
  this.statusCode = statusCode;
  this.statusMessage = statusMessage;

  var state = {
    connection: false,
    contLen: false,
    te: false,
    date: false,
    expect: false,
    upgrade: false,
    headers: {}
  };

  var field;
  var key;
  var value;
  var i;
  var j;
  if (headers === this[outHeadersKey]) {
    for (key in headers) {
      var entry = headers[key];
      field = entry[0];
      value = entry[1];

      if (value instanceof Array) {
        if (value.length < 2 || !isCookieField(field)) {
          for (j = 0; j < value.length; j++)
            storeHeader(this, state, field, value[j], false);
          continue;
        }
        value = value.join('; ');
      }
      storeHeader(this, state, field, value, false);
    }
  } else if (headers instanceof Array) {
    for (i = 0; i < headers.length; i++) {
      field = headers[i][0];
      value = headers[i][1];

      if (value instanceof Array) {
        for (j = 0; j < value.length; j++) {
          storeHeader(this, state, field, value[j], true);
        }
      } else {
        storeHeader(this, state, field, value, true);
      }
    }
  } else if (headers) {
    var keys = Object.keys(headers);
    for (i = 0; i < keys.length; i++) {
      field = keys[i];
      value = headers[field];

      if (value instanceof Array) {
        if (value.length < 2 || !isCookieField(field)) {
          for (j = 0; j < value.length; j++)
            storeHeader(this, state, field, value[j], true);
          continue;
        }
        value = value.join('; ');
      }
      storeHeader(this, state, field, value, true);
    }
  }

  // Date header
  // if (this.sendDate && !state.date) {
  //   this[outHeadersKey]['Date'] = utcDate();
  // }

  // Force the connection to close when the response is a 204 No Content or
  // a 304 Not Modified and the user has set a "Transfer-Encoding: chunked"
  // header.
  //
  // RFC 2616 mandates that 204 and 304 responses MUST NOT have a body but
  // node.js used to send out a zero chunk anyway to accommodate clients
  // that don't have special handling for those responses.
  //
  // It was pointed out that this might confuse reverse proxies to the point
  // of creating security liabilities, so suppress the zero chunk and force
  // the connection to close.
  var statusCode = this.statusCode;
    
  // wait until the first body chunk, or close(), is sent to flush,
  // UNLESS we're sending Expect: 100-continue.
  if (state.expect) this._send('');
}

function storeHeader(self, state, key, value, validate) {
  if (validate) {
    validateHeader(key, value);
  }
  matchHeader(self, state, key, value);
}

function matchHeader(self, state, field, value) {
  if (field.length < 4 || field.length > 17)
    return;
  field = field.toLowerCase();
  switch (field) {
    case 'connection':
      state.connection = true;
      if (RE_CONN_CLOSE.test(value))
        self._last = true;
      else
        self.shouldKeepAlive = true;
      break;
    case 'content-length':
      state.contLen = true;
      break;
    case 'date':
    case 'expect':
    case 'upgrade':
      state[field] = true;
      break;
  }
}

function validateHeader(name, value) {
  let err;
  if (typeof name !== 'string' || !name || !checkIsHttpToken(name)) {
    err = new ERR_INVALID_HTTP_TOKEN('Header name', name);
  } else if (value === undefined) {
    err = new ERR_HTTP_INVALID_HEADER_VALUE(value, name);
  } else if (checkInvalidHeaderChar(value)) {
    debug('Header "%s" contains invalid characters', name);
    err = new ERR_INVALID_CHAR('header content', name);
  }
  if (err !== undefined) {
    Error.captureStackTrace(err, validateHeader);
    throw err;
  }
}

OutgoingMessage.prototype.setHeader = function setHeader(name, value) {
  if (this._header) {
    throw new ERR_HTTP_HEADERS_SENT('set');
  }
  validateHeader(name, value);

  if (!this[outHeadersKey])
    this[outHeadersKey] = {};

  const key = name.toLowerCase();
  if ( key === 'content-length' ) {
    return;
  }
  this[outHeadersKey][key] = [name, value];

  switch (key) {
    case 'connection':
      this._removedConnection = false;
      break;
    case 'content-length':
      this._removedContLen = false;
      break;
    case 'transfer-encoding':
      this._removedTE = false;
      break;
  }
};



OutgoingMessage.prototype.getHeader = function getHeader(name) {
  if (typeof name !== 'string') {
    throw new ERR_INVALID_ARG_TYPE('name', 'string', name);
  }

  if (!this[outHeadersKey]) return;

  var entry = this[outHeadersKey][name.toLowerCase()];
  if (!entry)
    return;
  return entry[1];
};


// Returns an array of the names of the current outgoing headers.
OutgoingMessage.prototype.getHeaderNames = function getHeaderNames() {
  return (this[outHeadersKey] ? Object.keys(this[outHeadersKey]) : []);
};


// Returns a shallow copy of the current outgoing headers.
OutgoingMessage.prototype.getHeaders = function getHeaders() {
  const headers = this[outHeadersKey];
  const ret = Object.create(null);
  if (headers) {
    const keys = Object.keys(headers);
    for (var i = 0; i < keys.length; ++i) {
      const key = keys[i];
      const val = headers[key][1];
      ret[key] = val;
    }
  }
  return ret;
};


OutgoingMessage.prototype.hasHeader = function hasHeader(name) {
  if (typeof name !== 'string') {
    throw new ERR_INVALID_ARG_TYPE('name', 'string', name);
  }

  return !!(this[outHeadersKey] && this[outHeadersKey][name.toLowerCase()]);
};


OutgoingMessage.prototype.removeHeader = function removeHeader(name) {
  if (typeof name !== 'string') {
    throw new ERR_INVALID_ARG_TYPE('name', 'string', name);
  }

  if (this._header) {
    throw new ERR_HTTP_HEADERS_SENT('remove');
  }

  var key = name.toLowerCase();

  switch (key) {
    case 'connection':
      this._removedConnection = true;
      break;
    case 'content-length':
      this._removedContLen = true;
      break;
    case 'transfer-encoding':
      this._removedTE = true;
      break;
    case 'date':
      this.sendDate = false;
      break;
  }

  if (this[outHeadersKey]) {
    delete this[outHeadersKey][key];
  }
};


OutgoingMessage.prototype._implicitHeader = function _implicitHeader() {
  this.emit('error', new ERR_METHOD_NOT_IMPLEMENTED('_implicitHeader()'));
};

Object.defineProperty(OutgoingMessage.prototype, 'headersSent', {
  configurable: true,
  enumerable: true,
  get: function() { return !!this._header; }
});


const crlf_buf = Buffer.from('\r\n');
OutgoingMessage.prototype.write = function write(chunk, encoding, callback) {
  return write_(this, chunk, encoding, callback, false);
};

function write_(msg, chunk, encoding, callback, fromEnd) {
  
  if (msg.finished) {
    const err = new ERR_STREAM_WRITE_AFTER_END();
    const triggerAsyncId = msg.socket ? msg.socket[async_id_symbol] : undefined;
    // defaultTriggerAsyncIdScope(triggerAsyncId,
    //                            process.nextTick,
    //                            writeAfterEndNT,
    //                            msg,
    //                            err,
    //                            callback);

    return true;
  }

  if (!msg._header) {
    msg._implicitHeader();
  }

  if (!msg._hasBody) {
    debug('This type of response MUST NOT have a body. ' +
          'Ignoring write() calls.');
    return true;
  }

  if (!fromEnd && typeof chunk !== 'string' && !(chunk instanceof Buffer)) {
    throw new ERR_INVALID_ARG_TYPE('first argument',
                                   ['string', 'Buffer'], chunk);
  }


  // If we get an empty string or buffer, then just do nothing, and
  // signal the user to keep writing.
  if (chunk.length === 0) return true;

  var ret = msg._send(chunk, encoding, callback, fromEnd);
  
  debug('write ret = ' + ret);
  return ret;
}


function writeAfterEndNT(msg, err, callback) {
  msg.emit('error', err);
  if (callback) callback(err);
}

function escapeHeaderValue(value) {
  // Protect against response splitting. The regex test is there to
  // minimize the performance impact in the common case.
  return /[\r\n]/.test(value) ? value.replace(/[\r\n]+[ \t]*/g, '') : value;
}

function onFinish(outmsg) {
  outmsg.emit('finish');
}

function onServerResponseClose() {
  // EventEmitter.emit makes a copy of the 'close' listeners array before
  // calling the listeners. detachSocket() unregisters onServerResponseClose
  // but if detachSocket() is called, directly or indirectly, by a 'close'
  // listener, onServerResponseClose is still in that copy of the listeners
  // array. That is, in the example below, b still gets called even though
  // it's been removed by a:
  //
  //   var EventEmitter = require('events');
  //   var obj = new EventEmitter();
  //   obj.on('event', a);
  //   obj.on('event', b);
  //   function a() { obj.removeListener('event', b) }
  //   function b() { throw "BAM!" }
  //   obj.emit('event');  // throws
  //
  // Ergo, we need to deal with stale 'close' events and handle the case
  // where the ServerResponse object has already been deconstructed.
  // Fortunately, that requires only a single if check. :-)
  if (this._httpMessage) this._httpMessage.emit('close');
}

OutgoingMessage.prototype.assignSocket = function assignSocket() {
  var webSocket = null;
  if (this._rendezvousChannel) {
    // A rendezvous socket has been assigned
    webSocket = this._rendezvousChannel;
    webSocket._httpMessage = this;
    webSocket.on('close', onServerResponseClose);
  } else {
    // No socket assigned yet, check the message size to decide between the control channel or a new rendezvous
    if (this._contentLength <= maxControlChannelMessageSize) {
      webSocket = this._controlChannel;
    } else {
      webSocket = new WS(this._rendezvousAddress, {
        perMessageDeflate: false
      });
    }
  }
  this.socket = webSocket;
  this.connection = webSocket;
  this.emit('socket', webSocket);
  this._flush();
};

OutgoingMessage.prototype.detachSocket = function detachSocket(webSocket) {
  assert(socket._httpMessage === this);
  socket.removeListener('close', onServerResponseClose);
  socket._httpMessage = null;
  this.socket = this.connection = null;
};

OutgoingMessage.prototype.end = function end(chunk, encoding, callback) {
  if (typeof chunk === 'function') {
    callback = chunk;
    chunk = null;
  } else if (typeof encoding === 'function') {
    callback = encoding;
    encoding = null;
  }

  if (this.finished) {
    return this;
  }

  if (chunk) {
    this._hasBody = true;
    if (typeof chunk !== 'string' && !(chunk instanceof Buffer)) {
      throw new ERR_INVALID_ARG_TYPE('chunk', ['string', 'Buffer'], chunk);
    }
    if (!this._header) {
      var length = (typeof chunk === 'string') ? Buffer.byteLength(chunk, encoding) : chunk.length;
      if (length <= maxControlChannelMessageSize) 
        this._contentLength = length;
    }
    this.assignSocket();
    write_(this, chunk, encoding, null, true);
  } else {
    if (!this._header) {
      this._contentLength = 0;
      this._implicitHeader();
    }
    // force the FIN frame
    this._send('', null, null, true);
  }

  if (typeof callback === 'function')
    this.once('finish', callback);

  var finish = onFinish.bind(undefined, this);

  this.finished = true;

  // There is the first message on the outgoing queue, and we've sent
  // everything to the socket.
  debug('outgoing message end.');
  if (this.output.length === 0 &&
      this.connection &&
      this.connection._httpMessage === this) {
    this._finish();
  }

  return this;
};


OutgoingMessage.prototype._finish = function _finish() {
  assert(this.connection);
  this.emit('prefinish');
};


// This logic is probably a bit confusing. Let me explain a bit:
//
// In both HTTP servers and clients it is possible to queue up several
// outgoing messages. This is easiest to imagine in the case of a client.
// Take the following situation:
//
//    req1 = client.request('GET', '/');
//    req2 = client.request('POST', '/');
//
// When the user does
//
//   req2.write('hello world\n');
//
// it's possible that the first request has not been completely flushed to
// the socket yet. Thus the outgoing messages need to be prepared to queue
// up data internally before sending it on further to the socket's queue.
//
// This function, outgoingFlush(), is called by both the Server and Client
// to attempt to flush any pending messages out to the socket.
OutgoingMessage.prototype._flush = function _flush() {
  var socket = this.socket;
  var ret;

  if (socket && socket.writable) {
    // There might be remaining data in this.output; write it out
    ret = this._flushOutput(socket);

    if (this.finished) {
      // This is a queue to the server or client to bring in the next this.
      this._finish();
    } else if (ret) {
      // This is necessary to prevent https from breaking
      this.emit('drain');
    }
  }
};

OutgoingMessage.prototype._flushOutput = function _flushOutput(socket) {
  var ret;
  var outputLength = this.output.length;
  if (outputLength <= 0)
    return ret;

  var output = this.output;
  var outputCallbacks = this.outputCallbacks;
  for (var i = 0; i < outputLength; i++) {
    ret = socket.send(output[i], { binary: this.outputFrameBinary[i], fin : false}, outputCallbacks[i]);
  }
  
  this.output = [];
  this.outputCallbacks = [];
  this._onPendingData(-this.outputSize);
  this.outputSize = 0;

  return ret;
};


OutgoingMessage.prototype.flushHeaders = function flushHeaders() {
  if (!this._header) {
    this._implicitHeader();
  }

  // Force-flush the headers.
  this._send('');
};

OutgoingMessage.prototype.flush = function() {
  this.flushHeaders();
};

OutgoingMessage.prototype.pipe = function pipe() {
  // OutgoingMessage should be write-only. Piping from it is disabled.
  this.emit('error', new ERR_STREAM_CANNOT_PIPE());
};

module.exports = {
  OutgoingMessage
};
