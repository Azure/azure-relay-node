/**
 * Integration tests for HTTP query string forwarding via Azure Relay.
 * Verifies query parameters are forwarded to the listener, sb-hc-* params
 * are stripped, URL-encoded characters are handled, and empty/malformed
 * query strings do not cause errors.
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

var https = require('../..');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-https query strings', () => {
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
   * Helper to send an HTTPS GET request with an optional query string appended to the path.
   * Returns a promise that resolves with { statusCode, body, headers }.
   */
  function sendGetWithQuery(queryString) {
    return new Promise((resolve, reject) => {
      var clientUri = https.createRelayHttpsUri(config.namespace, config.path);
      var token = https.createRelayToken(clientUri, config.keyRule, config.key);
      var path = config.path;
      var reqPath = ((!path || path.length === 0 || path[0] !== '/') ? '/' : '') + path;

      if (queryString) {
        reqPath += (reqPath.indexOf('?') === -1 ? '?' : '&') + queryString;
      }

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

  test('Standard query parameters are forwarded to the listener', async () => {
    var receivedUrl = null;

    await startListener((req, res) => {
      receivedUrl = req.url;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });

    var result = await sendGetWithQuery('foo=bar&baz=qux');
    expect(result.statusCode).toBe(200);
    expect(receivedUrl).toBeDefined();
    expect(receivedUrl).toContain('foo=bar');
    expect(receivedUrl).toContain('baz=qux');
  }, 60000);

  test('sb-hc-* query parameters are stripped before forwarding', async () => {
    var receivedUrl = null;

    await startListener((req, res) => {
      receivedUrl = req.url;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });

    var result = await sendGetWithQuery('user=alice&sb-hc-action=test&keep=yes');
    expect(result.statusCode).toBe(200);
    expect(receivedUrl).toBeDefined();
    expect(receivedUrl).toContain('user=alice');
    expect(receivedUrl).toContain('keep=yes');
    // sb-hc-* parameters should be stripped by the relay
    expect(receivedUrl).not.toContain('sb-hc-action');
  }, 60000);

  test('URL-encoded characters in query strings are handled', async () => {
    var receivedUrl = null;

    await startListener((req, res) => {
      receivedUrl = req.url;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });

    var result = await sendGetWithQuery('name=' + encodeURIComponent('hello world') + '&value=' + encodeURIComponent('a&b=c'));
    expect(result.statusCode).toBe(200);
    expect(receivedUrl).toBeDefined();
    expect(receivedUrl).toContain('name=hello%20world');
    expect(receivedUrl).toContain('value=a%26b%3Dc');
  }, 60000);

  test('Empty query string does not cause errors', async () => {
    var receivedUrl = null;

    await startListener((req, res) => {
      receivedUrl = req.url;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });

    var result = await sendGetWithQuery('');
    expect(result.statusCode).toBe(200);
    expect(receivedUrl).toBeDefined();
  }, 60000);

  test('Query string with no value does not cause errors', async () => {
    var receivedUrl = null;

    await startListener((req, res) => {
      receivedUrl = req.url;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });

    var result = await sendGetWithQuery('flag&another=val');
    expect(result.statusCode).toBe(200);
    expect(receivedUrl).toBeDefined();
    expect(receivedUrl).toContain('flag');
    expect(receivedUrl).toContain('another=val');
  }, 60000);
});
