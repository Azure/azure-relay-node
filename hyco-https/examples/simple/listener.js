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

    var https = require('../../')
    var uri = https.createRelayListenUri(args.ns, args.path);
    var httpsServer = https.createRelayedServer(
        {
            server : uri,
            token : ()=>https.createRelayToken(uri, args.keyrule, args.key)
        },
        function(request, response) {
            console.log('request accepted');
            response.end('Hello Node.js Server!');
        });

    httpsServer.listen( (err) => {
            if (err) {
              return console.log('something bad happened', err)
            }          
            console.log(`server is listening on ${port}`)
          });
    httpsServer.on('error', function(err) {
    console.log('error: ' + err);
    });
}