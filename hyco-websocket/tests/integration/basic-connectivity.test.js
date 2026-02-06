/**
 * Integration tests for hyco-websocket basic WebSocket connectivity via Azure Relay.
 * Tests client connection, binary/text data send/receive, and clean close.
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

describeIf(config)('hyco-websocket basic connectivity', () => {
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
   * Helper to start a relay WebSocket server.
   * Returns a promise that resolves when the control channel is connected.
   */
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
   * Helper to create a client connection through Azure Relay.
   * Returns a promise that resolves with the WebSocket connection.
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

  test('Client connects to listener via Azure Relay', async () => {
    await startServer();

    // Use the 'connect' event on the server (fires after request.accept completes)
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

    expect(clientConnection).toBeDefined();
    expect(serverConnection).toBeDefined();

    clientConnection.close();
  });

  test('Client sends and receives UTF-8 text data', async () => {
    await startServer();

    // Use the 'connect' event to set up echo handler after connection is ready
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

    var receivedMessage = await new Promise((resolve, reject) => {
      clientConnection.on('message', (message) => {
        resolve(message);
      });
      clientConnection.on('error', reject);
      clientConnection.sendUTF('Hello Azure Relay!');
    });

    expect(receivedMessage.type).toBe('utf8');
    expect(receivedMessage.utf8Data).toBe('Hello Azure Relay!');

    clientConnection.close();
  });

  test('Client sends and receives binary data', async () => {
    await startServer();

    wsServer.on('connect', (connection) => {
      connection.on('message', (message) => {
        if (message.type === 'binary') {
          connection.sendBytes(message.binaryData);
        }
      });
    });

    wsServer.on('request', (request) => {
      request.accept(null, request.origin);
    });

    var clientConnection = await connectClient();

    var testData = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD, 0xAB, 0xCD]);

    var receivedMessage = await new Promise((resolve, reject) => {
      clientConnection.on('message', (message) => {
        resolve(message);
      });
      clientConnection.on('error', reject);
      clientConnection.sendBytes(testData);
    });

    expect(receivedMessage.type).toBe('binary');
    expect(Buffer.isBuffer(receivedMessage.binaryData)).toBe(true);
    expect(receivedMessage.binaryData.equals(testData)).toBe(true);

    clientConnection.close();
  });

  test('Both sides can close the connection cleanly', async () => {
    await startServer();

    var serverClosePromise = new Promise((resolve) => {
      wsServer.on('connect', (connection) => {
        connection.on('close', (reasonCode, description) => {
          resolve({ reasonCode, description });
        });
      });
    });

    wsServer.on('request', (request) => {
      request.accept(null, request.origin);
    });

    var clientConnection = await connectClient();

    var clientClosePromise = new Promise((resolve) => {
      clientConnection.on('close', (code, description) => {
        resolve({ code, description });
      });
    });

    // Client initiates close
    clientConnection.close();

    var serverClose = await serverClosePromise;
    var clientClose = await clientClosePromise;

    // WebSocket close code 1000 means normal closure
    expect(serverClose.reasonCode).toBe(1000);
    expect(clientClose.code).toBe(1000);
  });
});
