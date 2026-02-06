/**
 * Integration tests for listener/client abort while the other side is reading.
 * Modeled after .NET RunTimeTests.ListenerAbortWhileClientReadingTest.
 *
 * Tests that aborting one side of a WebSocket connection while the other
 * side is reading results in an error or close event on the remaining side.
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

describeIf(config)('hyco-websocket listener/client abort', () => {
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

  test('Listener abort while client is reading results in error on client', async () => {
    await startServer();

    var serverConnectionPromise = new Promise((resolve) => {
      wsServer.on('connect', (connection) => {
        resolve(connection);
      });
    });

    wsServer.on('request', (request) => {
      request.accept(null, request.origin);
    });

    var clientConnection = await connectClient();
    var serverConnection = await serverConnectionPromise;

    // Client is now "reading" — waiting for messages
    var clientResult = await new Promise((resolve) => {
      var timeout = setTimeout(() => {
        resolve({ type: 'timeout' });
      }, 15000);

      clientConnection.on('close', (code, description) => {
        clearTimeout(timeout);
        resolve({ type: 'close', code, description });
      });

      clientConnection.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ type: 'error', error: err });
      });

      // Abort server-side connection abruptly (drop without close handshake)
      serverConnection.drop(1006, 'Listener abort');
    });

    // Client should get a close event (possibly preceded by error)
    if (clientResult.type === 'close') {
      expect(clientResult.code).toBeDefined();
    } else if (clientResult.type === 'error') {
      expect(clientResult.error).toBeDefined();
    } else {
      throw new Error('Expected close or error on client, got: ' + clientResult.type);
    }
  });

  test('Client abort while listener is reading results in error/close on listener', async () => {
    await startServer();

    var serverConnectionPromise = new Promise((resolve) => {
      wsServer.on('connect', (connection) => {
        resolve(connection);
      });
    });

    wsServer.on('request', (request) => {
      request.accept(null, request.origin);
    });

    var clientConnection = await connectClient();
    var serverConnection = await serverConnectionPromise;

    // Server is now "reading" — waiting for messages
    var serverResult = await new Promise((resolve) => {
      var timeout = setTimeout(() => {
        resolve({ type: 'timeout' });
      }, 15000);

      serverConnection.on('close', (reasonCode, description) => {
        clearTimeout(timeout);
        resolve({ type: 'close', reasonCode, description });
      });

      serverConnection.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ type: 'error', error: err });
      });

      // Abort client-side connection abruptly (drop without close handshake)
      clientConnection.drop(1006, 'Client abort');
    });

    // Server should get a close event (possibly preceded by error)
    if (serverResult.type === 'close') {
      expect(serverResult.reasonCode).toBeDefined();
    } else if (serverResult.type === 'error') {
      expect(serverResult.error).toBeDefined();
    } else {
      throw new Error('Expected close or error on listener, got: ' + serverResult.type);
    }
  });
});
