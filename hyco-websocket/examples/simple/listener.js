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

if (args.ns == null || args.path == null || args.keyrule == null || args.key == null) {
    console.log('listener.js --ns=[namespace] --path=[path] --keyrule=[keyrule] --key=[key]');
} else {

    var WebSocket = require('../../');
    var WebSocketServer = require('../../').relayedServer;

    var uri = WebSocket.createRelayListenUri(args.ns, args.path);
    var wss = new WebSocketServer(
        {
            server : uri,
            token: function() {
                return WebSocket.createRelayToken(uri, args.keyrule, args.key);
            },
            autoAcceptConnections : true
        });
    wss.on('connect',
        function(ws) {
            console.log('connection accepted');
            ws.on('message', function(message) {
                if (message.type === 'utf8') {
                    try {
                        console.log(JSON.parse(message.utf8Data));
                    }
                    catch (e) {
                        // do nothing if there's an error.
                    }
                }
            });
            ws.on('close', function() {
                console.log('connection closed');
            });
        });

    wss.on('error', function(err) {
        console.log('error: ' + err);
    });
}