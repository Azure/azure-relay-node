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

module.exports = {
  createRelayConfig: createRelayConfig,
  safeClose: safeClose,
  createBuffer: createBuffer,
  describeIf: describeIf
};
