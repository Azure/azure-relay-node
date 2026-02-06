/**
 * Integration tests for hyco-ws authentication and error scenarios.
 * Tests non-existent namespace, bad path, invalid SAS key, and unauthenticated client.
 *
 * Modeled after .NET RunTimeTests negative tests (REQ-INT-WS-060 through REQ-INT-WS-064).
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

require('ws');
var WebSocket = require('../../');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-ws auth errors', () => {
  jest.setTimeout(60000);

  var wss;

  afterEach(async () => {
    await safeClose(wss);
    wss = null;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  test('Connecting to a non-existent namespace produces an error', (done) => {
    var fakeNamespace = 'nonexistent-' + Date.now() + '.servicebus.windows.net';
    var sendUri = WebSocket.createRelaySendUri(fakeNamespace, config.path);
    var token = WebSocket.createRelayToken(sendUri, config.keyRule, config.key);

    var client = WebSocket.relayedConnect(sendUri, token);

    client.on('error', (err) => {
      expect(err).toBeDefined();
      done();
    });

    client.on('open', () => {
      client.close();
      done(new Error('Expected connection to fail for non-existent namespace'));
    });
  });

  test('Connecting to a non-existent Hybrid Connection path produces an error', (done) => {
    var fakePath = 'nonexistent-path-' + Date.now();
    var sendUri = WebSocket.createRelaySendUri(config.namespace, fakePath);
    var token = WebSocket.createRelayToken(sendUri, config.keyRule, config.key);

    var client = WebSocket.relayedConnect(sendUri, token);

    client.on('error', (err) => {
      expect(err).toBeDefined();
      done();
    });

    client.on('open', () => {
      client.close();
      done(new Error('Expected connection to fail for non-existent path'));
    });
  });

  test('Listener with invalid SAS key fails to open', (done) => {
    var badKey = 'InvalidKeyValueThatIsDefinitelyWrong1234567890==';
    var listenUri = WebSocket.createRelayListenUri(config.namespace, config.path);
    var badToken = WebSocket.createRelayToken(listenUri, config.keyRule, badKey);

    wss = WebSocket.createRelayedServer({
      server: listenUri,
      token: badToken
    });

    wss.on('error', (err) => {
      expect(err).toBeDefined();
      done();
    });

    wss.on('listening', () => {
      done(new Error('Expected listener to fail with invalid SAS key'));
    });
  });

  test('Client with invalid SAS key fails to connect', (done) => {
    var badKey = 'InvalidKeyValueThatIsDefinitelyWrong1234567890==';
    var sendUri = WebSocket.createRelaySendUri(config.namespace, config.path);
    var badToken = WebSocket.createRelayToken(sendUri, config.keyRule, badKey);

    var client = WebSocket.relayedConnect(sendUri, badToken);

    client.on('error', (err) => {
      expect(err).toBeDefined();
      done();
    });

    client.on('open', () => {
      client.close();
      done(new Error('Expected connection to fail with invalid SAS key'));
    });
  });

  test('Unauthenticated client connecting to authenticated endpoint fails', (done) => {
    var sendUri = WebSocket.createRelaySendUri(config.namespace, config.path);

    // Connect without a token (null token)
    var client = WebSocket.relayedConnect(sendUri, null);

    client.on('error', (err) => {
      expect(err).toBeDefined();
      done();
    });

    client.on('open', () => {
      client.close();
      done(new Error('Expected connection to fail without authentication'));
    });
  });
});
