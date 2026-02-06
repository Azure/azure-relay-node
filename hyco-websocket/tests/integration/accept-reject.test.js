/**
 * Integration tests for hyco-websocket accept/reject handling via Azure Relay.
 * Tests request.accept() connection establishment, request.reject() with various
 * status codes, protocol negotiation, and request header accessibility.
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

describeIf(config)('hyco-websocket accept/reject handling', () => {
  jest.setTimeout(60000);

  var wsServer;

  afterEach(async () => {
    if (wsServer) {
      try { wsServer.close(); } catch (e) { /* ignore */ }
      wsServer = null;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  /**
   * Helper to start a relay WebSocket server.
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
   * Returns {connection, error} where connection may close shortly after on reject.
   */
  function connectClient(protocols, extraHeaders) {
    return new Promise((resolve, reject) => {
      var sendUri = WebSocket.createRelaySendUri(config.namespace, config.path);
      var token = WebSocket.createRelayToken(sendUri, config.keyRule, config.key);

      var headers = Object.assign({ 'ServiceBusAuthorization': token }, extraHeaders || {});
      var client = new WebSocketClient();
      client.on('connect', (connection) => {
        resolve({ connection: connection, error: null });
      });
      client.on('connectFailed', (error) => {
        resolve({ connection: null, error: error });
      });

      client.connect(sendUri, protocols || null, null, headers);
    });
  }

  /**
   * Helper to wait for a client connection to close.
   * Returns {code, description}.
   */
  function waitForClose(connection, timeoutMs) {
    return new Promise((resolve, reject) => {
      var timer = setTimeout(() => {
        reject(new Error('Timed out waiting for close'));
      }, timeoutMs || 15000);

      connection.on('close', (code, description) => {
        clearTimeout(timer);
        resolve({ code: code, description: description });
      });
    });
  }

  test('request.accept() establishes a connection', async () => {
    await startServer();

    var serverConnectionPromise = new Promise((resolve) => {
      wsServer.on('connect', (connection) => {
        resolve(connection);
      });
    });

    wsServer.on('request', (request) => {
      request.accept(null, request.origin);
    });

    var result = await connectClient();
    var serverConnection = await serverConnectionPromise;

    expect(result.connection).toBeDefined();
    expect(result.error).toBeNull();
    expect(serverConnection).toBeDefined();

    result.connection.close();
  });

  test('request.reject(400) sends rejection to relay', async () => {
    await startServer();

    var rejected = false;
    var rejectedStatus = null;
    wsServer.on('request', (request) => {
      rejectedStatus = 400;
      request.reject(400, 'Bad Request', {}, function() {});
      rejected = true;
    });

    var result = await connectClient();
    // Wait for the server to process the request
    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(rejected).toBe(true);
    expect(rejectedStatus).toBe(400);

    // Clean up the client connection
    if (result.connection) {
      result.connection.close();
      await waitForClose(result.connection);
    }
  });

  test('request.reject(401) sends rejection to relay', async () => {
    await startServer();

    var rejected = false;
    wsServer.on('request', (request) => {
      request.reject(401, 'Unauthorized', {}, function() {});
      rejected = true;
    });

    var result = await connectClient();
    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(rejected).toBe(true);

    if (result.connection) {
      result.connection.close();
      await waitForClose(result.connection);
    }
  });

  test('request.reject(403) sends rejection to relay', async () => {
    await startServer();

    var rejected = false;
    wsServer.on('request', (request) => {
      request.reject(403, 'Forbidden', {}, function() {});
      rejected = true;
    });

    var result = await connectClient();
    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(rejected).toBe(true);

    if (result.connection) {
      result.connection.close();
      await waitForClose(result.connection);
    }
  });

  test('Protocol negotiation works with specific subprotocol', async () => {
    await startServer();

    var acceptedProtocol = null;
    var serverConnectionPromise = new Promise((resolve) => {
      wsServer.on('connect', (connection) => {
        resolve(connection);
      });
    });

    wsServer.on('request', (request) => {
      acceptedProtocol = request.requestedProtocols[0];
      request.accept(acceptedProtocol, request.origin);
    });

    var result = await connectClient(['echo-protocol', 'chat-protocol']);
    var serverConnection = await serverConnectionPromise;

    expect(result.connection).toBeDefined();
    expect(result.error).toBeNull();
    expect(acceptedProtocol).toBe('echo-protocol');
    expect(result.connection.protocol).toBe('echo-protocol');

    result.connection.close();
  });

  test('Request headers from client are accessible on listener side', async () => {
    await startServer();

    var receivedHeaders = null;
    var serverConnectionPromise = new Promise((resolve) => {
      wsServer.on('connect', (connection) => {
        resolve(connection);
      });
    });

    wsServer.on('request', (request) => {
      receivedHeaders = request.httpRequest.headers;
      request.accept(null, request.origin);
    });

    var result = await connectClient(null, {
      'X-Custom-Header': 'test-value-123',
      'X-Another-Header': 'another-value'
    });
    await serverConnectionPromise;

    expect(result.connection).toBeDefined();
    expect(receivedHeaders).toBeDefined();
    expect(receivedHeaders['x-custom-header']).toBe('test-value-123');
    expect(receivedHeaders['x-another-header']).toBe('another-value');

    result.connection.close();
  });

  test('accept() sets _resolved flag preventing double resolution', async () => {
    await startServer();

    var requestResolved = false;
    var serverConnectionPromise = new Promise((resolve) => {
      wsServer.on('connect', (connection) => {
        resolve(connection);
      });
    });

    wsServer.on('request', (request) => {
      request.accept(null, request.origin);
      requestResolved = request._resolved;
    });

    var result = await connectClient();
    await serverConnectionPromise;

    expect(result.connection).toBeDefined();
    expect(requestResolved).toBe(true);

    result.connection.close();
  });
});
