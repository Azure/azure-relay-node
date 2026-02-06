/**
 * Integration tests for hyco-ws HTTP request mode.
 * Verifies that the hyco-ws server can receive HTTP GET/POST requests via the control channel,
 * parse url/method/headers, and send correct responses with writeHead(), write(), end().
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

require('ws');
var https = require('https');
var WebSocket = require('../../');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-ws HTTP request mode', () => {
  jest.setTimeout(60000);

  var wss;

  afterEach(async () => {
    await safeClose(wss);
    wss = null;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  /**
   * Helper to start a relay server with an HTTP request handler.
   */
  function startServer(requestHandler) {
    return new Promise((resolve, reject) => {
      var uri = WebSocket.createRelayListenUri(config.namespace, config.path);
      var token = WebSocket.createRelayToken(uri, config.keyRule, config.key);

      wss = WebSocket.createRelayedServer({
        server: uri,
        token: token
      });

      wss.on('request', requestHandler);

      wss.on('listening', () => {
        resolve(wss);
      });

      wss.on('error', (err) => {
        reject(err);
      });

      setTimeout(() => {
        reject(new Error('Server listening timeout'));
      }, 30000);
    });
  }

  /**
   * Helper to send an HTTPS GET request through the relay.
   * Returns a promise that resolves with { statusCode, body, headers }.
   */
  function sendGet(extraHeaders) {
    return new Promise((resolve, reject) => {
      var clientUri = 'https://' + config.namespace + '/' + config.path;
      var token = WebSocket.createRelayToken(clientUri, config.keyRule, config.key);
      var path = config.path;
      var reqPath = ((!path || path.length === 0 || path[0] !== '/') ? '/' : '') + path;

      var reqHeaders = Object.assign({
        'ServiceBusAuthorization': token
      }, extraHeaders || {});

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
   * Returns a promise that resolves with { statusCode, body, headers }.
   */
  function sendPost(requestBody, extraHeaders) {
    return new Promise((resolve, reject) => {
      var clientUri = 'https://' + config.namespace + '/' + config.path;
      var token = WebSocket.createRelayToken(clientUri, config.keyRule, config.key);
      var path = config.path;
      var reqPath = ((!path || path.length === 0 || path[0] !== '/') ? '/' : '') + path;

      var reqHeaders = Object.assign({
        'ServiceBusAuthorization': token,
        'Content-Type': 'text/plain'
      }, extraHeaders || {});

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

  test('Server receives HTTP GET request with correct url and method', async () => {
    var receivedReq = null;

    await startServer((req, res) => {
      receivedReq = { url: req.url, method: req.method, headers: req.headers };
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('OK');
    expect(receivedReq).not.toBeNull();
    expect(receivedReq.method).toBe('GET');
    expect(receivedReq.url).toBeDefined();
  });

  test('Server receives HTTP POST request with body', async () => {
    var receivedBody = '';

    await startServer((req, res) => {
      var body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        receivedBody = body;
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Received: ' + body);
      });
    });

    var result = await sendPost('Hello from client');
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('Received: Hello from client');
    expect(receivedBody).toBe('Hello from client');
  });

  test('Server receives request headers from client', async () => {
    var receivedHeaders = null;

    await startServer((req, res) => {
      receivedHeaders = req.headers;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });

    var result = await sendGet({ 'X-Custom-Header': 'test-value-123' });
    expect(result.statusCode).toBe(200);
    expect(receivedHeaders).not.toBeNull();
    expect(receivedHeaders['x-custom-header']).toBe('test-value-123');
  });

  test('Response writeHead() sets status code relayed to client', async () => {
    await startServer((req, res) => {
      res.writeHead(201, 'Created', { 'Content-Type': 'text/plain' });
      res.end('Resource created');
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(201);
    expect(result.body).toBe('Resource created');
  });

  test('Response write() and end() send correct HTTP response body', async () => {
    await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.write('Part 1. ');
      res.write('Part 2. ');
      res.end('Part 3.');
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('Part 1. Part 2. Part 3.');
  });
});
