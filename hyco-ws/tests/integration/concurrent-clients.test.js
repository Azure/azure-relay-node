/**
 * Integration tests for hyco-ws concurrent client connections via Azure Relay.
 * Tests that the server handles 10+ simultaneous clients, each independently
 * sending/receiving data, and all connections close cleanly.
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

require('ws');
var WebSocket = require('../../');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-ws concurrent clients', () => {
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

      wss.on('listening', () => resolve(wss));
      wss.on('error', (err) => reject(err));
      setTimeout(() => reject(new Error('Server listening timeout')), 30000);
    });
  }

  function connectClient() {
    return new Promise((resolve, reject) => {
      var sendUri = WebSocket.createRelaySendUri(config.namespace, config.path);
      var token = WebSocket.createRelayToken(sendUri, config.keyRule, config.key);

      var client = WebSocket.relayedConnect(sendUri, token, (ws) => {
        resolve(ws);
      });

      client.on('error', (err) => reject(err));
      setTimeout(() => reject(new Error('Client connection timeout')), 30000);
    });
  }

  function waitForListening() {
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

  test('Server handles 10+ simultaneous client connections independently', async () => {
    var NUM_CLIENTS = 12;
    var serverConnections = [];

    // Start server that echoes messages back with a client identifier
    await startServer((ws) => {
      serverConnections.push(ws);
      ws.on('message', (msg) => {
        ws.send('echo:' + msg);
      });
    });

    await waitForListening();

    // Connect all clients concurrently
    var clients = await Promise.all(
      Array.from({ length: NUM_CLIENTS }, () => connectClient())
    );

    expect(clients.length).toBe(NUM_CLIENTS);

    // Wait for all server-side connections to register
    await new Promise((resolve) => {
      var check = setInterval(() => {
        if (serverConnections.length >= NUM_CLIENTS) {
          clearInterval(check);
          resolve();
        }
      }, 200);
      setTimeout(() => { clearInterval(check); resolve(); }, 15000);
    });

    expect(serverConnections.length).toBe(NUM_CLIENTS);

    // Each client sends a unique message and verifies it gets the correct echo
    var results = await Promise.all(
      clients.map((client, i) => {
        return new Promise((resolve, reject) => {
          client.on('message', (data) => {
            resolve(data);
          });
          client.on('error', reject);
          client.send('client-' + i);
        });
      })
    );

    for (var i = 0; i < NUM_CLIENTS; i++) {
      expect(results[i]).toBe('echo:client-' + i);
    }

    // Close all clients and verify clean close
    var closePromises = clients.map((client) => {
      return new Promise((resolve) => {
        client.on('close', (code) => {
          resolve(code);
        });
        client.close();
      });
    });

    var closeCodes = await Promise.all(closePromises);
    for (var j = 0; j < NUM_CLIENTS; j++) {
      expect([1000, 1005, 1006]).toContain(closeCodes[j]);
    }
  });

  test('Each client independently sends multiple messages', async () => {
    var NUM_CLIENTS = 10;
    var MSGS_PER_CLIENT = 3;

    await startServer((ws) => {
      ws.on('message', (msg) => {
        ws.send(msg);
      });
    });

    await waitForListening();

    var clients = await Promise.all(
      Array.from({ length: NUM_CLIENTS }, () => connectClient())
    );

    // Each client sends multiple messages and collects responses
    var results = await Promise.all(
      clients.map((client, clientIdx) => {
        return new Promise((resolve, reject) => {
          var received = [];
          client.on('message', (data) => {
            received.push(data);
            if (received.length === MSGS_PER_CLIENT) {
              resolve(received);
            }
          });
          client.on('error', reject);
          for (var m = 0; m < MSGS_PER_CLIENT; m++) {
            client.send('c' + clientIdx + '-m' + m);
          }
        });
      })
    );

    // Verify each client received its own messages back
    for (var i = 0; i < NUM_CLIENTS; i++) {
      expect(results[i].length).toBe(MSGS_PER_CLIENT);
      for (var m = 0; m < MSGS_PER_CLIENT; m++) {
        expect(results[i][m]).toBe('c' + i + '-m' + m);
      }
    }

    // Clean close all clients
    await Promise.all(
      clients.map((client) => {
        return new Promise((resolve) => {
          client.on('close', () => resolve());
          client.close();
        });
      })
    );
  });

  test('All connections close cleanly after concurrent activity', async () => {
    var NUM_CLIENTS = 10;
    var serverCloseCount = 0;

    await startServer((ws) => {
      ws.on('message', (msg) => {
        ws.send(msg);
      });
      ws.on('close', () => {
        serverCloseCount++;
      });
    });

    await waitForListening();

    var clients = await Promise.all(
      Array.from({ length: NUM_CLIENTS }, () => connectClient())
    );

    // Each client does a round-trip
    await Promise.all(
      clients.map((client, i) => {
        return new Promise((resolve, reject) => {
          client.on('message', () => resolve());
          client.on('error', reject);
          client.send('ping-' + i);
        });
      })
    );

    // Close all clients
    await Promise.all(
      clients.map((client) => {
        return new Promise((resolve) => {
          client.on('close', () => resolve());
          client.close();
        });
      })
    );

    // Wait for server-side close events to propagate
    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(serverCloseCount).toBe(NUM_CLIENTS);
  });
});
