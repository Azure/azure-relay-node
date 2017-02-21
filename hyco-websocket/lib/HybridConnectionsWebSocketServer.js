/************************************************************************
 *  Copyright 2010-2015 Brian McKelvey.
 *  Derivative Copyright Microsoft Corporation
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ***********************************************************************/

const extend = require('./utils').extend;
const utils = require('./utils');
const util = require('util');
const EventEmitter = require('events').EventEmitter;
const WebSocketClient = require('websocket').client;
const WebSocketRequest = require('./HybridConnectionsWebSocketRequest');
const querystring = require('querystring');
const moment = require('moment');

var isDefinedAndNonNull = function(options, key) {
    return typeof options[key] != 'undefined' && options[key] !== null;
};

var HybridConnectionsWebSocketServer = function HybridConnectionsWebSocketServer(config) {
    // Superclass Constructor
    EventEmitter.call(this);

    this.closeRequested = false;
    this._handlers = {
        requestAccepted: this.handleRequestAccepted.bind(this),
        requestResolved: this.handleRequestResolved.bind(this)
    };
    this.pendingRequests = [];
    this.connections = [];
    if (config) {
        this.open(config);
    }
};

util.inherits(HybridConnectionsWebSocketServer, EventEmitter);

HybridConnectionsWebSocketServer.prototype.open = function(config) {
    this.config = {
        // hybrid connection endpoint address
        server: null,
        // listen token string or callback to generate one
        token: null,
        // identifier
        id: null,

        // If true, the server will automatically send a ping to all
        // connections every 'keepaliveInterval' milliseconds.  The timer is
        // reset on any received data from the client.
        keepalive: true,

        // The interval to send keepalive pings to connected clients if the
        // connection is idle.  Any received data will reset the counter.
        keepaliveInterval: 20000,

        // If true, the server will consider any connection that has not
        // received any data within the amount of time specified by
        // 'keepaliveGracePeriod' after a keepalive ping has been sent to
        // be dead, and will drop the connection.
        // Ignored if keepalive is false.
        dropConnectionOnKeepaliveTimeout: true,

        // The amount of time to wait after sending a keepalive ping before
        // closing the connection if the connected peer does not respond.
        // Ignored if keepalive is false.
        keepaliveGracePeriod: 10000,

        // Whether to use native TCP keep-alive instead of WebSockets ping
        // and pong packets.  Native TCP keep-alive sends smaller packets
        // on the wire and so uses bandwidth more efficiently.  This may
        // be more important when talking to mobile devices.
        // If this value is set to true, then these values will be ignored:
        //   keepaliveGracePeriod
        //   dropConnectionOnKeepaliveTimeout
        useNativeKeepalive: false,

        // If true, fragmented messages will be automatically assembled
        // and the full message will be emitted via a 'message' event.
        // If false, each frame will be emitted via a 'frame' event and
        // the application will be responsible for aggregating multiple
        // fragmented frames.  Single-frame messages will emit a 'message'
        // event in addition to the 'frame' event.
        // Most users will want to leave this set to 'true'
        assembleFragments: true,

        // If this is true, websocket connections will be accepted
        // regardless of the path and protocol specified by the client.
        // The protocol accepted will be the first that was requested
        // by the client.  Clients from any origin will be accepted.
        // This should only be used in the simplest of cases.  You should
        // probably leave this set to 'false' and inspect the request
        // object to make sure it's acceptable before accepting it.
        autoAcceptConnections: false,

        // Whether or not the X-Forwarded-For header should be respected.
        // It's important to set this to 'true' when accepting connections
        // from untrusted connections, as a malicious client could spoof its
        // IP address by simply setting this header.  It's meant to be added
        // by a trusted proxy or other intermediary within your own
        // infrastructure.
        // See:  http://en.wikipedia.org/wiki/X-Forwarded-For
        ignoreXForwardedFor: false,

        // The Nagle Algorithm makes more efficient use of network resources
        // by introducing a small delay before sending small packets so that
        // multiple messages can be batched together before going onto the
        // wire.  This however comes at the cost of latency, so the default
        // is to disable it.  If you don't need low latency and are streaming
        // lots of small messages, you can change this to 'false'
        disableNagleAlgorithm: true,

        // The number of milliseconds to wait after sending a close frame
        // for an acknowledgement to come back before giving up and just
        // closing the socket.
        closeTimeout: 5000
    };
    extend(this.config, config);

    if (this.config.server) {
        // connect
        this.listenUri = config.server;
        if (isDefinedAndNonNull(config, 'id')) {
            this.listenUri = listenUri + '&id=' + config.id;
        }

        connectControlChannel(this);
    }
    else {
        throw new Error('You must specify a hybrid connections server address on which to open the WebSocket server.');
    }
};

HybridConnectionsWebSocketServer.prototype.close = function() {
    this.closeRequested = true;
    if (this.controlChannel) {
        this.controlChannel.close();
    }
    this.closeAllConnections();
};

HybridConnectionsWebSocketServer.prototype.closeAllConnections = function() {
    this.connections.forEach(function(connection) {
        connection.close();
    });
};

HybridConnectionsWebSocketServer.prototype.broadcast = function(data) {
    if (Buffer.isBuffer(data)) {
        this.broadcastBytes(data);
    }
    else if (typeof (data.toString) === 'function') {
        this.broadcastUTF(data);
    }
};

HybridConnectionsWebSocketServer.prototype.broadcastUTF = function(utfData) {
    this.connections.forEach(function(connection) {
        connection.sendUTF(utfData);
    });
};

HybridConnectionsWebSocketServer.prototype.broadcastBytes = function(binaryData) {
    this.connections.forEach(function(connection) {
        connection.sendBytes(binaryData);
    });
};

HybridConnectionsWebSocketServer.prototype.shutDown = function() {
    this.closeAllConnections();
};

HybridConnectionsWebSocketServer.prototype.handleRequestAccepted = function(connection) {
    var self = this;
    connection.once('close', function(closeReason, description) {
        self.handleConnectionClose(connection, closeReason, description);
    });
    this.connections.push(connection);
    this.emit('connect', connection);
};

HybridConnectionsWebSocketServer.prototype.handleRequestResolved = function(request) {
    var index = this.pendingRequests.indexOf(request);
    if (index !== -1) { this.pendingRequests.splice(index, 1); }
};

HybridConnectionsWebSocketServer.prototype.handleConnectionClose = function(closeReason, description) {
    console.log(description);
}

function connectControlChannel(server) {
    /* create the control connection */

    var headers = null;
    var tokenRenewDuration = null;
    if (server.config.token != null) {
        var token = null;
        if (typeof server.config.token === 'function') {
            // server.config.token is a function, call it periodically to renew the token
            tokenRenewDuration = new moment.duration(1, 'hours');
            token = server.config.token();
        } else {
            // server.config.token is a string, the token cannot be renewed automatically
            token = server.config.token;
        }

        headers = { 'ServiceBusAuthorization': token };
    };

    // This represents the token renew timer/interval, keep a reference in order to cancel it.
    var tokenRenewTimer = null;

    var client = new WebSocketClient();
    client.connect(server.listenUri, null, null, headers);
    client.on('connect', function(connection) {
        server.controlChannel = connection;
        server.controlChannel.on('error', function(event) {
            server.emit('error', event);
            clearInterval(tokenRenewTimer);
            if (!closeRequested) {
                connectControlChannel(server);
            }
        });

        server.controlChannel.on('close', function(event) {
            clearInterval(tokenRenewTimer);
            if (!closeRequested) {
                // reconnect
                connectControlChannel(server);
            } else {
                server.controlChannel = null;
                server.emit('close', server);
            }
        });

        server.controlChannel.on('message', function(message) {
            if (message.type === 'utf8') {
                try {
                    handleControl(server, JSON.parse(message.utf8Data));
                }
                catch (e) {
                    // do nothing if there's an error.
                }
            }
        });
    });

    client.on('connectFailed', function(event) {
        console.log(event);
    });

    if (tokenRenewDuration) {
        // tokenRenewDuration having a value means server.config.token is a function, renew the token periodically
        tokenRenewTimer = setInterval(function() {
            if (!server.closeRequested) {
                var newToken = server.config.token();
                console.log('Renewing Token: ' + newToken);
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

function handleControl(server, message) {
    if (isDefinedAndNonNull(message, 'accept')) {
        handleAccept(server, message);
    }
}

function handleAccept(server, message) {
    var wsRequest = new WebSocketRequest(
        message.accept.address,
        message.accept.id,
        message.accept.connectHeaders,
        server.config);
    try {
        wsRequest.readHandshake();
    }
    catch (e) {
        wsRequest.reject(
            e.httpCode ? e.httpCode : 400,
            e.message,
            e.headers
        );
        debug('Invalid handshake: %s', e.message);
        return;
    }

    server.pendingRequests.push(wsRequest);

    wsRequest.once('requestAccepted', server._handlers.requestAccepted);
    wsRequest.once('requestResolved', server._handlers.requestResolved);

    if (!server.config.autoAcceptConnections && utils.eventEmitterListenerCount(server, 'request') > 0) {
        server.emit('request', wsRequest);
    }
    else if (server.config.autoAcceptConnections) {
        wsRequest.accept(wsRequest.requestedProtocols[0], wsRequest.origin);
    }
    else {
        wsRequest.reject(404, 'No handler is configured to accept the connection.');
    }
}

module.exports = HybridConnectionsWebSocketServer;
