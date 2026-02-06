/**
 * Integration tests for hyco-https response immutability after body write.
 * Verifies that setting status code, headers, or status description after writing
 * the response body throws an error.
 *
 * Modeled after .NET HybridRequestTests.ResponseHeadersAfterBody.
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

var https = require('../..');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-https response immutability after body write', () => {
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
  function sendGet() {
    return new Promise((resolve, reject) => {
      var clientUri = https.createRelayHttpsUri(config.namespace, config.path);
      var token = https.createRelayToken(clientUri, config.keyRule, config.key);
      var path = config.path;
      var reqPath = ((!path || path.length === 0 || path[0] !== '/') ? '/' : '') + path;

      https.get({
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
          resolve({ statusCode: res.statusCode, body: chunks, headers: res.headers });
        });
      }).on('error', (e) => {
        reject(e);
      });
    });
  }

  test('Setting headers after writing body throws ERR_HTTP_HEADERS_SENT', async () => {
    var thrownError = null;

    await startListener((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.write('body content');
      try {
        res.setHeader('X-After-Body', 'should-fail');
      } catch (e) {
        thrownError = e;
      }
      res.end();
    });

    var result = await sendGet();
    // The request should still complete successfully
    expect(result.statusCode).toBe(200);
    // The setHeader call after write should have thrown
    expect(thrownError).not.toBeNull();
    expect(thrownError.code).toBe('ERR_HTTP_HEADERS_SENT');
  }, 60000);

  test('Removing headers after writing body throws ERR_HTTP_HEADERS_SENT', async () => {
    var thrownError = null;

    await startListener((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'X-Custom': 'value' });
      res.write('body content');
      try {
        res.removeHeader('X-Custom');
      } catch (e) {
        thrownError = e;
      }
      res.end();
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(200);
    expect(thrownError).not.toBeNull();
    expect(thrownError.code).toBe('ERR_HTTP_HEADERS_SENT');
  }, 60000);

  test('Calling writeHead() after writing body throws ERR_HTTP_HEADERS_SENT', async () => {
    var thrownError = null;

    await startListener((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.write('body content');
      try {
        res.writeHead(404);
      } catch (e) {
        thrownError = e;
      }
      res.end();
    });

    var result = await sendGet();
    // Original status code should be preserved
    expect(result.statusCode).toBe(200);
    expect(thrownError).not.toBeNull();
    expect(thrownError.code).toBe('ERR_HTTP_HEADERS_SENT');
  }, 60000);
});
