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

if ( args.ns == null || args.path == null || args.keyrule == null || args.key == null) {
    console.log("listener.js --ns=[namespace] --path=[path] --keyrule=[keyrule] --key=[key]");
} else {

    var WebSocket = require('../../')
    var uri = WebSocket.createRelayListenUri(args.ns, args.path);
    var wss = WebSocket.createRelayedServer(
        {
            server : uri,
            token: WebSocket.createRelayToken(uri, args.keyrule, args.key)
        }, 
        function (ws) {
            console.log('connection accepted');
            ws.onmessage = function (event) {
                console.log(JSON.parse(event.data));
            };
            ws.on('close', function () {
                console.log('connection closed');
            });       
    });

    wss.on('error', function(err) {
    console.log('error' + err);
    });
}