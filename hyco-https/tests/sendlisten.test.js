var https = require('..')

//test('tests requests and responses', () => {
    var ns = "azbridgeunittests.servicebus.windows.net"; // process.env.SB_HC_NAMESPACE,
    var path = "a1"; // process.env.SB_HC_PATH,
    var keyrule = "sendlisten"; // process.env.SB_HC_KEYRULE,
    var key = "XNiXfn6PZxt3ZZOQqRq4LroCeYSA1fulu/orpXwYkgA="; // process.env.SB_HC_KEY

    
    var uri = https.createRelayListenUri(ns, path);
    var server = https.createRelayedServer({
            server: uri,
            token: () => https.createRelayToken(uri, keyrule, key)
        },
        (req, res) => {
            console.log('request accepted: ' + req.method + ' on ' + req.url);
            res.setHeader('Content-Type', 'text/html');
            res.end('<html><head><title>Hey!</title></head><body>Relayed Node.js Server!</body></html>');
        });

    server.listen((err) => {
        if (err) {
            return console.log('something bad happened', err)
        }
        console.log(`server is listening on ${port}`)
    });

    server.on('error', (err) => {
        console.log('error: ' + err.message);
    });

    done => { server.close(); }

    
    var clientUri = https.createRelayHttpsUri(ns, path);
    var token = https.createRelayToken(clientUri, keyrule, key);
    // https.get({
    //     hostname: ns,
    //     path: ((!path || path.length == 0 || path[0] !== '/') ? '/' : '') + path,
    //     port: 443,
    //     headers: {
    //         'ServiceBusAuthorization': token
    //     }
    // }, (res) => {
    //     let error;
    //     if (res.statusCode !== 200) {
    //         console.error('Request Failed.\n Status Code:' + res.statusCode);
    //         res.resume();
    //     } else {
    //         res.setEncoding('utf8');
    //         res.on('data', (chunk) => {
    //             console.log(`BODY: ${chunk}`);
    //         });
    //         res.on('end', () => {
    //             console.log('No more data in response.');
    //         });
    //     };
    //     done();
    // }).on('error', (e) => {
    //     console.error(`Got error: ${e.message}`);
    //     done();
    // });

    var querystring = require('querystring');
    const postData = querystring.stringify({
        'msg': 'Hello World!'
      });

    var req = https.request({
        hostname: ns,
        path: ((!path || path.length == 0 || path[0] !== '/') ? '/' : '') + path,
        port: 443,
        method : "POST",
        headers: {
            'ServiceBusAuthorization': token,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        }
    }, (res) => {
        let error;
        if (res.statusCode !== 200) {
            console.error('Request Failed.\n Status Code:' + res.statusCode);
            res.resume();
        } else {
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                console.log(`BODY: ${chunk}`);
            });
            res.on('end', () => {
                console.log('No more data in response.');
            });
        };
        done();
    }).on('error', (e) => {
        console.error(`Got error: ${e.message}`);
        done();
    });

    req.write(postData);
    req.end();
    
//});