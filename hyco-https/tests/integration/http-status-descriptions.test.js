/**
 * Integration tests for custom and null HTTP status descriptions via Azure Relay.
 * Verifies the listener can set custom status descriptions and handle null/empty
 * status descriptions gracefully.
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

var https = require('../..');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-https HTTP status descriptions', () => {
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
   * Returns a promise that resolves with { statusCode, statusMessage, body, headers }.
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
          resolve({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            body: chunks,
            headers: res.headers
          });
        });
      }).on('error', (e) => {
        reject(e);
      });
    });
  }

  test('Custom status description is relayed to client', async () => {
    await startListener((req, res) => {
      res.writeHead(200, 'All Good Here', { 'Content-Type': 'text/plain' });
      res.end('OK');
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(200);
    expect(result.statusMessage).toBe('All Good Here');
  }, 60000);

  test('Custom status description with non-standard status code', async () => {
    await startListener((req, res) => {
      res.writeHead(299, 'Custom Success', { 'Content-Type': 'text/plain' });
      res.end('Custom');
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(299);
    expect(result.statusMessage).toBe('Custom Success');
  }, 60000);

  test('Empty status description is handled gracefully', async () => {
    await startListener((req, res) => {
      res.writeHead(200, '', { 'Content-Type': 'text/plain' });
      res.end('OK');
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(200);
    // Empty string or default status message - should not error
    expect(typeof result.statusMessage).toBe('string');
  }, 60000);

  test('Undefined status description defaults to standard phrase', async () => {
    await startListener((req, res) => {
      // writeHead with only status code and headers (no custom reason)
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not here');
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(404);
    expect(result.statusMessage).toBe('Not Found');
  }, 60000);

  test('Status description with spaces and punctuation', async () => {
    await startListener((req, res) => {
      res.writeHead(200, 'Request Processed - OK!', { 'Content-Type': 'text/plain' });
      res.end('Done');
    });

    var result = await sendGet();
    expect(result.statusCode).toBe(200);
    expect(result.statusMessage).toBe('Request Processed - OK!');
  }, 60000);
});
