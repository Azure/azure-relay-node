/**
 * Cross-module interoperability integration tests.
 * Verifies that hyco-ws and hyco-websocket relay servers accept connections
 * from standard (non-hyco) WebSocket clients using relay tokens.
 *
 * REQ-CROSS-010: hyco-ws server accepts connections from standard ws clients
 * REQ-CROSS-011: hyco-websocket server accepts connections from standard websocket clients
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

// hyco-ws module (server side)
require('ws');
var HycoWs = require('../../../hyco-ws');

// hyco-websocket module (server side)
var HycoWebSocket = require('../../../hyco-websocket');
var HycoWebSocketServer = require('../../../hyco-websocket/lib/HybridConnectionsWebSocketServer');

// Standard (non-hyco) clients
var StandardWsClient = require('ws');
var StandardWebSocketClient = require('websocket').client;

var { createRelayConfig, safeClose, describeIf } = require('../../');

var config = createRelayConfig();

describeIf(config)('Cross-module interoperability', () => {
  jest.setTimeout(60000);

  describe('hyco-ws server with standard ws client (REQ-CROSS-010)', () => {
    var wss;

    afterEach(async () => {
      await safeClose(wss);
      wss = null;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    function startHycoWsServer(connectionHandler) {
      return new Promise((resolve, reject) => {
        var listenUri = HycoWs.createRelayListenUri(config.namespace, config.path);
        var token = HycoWs.createRelayToken(listenUri, config.keyRule, config.key);

        wss = HycoWs.createRelayedServer({
          server: listenUri,
          token: token
        }, connectionHandler);

        wss.on('listening', () => resolve(wss));
        wss.on('error', (err) => reject(err));
        setTimeout(() => reject(new Error('Server listening timeout')), 30000);
      });
    }

    test('Standard ws client connects to hyco-ws server via relay token', async () => {
      var serverGotConnection = false;
      var serverConnectionPromise = new Promise((resolve) => {
        startHycoWsServer((ws) => {
          serverGotConnection = true;
          resolve(ws);
        }).catch(() => {});
      });

      // Wait for server to be listening
      await new Promise((resolve) => {
        var check = setInterval(() => {
          if (wss && wss.controlChannel && wss.controlChannel.readyState === StandardWsClient.OPEN) {
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 30000);
      });

      var sendUri = HycoWs.createRelaySendUri(config.namespace, config.path);
      var token = HycoWs.createRelayToken(sendUri, config.keyRule, config.key);

      // Connect with standard ws library using ServiceBusAuthorization header
      var client = new StandardWsClient(sendUri, {
        headers: { 'ServiceBusAuthorization': token }
      });

      await new Promise((resolve, reject) => {
        client.on('open', resolve);
        client.on('error', reject);
        setTimeout(() => reject(new Error('Client connection timeout')), 30000);
      });

      var serverWs = await serverConnectionPromise;
      expect(serverGotConnection).toBe(true);
      expect(serverWs).toBeDefined();

      client.close();
    });

    test('Standard ws client sends and receives message through hyco-ws server', async () => {
      var serverConnectionPromise = new Promise((resolve) => {
        startHycoWsServer((ws) => {
          ws.on('message', (msg) => {
            ws.send(msg);
          });
          resolve(ws);
        }).catch(() => {});
      });

      await new Promise((resolve) => {
        var check = setInterval(() => {
          if (wss && wss.controlChannel && wss.controlChannel.readyState === StandardWsClient.OPEN) {
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 30000);
      });

      var sendUri = HycoWs.createRelaySendUri(config.namespace, config.path);
      var token = HycoWs.createRelayToken(sendUri, config.keyRule, config.key);

      var client = new StandardWsClient(sendUri, {
        headers: { 'ServiceBusAuthorization': token }
      });

      await new Promise((resolve, reject) => {
        client.on('open', resolve);
        client.on('error', reject);
        setTimeout(() => reject(new Error('Client connection timeout')), 30000);
      });

      await serverConnectionPromise;

      var received = await new Promise((resolve, reject) => {
        client.on('message', (data) => {
          resolve(data.toString());
        });
        client.on('error', reject);
        client.send('Hello from standard ws!');
      });

      expect(received).toBe('Hello from standard ws!');

      client.close();
    });

    test('Standard ws client closes connection cleanly with hyco-ws server', async () => {
      var serverClosePromise;
      var serverConnectionPromise = new Promise((resolve) => {
        startHycoWsServer((ws) => {
          serverClosePromise = new Promise((resolveClose) => {
            ws.on('close', (code) => resolveClose(code));
          });
          resolve(ws);
        }).catch(() => {});
      });

      await new Promise((resolve) => {
        var check = setInterval(() => {
          if (wss && wss.controlChannel && wss.controlChannel.readyState === StandardWsClient.OPEN) {
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 30000);
      });

      var sendUri = HycoWs.createRelaySendUri(config.namespace, config.path);
      var token = HycoWs.createRelayToken(sendUri, config.keyRule, config.key);

      var client = new StandardWsClient(sendUri, {
        headers: { 'ServiceBusAuthorization': token }
      });

      await new Promise((resolve, reject) => {
        client.on('open', resolve);
        client.on('error', reject);
        setTimeout(() => reject(new Error('Client connection timeout')), 30000);
      });

      await serverConnectionPromise;

      var clientClosePromise = new Promise((resolve) => {
        client.on('close', (code) => resolve(code));
      });

      client.close();

      var serverCloseCode = await serverClosePromise;
      var clientCloseCode = await clientClosePromise;

      expect([1000, 1005]).toContain(serverCloseCode);
      expect([1000, 1005]).toContain(clientCloseCode);
    });
  });

  describe('hyco-websocket server with standard websocket client (REQ-CROSS-011)', () => {
    var wsServer;

    afterEach(async () => {
      if (wsServer) {
        try { wsServer.close(); } catch (e) { /* ignore */ }
        wsServer = null;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    function startHycoWebSocketServer() {
      return new Promise((resolve, reject) => {
        var uri = HycoWebSocket.createRelayListenUri(config.namespace, config.path);
        var token = HycoWebSocket.createRelayToken(uri, config.keyRule, config.key);

        wsServer = new HycoWebSocketServer({
          server: uri,
          token: token,
          autoAcceptConnections: false
        });

        wsServer.on('error', (err) => reject(err));

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

    test('Standard websocket client connects to hyco-websocket server via relay token', async () => {
      await startHycoWebSocketServer();

      var serverGotRequest = false;
      wsServer.on('request', (request) => {
        serverGotRequest = true;
        request.accept(null, request.origin);
      });

      var sendUri = HycoWebSocket.createRelaySendUri(config.namespace, config.path);
      var token = HycoWebSocket.createRelayToken(sendUri, config.keyRule, config.key);

      var client = new StandardWebSocketClient();

      var connection = await new Promise((resolve, reject) => {
        client.on('connect', (conn) => resolve(conn));
        client.on('connectFailed', (err) => reject(err));
        client.connect(sendUri, null, null, {
          'ServiceBusAuthorization': token
        });
      });

      expect(connection).toBeDefined();
      expect(serverGotRequest).toBe(true);

      connection.close();
    });

    test('Standard websocket client sends and receives message through hyco-websocket server', async () => {
      await startHycoWebSocketServer();

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

      var sendUri = HycoWebSocket.createRelaySendUri(config.namespace, config.path);
      var token = HycoWebSocket.createRelayToken(sendUri, config.keyRule, config.key);

      var client = new StandardWebSocketClient();

      var connection = await new Promise((resolve, reject) => {
        client.on('connect', (conn) => resolve(conn));
        client.on('connectFailed', (err) => reject(err));
        client.connect(sendUri, null, null, {
          'ServiceBusAuthorization': token
        });
      });

      var received = await new Promise((resolve, reject) => {
        connection.on('message', (message) => {
          resolve(message);
        });
        connection.on('error', reject);
        connection.sendUTF('Hello from standard websocket!');
      });

      expect(received.type).toBe('utf8');
      expect(received.utf8Data).toBe('Hello from standard websocket!');

      connection.close();
    });

    test('Standard websocket client closes connection cleanly with hyco-websocket server', async () => {
      await startHycoWebSocketServer();

      var serverClosePromise = new Promise((resolve) => {
        wsServer.on('connect', (connection) => {
          connection.on('close', (reasonCode) => {
            resolve(reasonCode);
          });
        });
      });

      wsServer.on('request', (request) => {
        request.accept(null, request.origin);
      });

      var sendUri = HycoWebSocket.createRelaySendUri(config.namespace, config.path);
      var token = HycoWebSocket.createRelayToken(sendUri, config.keyRule, config.key);

      var client = new StandardWebSocketClient();

      var connection = await new Promise((resolve, reject) => {
        client.on('connect', (conn) => resolve(conn));
        client.on('connectFailed', (err) => reject(err));
        client.connect(sendUri, null, null, {
          'ServiceBusAuthorization': token
        });
      });

      var clientClosePromise = new Promise((resolve) => {
        connection.on('close', (code) => resolve(code));
      });

      connection.close();

      var serverCloseCode = await serverClosePromise;
      var clientCloseCode = await clientClosePromise;

      expect(serverCloseCode).toBe(1000);
      expect(clientCloseCode).toBe(1000);
    });
  });
});
