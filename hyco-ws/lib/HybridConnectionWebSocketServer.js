'use strict';

const util = require('util');
const EventEmitter = require('events');
const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');
const url = require('url');

// slightly awful workaround to pull submodules 
var wsc = require.cache[require.resolve('ws')]
const Extensions = wsc.require('./lib/Extensions');
const PerMessageDeflate = wsc.require('./lib/PerMessageDeflate');


var isDefinedAndNonNull = function (options, key) {
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

  var self = this;

  this.listenUri = options.server;
  if (isDefinedAndNonNull(options, 'id')) {
    this.listenUri = listenUri + '&id=' + options.id;
  }

  this.closeRequested = false;
  this.options = options;
  this.path = options.path;
  this.clients = [];

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

HybridConnectionsWebSocketServer.prototype.close = function (callback) {
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

  if (callback)
    callback(error);
  else if (error)
    throw error;
}


function connectControlChannel(server) {
  /* create the control connection */

  var opt = null;
  if (server.options.token != null) {
    opt = { headers: { 'ServiceBusAuthorization': server.options.token } };
  };
  server.controlChannel = new WebSocket(server.listenUri, null, opt);

  server.controlChannel.onerror = function (event) {
    server.emit('error', event);
    if (!server.closeRequested) {
      connectControlChannel(server);
    }
  }

  server.controlChannel.onopen = function (event) {
    server.emit('listening');
  }

  server.controlChannel.onclose = function (event) {
    // reconnect
    if (!server.closeRequested) {
      connectControlChannel(server);
    } else {
      server.emit('close', server);
    }

  }
  server.controlChannel.onmessage = function (event) {
    var message = JSON.parse(event.data);
    if (isDefinedAndNonNull(message, 'accept')) {
      accept(server, message);
    }
  };
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
  var completeHybiUpgrade2 = function (protocol) {

    var extensions = {};
    try {
      extensions = acceptExtensions.call(self, extensionsOffer);
    } catch (err) {
      abortConnection(message, 400, 'Bad Request');
      return;
    }

    if (Object.keys(extensions).length) {
      var serverExtensions = {};
      Object.keys(extensions).forEach(function (token) {
        serverExtensions[token] = [extensions[token].params]
      });
      headers.push('Sec-WebSocket-Extensions: ' + Extensions.format(serverExtensions));
    }

    // allows external modification/inspection of handshake headers
    self.emit('headers', headers);

    try {
      var client = new WebSocket(address, protocol, {
        rejectUnauthorized: false, 
        headers: headers,
        perMessageDeflate : false
      });

      client.on('error', function (event) {
        var index = server.clients.indexOf(client);
        if (index != -1) {
          server.clients.splice(index, 1);
        }
      });

      server.emit('connection', client);
      if (self.options.clientTracking) {
        self.clients.push(client);
        client.on('close', function () {
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
  var completeHybiUpgrade1 = function () {
    // choose from the sub-protocols
    if (typeof self.options.handleProtocols == 'function') {
      var protList = (protocols || '').split(/, */);
      var callbackCalled = false;
      self.options.handleProtocols(protList, function (result, protocol) {
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

  var client = new WebSocketClient({ tlsOptions: { rejectUnauthorized: false } });
  var rejectUri = message.address + "&statusCode=" + status + "&statusDescription" + encodeURIComponent(reason);

  client.connect(rejectUri, null, null);
  client.on('error', function (connection) {
    this.emit('requestRejected', this);
  });
}


module.exports = HybridConnectionsWebSocketServer