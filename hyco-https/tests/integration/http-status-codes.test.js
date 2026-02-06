/**
 * Integration tests for HTTP status code coverage via Azure Relay.
 * Verifies the listener can set and return standard HTTP status codes
 * (200, 201, 204, 301, 302, 400, 401, 403, 404, 500, 502, 503, etc.).
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

var https = require('../..');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-https HTTP status codes', () => {
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
   * Returns a promise that resolves with { statusCode, body, headers }.
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
          resolve({ statusCode: res.statusCode, body: chunks, headers: res.headers });
        });
      }).on('error', (e) => {
        reject(e);
      });
    });
  }

  // Standard HTTP status codes to test
  var statusCodes = [
    { code: 200, description: 'OK', hasBody: true },
    { code: 201, description: 'Created', hasBody: true },
    { code: 204, description: 'No Content', hasBody: false },
    { code: 301, description: 'Moved Permanently', hasBody: true },
    { code: 302, description: 'Found', hasBody: true },
    { code: 400, description: 'Bad Request', hasBody: true },
    { code: 401, description: 'Unauthorized', hasBody: true },
    { code: 403, description: 'Forbidden', hasBody: true },
    { code: 404, description: 'Not Found', hasBody: true },
    { code: 500, description: 'Internal Server Error', hasBody: true },
    { code: 502, description: 'Bad Gateway', hasBody: true },
    { code: 503, description: 'Service Unavailable', hasBody: true }
  ];

  statusCodes.forEach(({ code, description, hasBody }) => {
    test('Listener returns status ' + code + ' (' + description + ') correctly', async () => {
      await startListener((req, res) => {
        res.writeHead(code, { 'Content-Type': 'text/plain' });
        if (hasBody) {
          res.end('Status ' + code);
        } else {
          res.end();
        }
      });

      var result = await sendGet();
      expect(result.statusCode).toBe(code);

      if (hasBody) {
        expect(result.body).toBe('Status ' + code);
      }
    }, 60000);
  });
});
