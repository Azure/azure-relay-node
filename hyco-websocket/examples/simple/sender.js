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
    console.log("sender.js --ns=[namespace] --path=[path] --keyrule=[keyrule] --key=[key]");
} else {
    
    var WebSocket = require('../../')
    var WebSocketClient = WebSocket.client
    
    var address =  WebSocket.createRelaySendUri(args.ns, args.path);
    var token = WebSocket.createRelayToken(address, args.keyrule, args.key);
     
    var client = new WebSocketClient({tlsOptions: { rejectUnauthorized: false }});
    client.connect(address, null, null, { 'ServiceBusAuthorization' : token});
    
    client.on('connect', function(connection){
        var id = setInterval(function () {
            connection.send(JSON.stringify(process.memoryUsage()), function () { /* ignore errors */ });
        }, 100);

        console.log('Started client interval. Press any key to stop.');
        connection.on('close', function () {
            console.log('stopping client interval');
            clearInterval(id);
            process.exit();
        });

        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', function () {
            connection.close();
        });
    });
}