/**
 * Integration tests for hyco-https request handler error scenarios.
 * Verifies behavior when no request handler is registered and when a handler throws an exception.
 *
 * Modeled after .NET HybridRequestTests.RequestHandlerErrors.
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

var https = require('../..');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-https request handler errors', () => {
  var server;

  afterEach(async () => {
    await safeClose(server);
    server = null;
  });

  /**
   * Helper to start a relay listener with an optional request handler.
   * Returns a promise that resolves when the server is listening.
   */
  function startListener(requestHandler) {
    return new Promise((resolve, reject) => {
      var uri = https.createRelayListenUri(config.namespace, config.path);
      var options = {
        server: uri,
        token: () => https.createRelayToken(uri, config.keyRule, config.key)
      };

      if (requestHandler) {
        server = https.createRelayedServer(options, requestHandler);
      } else {
        server = https.createRelayedServer(options);
      }

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
   * Helper to send an HTTPS GET request through the relay with a timeout.
   * Returns a promise that resolves with { statusCode, body } or rejects on error/timeout.
   */
  function sendGet(timeoutMs) {
    timeoutMs = timeoutMs || 30000;
    return new Promise((resolve, reject) => {
      var clientUri = https.createRelayHttpsUri(config.namespace, config.path);
      var token = https.createRelayToken(clientUri, config.keyRule, config.key);
      var path = config.path;
      var reqPath = ((!path || path.length === 0 || path[0] !== '/') ? '/' : '') + path;

      var timer = setTimeout(() => {
        req.destroy(new Error('Request timed out'));
      }, timeoutMs);

      var req = https.get({
        hostname: config.namespace,
        path: reqPath,
        port: 443,
        headers: {
          'ServiceBusAuthorization': token
        }
      }, (res) => {
        var chunks = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { chunks += chunk; });
        res.on('end', () => {
          clearTimeout(timer);
          resolve({ statusCode: res.statusCode, body: chunks, headers: res.headers });
        });
      });

      req.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  test('No request handler configured: server does not crash and client gets error or timeout', async () => {
    // Start listener with no request handler — the server should not crash
    await startListener(null);

    // With no handler, the relay request has no response written, so the client
    // will either get a timeout or an error status from the relay infrastructure.
    try {
      var result = await sendGet(15000);
      // If we get a response, it should indicate an error (not 200 OK)
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
    } catch (e) {
      // A timeout or connection error is acceptable when there's no handler
      expect(e).toBeDefined();
    }
  }, 60000);

  test('Request handler that throws: exception details are not leaked to client', async () => {
    var secretMessage = 'SuperSecretInternalError_12345';

    await startListener((req, res) => {
      throw new Error(secretMessage);
    });

    try {
      var result = await sendGet(15000);
      // Exception details MUST NOT be leaked to the client regardless of status code
      expect(result.body).not.toContain(secretMessage);
    } catch (e) {
      // A connection error or timeout is also acceptable — the key is the exception doesn't leak
      expect(e.message).not.toContain(secretMessage);
    }
  }, 60000);

  test('Request handler that throws: stack trace not leaked to client', async () => {
    var secretFunction = 'mySecretFunctionName';

    await startListener(function mySecretFunctionName(req, res) {
      throw new TypeError('Invalid operation in ' + secretFunction);
    });

    try {
      var result = await sendGet(15000);
      // Verify the stack trace and function name are not in the response body
      expect(result.body).not.toContain(secretFunction);
      expect(result.body).not.toContain('TypeError');
      expect(result.body).not.toContain('Invalid operation');
    } catch (e) {
      // Connection error is acceptable — verify exception details not in error message
      expect(e.message).not.toContain(secretFunction);
    }
  }, 60000);
});
