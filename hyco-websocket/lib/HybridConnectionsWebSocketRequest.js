/************************************************************************
 *  Copyright 2010-2015 Brian McKelvey.
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

var crypto = require('crypto');
var util = require('util');
var url = require('url');
var EventEmitter = require('events').EventEmitter;
var WebSocketClient = require('websocket').client;
var WebSocketConnection = require('websocket').connection;

var headerValueSplitRegExp = /,\s*/;
var headerParamSplitRegExp = /;\s*/;
var headerSanitizeRegExp = /[\r\n]/g;
var xForwardedForSeparatorRegExp = /,\s*/;
var separators = [
    '(', ')', '<', '>', '@',
    ',', ';', ':', '\\', '\"',
    '/', '[', ']', '?', '=',
    '{', '}', ' ', String.fromCharCode(9)
];

var cookieSeparatorRegEx = /[;,] */;

function HybridConnectionsWebSocketRequest(address, id, httpHeaders, serverConfig) {
    // Superclass Constructor
    EventEmitter.call(this);

    this.resource = address;
    this.address = address;
    this.id = id;
    this.httpRequest = {
        headers : {}
    };

    for (var keys = Object.keys(httpHeaders), l = keys.length; l; --l) {
        this.httpRequest.headers[ keys[l - 1].toLowerCase() ] = httpHeaders[ keys[l - 1] ];
    }

    this.serverConfig = serverConfig;
    this._resolved = false;
}

util.inherits(HybridConnectionsWebSocketRequest, EventEmitter);

HybridConnectionsWebSocketRequest.prototype.readHandshake = function() {
    var self = this;
    var request = this.httpRequest;

    // Decode URL
    this.resourceURL = url.parse(this.resource, true);

    this.host = request.headers['host'];
    if (!this.host) {
        throw new Error('Client must provide a Host header.');
    }

    this.key = request.headers['sec-websocket-key'];
    if (!this.key) {
        throw new Error('Client must provide a value for Sec-WebSocket-Key.');
    }

    this.webSocketVersion = parseInt(request.headers['sec-websocket-version'], 10);

    if (!this.webSocketVersion || isNaN(this.webSocketVersion)) {
        throw new Error('Client must provide a value for Sec-WebSocket-Version.');
    }

    // Protocol is optional.
    var protocolString = request.headers['sec-websocket-protocol'];
    this.protocolFullCaseMap = {};
    this.requestedProtocols = [];
    if (protocolString) {
        var requestedProtocolsFullCase = protocolString.split(headerValueSplitRegExp);
        requestedProtocolsFullCase.forEach(function(protocol) {
            var lcProtocol = protocol.toLocaleLowerCase();
            self.requestedProtocols.push(lcProtocol);
            self.protocolFullCaseMap[lcProtocol] = protocol;
        });
    }

    if (!this.serverConfig.ignoreXForwardedFor &&
        request.headers['x-forwarded-for']) {
        var immediatePeerIP = this.remoteAddress;
        this.remoteAddresses = request.headers['x-forwarded-for']
            .split(xForwardedForSeparatorRegExp);
        this.remoteAddresses.push(immediatePeerIP);
        this.remoteAddress = this.remoteAddresses[0];
    }

    // Extensions are optional.
    var extensionsString = request.headers['sec-websocket-extensions'];
    this.requestedExtensions = this.parseExtensions(extensionsString);

    // Cookies are optional
    var cookieString = request.headers['cookie'];
    this.cookies = this.parseCookies(cookieString);
};

HybridConnectionsWebSocketRequest.prototype.parseExtensions = function(extensionsString) {
    if (!extensionsString || extensionsString.length === 0) {
        return [];
    }
    var extensions = extensionsString.toLocaleLowerCase().split(headerValueSplitRegExp);
    extensions.forEach(function(extension, index, array) {
        var params = extension.split(headerParamSplitRegExp);
        var extensionName = params[0];
        var extensionParams = params.slice(1);
        extensionParams.forEach(function(rawParam, index, array) {
            var arr = rawParam.split('=');
            var obj = {
                name: arr[0],
                value: arr[1]
            };
            array.splice(index, 1, obj);
        });
        var obj = {
            name: extensionName,
            params: extensionParams
        };
        array.splice(index, 1, obj);
    });
    return extensions;
};

// This function adapted from node-cookie
// https://github.com/shtylman/node-cookie
HybridConnectionsWebSocketRequest.prototype.parseCookies = function(str) {
    // Sanity Check
    if (!str || typeof(str) !== 'string') {
        return [];
    }

    var cookies = [];
    var pairs = str.split(cookieSeparatorRegEx);

    pairs.forEach(function(pair) {
        var eq_idx = pair.indexOf('=');
        if (eq_idx === -1) {
            cookies.push({
                name: pair,
                value: null
            });
            return;
        }

        var key = pair.substr(0, eq_idx).trim();
        var val = pair.substr(++eq_idx, pair.length).trim();

        // quoted values
        if ('"' === val[0]) {
            val = val.slice(1, -1);
        }

        cookies.push({
            name: key,
            value: decodeURIComponent(val)
        });
    });

    return cookies;
};

HybridConnectionsWebSocketRequest.prototype.accept = function(acceptedProtocol, allowedOrigin, cookies, callback) {
     var req = this;
     var protocolFullCase = null;
     var extraHeaders = {};

    if (acceptedProtocol) {
        protocolFullCase = this.protocolFullCaseMap[acceptedProtocol.toLocaleLowerCase()];
        if (typeof(protocolFullCase) === 'undefined') {
            protocolFullCase = acceptedProtocol;
        }
    }
    else {
        protocolFullCase = acceptedProtocol;
    }
    this.protocolFullCaseMap = null;

    if (protocolFullCase) {
        // validate protocol
        for (var i = 0; i < protocolFullCase.length; i++) {
            var charCode = protocolFullCase.charCodeAt(i);
            var character = protocolFullCase.charAt(i);
            if (charCode < 0x21 || charCode > 0x7E || separators.indexOf(character) !== -1) {
                this.reject(500);
                throw new Error('Illegal character "' + String.fromCharCode(character) + '" in subprotocol.');
            }
        }
        if (this.requestedProtocols.indexOf(acceptedProtocol) === -1) {
            this.reject(500);
            throw new Error('Specified protocol was not requested by the client.');
        }

        protocolFullCase = protocolFullCase.replace(headerSanitizeRegExp, '');
    }
    this.requestedProtocols = null;

    // Mark the request resolved now so that the user can't call accept or
    // reject a second time.
    this._resolved = true;
    this.emit('requestResolved', this);

    var client = new WebSocketClient();
    client.connect(this.address, protocolFullCase);
    client.on('connect', function(connection) {
        req.emit('requestAccepted', connection);
        if (callback) {
            callback(connection);
        }
     });
     client.on('error', function(event) {
         req.emit('requestRejected', event);
        if (callback) {
            callback(event);
        }
     });
};

HybridConnectionsWebSocketRequest.prototype.reject = function(status, reason, extraHeaders, callback) {
     var req = this;
     var client = new WebSocketClient();
     var rejectUri = this.address + '&statusCode=' + status + '&statusDescription=' + encodeURIComponent(reason);

     client.connect(rejectUri, null, null, extraHeaders);
     // we expect this to complete with a 410 Gone
     client.on('error', function(event) {
         this.emit('requestRejected', event);
         callback(event);
     });
};

HybridConnectionsWebSocketRequest.prototype._handleSocketCloseBeforeAccept = function() {
    this._socketIsClosing = true;
    this._removeSocketCloseListeners();
};

HybridConnectionsWebSocketRequest.prototype._removeSocketCloseListeners = function() {
    this.socket.removeListener('end', this._socketCloseHandler);
    this.socket.removeListener('close', this._socketCloseHandler);
};

HybridConnectionsWebSocketRequest.prototype._verifyResolution = function() {
    if (this._resolved) {
        throw new Error('HybridConnectionsWebSocketRequest may only be accepted or rejected one time.');
    }
};

function cleanupFailedConnection(connection) {
    // Since we have to return a connection object even if the socket is
    // already dead in order not to break the API, we schedule a 'close'
    // event on the connection object to occur immediately.
    process.nextTick(function() {
        // WebSocketConnection.CLOSE_REASON_ABNORMAL = 1006
        // Third param: Skip sending the close frame to a dead socket
        connection.drop(1006, 'TCP connection lost before handshake completed.', true);
    });
}

module.exports = HybridConnectionsWebSocketRequest;
