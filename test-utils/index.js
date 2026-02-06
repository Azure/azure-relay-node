/**
 * Shared test utilities for the Azure Relay Node.js SDK test suite.
 * Provides helpers for configuration, resource management, and test data generation.
 */

'use strict';

/**
 * Reads Azure Relay connection parameters from environment variables.
 * Returns a config object with namespace, path, keyRule, and key.
 * Returns null if the required environment variables are not set.
 *
 * Supports both RELAY_* and SB_HC_* environment variable prefixes.
 * RELAY_* variables take precedence over SB_HC_* variables.
 *
 * @returns {{ namespace: string, path: string, keyRule: string, key: string } | null}
 */
function createRelayConfig() {
  var namespace = process.env.RELAY_NAMESPACE || process.env.SB_HC_NAMESPACE || null;
  var path = process.env.RELAY_PATH || process.env.SB_HC_PATH || null;
  var keyRule = process.env.RELAY_KEYRULE || process.env.SB_HC_KEYRULE || null;
  var key = process.env.RELAY_KEY || process.env.SB_HC_KEY || null;

  // Strip surrounding quotes if present (some CI environments add them)
  if (namespace) namespace = namespace.replace(/^"(.*)"$/, '$1');
  if (keyRule) keyRule = keyRule.replace(/^"(.*)"$/, '$1');
  if (key) key = key.replace(/^"(.*)"$/, '$1');

  if (!namespace || !path || !keyRule || !key) {
    return null;
  }

  return {
    namespace: namespace,
    path: path,
    keyRule: keyRule,
    key: key
  };
}

/**
 * Safely closes a server/listener, suppressing any errors.
 *
 * @param {object} server - The server or listener to close
 * @returns {Promise<void>}
 */
function safeClose(server) {
  return new Promise(function (resolve) {
    if (!server) {
      resolve();
      return;
    }
    try {
      if (typeof server.close === 'function') {
        server.close(function () { resolve(); });
      } else {
        resolve();
      }
    } catch (e) {
      resolve();
    }
  });
}

/**
 * Creates a Buffer of the specified length filled with a repeating pattern.
 *
 * @param {number} length - The length of the buffer in bytes
 * @param {number|string} [fillPattern=0xAB] - The value or string to fill the buffer with
 * @returns {Buffer}
 */
function createBuffer(length, fillPattern) {
  if (fillPattern === undefined) fillPattern = 0xAB;
  var buf = Buffer.alloc(length);
  buf.fill(fillPattern);
  return buf;
}

/**
 * Helper to skip integration tests when relay config is not available.
 * Returns a describe function that skips if config is null.
 *
 * @param {object|null} config - The relay config from createRelayConfig()
 * @returns {Function} Jest describe or describe.skip
 */
function describeIf(config) {
  return config ? describe : describe.skip;
}

/**
 * Creates an echo listener callback for hyco-ws WebSocket servers.
 * Accepts a WebSocket connection and echoes all received messages back to the sender.
 *
 * @param {object} [options] - Options for the echo listener
 * @param {function} [options.onConnection] - Callback invoked when a connection is established
 * @param {function} [options.onClose] - Callback invoked when a connection is closed
 * @returns {function} A callback suitable for use with createRelayedServer or the 'connection' event
 */
function createEchoListener(options) {
  if (!options) options = {};
  return function (ws) {
    if (typeof options.onConnection === 'function') {
      options.onConnection(ws);
    }
    ws.on('message', function (msg) {
      ws.send(msg);
    });
    ws.on('close', function () {
      if (typeof options.onClose === 'function') {
        options.onClose(ws);
      }
    });
  };
}

/**
 * Creates an echo listener for hyco-websocket servers.
 * Handles both UTF-8 and binary message types using the websocket library's message format.
 *
 * @param {object} [options] - Options for the echo listener
 * @param {function} [options.onConnection] - Callback invoked when a connection is established
 * @param {function} [options.onClose] - Callback invoked when a connection is closed
 * @returns {function} A callback suitable for use with the 'connect' event
 */
function createHycoWebSocketEchoListener(options) {
  if (!options) options = {};
  return function (connection) {
    if (typeof options.onConnection === 'function') {
      options.onConnection(connection);
    }
    connection.on('message', function (message) {
      if (message.type === 'utf8') {
        connection.sendUTF(message.utf8Data);
      } else if (message.type === 'binary') {
        connection.sendBytes(message.binaryData);
      }
    });
    connection.on('close', function (reasonCode, description) {
      if (typeof options.onClose === 'function') {
        options.onClose(connection, reasonCode, description);
      }
    });
  };
}

module.exports = {
  createRelayConfig: createRelayConfig,
  safeClose: safeClose,
  createBuffer: createBuffer,
  describeIf: describeIf,
  createEchoListener: createEchoListener,
  createHycoWebSocketEchoListener: createHycoWebSocketEchoListener
};
