/**
 * Integration tests for hyco-websocket token renewal.
 * Verifies that the server works correctly when the token option is a function,
 * including initial token call, server connectivity, and renewal setup.
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

describeIf(config)('hyco-websocket token renewal', () => {
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

  /**
   * Helper to start a relay WebSocket server with custom options.
   * Returns a promise that resolves when the control channel is connected.
   */
  function startServer(options) {
    return new Promise((resolve, reject) => {
      var uri = WebSocket.createRelayListenUri(config.namespace, config.path);

      var serverConfig = Object.assign({
        server: uri,
        autoAcceptConnections: false
      }, options || {});

      wsServer = new WebSocketServer(serverConfig);

      wsServer.on('error', (err) => {
        reject(err);
      });

      // Poll for control channel connection
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

  /**
   * Helper to connect a client through Azure Relay.
   */
  function connectClient(protocols) {
    return new Promise((resolve, reject) => {
      var sendUri = WebSocket.createRelaySendUri(config.namespace, config.path);
      var token = WebSocket.createRelayToken(sendUri, config.keyRule, config.key);

      var client = new WebSocketClient();
      client.on('connect', (connection) => {
        resolve(connection);
      });
      client.on('connectFailed', (error) => {
        reject(error);
      });

      client.connect(sendUri, protocols || null, null, {
        'ServiceBusAuthorization': token
      });
    });
  }

  test('Token function is called for initial connection', async () => {
    var tokenCallCount = 0;
    var tokenFn = function() {
      tokenCallCount++;
      var uri = WebSocket.createRelayListenUri(config.namespace, config.path);
      return WebSocket.createRelayToken(uri, config.keyRule, config.key);
    };

    await startServer({ token: tokenFn });

    // Token function should have been called at least once for the initial connection
    expect(tokenCallCount).toBeGreaterThanOrEqual(1);
    // Control channel should be connected
    expect(wsServer.controlChannel).toBeDefined();
  });

  test('Server remains connected and handles clients with function token', async () => {
    var tokenCallCount = 0;
    var tokenFn = function() {
      tokenCallCount++;
      var uri = WebSocket.createRelayListenUri(config.namespace, config.path);
      return WebSocket.createRelayToken(uri, config.keyRule, config.key);
    };

    await startServer({ token: tokenFn });

    // Set up echo handler
    wsServer.on('connect', (connection) => {
      connection.on('message', (message) => {
        if (message.type === 'utf8') {
          connection.sendUTF(message.utf8Data);
        }
      });
    });

    wsServer.on('request', (request) => {
      request.accept(null, request.origin);
    });

    var clientConnection = await connectClient();

    // Send and receive a message to verify server is fully functional
    var receivedMessage = await new Promise((resolve, reject) => {
      clientConnection.on('message', (msg) => resolve(msg));
      clientConnection.on('error', reject);
      clientConnection.sendUTF('Token renewal test message');
    });

    expect(receivedMessage.type).toBe('utf8');
    expect(receivedMessage.utf8Data).toBe('Token renewal test message');
    expect(tokenCallCount).toBeGreaterThanOrEqual(1);

    clientConnection.close();
  });

  test('Server control channel persists after client interactions with function token', async () => {
    var tokenFn = function() {
      var uri = WebSocket.createRelayListenUri(config.namespace, config.path);
      return WebSocket.createRelayToken(uri, config.keyRule, config.key);
    };

    await startServer({ token: tokenFn });

    wsServer.on('request', (request) => {
      request.accept(null, request.origin);
    });

    // Connect and disconnect multiple clients
    for (var i = 0; i < 3; i++) {
      var conn = await connectClient();
      await new Promise((resolve) => {
        conn.on('close', resolve);
        conn.close();
      });
      // Brief pause between connections
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Control channel should still be connected after all client interactions
    expect(wsServer.controlChannel).toBeDefined();
    expect(wsServer.controlChannel.connected).toBe(true);
  });
});
