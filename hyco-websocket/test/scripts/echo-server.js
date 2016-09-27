#!/usr/bin/env node
/************************************************************************
 *  Copyright 2010-2015 Brian McKelvey.
 *
 *  Licensed under the Apache License, Version 2.0 (the 'License');
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ***********************************************************************/

var WebSocket = require('../..');
var WebSocketServer = require('../../lib/HybridConnectionsWebSocketServer');

var args = { /* defaults */
    debug: false,
    ns : process.env.RELAY_NAMESPACE,
    path : process.env.RELAY_PATH, 
    keyrule : process.env.RELAY_KEYRULE,
    key : process.env.RELAY_KEY 
};

/* Parse command line options */
var pattern = /^--(.*?)(?:=(.*))?$/;
process.argv.forEach(function(value) {
    var match = pattern.exec(value);
    if (match) {
        args[match[1]] = match[2] ? match[2] : true;
    }
});

var ns = args.ns;
var path = args.path;
var keyrule = args.keyrule;
var key = args.key;
var debug = args.debug;

console.log('WebSocket-Node: echo-server');

if ( ns == null || path == null || keyrule == null || key == null ) {
    console.log('Usage: ./echo-server.js [--ns=ns.servicebus.windows.net] [--path=path] [--keyrule=keyrule] [--key=key] [--debug]');
    return;
}

var uri = WebSocket.createRelayListenUri(ns, path);
    
var wsServer = new WebSocketServer({
    server : uri,
    token: WebSocket.createRelayToken(uri, keyrule, key),
    autoAcceptConnections: true,
    maxReceivedFrameSize: 64*1024*1024,   // 64MiB
    maxReceivedMessageSize: 64*1024*1024, // 64MiB
    fragmentOutgoingMessages: false,
    keepalive: false,
    disableNagleAlgorithm: false
});

wsServer.on('connect', function(connection) {
    if (debug) { console.log((new Date()) + ' Connection accepted' + 
                            ' - Protocol Version ' + connection.webSocketVersion); }
    function sendCallback(err) {
        if (err) {
          console.error('send() error: ' + err);
          connection.drop();
          setTimeout(function() {
            process.exit(100);
          }, 100);
        }
    }
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            if (debug) { console.log('Received utf-8 message of ' + message.utf8Data.length + ' characters.'); }
            connection.sendUTF(message.utf8Data, sendCallback);
        }
        else if (message.type === 'binary') {
            if (debug) { console.log('Received Binary Message of ' + message.binaryData.length + ' bytes'); }
            connection.sendBytes(message.binaryData, sendCallback);
        }
    });
    connection.on('close', function(reasonCode, description) {
        if (debug) { console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.'); }
        connection._debug.printOutput();
    });
});
