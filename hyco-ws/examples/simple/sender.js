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
    console.log('sender.js --ns=[namespace] --path=[path] --keyrule=[keyrule] --key=[key]');
} else {

    var WebSocket = require('../..')
    var uri = WebSocket.createRelaySendUri(args.ns, args.path);
    WebSocket.relayedConnect(
        uri,
        WebSocket.createRelayToken(uri, args.keyrule, args.key),
        function(wss) {
            var id = setInterval(function() {
                wss.send(JSON.stringify(process.memoryUsage()), function() { /* ignore errors */ });
            }, 100);

            console.log('Started client interval. Press any key to stop.');
            wss.on('close', function() {
                console.log('stopping client interval');
                clearInterval(id);
                process.exit();
            });

            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.on('data', function() {
                wss.close();
            });
        }
    );
}