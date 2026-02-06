/**
 * Integration tests for TCP connection drop before server accepts the request.
 * Modeled after .NET RunTimeTests.ListenerAbortWhileClientReadingTest and
 * the original hyco-websocket Tape test (dropBeforeAccept.js).
 *
 * Tests that when a client aborts its connection before the server calls
 * request.accept(), the accept fails or the resulting connection closes with
 * code 1006 because the relay tore down the rendezvous.
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

var WebSocket = require('../../');
var WebSocketServer = require('../../lib/HybridConnectionsWebSocketServer');
var WebSocketClient = require('websocket').client;
var { createRelayConfig, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-websocket connection drop before accept', () => {
  jest.setTimeout(60000);

  var wsServer;

  afterEach(async () => {
    if (wsServer) {
      try { wsServer.close(); } catch (e) { /* ignore */ }
      wsServer = null;
    }
    // Allow time for control channel cleanup
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  function startServer(options) {
    return new Promise((resolve, reject) => {
      var uri = WebSocket.createRelayListenUri(config.namespace, config.path);
      var token = WebSocket.createRelayToken(uri, config.keyRule, config.key);

      var serverConfig = Object.assign({
        server: uri,
        token: token,
        autoAcceptConnections: false
      }, options || {});

      wsServer = new WebSocketServer(serverConfig);

      wsServer.on('error', (err) => {
        reject(err);
      });

      var checkReady = setInterval(() => {
        if (wsServer.controlChannel) {
          clearInterval(checkReady);
          resolve(wsServer);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkReady);
        reject(new Error('Server control channel connection timeout'));
      }, 30000);
    });
  }

  test('Drop TCP connection before accept emits close event with code 1006', async () => {
    await startServer();

    var result = await new Promise((resolve, reject) => {
      var timeout = setTimeout(() => {
        resolve({ type: 'timeout' });
      }, 30000);

      // Capture the server request - do NOT accept yet
      wsServer.on('request', (request) => {
        // Abort the client immediately - it's still in connecting state
        // (relay hasn't completed the handshake because server hasn't accepted)
        client.abort();

        // Wait for the relay to detect the sender abort, then try to accept
        setTimeout(() => {
          // Listen for requestRejected in case accept fails entirely
          request.on('requestRejected', (error) => {
            clearTimeout(timeout);
            resolve({ type: 'acceptFailed', error: error });
          });

          try {
            request.accept(null, request.origin, null, (connectionOrError) => {
              if (connectionOrError instanceof Error || !connectionOrError.on) {
                clearTimeout(timeout);
                resolve({ type: 'acceptFailed', error: connectionOrError });
                return;
              }

              var connection = connectionOrError;
              connection.on('close', (reasonCode, description) => {
                clearTimeout(timeout);
                resolve({ type: 'close', reasonCode, description });
              });

              connection.on('error', () => {
                // Error may precede close; wait for close
              });
            });
          } catch (e) {
            clearTimeout(timeout);
            resolve({ type: 'acceptThrew', error: e });
          }
        }, 2000);
      });

      // Start client connection (non-blocking) - client stays in connecting state
      // until server accepts, giving us the window to abort
      var sendUri = WebSocket.createRelaySendUri(config.namespace, config.path);
      var token = WebSocket.createRelayToken(sendUri, config.keyRule, config.key);
      var client = new WebSocketClient();

      client.on('connect', () => {
        // Should not connect since we abort before accept
      });
      client.on('connectFailed', () => {
        // Expected - the client was aborted
      });

      client.connect(sendUri, null, null, {
        'ServiceBusAuthorization': token
      });
    });

    // The accept should fail (relay tore down rendezvous after sender abort)
    // or the connection should close with 1006 (abnormal closure)
    if (result.type === 'close') {
      expect(result.reasonCode).toBe(1006);
    } else if (result.type === 'acceptFailed' || result.type === 'acceptThrew') {
      expect(result.error).toBeDefined();
    } else {
      throw new Error('Test timed out or got unexpected result type: ' + result.type);
    }
  });
});
