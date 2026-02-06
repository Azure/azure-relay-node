'use strict';

const util = require('util');
const EventEmitter = require('events');
const Stream = require('stream');
const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');
const url = require('url');
const moment = require('moment');

// Pull ws submodules using path relative to ws package
var wsDir = require('path').dirname(require.resolve('ws'));
const Extensions = require(require('path').join(wsDir, 'lib', 'extension'));
const PerMessageDeflate = require(require('path').join(wsDir, 'lib', 'permessage-deflate'));

var isDefinedAndNonNull = function(options, key) {
  return typeof options[key] != 'undefined' && options[key] !== null;
};

/**
 * WebSocket Server implementation
 */
function HybridConnectionsWebSocketServer(options, callback) {
  if (this instanceof HybridConnectionsWebSocketServer === false) {
    return new HybridConnectionsWebSocketServer(options, callback);
  }

  EventEmitter.call(this);

  options = Object.assign({
    server: null,
    token: null,
    id: null,
    verifyClient: null,
    handleProtocols: null,
    disableHixie: false,
    clientTracking: true,
    perMessageDeflate: true,
    maxPayload: 100 * 1024 * 1024,
    backlog: null // use default (511 as implemented in net.js)
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

  this.closeRequested = false;
  this.options = options;
  this.path = options.path;
  this.clients = [];
  this._reconnectDelayIndex = -1;
  this.pendingRequest = null;

  connectControlChannel(this);
}

/**
 * Inherits from EventEmitter.
 */

util.inherits(HybridConnectionsWebSocketServer, EventEmitter);

/**
 * Immediately shuts down the connection.
 *
 * @api public
 */
HybridConnectionsWebSocketServer.prototype.close = function(callback) {
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

var reconnectDelays = [0, 1, 2, 5, 10, 30]; // in seconds

function connectControlChannel(server) {
  /* create the control connection */

  var opt = null;
  var token = null;
  var tokenRenewDuration = null;

  server._connecting = true;

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

  var reconnect = function(server) {
    if (!server._connecting) {
      server._connecting = true;
      if (server._reconnectDelayIndex < reconnectDelays.length - 1) {
        server._reconnectDelayIndex++;
      }
      setTimeout(function() {
        connectControlChannel(server);
      }, reconnectDelays[server._reconnectDelayIndex] * 1000);
    }
  }

  server.controlChannel.onerror = function(event) {
    server.emit('error', event);
    clearInterval(tokenRenewTimer);
    if (!server.closeRequested) {
      reconnect(server);
    }
  }

  server.controlChannel.onopen = function(event) {
    server._connecting = false;
    server._reconnectDelayIndex = -1;
    server.emit('listening');
  }

  server.controlChannel.onclose = function(event) {
    server._connecting = false;
    clearInterval(tokenRenewTimer);

    if (!server.closeRequested) {
      reconnect(server);
    } else {
      server.emit('close', server);
    }
  }

  server.controlChannel.onmessage = function(event) {
    if (server.pendingRequest != null) {
      server.pendingRequest.handleBody(event.data);
      server.pendingRequest = null;
      return;
    }

    var message = JSON.parse(event.data);
    if (isDefinedAndNonNull(message, 'accept')) {
      accept(server, message);
    } else if (isDefinedAndNonNull(message, 'request')) {
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

/**
 * Minimal IncomingMessage for HTTP requests received over the control channel.
 * Implements a Readable stream so request body data can be consumed.
 */
function RelayIncomingMessage(message, controlChannel) {
  Stream.Readable.call(this);
  this.socket = controlChannel;
  this.connection = controlChannel;
  this.httpVersion = '1.1';
  this.httpVersionMajor = 1;
  this.httpVersionMinor = 1;
  this.complete = false;
  this.headers = {};
  this.rawHeaders = [];
  this.trailers = {};
  this.rawTrailers = [];
  this.readable = true;
  this.aborted = false;

  this.url = message.request.requestTarget;
  this.method = message.request.method;

  if (message.request.requestHeaders) {
    for (var header in message.request.requestHeaders) {
      this.headers[header.toLowerCase()] = message.request.requestHeaders[header];
    }
  }
}
util.inherits(RelayIncomingMessage, Stream.Readable);

RelayIncomingMessage.prototype._read = function() {};

RelayIncomingMessage.prototype.handleBody = function(data) {
  var buf = (typeof data === 'string') ? Buffer.from(data) : data;
  this.push(buf);
  this.push(null);
};

/**
 * Minimal ServerResponse for HTTP requests received over the control channel.
 * Supports writeHead(), write(), end() to send response back via the control channel.
 */
function RelayServerResponse(req) {
  Stream.call(this);
  this.statusCode = 200;
  this.statusMessage = 'OK';
  this._headers = {};
  this._hasBody = false;
  this._headerSent = false;
  this.finished = false;
  this.headersSent = false;
  this.requestId = null;
  this._controlChannel = null;
  this._bodyChunks = [];
  this._req = req;
}
util.inherits(RelayServerResponse, Stream);

RelayServerResponse.prototype.writeHead = function writeHead(statusCode, reason, obj) {
  if (typeof reason === 'object' && reason !== null) {
    obj = reason;
    reason = undefined;
  }
  this.statusCode = statusCode;
  if (reason !== undefined) {
    this.statusMessage = reason;
  }
  if (obj) {
    for (var k in obj) {
      this._headers[k.toLowerCase()] = obj[k];
    }
  }
};

RelayServerResponse.prototype.setHeader = function setHeader(name, value) {
  this._headers[name.toLowerCase()] = value;
};

RelayServerResponse.prototype.getHeader = function getHeader(name) {
  return this._headers[name.toLowerCase()];
};

RelayServerResponse.prototype.write = function write(chunk, encoding) {
  if (typeof chunk === 'string') {
    chunk = Buffer.from(chunk, encoding || 'utf8');
  }
  this._hasBody = true;
  this._bodyChunks.push(chunk);
  return true;
};

RelayServerResponse.prototype.end = function end(chunk, encoding, callback) {
  if (typeof chunk === 'function') {
    callback = chunk;
    chunk = null;
  } else if (typeof encoding === 'function') {
    callback = encoding;
    encoding = null;
  }

  if (this.finished) return this;

  if (chunk) {
    this.write(chunk, encoding);
  }

  // Build and send the response JSON
  var response = { response: {
    requestId: this.requestId,
    statusCode: this.statusCode,
    statusDescription: this.statusMessage,
    responseHeaders: this._headers,
    body: this._hasBody
  }};

  var channel = this._controlChannel;
  if (channel && channel.readyState === WebSocket.OPEN) {
    channel.send(JSON.stringify(response), { binary: false });
    if (this._hasBody) {
      var body = Buffer.concat(this._bodyChunks);
      channel.send(body, { binary: true });
    }
  }

  this.finished = true;
  this.headersSent = true;

  if (typeof callback === 'function') {
    callback();
  }

  return this;
};

/**
 * Handle an HTTP request message received on the control channel.
 */
function controlChannelRequest(server, message) {
  if (message.request.method) {
    var req = new RelayIncomingMessage(message, server.controlChannel);
    if (message.request.body === true) {
      server.pendingRequest = req;
    } else {
      req.push(null);
    }

    var res = new RelayServerResponse(req);
    res.requestId = message.request.id;
    res._controlChannel = server.controlChannel;

    try {
      server.emit('request', req, res);
    } catch (err) {
      if (!res.finished) {
        try {
          res.writeHead(500);
          res.end();
        } catch (writeErr) {
          // ignore write errors during error recovery
        }
      }
    }
  }
}

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

function abortConnection(message, status, reason) {

  var client = new WebSocketClient();
  var rejectUri = message.address + '&statusCode=' + status + '&statusDescription=' + encodeURIComponent(reason);

  client.connect(rejectUri, null, null);
  client.on('error', function(connection) {
    this.emit('requestRejected', this);
  });
}

module.exports = HybridConnectionsWebSocketServer;
module.exports.reconnectDelays = reconnectDelays;