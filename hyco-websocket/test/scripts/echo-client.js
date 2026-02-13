#!/usr/bin/env node

var WebSocket = require('../..');
var readline = require('readline');

var args = { /* defaults */
    ns : process.env.SB_HC_NAMESPACE,
    path : process.env.SB_HC_PATH,
    keyrule : process.env.SB_HC_KEYRULE,
    key : process.env.SB_HC_KEY
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

if (ns == null || path == null || keyrule == null || key == null) {
    console.log('Usage: ./echo-client.js [--ns=ns.servicebus.windows.net] [--path=path] [--keyrule=keyrule] [--key=key]');
    process.exit(1);
}

var uri = WebSocket.createRelaySendUri(ns, path);
var token = WebSocket.createRelayToken(uri, keyrule, key);

var client = new WebSocket.client();
client.connect(WebSocket.appendRelayToken(uri, keyrule, key));

client.on('connect', function(connection) {
    console.log('Connected to echo-server. Type a message and press Enter. Ctrl+C to quit.');

    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            console.log('Echo: ' + message.utf8Data);
        } else if (message.type === 'binary') {
            console.log('Echo: (binary, ' + message.binaryData.length + ' bytes)');
        }
    });

    connection.on('close', function() {
        console.log('Connection closed.');
        process.exit(0);
    });

    connection.on('error', function(err) {
        console.error('Connection error: ' + err);
        process.exit(1);
    });

    rl.on('line', function(line) {
        connection.sendUTF(line);
    });

    rl.on('close', function() {
        connection.close();
    });
});

client.on('connectFailed', function(err) {
    console.error('Connection failed: ' + err);
    process.exit(1);
});
