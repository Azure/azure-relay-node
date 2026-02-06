/**
 * Integration tests for concurrent HTTP requests via Azure Relay.
 * Verifies the server handles 10+ concurrent GET and POST requests without errors.
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

var https = require('../..');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-https concurrent HTTP requests', () => {
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
  function sendGet(extraHeaders) {
    return new Promise((resolve, reject) => {
      var clientUri = https.createRelayHttpsUri(config.namespace, config.path);
      var token = https.createRelayToken(clientUri, config.keyRule, config.key);
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
          resolve({ statusCode: res.statusCode, body: chunks });
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
  function sendPost(requestBody, extraHeaders) {
    return new Promise((resolve, reject) => {
      var clientUri = https.createRelayHttpsUri(config.namespace, config.path);
      var token = https.createRelayToken(clientUri, config.keyRule, config.key);
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
          resolve({ statusCode: res.statusCode, body: chunks });
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

  test('Server handles 10+ concurrent GET requests without errors', async () => {
    var count = 12;

    await startListener((req, res) => {
      var id = req.headers['x-request-id'] || 'unknown';
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('response-' + id);
    });

    // Send all requests concurrently
    var promises = [];
    for (var i = 0; i < count; i++) {
      promises.push(sendGet({ 'X-Request-Id': String(i) }));
    }

    var results = await Promise.all(promises);

    // Verify all responses returned 200
    for (var j = 0; j < count; j++) {
      expect(results[j].statusCode).toBe(200);
      expect(results[j].body).toBe('response-' + j);
    }
  }, 60000);

  test('Server handles 10+ concurrent POST requests without errors', async () => {
    var count = 12;

    await startListener((req, res) => {
      var body = '';
      req.setEncoding('utf-8');
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('echo:' + body);
      });
    });

    // Send all POST requests concurrently
    var promises = [];
    for (var i = 0; i < count; i++) {
      promises.push(sendPost('payload-' + i));
    }

    var results = await Promise.all(promises);

    // Verify all responses returned 200 with echoed body
    for (var j = 0; j < count; j++) {
      expect(results[j].statusCode).toBe(200);
      expect(results[j].body).toBe('echo:payload-' + j);
    }
  }, 60000);

  test('Server handles concurrent GET and POST requests simultaneously', async () => {
    var getCount = 6;
    var postCount = 6;

    await startListener((req, res) => {
      if (req.method === 'GET') {
        var id = req.headers['x-request-id'] || 'unknown';
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('get-' + id);
      } else if (req.method === 'POST') {
        var body = '';
        req.setEncoding('utf-8');
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('post-echo:' + body);
        });
      }
    });

    // Send GET and POST requests concurrently
    var promises = [];
    for (var i = 0; i < getCount; i++) {
      (function (idx) {
        promises.push(
          sendGet({ 'X-Request-Id': String(idx) })
            .then((r) => ({ type: 'get', index: idx, result: r }))
        );
      })(i);
    }
    for (var k = 0; k < postCount; k++) {
      (function (idx) {
        promises.push(
          sendPost('data-' + idx)
            .then((r) => ({ type: 'post', index: idx, result: r }))
        );
      })(k);
    }

    var results = await Promise.all(promises);

    // Verify all GET responses
    var getResults = results.filter((r) => r.type === 'get');
    expect(getResults.length).toBe(getCount);
    for (var g = 0; g < getResults.length; g++) {
      expect(getResults[g].result.statusCode).toBe(200);
      expect(getResults[g].result.body).toBe('get-' + getResults[g].index);
    }

    // Verify all POST responses
    var postResults = results.filter((r) => r.type === 'post');
    expect(postResults.length).toBe(postCount);
    for (var p = 0; p < postResults.length; p++) {
      expect(postResults[p].result.statusCode).toBe(200);
      expect(postResults[p].result.body).toBe('post-echo:data-' + postResults[p].index);
    }
  }, 60000);
});
