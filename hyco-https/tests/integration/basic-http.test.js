/**
 * Integration tests for basic HTTP GET/POST requests via Azure Relay.
 * Verifies small request/response bodies return status 200 with correct content.
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

var https = require('../..');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-https basic HTTP requests', () => {
  var server;

  afterEach(async () => {
    await safeClose(server);
    server = null;
  });

  /**
   * Helper to start a relay listener with a given request handler.
   * Returns a promise that resolves when the server is listening.
   */
  function startListener(requestHandler) {
    return new Promise((resolve, reject) => {
      var uri = https.createRelayListenUri(config.namespace, config.path);
      server = https.createRelayedServer({
        server: uri,
        token: () => https.createRelayToken(uri, config.keyRule, config.key)
      }, requestHandler);

      server.listen((err) => {
        if (err) reject(err);
      });

      server.on('error', (err) => {
        reject(err);
      });

      server.on('listening', () => {
        resolve();
      });
    });
  }

  /**
   * Helper to send an HTTPS GET request through the relay.
   * Returns a promise that resolves with { statusCode, body }.
   */
  function sendGet(headers) {
    return new Promise((resolve, reject) => {
      var clientUri = https.createRelayHttpsUri(config.namespace, config.path);
      var token = https.createRelayToken(clientUri, config.keyRule, config.key);
      var path = config.path;
      var reqPath = ((!path || path.length === 0 || path[0] !== '/') ? '/' : '') + path;

      var reqHeaders = Object.assign({
        'ServiceBusAuthorization': token
      }, headers || {});

      https.get({
        hostname: config.namespace,
        path: reqPath,
        port: 443,
        headers: reqHeaders
      }, (res) => {
        var chunks = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { chunks += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: chunks, headers: res.headers });
        });
      }).on('error', (e) => {
        reject(e);
      });
    });
  }

  /**
   * Helper to send an HTTPS POST request through the relay.
   * Returns a promise that resolves with { statusCode, body }.
   */
  function sendPost(requestBody, headers) {
    return new Promise((resolve, reject) => {
      var clientUri = https.createRelayHttpsUri(config.namespace, config.path);
      var token = https.createRelayToken(clientUri, config.keyRule, config.key);
      var path = config.path;
      var reqPath = ((!path || path.length === 0 || path[0] !== '/') ? '/' : '') + path;

      var reqHeaders = Object.assign({
        'ServiceBusAuthorization': token,
        'Content-Type': 'text/plain'
      }, headers || {});

      if (requestBody) {
        reqHeaders['Content-Length'] = Buffer.byteLength(requestBody);
      }

      var req = https.request({
        hostname: config.namespace,
        path: reqPath,
        port: 443,
        method: 'POST',
        headers: reqHeaders
      }, (res) => {
        var chunks = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { chunks += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: chunks, headers: res.headers });
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      if (requestBody) {
        req.end(requestBody);
      } else {
        req.end();
      }
    });
  }

  test('Small GET request returns status 200 with correct response body', async () => {
    var responseBody = 'Hello from relay';

    await startListener((req, res) => {
      expect(req.method).toBe('GET');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(responseBody);
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe(responseBody);
  }, 60000);

  test('Small POST request returns status 200 with correct response body', async () => {
    var requestBody = 'Hello request';
    var responseBody = 'Hello response';

    await startListener((req, res) => {
      expect(req.method).toBe('POST');
      var body = '';
      req.setEncoding('utf-8');
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        expect(body).toBe(requestBody);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(responseBody);
      });
    });

    var result = await sendPost(requestBody);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe(responseBody);
  }, 60000);

  test('Small GET request with custom headers returns 200', async () => {
    await startListener((req, res) => {
      expect(req.method).toBe('GET');
      expect(req.headers['x-custom']).toBe('TestValue');
      res.writeHead(200);
      res.end('OK');
    });

    var result = await sendGet({ 'X-Custom': 'TestValue' });
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('OK');
  }, 60000);

  test('Small GET request with large (65KB+) response body verifies integrity', async () => {
    // Generate a 65KB+ response body with a repeating pattern for integrity check
    var size = 68000; // ~66.4 KB
    var pattern = 'ABCDEFGHIJ';
    var largeBody = '';
    while (largeBody.length < size) {
      largeBody += pattern;
    }
    largeBody = largeBody.substring(0, size);

    await startListener((req, res) => {
      expect(req.method).toBe('GET');
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Content-Length': String(Buffer.byteLength(largeBody))
      });
      res.end(largeBody);
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(200);
    expect(result.body.length).toBe(size);
    expect(result.body).toBe(largeBody);
  }, 60000);

  test('Large (65KB+) POST body with empty response verifies listener receives full body', async () => {
    // Generate a 68KB POST body with repeating pattern
    var size = 68000;
    var pattern = 'ABCDEFGHIJ';
    var largeBody = '';
    while (largeBody.length < size) {
      largeBody += pattern;
    }
    largeBody = largeBody.substring(0, size);

    var receivedBody = '';

    await startListener((req, res) => {
      expect(req.method).toBe('POST');
      req.setEncoding('utf-8');
      req.on('data', (chunk) => { receivedBody += chunk; });
      req.on('end', () => {
        res.writeHead(200);
        res.end();
      });
    });

    var result = await sendPost(largeBody);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('');
    expect(receivedBody.length).toBe(size);
    expect(receivedBody).toBe(largeBody);
  }, 60000);

  test('Empty GET request returns 200 OK with empty response body', async () => {
    await startListener((req, res) => {
      expect(req.method).toBe('GET');
      res.writeHead(200);
      res.end();
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('');
  }, 60000);

  test('Empty POST request (no body) returns 200 OK with empty response body', async () => {
    var receivedBody = '';

    await startListener((req, res) => {
      expect(req.method).toBe('POST');
      req.setEncoding('utf-8');
      req.on('data', (chunk) => { receivedBody += chunk; });
      req.on('end', () => {
        res.writeHead(200);
        res.end();
      });
    });

    var result = await sendPost(null);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('');
    expect(receivedBody).toBe('');
  }, 60000);

  /**
   * Helper to send a chunked HTTPS POST request through the relay using multiple write() calls.
   * The requestBody is split into the given number of chunks and sent via separate write() calls.
   * Returns a promise that resolves with { statusCode, body }.
   */
  function sendChunkedPost(requestBody, numChunks, headers) {
    return new Promise((resolve, reject) => {
      var clientUri = https.createRelayHttpsUri(config.namespace, config.path);
      var token = https.createRelayToken(clientUri, config.keyRule, config.key);
      var path = config.path;
      var reqPath = ((!path || path.length === 0 || path[0] !== '/') ? '/' : '') + path;

      var reqHeaders = Object.assign({
        'ServiceBusAuthorization': token,
        'Content-Type': 'text/plain'
      }, headers || {});

      var req = https.request({
        hostname: config.namespace,
        path: reqPath,
        port: 443,
        method: 'POST',
        headers: reqHeaders
      }, (res) => {
        var chunks = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { chunks += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: chunks, headers: res.headers });
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      // Split body into chunks and send via multiple write() calls
      var chunkSize = Math.ceil(requestBody.length / numChunks);
      for (var i = 0; i < numChunks; i++) {
        var start = i * chunkSize;
        var end = Math.min(start + chunkSize, requestBody.length);
        if (start < requestBody.length) {
          req.write(requestBody.substring(start, end));
        }
      }
      req.end();
    });
  }

  test('Chunked POST via multiple write() calls is received completely by listener', async () => {
    var requestBody = 'chunk1-AAAA|chunk2-BBBB|chunk3-CCCC|chunk4-DDDD';
    var receivedBody = '';

    await startListener((req, res) => {
      expect(req.method).toBe('POST');
      req.setEncoding('utf-8');
      req.on('data', (chunk) => { receivedBody += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      });
    });

    var result = await sendChunkedPost(requestBody, 4);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('OK');
    expect(receivedBody).toBe(requestBody);
    expect(receivedBody.length).toBe(requestBody.length);
  }, 60000);

  test('Chunked POST with large (65KB+) body via multiple write() calls verifies integrity', async () => {
    var size = 68000;
    var pattern = 'ABCDEFGHIJ';
    var largeBody = '';
    while (largeBody.length < size) {
      largeBody += pattern;
    }
    largeBody = largeBody.substring(0, size);
    var receivedBody = '';

    await startListener((req, res) => {
      expect(req.method).toBe('POST');
      req.setEncoding('utf-8');
      req.on('data', (chunk) => { receivedBody += chunk; });
      req.on('end', () => {
        res.writeHead(200);
        res.end('received');
      });
    });

    var result = await sendChunkedPost(largeBody, 8);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('received');
    expect(receivedBody.length).toBe(size);
    expect(receivedBody).toBe(largeBody);
  }, 60000);

  test('Stream piping to response delivers complete data to client', async () => {
    var Stream = require('stream');
    var streamData = 'Stream chunk data repeated. ';
    var fullStreamContent = '';
    var chunkCount = 100;
    for (var i = 0; i < chunkCount; i++) {
      fullStreamContent += streamData;
    }

    await startListener((req, res) => {
      var readStream = new Stream.Readable({
        read() {}
      });

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      readStream.pipe(res);

      // Push chunks into the readable stream
      for (var i = 0; i < chunkCount; i++) {
        readStream.push(streamData);
      }
      readStream.push(null); // signal end of stream
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(200);
    expect(result.body.length).toBe(fullStreamContent.length);
    expect(result.body).toBe(fullStreamContent);
  }, 60000);

  test('Stream piping large (65KB+) data to response delivers complete data to client', async () => {
    var Stream = require('stream');
    var pattern = 'ABCDEFGHIJ';
    var kb = '';
    for (var i = 0; i < 1024; i++) {
      kb += pattern[i % pattern.length];
    }
    // Push 1KB chunks, 68 times = ~68KB
    var chunkCount = 68;
    var expectedBody = '';
    for (var j = 0; j < chunkCount; j++) {
      expectedBody += kb;
    }

    await startListener((req, res) => {
      var readStream = new Stream.Readable({
        read() {}
      });

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      readStream.pipe(res);

      for (var j = 0; j < chunkCount; j++) {
        readStream.push(kb);
      }
      readStream.push(null);
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(200);
    expect(result.body.length).toBe(expectedBody.length);
    expect(result.body).toBe(expectedBody);
  }, 60000);

  test('Small POST with small response verifies round-trip data integrity', async () => {
    var requestBody = 'Request data 12345';
    var responseBody = 'Response data 67890';

    await startListener((req, res) => {
      var body = '';
      req.setEncoding('utf-8');
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        // Echo request body length in response header
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'X-Request-Length': String(body.length)
        });
        res.end(responseBody);
      });
    });

    var result = await sendPost(requestBody);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe(responseBody);
  }, 60000);
});
