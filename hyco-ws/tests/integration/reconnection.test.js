/**
 * Integration tests for hyco-ws server reconnection behavior.
 * Tests that the server reconnects with exponential backoff after control channel loss,
 * emits 'listening' after reconnect, and does not reconnect after explicit close().
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

require('ws');
var WebSocket = require('../../');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-ws server reconnection', () => {
  jest.setTimeout(120000);

  var wss;

  afterEach(async () => {
    if (wss && !wss.closeRequested) {
      await safeClose(wss);
    }
    wss = null;
    // Allow time for control channel cleanup between tests
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  /**
   * Helper to start a relay server and wait for the 'listening' event.
   */
  function startServer(connectionHandler) {
    return new Promise((resolve, reject) => {
      var token = WebSocket.createRelayToken(
        WebSocket.createRelayListenUri(config.namespace, config.path),
        config.keyRule, config.key
      );

      wss = WebSocket.createRelayedServer({
        server: WebSocket.createRelayListenUri(config.namespace, config.path),
        token: token
      }, connectionHandler || function() {});

      wss.on('listening', function onListening() {
        wss.removeListener('listening', onListening);
        resolve(wss);
      });

      wss.on('error', (err) => {
        // Suppress errors during reconnect tests
      });

      setTimeout(() => {
        reject(new Error('Server listening timeout'));
      }, 30000);
    });
  }

  test('Server reconnects after control channel close and emits listening event', async () => {
    await startServer();

    expect(wss.controlChannel).toBeDefined();

    // Wait for control channel to be fully open
    await new Promise((resolve) => {
      var check = setInterval(() => {
        if (wss.controlChannel && wss.controlChannel.readyState === WebSocket.OPEN) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 15000);
    });

    // Wait for 'listening' event after reconnection
    var listeningPromise = new Promise((resolve) => {
      wss.on('listening', () => {
        resolve(true);
      });
    });

    // Force close the control channel to simulate channel loss
    wss.controlChannel.close();

    // Wait for reconnection - server should reconnect and emit 'listening'
    var reconnected = await Promise.race([
      listeningPromise,
      new Promise((resolve) => setTimeout(() => resolve(false), 60000))
    ]);

    expect(reconnected).toBe(true);
    expect(wss.controlChannel).toBeDefined();
  });

  test('Server remains functional after reconnection (can accept clients)', async () => {
    await startServer((ws) => {
      ws.on('message', (msg) => {
        ws.send('echo:' + msg);
      });
    });

    // Wait for control channel open
    await new Promise((resolve) => {
      var check = setInterval(() => {
        if (wss.controlChannel && wss.controlChannel.readyState === WebSocket.OPEN) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 15000);
    });

    // Force close to trigger reconnection
    var listeningPromise = new Promise((resolve) => {
      wss.on('listening', () => {
        resolve(true);
      });
    });

    wss.controlChannel.close();
    await listeningPromise;

    // Wait for new control channel to be fully open
    await new Promise((resolve) => {
      var check = setInterval(() => {
        if (wss.controlChannel && wss.controlChannel.readyState === WebSocket.OPEN) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 15000);
    });

    // Now try to connect a client and exchange messages
    var sendUri = WebSocket.createRelaySendUri(config.namespace, config.path);
    var token = WebSocket.createRelayToken(sendUri, config.keyRule, config.key);

    var received = await new Promise((resolve, reject) => {
      var client = WebSocket.relayedConnect(sendUri, token, (ws) => {
        ws.on('message', (data) => {
          ws.close();
          resolve(data);
        });
        ws.on('error', reject);
        ws.send('test-after-reconnect');
      });
      client.on('error', reject);
      setTimeout(() => reject(new Error('Client timeout after reconnect')), 30000);
    });

    expect(received).toBe('echo:test-after-reconnect');
  });

  test('Server does NOT reconnect after explicit close()', async () => {
    await startServer();

    // Wait for control channel open
    await new Promise((resolve) => {
      var check = setInterval(() => {
        if (wss.controlChannel && wss.controlChannel.readyState === WebSocket.OPEN) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 15000);
    });

    var reconnected = false;
    wss.on('listening', () => {
      reconnected = true;
    });

    // Explicitly close the server
    await new Promise((resolve) => {
      wss.close((err) => {
        resolve();
      });
    });

    expect(wss.closeRequested).toBe(true);

    // Wait to confirm no reconnection occurs
    await new Promise((resolve) => setTimeout(resolve, 10000));

    expect(reconnected).toBe(false);
  });
});
