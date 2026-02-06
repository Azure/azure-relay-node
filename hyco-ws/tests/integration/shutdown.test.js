/**
 * Integration tests for hyco-ws client/listener shutdown behavior via Azure Relay.
 * Tests client close → listener close event, listener close → client close event,
 * and server.close() with active connections.
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

require('ws');
var WebSocket = require('../../');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-ws shutdown', () => {
  jest.setTimeout(60000);

  var wss;

  afterEach(async () => {
    await safeClose(wss);
    wss = null;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  function startServer(connectionHandler) {
    return new Promise((resolve, reject) => {
      var token = WebSocket.createRelayToken(
        WebSocket.createRelayListenUri(config.namespace, config.path),
        config.keyRule, config.key
      );

      wss = WebSocket.createRelayedServer({
        server: WebSocket.createRelayListenUri(config.namespace, config.path),
        token: token
      }, connectionHandler);

      wss.on('listening', () => {
        resolve(wss);
      });

      wss.on('error', (err) => {
        reject(err);
      });

      setTimeout(() => {
        reject(new Error('Server listening timeout'));
      }, 30000);
    });
  }

  function connectClient() {
    return new Promise((resolve, reject) => {
      var sendUri = WebSocket.createRelaySendUri(config.namespace, config.path);
      var token = WebSocket.createRelayToken(sendUri, config.keyRule, config.key);

      var client = WebSocket.relayedConnect(sendUri, token, (ws) => {
        resolve(ws);
      });

      client.on('error', (err) => {
        reject(err);
      });

      setTimeout(() => {
        reject(new Error('Client connection timeout'));
      }, 30000);
    });
  }

  test('Client close results in close event on listener', async () => {
    var serverClosePromise;
    var serverWs;

    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
        serverWs = ws;
        serverClosePromise = new Promise((resolveClose) => {
          ws.on('close', (code, reason) => {
            resolveClose({ code, reason });
          });
        });
        resolve(ws);
      }).catch(() => {});
    });

    await new Promise((resolve) => {
      var check = setInterval(() => {
        if (wss && wss.controlChannel && wss.controlChannel.readyState === WebSocket.OPEN) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 30000);
    });

    var client = await connectClient();
    await serverConnectionPromise;

    // Client initiates close
    client.close();

    // Server side should receive close event
    var serverClose = await serverClosePromise;
    expect([1000, 1005, 1006]).toContain(serverClose.code);
  });

  test('Listener close results in close event on client', async () => {
    var serverWs;

    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
        serverWs = ws;
        resolve(ws);
      }).catch(() => {});
    });

    await new Promise((resolve) => {
      var check = setInterval(() => {
        if (wss && wss.controlChannel && wss.controlChannel.readyState === WebSocket.OPEN) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 30000);
    });

    var client = await connectClient();
    await serverConnectionPromise;

    var clientClosePromise = new Promise((resolve) => {
      client.on('close', (code, reason) => {
        resolve({ code, reason });
      });
    });

    // Listener (server-side WebSocket) initiates close
    serverWs.close();

    // Client should receive close event
    var clientClose = await clientClosePromise;
    expect([1000, 1005, 1006]).toContain(clientClose.code);
  });

  test('server.close() with active connections terminates all cleanly', async () => {
    var serverWs;
    var serverClosePromise;

    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
        serverWs = ws;
        serverClosePromise = new Promise((resolveClose) => {
          ws.on('close', (code, reason) => {
            resolveClose({ code, reason });
          });
        });
        resolve(ws);
      }).catch(() => {});
    });

    await new Promise((resolve) => {
      var check = setInterval(() => {
        if (wss && wss.controlChannel && wss.controlChannel.readyState === WebSocket.OPEN) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 30000);
    });

    var client = await connectClient();
    await serverConnectionPromise;

    var clientClosePromise = new Promise((resolve) => {
      client.on('close', (code, reason) => {
        resolve({ code, reason });
      });
    });

    // Server close should terminate all active connections
    await new Promise((resolve, reject) => {
      wss.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Both sides should have received close events
    var serverClose = await serverClosePromise;
    var clientClose = await clientClosePromise;

    expect([1000, 1005, 1006]).toContain(serverClose.code);
    expect([1000, 1005, 1006]).toContain(clientClose.code);
    expect(wss.closeRequested).toBe(true);
  });
});
