/**
 * Integration tests for hyco-ws custom request headers via Azure Relay.
 * Tests that custom headers passed during client connection are accessible
 * on the listener side, and that headers with special characters are handled safely.
 *
 * Requires RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY environment variables.
 * Tests skip gracefully when env vars are not set.
 */
'use strict';

require('ws');
var WebSocket = require('../../');
var WS = require('ws');
var { createRelayConfig, safeClose, describeIf } = require('../../../test-utils');

var config = createRelayConfig();

describeIf(config)('hyco-ws request headers', () => {
  jest.setTimeout(60000);

  var wss;

  afterEach(async () => {
    await safeClose(wss);
    wss = null;
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
   * Helper to connect a client with custom headers via ws directly.
   * Returns a promise resolving to the WebSocket client.
   */
  function connectClientWithHeaders(extraHeaders) {
    return new Promise((resolve, reject) => {
      var sendUri = WebSocket.createRelaySendUri(config.namespace, config.path);
      var token = WebSocket.createRelayToken(sendUri, config.keyRule, config.key);

      var headers = Object.assign(
        { 'ServiceBusAuthorization': token },
        extraHeaders || {}
      );

      var client = new WS(sendUri, null, { headers: headers });

      client.on('open', () => {
        resolve(client);
      });

      client.on('error', (err) => {
        reject(err);
      });

      setTimeout(() => {
        reject(new Error('Client connection timeout'));
      }, 30000);
    });
  }

  /**
   * Helper to intercept control channel messages and capture connectHeaders.
   * Must be called after startServer resolves (when controlChannel exists).
   */
  function captureConnectHeaders() {
    var captured = null;
    var capturePromise = new Promise((resolve) => {
      var originalOnMessage = wss.controlChannel.onmessage;
      wss.controlChannel.onmessage = function(event) {
        var message = JSON.parse(event.data);
        if (message.accept && message.accept.connectHeaders) {
          captured = {};
          // Lowercase all keys for consistent comparison
          var keys = Object.keys(message.accept.connectHeaders);
          for (var i = 0; i < keys.length; i++) {
            captured[keys[i].toLowerCase()] = message.accept.connectHeaders[keys[i]];
          }
          resolve(captured);
        }
        originalOnMessage.call(this, event);
      };
    });
    return capturePromise;
  }

  test('Custom headers in client connection are forwarded to listener via relay', async () => {
    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
        resolve(ws);
      }).catch(() => {});
    });

    await new Promise((resolve) => {
      var check = setInterval(() => {
        if (wss && wss.controlChannel && wss.controlChannel.readyState === WS.OPEN) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 30000);
    });

    var headersPromise = captureConnectHeaders();

    var client = await connectClientWithHeaders({
      'X-Custom-Test': 'relay-header-value',
      'X-Another-Header': 'second-value'
    });
    await serverConnectionPromise;

    var receivedHeaders = await headersPromise;

    expect(receivedHeaders).toBeDefined();
    expect(receivedHeaders['x-custom-test']).toBe('relay-header-value');
    expect(receivedHeaders['x-another-header']).toBe('second-value');

    client.close();
  });

  test('Headers with colons in values are handled correctly', async () => {
    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
        resolve(ws);
      }).catch(() => {});
    });

    await new Promise((resolve) => {
      var check = setInterval(() => {
        if (wss && wss.controlChannel && wss.controlChannel.readyState === WS.OPEN) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 30000);
    });

    var headersPromise = captureConnectHeaders();

    var client = await connectClientWithHeaders({
      'X-Time-Value': '12:30:45'
    });
    await serverConnectionPromise;

    var receivedHeaders = await headersPromise;

    expect(receivedHeaders).toBeDefined();
    expect(receivedHeaders['x-time-value']).toBe('12:30:45');

    client.close();
  });

  test('Headers with special characters in values are forwarded safely', async () => {
    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
        resolve(ws);
      }).catch(() => {});
    });

    await new Promise((resolve) => {
      var check = setInterval(() => {
        if (wss && wss.controlChannel && wss.controlChannel.readyState === WS.OPEN) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 30000);
    });

    var headersPromise = captureConnectHeaders();

    var client = await connectClientWithHeaders({
      'X-Special-Chars': 'value=with&special+chars/here'
    });
    await serverConnectionPromise;

    var receivedHeaders = await headersPromise;

    expect(receivedHeaders).toBeDefined();
    expect(receivedHeaders['x-special-chars']).toBe('value=with&special+chars/here');

    client.close();
  });

  test('Headers with newline characters are rejected by the ws library', () => {
    // HTTP header injection via newlines must be rejected
    var sendUri = WebSocket.createRelaySendUri(config.namespace, config.path);
    var token = WebSocket.createRelayToken(sendUri, config.keyRule, config.key);

    expect(() => {
      new WS(sendUri, null, {
        headers: {
          'ServiceBusAuthorization': token,
          'X-Injected': 'value\r\nX-Evil: injected'
        }
      });
    }).toThrow();
  });

  test('Connection succeeds with many custom headers', async () => {
    var serverConnectionPromise = new Promise((resolve) => {
      startServer((ws) => {
        resolve(ws);
      }).catch(() => {});
    });

    await new Promise((resolve) => {
      var check = setInterval(() => {
        if (wss && wss.controlChannel && wss.controlChannel.readyState === WS.OPEN) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 30000);
    });

    var headersPromise = captureConnectHeaders();

    var manyHeaders = {};
    for (var i = 0; i < 10; i++) {
      manyHeaders['X-Header-' + i] = 'value-' + i;
    }

    var client = await connectClientWithHeaders(manyHeaders);
    await serverConnectionPromise;

    var receivedHeaders = await headersPromise;

    expect(receivedHeaders).toBeDefined();
    for (var j = 0; j < 10; j++) {
      expect(receivedHeaders['x-header-' + j]).toBe('value-' + j);
    }

    client.close();
  });
});
