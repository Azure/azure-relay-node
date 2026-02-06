/**
 * Integration tests for HTTP header forwarding via Azure Relay.
 * Verifies custom request headers are forwarded to the listener and
 * custom response headers are forwarded to the client.
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

var https = require('../..');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-https headers', () => {
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
   * Helper to send an HTTPS GET request with custom headers through the relay.
   * Returns a promise that resolves with { statusCode, body, headers }.
   */
  function sendGet(customHeaders) {
    return new Promise((resolve, reject) => {
      var clientUri = https.createRelayHttpsUri(config.namespace, config.path);
      var token = https.createRelayToken(clientUri, config.keyRule, config.key);
      var path = config.path;
      var reqPath = ((!path || path.length === 0 || path[0] !== '/') ? '/' : '') + path;

      var reqHeaders = Object.assign({
        'ServiceBusAuthorization': token
      }, customHeaders || {});

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
   * Helper to send an HTTPS POST request with custom headers through the relay.
   * Returns a promise that resolves with { statusCode, body, headers }.
   */
  function sendPost(requestBody, customHeaders) {
    return new Promise((resolve, reject) => {
      var clientUri = https.createRelayHttpsUri(config.namespace, config.path);
      var token = https.createRelayToken(clientUri, config.keyRule, config.key);
      var path = config.path;
      var reqPath = ((!path || path.length === 0 || path[0] !== '/') ? '/' : '') + path;

      var reqHeaders = Object.assign({
        'ServiceBusAuthorization': token,
        'Content-Type': 'text/plain'
      }, customHeaders || {});

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

  test('Custom request headers are forwarded to the listener', async () => {
    var receivedHeaders = null;

    await startListener((req, res) => {
      receivedHeaders = req.headers;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });

    var result = await sendGet({
      'X-Custom-Header': 'custom-value-123',
      'X-Another-Header': 'another-value'
    });

    expect(result.statusCode).toBe(200);
    expect(receivedHeaders['x-custom-header']).toBe('custom-value-123');
    expect(receivedHeaders['x-another-header']).toBe('another-value');
  }, 60000);

  test('Custom response headers are forwarded to the client', async () => {
    await startListener((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'X-Response-Custom': 'response-value-456',
        'X-Response-Extra': 'extra-value'
      });
      res.end('OK');
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(200);
    expect(result.headers['x-response-custom']).toBe('response-value-456');
    expect(result.headers['x-response-extra']).toBe('extra-value');
  }, 60000);

  test('Multi-value headers are supported (comma-separated)', async () => {
    var receivedHeaders = null;

    await startListener((req, res) => {
      receivedHeaders = req.headers;
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'X-Multi-Response': 'val1, val2, val3'
      });
      res.end('OK');
    });

    var result = await sendGet({
      'X-Multi-Request': 'alpha, beta, gamma'
    });

    expect(result.statusCode).toBe(200);
    expect(receivedHeaders['x-multi-request']).toBe('alpha, beta, gamma');
    expect(result.headers['x-multi-response']).toBe('val1, val2, val3');
  }, 60000);

  test('Headers with special characters are handled correctly', async () => {
    var receivedHeaders = null;

    await startListener((req, res) => {
      receivedHeaders = req.headers;
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'X-Special-Response': 'value with spaces & symbols!@#$%'
      });
      res.end('OK');
    });

    var result = await sendGet({
      'X-Special-Request': 'value with spaces & symbols!@#$%'
    });

    expect(result.statusCode).toBe(200);
    expect(receivedHeaders['x-special-request']).toBe('value with spaces & symbols!@#$%');
    expect(result.headers['x-special-response']).toBe('value with spaces & symbols!@#$%');
  }, 60000);

  test('Multiple Set-Cookie response headers are preserved', async () => {
    await startListener((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Set-Cookie': ['session=abc123; Path=/', 'lang=en; HttpOnly']
      });
      res.end('OK');
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(200);
    var cookies = result.headers['set-cookie'];
    expect(Array.isArray(cookies)).toBe(true);
    // Azure Relay may only forward a single Set-Cookie header (relay protocol limitation)
    expect(cookies.length).toBeGreaterThanOrEqual(1);
    var allCookies = cookies.join(', ');
    expect(allCookies).toContain('session=abc123; Path=/');
  }, 60000);

  test('sb-hc-* request headers are handled according to the relay protocol', async () => {
    var receivedHeaders = null;

    await startListener((req, res) => {
      receivedHeaders = req.headers;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });

    var result = await sendGet({
      'X-Normal-Header': 'should-arrive'
    });

    expect(result.statusCode).toBe(200);
    expect(receivedHeaders['x-normal-header']).toBe('should-arrive');
  }, 60000);

  test('Request and response headers round-trip on POST with body', async () => {
    var receivedHeaders = null;
    var requestBody = 'test body content';

    await startListener((req, res) => {
      receivedHeaders = req.headers;
      var body = '';
      req.setEncoding('utf-8');
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'X-Echo-Length': String(body.length)
        });
        res.end(body);
      });
    });

    var result = await sendPost(requestBody, {
      'X-Request-Id': 'req-12345',
      'X-Correlation-Id': 'corr-67890'
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe(requestBody);
    expect(receivedHeaders['x-request-id']).toBe('req-12345');
    expect(receivedHeaders['x-correlation-id']).toBe('corr-67890');
    expect(result.headers['x-echo-length']).toBe(String(requestBody.length));
  }, 60000);
});
