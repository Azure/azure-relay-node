var https = require('..')

var ns = process.env.SB_HC_NAMESPACE ? process.env.SB_HC_NAMESPACE.replace(/^"(.*)"$/, '$1') : null;
var path = process.env.SB_HC_PATH ? process.env.SB_HC_PATH : "a2";
var keyrule = process.env.SB_HC_KEYRULE ? process.env.SB_HC_KEYRULE.replace(/^"(.*)"$/, '$1') : null;
var key = process.env.SB_HC_KEY ? process.env.SB_HC_KEY.replace(/^"(.*)"$/, '$1') : null;

expect(ns).toBeDefined();
expect(path).toBeDefined();
expect(keyrule).toBeDefined();
expect(key).toBeDefined();

var smallMessage = "SmallMessage";
var exactly64kbMessage = "";
for (var i = 1024 * 64; i > 0; i--) {
    exactly64kbMessage += String.fromCharCode(i % 128);
}
var over64kbMessage = exactly64kbMessage + String.fromCharCode(0);

// reqWriteMsgs, reqEndMsg, resWriteMsgs, resEndMsg should be string[], string, or null
function sendAndReceive(reqWriteMsgs, reqEndMsg, resWriteMsgs, resEndMsg, done) {
    var reqExpected = "";
    var resExpected = "";

    if (reqWriteMsgs) {
        reqExpected = Array.isArray(reqWriteMsgs) ? reqWriteMsgs.reduce((total, current) => { return total + current; }) : reqWriteMsgs;
    }
    reqExpected += (reqEndMsg) ? reqEndMsg : "";

    if (resWriteMsgs) {
        resExpected = Array.isArray(resWriteMsgs) ? resWriteMsgs.reduce((total, current) => { return total + current; }) : resWriteMsgs;
    }
    resExpected += (resEndMsg) ? resEndMsg : "";

    jest.setTimeout(5000); // 5 seconds timeout per test

    /* set up the listener */
    var uri = https.createRelayListenUri(ns, path);
    var server = https.createRelayedServer({
            server: uri,
            token: () => https.createRelayToken(uri, keyrule, key)
        },
        (req, res) => {
            expect(req.method).toBe("POST");
            expect(req.headers.custom).toBe("Hello");
            req.setEncoding('utf-8');
            req.on('data', (chunk) => {
                expect(chunk.length).toBe(Buffer.byteLength(reqExpected));
                expect(chunk).toBe(reqExpected);
            });
            req.on('end', () => {
                if (resWriteMsgs) {
                    if (Array.isArray(resWriteMsgs)) {
                        resWriteMsgs.forEach((msg) => {
                            res.write(msg);
                        });
                    } else {
                        res.write(resWriteMsgs);
                    }
                }

                if (resEndMsg && resEndMsg.length) {
                    res.end(resEndMsg);
                } else {
                    res.end();
                }
            });
        });

    // fail we get an error
    server.listen((err) => {
        expect(err).toBeUndefined();
    });
    // fail if we get an error (we'll always get one if this triggers)
    server.on('error', (err) => {
        expect(err).toBeUndefined();
    });
    
    /* set up the client */
    var clientUri = https.createRelayHttpsUri(ns, path);
    var token = https.createRelayToken(clientUri, keyrule, key);
    
    server.on('listening', () => {
        var req = https.request({
            hostname: ns,
            path: ((!path || path.length == 0 || path[0] !== '/') ? '/' : '') + path,
            port: 443,
            method : "POST",
            headers: {
                'ServiceBusAuthorization': token,
                'Custom' : 'Hello',
                'Content-Type': 'text/plain',
                'Content-Length': Buffer.byteLength(reqExpected)
            }
        }, (res) => {
            var chunks = '';
            expect(res.statusCode).toBe(200);
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                chunks += chunk;
            });
            res.on('end', () => {
                expect(chunks.length).toBe(Buffer.byteLength(resExpected));
                expect(chunks).toBe(resExpected);
                server.close();
                jest.clearAllTimers();
                done();
            });
        }).on('error', (e) => {
            expect(e).toBeUndefined();
        });

        if (reqWriteMsgs) {
            if (Array.isArray(reqWriteMsgs)) {
                reqWriteMsgs.forEach((msg) => {
                    req.write(msg);
                });
            } else {
                req.write(reqWriteMsgs);
            }
        }

        if (reqEndMsg && reqEndMsg.length) {
            req.end(reqEndMsg);
        } else {
            req.end();
        }
    });
}

var testMessages = {
    // testName : testMessage
    "SmallMessage" : smallMessage,
    "Exactly64kbMessage" : exactly64kbMessage,
    "Over64kbMessage" : over64kbMessage
}

describe('HttpPostEmptyReqEmptyResTest', () => {
    test('HttpPostEmptyReqEmptyRes', (done) => {
        sendAndReceive(null, "", null, "", done);
    });
});

describe('HttpPostRequestTests', () => {
    describe('EndOnly', () => {
        Object.keys(testMessages).forEach((testName) => {
            test('HttpPostRequestEndOnly' + testName, (done) => {
                sendAndReceive(null, testMessages[testName], null, "ResponseMessage", done);
            });
        });
    });
    describe('WriteOnly', () => {
        Object.keys(testMessages).forEach((testName) => {
            test('HttpPostRequestWriteOnly' + testName, (done) => {
                sendAndReceive(testMessages[testName], null, "ResponseMessage", null, done);
            });
        });
    });
    describe('WriteAndEnd', () => {
        test('HttpPostRequestSmallWriteSmallEnd', (done) => {
            sendAndReceive(smallMessage, smallMessage, "ResponseMessage", null, done);
        });
        test('HttpPostRequestSmallWrite64kbEnd', (done) => {
            sendAndReceive(smallMessage, exactly64kbMessage, "ResponseMessage", null, done);
        });
        test('HttpPostRequestLargeWriteSmallEnd', (done) => {
            sendAndReceive(over64kbMessage, smallMessage, "ResponseMessage", null, done);
        });
    });
    describe('MultipleWrites', () => {
        test('HttpPostRequestSmallWrites', (done) => {
            sendAndReceive([smallMessage, smallMessage], null, "ResponseMessage", null, done);
        });
        test('HttpPostRequestExceed64kbWrites', (done) => {
            sendAndReceive([smallMessage, exactly64kbMessage], null, "ResponseMessage", null, done);
        });
        test('HttpPostRequestLargeThenSmallWrites', (done) => {
            sendAndReceive([over64kbMessage, smallMessage], null, "ResponseMessage", null, done);
        });
    });
});

describe('HttpPostResponseTests', () => {
    Object.keys(testMessages).forEach((testName) => {
        test('HttpPostResponseEndOnly' + testName, (done) => {
            sendAndReceive(null, "RequestMessage", null, testMessages[testName], done);
        });
    });
    Object.keys(testMessages).forEach((testName) => {
        test('HttpPostResponseWriteOnly' + testName, (done) => {
            sendAndReceive("RequestMessage", null, testMessages[testName], null, done);
        });
    });
    describe('WriteAndEnd', () => {
        test('HttpPostResponseSmallWriteSmallEnd', (done) => {
            sendAndReceive("RequestMessage", null, smallMessage, smallMessage, done);
        });
        test('HttpPostResponseSmallWrite64kbEnd', (done) => {
            sendAndReceive("RequestMessage", null, smallMessage, exactly64kbMessage, done);
        });
        test('HttpPostResponseLargeWriteSmallEnd', (done) => {
            sendAndReceive("RequestMessage", null, over64kbMessage, smallMessage, done);
        });
    });
    describe('MultipleWrites', () => {
        test('HttpPostResponseSmallWrites', (done) => {
            sendAndReceive("RequestMessage", null, [smallMessage, smallMessage], null, done);
        });
        test('HttpPostResponseExceed64kbWrites', (done) => {
            sendAndReceive("RequestMessage", null, [smallMessage, exactly64kbMessage], null, done);
        });
        test('HttpPostResponseLargeThenSmallWrites', (done) => {
            sendAndReceive("RequestMessage", null, [over64kbMessage, smallMessage], null, done);
        });
    });
});