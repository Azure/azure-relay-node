
'use strict';

const util = require('util');
const EventEmitter = require('events');
const crypto = require('crypto');
const WebSocket = require('ws');
const url = require('url');
const moment = require('moment');
const assert = require('assert');

// slightly awful workaround to pull submodules
var https = require.cache[require.resolve('https')]
const { IncomingMessage } = require('./_hyco_incoming');
const { OutgoingMessage } = require('./_hyco_outgoing');
//const Extensions = wsc.require('./lib/Extensions');
//const PerMessageDeflate = wsc.require('./lib/PerMessageDeflate');

const outHeadersKey = 'outHeadersKey';

const {
  ERR_HTTP_HEADERS_SENT,
  ERR_HTTP_INVALID_STATUS_CODE,
  ERR_INVALID_CHAR
} = require('./_hyco_errors').codes;

const STATUS_CODES = {
  100: 'Continue',
  101: 'Switching Protocols',
  102: 'Processing',                 // RFC 2518, obsoleted by RFC 4918
  103: 'Early Hints',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  207: 'Multi-Status',               // RFC 4918
  208: 'Already Reported',
  226: 'IM Used',
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  305: 'Use Proxy',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',         // RFC 7238
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Range Not Satisfiable',
  417: 'Expectation Failed',
  418: 'I\'m a teapot',              // RFC 2324
  421: 'Misdirected Request',
  422: 'Unprocessable Entity',       // RFC 4918
  423: 'Locked',                     // RFC 4918
  424: 'Failed Dependency',          // RFC 4918
  425: 'Unordered Collection',       // RFC 4918
  426: 'Upgrade Required',           // RFC 2817
  428: 'Precondition Required',      // RFC 6585
  429: 'Too Many Requests',          // RFC 6585
  431: 'Request Header Fields Too Large', // RFC 6585
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates',    // RFC 2295
  507: 'Insufficient Storage',       // RFC 4918
  508: 'Loop Detected',
  509: 'Bandwidth Limit Exceeded',
  510: 'Not Extended',               // RFC 2774
  511: 'Network Authentication Required' // RFC 6585
};


var isDefinedAndNonNull = function(options, key) {
  return typeof options[key] != 'undefined' && options[key] !== null;
};

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

function ServerResponse(req) {
  OutgoingMessage.call(this);
  this._hasBody = (req.method !== 'HEAD');  
  this.sendDate = true;
  this._sent100 = false;
  this._expect_continue = false;
}
util.inherits(ServerResponse, OutgoingMessage);

ServerResponse.prototype._finish = function _finish() {
  DTRACE_HTTP_SERVER_RESPONSE && DTRACE_HTTP_SERVER_RESPONSE(this.connection);
  //COUNTER_HTTP_SERVER_RESPONSE();
  OutgoingMessage.prototype._finish.call(this);
};


ServerResponse.prototype.statusCode = 200;
ServerResponse.prototype.statusMessage = undefined;

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

ServerResponse.prototype.assignSocket = function assignSocket(webSocket) {
  // (!webSocket._httpMessage) implies that it's a rendezvous connection
  // We don't want to close the websocket if it's the control channel we are sending over
  if (!webSocket._httpMessage) {
    webSocket._httpMessage = this;
    webSocket.on('close', onServerResponseClose);
  }
  this.socket = webSocket;
  this.connection = webSocket;
  this.emit('socket', webSocket);
  this._flush();
};

ServerResponse.prototype.detachSocket = function detachSocket(webSocket) {
  assert(socket._httpMessage === this);
  socket.removeListener('close', onServerResponseClose);
  socket._httpMessage = null;
  this.socket = this.connection = null;
};

ServerResponse.prototype.writeContinue = function writeContinue(cb) {
  // foo
  this._sent100 = true;
};

ServerResponse.prototype.writeProcessing = function writeProcessing(cb) {
  // foo
};

ServerResponse.prototype._implicitHeader = function _implicitHeader() {
  this.writeHead(this.statusCode);
};

ServerResponse.prototype.writeHead = writeHead;
function writeHead(statusCode, reason, obj) {
  var originalStatusCode = statusCode;

  statusCode |= 0;
  if (statusCode < 100 || statusCode > 999) {
    throw new ERR_HTTP_INVALID_STATUS_CODE(originalStatusCode);
  }


  if (typeof reason === 'string') {
    // writeHead(statusCode, reasonPhrase[, headers])
    this.statusMessage = reason;
  } else {
    // writeHead(statusCode[, headers])
    if (!this.statusMessage)
      this.statusMessage = STATUS_CODES[statusCode] || 'unknown';
    obj = reason;
  }
  this.statusCode = statusCode;

  var headers;
  if (this[outHeadersKey]) {
    // Slow-case: when progressive API and header fields are passed.
    var k;
    if (obj) {
      var keys = Object.keys(obj);
      for (var i = 0; i < keys.length; i++) {
        k = keys[i];
        if (k) this.setHeader(k, obj[k]);
      }
    }
    if (k === undefined && this._header) {
      throw new ERR_HTTP_HEADERS_SENT('render');
    }
    // only progressive api is used
    headers = this[outHeadersKey];
  } else {
    // only writeHead() called
    headers = obj;
  }

  if (checkInvalidHeaderChar(this.statusMessage))
    throw new ERR_INVALID_CHAR('statusMessage');

  if (statusCode === 204 || statusCode === 304 ||
      (statusCode >= 100 && statusCode <= 199)) {
    // RFC 2616, 10.2.5:
    // The 204 response MUST NOT include a message-body, and thus is always
    // terminated by the first empty line after the header fields.
    // RFC 2616, 10.3.5:
    // The 304 response MUST NOT contain a message-body, and thus is always
    // terminated by the first empty line after the header fields.
    // RFC 2616, 10.1 Informational 1xx:
    // This class of status code indicates a provisional response,
    // consisting only of the Status-Line and optional headers, and is
    // terminated by an empty line.
    this._hasBody = false;
  }

  // don't keep alive connections where the client expects 100 Continue
  // but we sent a final status; they may put extra bytes on the wire.
  if (this._expect_continue && !this._sent100) {
    this.shouldKeepAlive = false;
  }

  this._storeHeader(this.statusCode, this.statusMessage, headers);
}

// Docs-only deprecated: DEP0063
ServerResponse.prototype.writeHeader = ServerResponse.prototype.writeHead;


/**
 * WebSocket Server implementation
 */
function Server(options, requestListener) {
  if (!(this instanceof Server)) {
    return new Server(options, requestListener);
  }
  
  if (typeof options === 'function') {
    requestListener = options;
    options = {};
  } else if (options == null || typeof options === 'object') {
    options = util._extend({}, options);
  }

  options = Object.assign({
    server: null,
    token: null,
    id: null,
    keepAliveTimeout: null
  }, options);

  if (!isDefinedAndNonNull(options, 'server')) {
    throw new TypeError('\'server\' must be provided');
  }

  if (!isDefinedAndNonNull(options, 'token')) {
    throw new TypeError('A \'token\' string or function must be provided');
  }

  var self = this;

  this.listenUri = options.server;
  if (isDefinedAndNonNull(options, 'id')) {
    this.listenUri = listenUri + '&id=' + options.id;
  }

  this.pendingRequest = null;
  this.closeRequested = false;
  this.options = options;
  this.path = options.path;
  this.clients = [];

  if (requestListener) {
    this.on('request', requestListener);
  }
  this.timeout = 2 * 60 * 1000;
  this.on('requestchannel', function(channel) { requestChannelListener(self, channel) });
}

/**
 * Inherits from EventEmitter.
 */

util.inherits(Server, EventEmitter);


Server.prototype.setTimeout = function setTimeout(msecs, callback) {
  this.timeout = msecs;
  if (callback)
    this.on('timeout', callback);
  return this;
};

/*
  Listener
 */
Server.prototype.listen = function () {
  // connect the control channel to stary listening
  connectControlChannel(this);
}


/**
 * Immediately shuts down the connection.
 *
 * @api public
 */
Server.prototype.close = function(callback) {
  this.closeRequested = true;
  // terminate all associated clients
  var error = null;
  try {
    for (var i = 0, l = this.clients.length; i < l; ++i) {
      this.clients[i].close();
    }
    this.controlChannel.close();
  }
  catch (e) {
    error = e;
  }

  if (callback) {
    callback(error);
  } else if (error) {
    throw error;
  }
}

/* 
 * create the control channel connection 
 */
function connectControlChannel(server) {
  var opt = null;
  var token = null;
  var tokenRenewDuration = null;
  if (typeof server.options.token === 'function') {
    // server.options.token is a function, call it periodically to renew the token
    tokenRenewDuration = new moment.duration(1, 'hours');
    token = server.options.token();
  } else {
    // server.options.token is a string, the token cannot be renewed automatically
    token = server.options.token;
  }

  if (token) {
    opt = { headers: { 'ServiceBusAuthorization': token } };
  }

  server.controlChannel = new WebSocket(server.listenUri, null, opt);

  // This represents the token renew timer/interval, keep a reference in order to cancel it.
  var tokenRenewTimer = null;

  // KeepAlive interval to detect half-open connections
  var keepAliveTimer = null;

  var clearIntervals = function() {
    clearInterval(tokenRenewTimer);
    clearInterval(keepAliveTimer);
  }

  server.controlChannel.onerror = function(event) {
    server.emit('error', event);
    clearIntervals();
    if (!server.closeRequested) {
      connectControlChannel(server);
    }
  }

  server.controlChannel.onopen = function(event) {
    server.emit('listening');

    var keepAliveInterval = null;
    try {
      if (server.options.keepAliveTimeout) {
        keepAliveInterval = server.options.keepAliveTimeout.asMilliseconds();
      }
    } catch (ex) {
      console.log("keepAliveTimeout should be an instance of moment.duration");
    }
    if (keepAliveInterval) {
      keepAliveTimer = setInterval(function() {
        try {
          server.controlChannel.pong();
        } catch (e) {
          server.controlChannel.onclose();
        }
      }, keepAliveInterval);
    }
  }

  server.controlChannel.onclose = function(event) {
    clearIntervals();

    if (!server.closeRequested) {
      // reconnect
      connectControlChannel(server);
    } else {
      server.emit('close', server);
    }
  }

  server.controlChannel.onmessage = function(event) {
    
    if ( server.pendingRequest != null ) {
      server.pendingRequest.handleBody(event.data);
      server.pendingRequest = null;
      return;
    }

    var message = JSON.parse(event.data);
    
    if (isDefinedAndNonNull(message, 'accept')) {
      // WebSocket rendezvous
      accept(server, message);
    } else if (isDefinedAndNonNull(message, 'request')) {
      // HTTP request
      controlChannelRequest(server, message);
    }
  };

  if (tokenRenewDuration) {
    // tokenRenewDuration having a value means server.options.token is a function, renew the token periodically
    tokenRenewTimer = setInterval(function() {
      if (!server.closeRequested) {
        var newToken = server.options.token();
        var renewToken = { 'renewToken' : { 'token' : newToken } };
        server.controlChannel.send(
          JSON.stringify(renewToken),
          function(error) {
            if (error) {
              console.log('renewToken error: ' + error);
            }
          }
        );
      }
    },
    tokenRenewDuration.asMilliseconds());
  }
}

/* 
 * accept a web socket upgrade
 */
function accept(server, message) {
  var address = message.accept.address;
  var req = { headers: {} };
  var headers = [];

  for (var keys = Object.keys(message.accept.connectHeaders), l = keys.length; l; --l) {
    req.headers[keys[l - 1].toLowerCase()] = message.accept.connectHeaders[keys[l - 1]];
  }
  // verify key presence
  if (!req.headers['sec-websocket-key']) {
    abortConnection(message, 400, 'Bad Request');
    return;
  }

  // verify version
  var version = parseInt(req.headers['sec-websocket-version']);
  // verify protocol
  var protocols = req.headers['sec-websocket-protocol'];

  // verify client
  var origin = version < 13 ?
    req.headers['sec-websocket-origin'] :
    req.headers['origin'];

  // handle extensions offer
  var extensionsOffer = Extensions.parse(req.headers['sec-websocket-extensions']);

  // handler to call when the connection sequence completes
  var self = server;
  var completeHybiUpgrade2 = function(protocol) {

    var extensions = {};
    try {
      extensions = acceptExtensions.call(self, extensionsOffer);
    } catch (err) {
      abortConnection(message, 400, 'Bad Request');
      return;
    }

    if (Object.keys(extensions).length) {
      var serverExtensions = {};
      Object.keys(extensions).forEach(function(token) {
        serverExtensions[token] = [extensions[token].params]
      });
      headers.push('Sec-WebSocket-Extensions: ' + Extensions.format(serverExtensions));
    }

    // allows external modification/inspection of handshake headers
    self.emit('headers', headers);

    try {
      var client = new WebSocket(address, protocol, {
        headers: headers,
        perMessageDeflate: false
      });

      client.on('error', function(event) {
        var index = server.clients.indexOf(client);
        if (index != -1) {
          server.clients.splice(index, 1);
        }
      });

      server.emit('connection', client);
      if (self.options.clientTracking) {
        self.clients.push(client);
        client.on('close', function() {
          var index = self.clients.indexOf(client);
          if (index != -1) {
            self.clients.splice(index, 1);
          }
        });
      }
    } catch (err) {
      console.log(err);
    }
  }

  // optionally call external protocol selection handler before
  // calling completeHybiUpgrade2
  var completeHybiUpgrade1 = function() {
    // choose from the sub-protocols
    if (typeof self.options.handleProtocols == 'function') {
      var protList = (protocols || '').split(/, */);
      var callbackCalled = false;
      self.options.handleProtocols(protList, function(result, protocol) {
        callbackCalled = true;
        if (!result) abortConnection(socket, 401, 'Unauthorized');
        else completeHybiUpgrade2(protocol);
      });
      if (!callbackCalled) {
        // the handleProtocols handler never called our callback
        abortConnection(socket, 501, 'Could not process protocols');
      }
      return;
    } else {
      if (typeof protocols !== 'undefined') {
        completeHybiUpgrade2(protocols.split(/, */)[0]);
      }
      else {
        completeHybiUpgrade2();
      }
    }
  }

  completeHybiUpgrade1();
}

function acceptExtensions(offer) {
  var extensions = {};
  var options = this.options.perMessageDeflate;
  var maxPayload = this.options.maxPayload;
  if (options && offer[PerMessageDeflate.extensionName]) {
    var perMessageDeflate = new PerMessageDeflate(options !== true ? options : {}, true, maxPayload);
    perMessageDeflate.accept(offer[PerMessageDeflate.extensionName]);
    extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
  }
  return extensions;
}

/* 
 * accept a control-channel request
 */
function controlChannelRequest(server, message) {
  var address = message.request.address;
  var req = { headers: {} };
  var headers = [];

  // handler to call when the connection sequence completes
  var self = server;
  
  if (message.request.method === "GET" || message.request.body) {
    // we received a GET request or a small POST http request
    // the response should be sent over the control channel
    req = new IncomingMessage(message, server.controlChannel);
    if ( message.request.body == true) {
       self.pendingRequest = req;
    } else {
      req.push(null);
    }

    var res = new ServerResponse(req);
    res.requestId = message.request.id;
    res.assignSocket(server.controlChannel);
    server.emit('request', req, res);
  } else {
    // we received a chunked request or a large (>64kb) request
    // execute the web socket rendezvous with the server
    try {
      var client = new WebSocket(address, {
        headers: headers,
        perMessageDeflate: false
      });
      client.on('open', function() {
        
        server.emit('requestchannel', client);
        if (self.options.clientTracking) {
          self.clients.push(client);
          ws.on('close', function() {
            var index = self.clients.indexOf(client);
            if (index != -1) {
              self.clients.splice(index, 1);
            }
          });
        }
      });

      client.on('error', function(event) {
        var index = server.clients.indexOf(client);
        if (index != -1) {
          server.clients.splice(index, 1);
        }
      });

    } catch (err) {
      console.log(err);
    }
  }
}

/* 
 * accept a control-channel request
 */
function requestChannelRequest(server, channel, message) {
  try {
    var res = null;
    // do we have a request or is this just rendezvous?
    var req = new IncomingMessage(message, channel);
    if ( message.request.body == true) {
      channel.pendingRequest = req;
    } else {
      req.push(null);
    }
    res = new ServerResponse(req);
    res.requestId = message.request.id;
    res.assignSocket(channel);
    server.emit('request', req, res);
  } catch (err) {
    console.log(err);
  }
}

function requestChannelListener(server, requestChannel) {
  
  requestChannel.onmessage = function(event) {
    
    if ( requestChannel.pendingRequest != null )
    {
      requestChannel.pendingRequest.handleBody(event.data);
      requestChannel.pendingRequest = null;
      return;
    }
    var message = JSON.parse(event.data);
    
    if (isDefinedAndNonNull(message, 'request')) {
      // HTTP request
      requestChannelRequest(server, requestChannel, message);
    }
  };
}

function abortConnection(message, status, reason) {

  var client = new WebSocketClient();
  var rejectUri = message.address + '&statusCode=' + status + '&statusDescription=' + encodeURIComponent(reason);

  client.connect(rejectUri, null, null);
  client.on('error', function(connection) {
    this.emit('requestRejected', this);
  });
}

module.exports = { Server, ServerResponse };
