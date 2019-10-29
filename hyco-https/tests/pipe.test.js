var https = require('..');
const Stream = require('stream');

var ns = process.env.SB_HC_NAMESPACE ? process.env.SB_HC_NAMESPACE.replace(/^"(.*)"$/, '$1') : null;
var path = process.env.SB_HC_PATH ? process.env.SB_HC_PATH : "a2";
var keyrule = process.env.SB_HC_KEYRULE ? process.env.SB_HC_KEYRULE.replace(/^"(.*)"$/, '$1') : null;
var key = process.env.SB_HC_KEY ? process.env.SB_HC_KEY.replace(/^"(.*)"$/, '$1') : null;

expect(ns).toBeDefined();
expect(path).toBeDefined();
expect(keyrule).toBeDefined();
expect(key).toBeDefined();

var smallMessage = "SmallMessage";
var kb = "";
for (var i = 1024; i > 0; i--) {
    kb += String.fromCharCode(i % 128);
}
// let stream push 1kb at a time
var over64kbMessage = []; 
for (var j = 64; j >= 0; j--) {
    over64kbMessage.push(kb);
}

jest.setTimeout(10000);

function streamResponse(preStreamMessage, streamMessage, postStreamMessage, done) {
    var responseExpected = "";
    var uri = https.createRelayListenUri(ns, path);
    var server = https.createRelayedServer(
        {
            server: uri,
            token: () => https.createRelayToken(uri, keyrule, key)
        },
        function (req, res) {
            var readStream = new Stream.Readable();

            readStream.on('error', function(err) {
                expect(err).toBeUndefined();
            });
            readStream.on('end', function() {
                if (postStreamMessage) {
                    res.write(postStreamMessage);
                    responseExpected += postStreamMessage;
                }
                res.end();
            });

            res.setHeader('Content-type', 'text/plain');
            readStream.pipe(res);

            if (preStreamMessage) {
                res.write(preStreamMessage);
                responseExpected += preStreamMessage;
            }

            for (var i = 0; i < streamMessage.length; i++) {
                readStream.push(streamMessage[i]);
                responseExpected += streamMessage[i];
            }
            readStream.push(null); // signal the end of stream
        }
    );

    // fail we get an error
    server.listen((err) => {
        expect(err).toBeUndefined();
    });

    // fail if we get an error (we'll always get one if this triggers)
    server.on('error', (err) => {
        expect(err).toBeUndefined();
    });

    server.on('listening', () => {
        https.get({
            hostname: ns,
            path: ((!path || path.length == 0 || path[0] !== '/') ? '/' : '') + path,
            port: 443,
            method : "GET",
            headers: {
                'ServiceBusAuthorization': https.createRelayToken(uri, keyrule, key),
                'Custom' : 'Hello',
            }
        }, (res) => {
            var chunks = '';
            expect(res.statusCode).toBe(200);
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                chunks += chunk;
            });
            res.on('end', () => {
                expect(chunks.length).toBe(Buffer.byteLength(responseExpected));
                expect(chunks).toBe(responseExpected);
                server.close();
                jest.clearAllTimers();
                done();
            });
        }).on('error', (e) => {
            expect(e).toBeUndefined();
        });
    });
}

test('PipeSmallStreamOnly', (done) => {
    streamResponse(null, smallMessage, null, done);
});

test('PipeLargeStreamOnly', (done) => {
    streamResponse(null, over64kbMessage.join(""), null, done);
});

test('SmallMessageThenPipeSmallStream', (done) => {
    streamResponse(smallMessage, smallMessage, null, done);
});

test('LargeMessageThenPipeSmallStream', (done) => {
    streamResponse(over64kbMessage.join(""), smallMessage, null, done);
});

test('SmallMessageThenPipeLargeStream', (done) => {
    streamResponse(smallMessage, over64kbMessage.join(""), null, done);
});

test('PipeSmallStreamThenSmallMessage', (done) => {
    streamResponse(null, smallMessage, smallMessage, done);
});

test('PipeSmallStreamThenLargeMessage', (done) => {
    streamResponse(null, smallMessage, over64kbMessage.join(""), done);
});

test('PipeLargeStreamThenSmallMessage', (done) => {
    streamResponse(null, over64kbMessage.join(""), smallMessage, done);
});



