/**
 * Integration tests for hyco-ws basic WebSocket connectivity via Azure Relay.
 * Tests createRelayedServer(), relayedConnect(), text/binary send/receive, and clean close.
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

// Pre-load ws into require.cache so HybridConnectionWebSocketServer can find it
require('ws');
var WebSocket = require('../../');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-ws basic connectivity', () => {
  jest.setTimeout(60000);

  var wss;

  afterEach(async () => {
    await safeClose(wss);
    wss = null;
    // Allow time for control channel cleanup
    await new Promise((resolve) => setTimeout(resolve, 2000));
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

  /**
   * Helper to create a client connection through Azure Relay.
   * Returns a promise that resolves with the WebSocket client.
   */
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

  test('createRelayedServer() creates server that connects to Azure Relay', async () => {
    await startServer(() => {});
    expect(wss).toBeDefined();
    expect(wss.controlChannel).toBeDefined();
  });

  test('relayedConnect() creates client and connection event fires on server', async () => {
    var serverConnection = null;
    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
        serverConnection = ws;
        resolve(ws);
      }).catch(() => {});
    });

    // Wait for server to be listening
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
    var serverWs = await serverConnectionPromise;

    expect(client).toBeDefined();
    expect(serverWs).toBeDefined();

    client.close();
  });

  test('Client sends and receives text messages', async () => {
    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
        ws.on('message', (msg) => {
          ws.send(msg);
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

    var received = await new Promise((resolve, reject) => {
      client.on('message', (data) => {
        resolve(data);
      });
      client.on('error', reject);
      client.send('Hello Azure Relay via hyco-ws!');
    });

    expect(received).toBe('Hello Azure Relay via hyco-ws!');

    client.close();
  });

  test('Client sends and receives binary messages', async () => {
    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
        ws.on('message', (msg) => {
          ws.send(msg);
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

    var testData = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD, 0xAB, 0xCD]);

    var received = await new Promise((resolve, reject) => {
      client.on('message', (data) => {
        resolve(data);
      });
      client.on('error', reject);
      client.send(testData);
    });

    expect(Buffer.isBuffer(received)).toBe(true);
    expect(received.equals(testData)).toBe(true);

    client.close();
  });

  test('Both sides can close the connection cleanly', async () => {
    var serverClosePromise;
    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
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

    client.close();

    var serverClose = await serverClosePromise;
    var clientClose = await clientClosePromise;

    // ws 7.x reports 1005 (no status received) when the relay mediates the close
    expect([1000, 1005]).toContain(serverClose.code);
    expect([1000, 1005]).toContain(clientClose.code);
  });

  test('connection event fires on the server when a client connects', async () => {
    var connectionEventFired = false;
    await startServer((ws) => {
      connectionEventFired = true;
    });

    var client = await connectClient();

    // Wait briefly for server-side event
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(connectionEventFired).toBe(true);

    client.close();
  });
});
