#!/usr/bin/env node

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

if ( ns == null || path == null || keyrule == null || key == null ) {
    return;
}

var uri = WebSocket.createRelayListenUri(ns, path);
uri = WebSocket.appendRelayToken(uri, keyrule, key);

console.log(uri);