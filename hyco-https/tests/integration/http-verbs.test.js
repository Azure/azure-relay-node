/**
 * Integration tests for HTTP verb coverage via Azure Relay.
 * Verifies all standard HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
 * are correctly forwarded to the listener and return 200 OK.
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

var https = require('../..');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-https HTTP verbs', () => {
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
   * Helper to send an HTTPS request with any HTTP method through the relay.
   * Returns a promise that resolves with { statusCode, body, headers }.
   */
  function sendRequest(method, requestBody) {
    return new Promise((resolve, reject) => {
      var clientUri = https.createRelayHttpsUri(config.namespace, config.path);
      var token = https.createRelayToken(clientUri, config.keyRule, config.key);
      var path = config.path;
      var reqPath = ((!path || path.length === 0 || path[0] !== '/') ? '/' : '') + path;

      var reqHeaders = {
        'ServiceBusAuthorization': token
      };

      if (requestBody) {
        reqHeaders['Content-Type'] = 'text/plain';
        reqHeaders['Content-Length'] = Buffer.byteLength(requestBody);
      }

      var req = https.request({
        hostname: config.namespace,
        path: reqPath,
        port: 443,
        method: method,
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

  var methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

  methods.forEach((method) => {
    test(method + ' request returns 200 OK and listener receives correct method', async () => {
      var receivedMethod = null;

      await startListener((req, res) => {
        receivedMethod = req.method;
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(method === 'HEAD' ? undefined : 'OK');
      });

      var body = (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && method !== 'DELETE')
        ? 'test body'
        : null;

      var result = await sendRequest(method, body);
      expect(result.statusCode).toBe(200);
      expect(receivedMethod).toBe(method);

      // HEAD returns no body per HTTP spec
      if (method !== 'HEAD') {
        expect(result.body).toBe('OK');
      }
    }, 60000);
  });
});
