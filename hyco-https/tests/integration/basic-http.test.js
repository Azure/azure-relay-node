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
