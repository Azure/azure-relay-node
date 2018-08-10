var https = require('..')

jest.setTimeout(30000); // 30 seconds

test('HTTPS GET', (done) => {
    var ns = process.env.SB_HC_NAMESPACE ? process.env.SB_HC_NAMESPACE.replace(/^"(.*)"$/, '$1') : null;
    var path = "a1";
    var keyrule = process.env.SB_HC_KEYRULE ? process.env.SB_HC_KEYRULE.replace(/^"(.*)"$/, '$1') : null;
    var key = process.env.SB_HC_KEY ? process.env.SB_HC_KEY.replace(/^"(.*)"$/, '$1') : null;

    expect(ns).toBeDefined();
    expect(path).toBeDefined();
    expect(keyrule).toBeDefined();
    expect(key).toBeDefined();

    /* set up the listener */
    var uri = https.createRelayListenUri(ns, path);
    var server = https.createRelayedServer({
            server: uri,
            token: () => https.createRelayToken(uri, keyrule, key)
        },
        (req, res) => {
            expect(req.method).toBe('GET');
            expect(req.headers.custom).toBe('Hello');
            res.end('Hello');
        });

    // fail we get an error
    server.listen((err) => {
        expect(err).toBeUndefined();
    });
    // fail if we get an error (we'll always get one if this triggers)
    server.on('error', (err) => {
        expect(err).toBeUndefined();
    });

    // client is being run with 5 second delay to allow the server to settle
    setTimeout(() => {
        /* set up the client */
        var clientUri = https.createRelayHttpsUri(ns, path);
        var token = https.createRelayToken(clientUri, keyrule, key);
        https.get({
            hostname: ns,
            path: ((!path || path.length == 0 || path[0] !== '/') ? '/' : '') + path,
            port: 443,
            headers: {
                'ServiceBusAuthorization': token,
                'Custom': 'Hello'
            }
        }, (res) => {
            expect(res.statusCode).toBe(200);
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                expect(chunk).toBe('Hello');
            });
            res.on('end', () => {
                server.close();
                done();
            });
        }).on('error', (e) => {
            expect(e).toBeUndefined();
        });
    });
});