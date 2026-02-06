/**
 * Integration tests for hyco-websocket server lifecycle methods.
 * Tests server.close(), server.closeAllConnections(), broadcast(), broadcastUTF(), and broadcastBytes().
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

describeIf(config)('hyco-websocket server lifecycle', () => {
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
  function connectClient() {
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

      client.connect(sendUri, null, null, {
        'ServiceBusAuthorization': token
      });
    });
  }

  /**
   * Helper to connect a client and wait for server-side acceptance.
   * Returns { clientConnection, serverConnection }.
   */
  function connectAndAccept() {
    return new Promise((resolve, reject) => {
      var serverConnPromise = new Promise((res) => {
        wsServer.on('connect', function onConnect(connection) {
          res(connection);
        });
      });

      wsServer.on('request', function onRequest(request) {
        request.accept(null, request.origin);
      });

      connectClient()
        .then((clientConnection) => {
          return serverConnPromise.then((serverConnection) => {
            resolve({ clientConnection, serverConnection });
          });
        })
        .catch(reject);
    });
  }

  /**
   * Helper to connect multiple clients and wait for server-side acceptance.
   * Returns array of { clientConnection, serverConnection } objects.
   */
  async function connectMultipleClients(count) {
    var serverConnections = [];
    var serverConnResolvers = [];

    // Create promises for each expected server-side connection
    for (var i = 0; i < count; i++) {
      serverConnections.push(new Promise((resolve) => {
        serverConnResolvers.push(resolve);
      }));
    }

    var connIdx = 0;
    wsServer.on('connect', (connection) => {
      if (connIdx < count) {
        serverConnResolvers[connIdx](connection);
        connIdx++;
      }
    });

    wsServer.on('request', (request) => {
      request.accept(null, request.origin);
    });

    var results = [];
    for (var j = 0; j < count; j++) {
      var clientConnection = await connectClient();
      var serverConnection = await serverConnections[j];
      results.push({ clientConnection, serverConnection });
    }

    // Remove request listener to avoid leaks on subsequent calls
    wsServer.removeAllListeners('request');
    wsServer.removeAllListeners('connect');

    return results;
  }

  test('server.close() cleanly shuts down all connections', async () => {
    await startServer();

    var pairs = await connectMultipleClients(3);

    // Track client-side close events
    var clientClosePromises = pairs.map((pair) => {
      return new Promise((resolve) => {
        pair.clientConnection.on('close', (code) => {
          resolve(code);
        });
      });
    });

    // Close the server
    wsServer.close();
    wsServer = null; // prevent afterEach double-close

    // All client connections should receive close events
    var closeCodes = await Promise.all(clientClosePromises);
    closeCodes.forEach((code) => {
      // 1000 = normal close, 1006 = abnormal (relay teardown)
      expect([1000, 1006]).toContain(code);
    });
  });

  test('server.closeAllConnections() terminates all active connections', async () => {
    await startServer();

    var pairs = await connectMultipleClients(3);

    // Track server-side close events
    var serverClosePromises = pairs.map((pair) => {
      return new Promise((resolve) => {
        pair.serverConnection.on('close', (code) => {
          resolve(code);
        });
      });
    });

    // Track client-side close events
    var clientClosePromises = pairs.map((pair) => {
      return new Promise((resolve) => {
        pair.clientConnection.on('close', (code) => {
          resolve(code);
        });
      });
    });

    // Close all connections (but not the server control channel)
    wsServer.closeAllConnections();

    // All server connections should close
    var serverCodes = await Promise.all(serverClosePromises);
    serverCodes.forEach((code) => {
      expect([1000, 1006]).toContain(code);
    });

    // All client connections should also close
    var clientCodes = await Promise.all(clientClosePromises);
    clientCodes.forEach((code) => {
      expect([1000, 1006]).toContain(code);
    });
  });

  test('server.broadcastUTF() sends text to all connected clients', async () => {
    await startServer();

    var pairs = await connectMultipleClients(3);

    // Set up message listeners on all client connections
    var messagePromises = pairs.map((pair) => {
      return new Promise((resolve) => {
        pair.clientConnection.on('message', (message) => {
          resolve(message);
        });
      });
    });

    var broadcastText = 'Hello from broadcast!';
    wsServer.broadcastUTF(broadcastText);

    var messages = await Promise.all(messagePromises);
    messages.forEach((message) => {
      expect(message.type).toBe('utf8');
      expect(message.utf8Data).toBe(broadcastText);
    });

    // Clean up client connections
    pairs.forEach((pair) => pair.clientConnection.close());
  });

  test('server.broadcastBytes() sends binary data to all connected clients', async () => {
    await startServer();

    var pairs = await connectMultipleClients(3);

    // Set up message listeners on all client connections
    var messagePromises = pairs.map((pair) => {
      return new Promise((resolve) => {
        pair.clientConnection.on('message', (message) => {
          resolve(message);
        });
      });
    });

    var broadcastData = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x02, 0x03]);
    wsServer.broadcastBytes(broadcastData);

    var messages = await Promise.all(messagePromises);
    messages.forEach((message) => {
      expect(message.type).toBe('binary');
      expect(Buffer.isBuffer(message.binaryData)).toBe(true);
      expect(message.binaryData.equals(broadcastData)).toBe(true);
    });

    // Clean up client connections
    pairs.forEach((pair) => pair.clientConnection.close());
  });

  test('server.broadcast() routes text data via broadcastUTF()', async () => {
    await startServer();

    var pairs = await connectMultipleClients(2);

    var messagePromises = pairs.map((pair) => {
      return new Promise((resolve) => {
        pair.clientConnection.on('message', (message) => {
          resolve(message);
        });
      });
    });

    // broadcast() with a string should route to broadcastUTF
    wsServer.broadcast('Text via broadcast()');

    var messages = await Promise.all(messagePromises);
    messages.forEach((message) => {
      expect(message.type).toBe('utf8');
      expect(message.utf8Data).toBe('Text via broadcast()');
    });

    pairs.forEach((pair) => pair.clientConnection.close());
  });

  test('server.broadcast() routes binary data via broadcastBytes()', async () => {
    await startServer();

    var pairs = await connectMultipleClients(2);

    var messagePromises = pairs.map((pair) => {
      return new Promise((resolve) => {
        pair.clientConnection.on('message', (message) => {
          resolve(message);
        });
      });
    });

    // broadcast() with a Buffer should route to broadcastBytes
    var binaryData = Buffer.from([0xCA, 0xFE, 0xBA, 0xBE]);
    wsServer.broadcast(binaryData);

    var messages = await Promise.all(messagePromises);
    messages.forEach((message) => {
      expect(message.type).toBe('binary');
      expect(message.binaryData.equals(binaryData)).toBe(true);
    });

    pairs.forEach((pair) => pair.clientConnection.close());
  });
});
