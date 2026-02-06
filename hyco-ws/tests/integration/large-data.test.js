/**
 * Integration tests for hyco-ws large data transfer via Azure Relay.
 * Tests 64KB+, 1MB+ messages and bidirectional large data integrity.
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

require('ws');
var WebSocket = require('../../');
var { createRelayConfig, safeClose, createBuffer, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-ws large data transfer', () => {
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

  function waitForServerReady() {
    return new Promise((resolve) => {
      var check = setInterval(() => {
        if (wss && wss.controlChannel && wss.controlChannel.readyState === WebSocket.OPEN) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 30000);
    });
  }

  test('Client sends 64KB+ message and receives echoed data with integrity', async () => {
    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
        ws.on('message', (msg) => {
          ws.send(msg);
        });
        resolve(ws);
      }).catch(() => {});
    });

    await waitForServerReady();

    var client = await connectClient();
    await serverConnectionPromise;

    var testData = createBuffer(68000, 0xAB);

    var received = await new Promise((resolve, reject) => {
      client.on('message', (data) => {
        resolve(data);
      });
      client.on('error', reject);
      client.send(testData);
    });

    expect(Buffer.isBuffer(received)).toBe(true);
    expect(received.length).toBe(68000);
    expect(received.equals(testData)).toBe(true);

    client.close();
  });

  test('Client sends 1MB+ message and receives echoed data with integrity', async () => {
    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
        ws.on('message', (msg) => {
          ws.send(msg);
        });
        resolve(ws);
      }).catch(() => {});
    });

    await waitForServerReady();

    var client = await connectClient();
    await serverConnectionPromise;

    var testData = createBuffer(1048577, 0xCD);

    var received = await new Promise((resolve, reject) => {
      client.on('message', (data) => {
        resolve(data);
      });
      client.on('error', reject);
      client.send(testData);
    });

    expect(Buffer.isBuffer(received)).toBe(true);
    expect(received.length).toBe(1048577);
    expect(received.equals(testData)).toBe(true);

    client.close();
  });

  test('Bidirectional large data transfer: server sends large message to client', async () => {
    var largePayload = createBuffer(68000, 0xEF);

    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
        // Wait for the ws to be open before sending
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(largePayload);
          resolve(ws);
        } else {
          ws.on('open', () => {
            ws.send(largePayload);
            resolve(ws);
          });
        }
      }).catch(() => {});
    });

    await waitForServerReady();

    var client = await connectClient();
    await serverConnectionPromise;

    var received = await new Promise((resolve, reject) => {
      client.on('message', (data) => {
        resolve(data);
      });
      client.on('error', reject);
    });

    expect(Buffer.isBuffer(received)).toBe(true);
    expect(received.length).toBe(68000);
    expect(received.equals(largePayload)).toBe(true);

    client.close();
  });

  test('Bidirectional large data: client sends and server sends simultaneously', async () => {
    var clientPayload = createBuffer(68000, 0xAA);
    var serverPayload = createBuffer(68000, 0xBB);

    var serverReceivedPromise;
    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
        serverReceivedPromise = new Promise((resolveMsg) => {
          ws.on('message', (msg) => {
            resolveMsg(msg);
          });
        });
        // Wait for the ws to be open before sending
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(serverPayload);
          resolve(ws);
        } else {
          ws.on('open', () => {
            ws.send(serverPayload);
            resolve(ws);
          });
        }
      }).catch(() => {});
    });

    await waitForServerReady();

    var client = await connectClient();
    await serverConnectionPromise;

    var clientReceivedPromise = new Promise((resolve, reject) => {
      client.on('message', (data) => {
        resolve(data);
      });
      client.on('error', reject);
    });

    // Client sends its payload
    client.send(clientPayload);

    var [clientReceived, serverReceived] = await Promise.all([
      clientReceivedPromise,
      serverReceivedPromise
    ]);

    // Verify client received server's payload
    expect(Buffer.isBuffer(clientReceived)).toBe(true);
    expect(clientReceived.length).toBe(68000);
    expect(clientReceived.equals(serverPayload)).toBe(true);

    // Verify server received client's payload
    expect(Buffer.isBuffer(serverReceived)).toBe(true);
    expect(serverReceived.length).toBe(68000);
    expect(serverReceived.equals(clientPayload)).toBe(true);

    client.close();
  });
});
