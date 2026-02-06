/**
 * Parameter validation unit tests for hyco-websocket module.
 * Verifies that createRelayToken() throws or handles gracefully
 * when called with invalid inputs (null, undefined, empty URI).
 */
'use strict';

const WebSocketServer = require('../../lib/HybridConnectionsWebSocketServer');

const VALID_URI = 'wss://contoso.servicebus.windows.net:443/$hc/mypath';
const VALID_KEY_NAME = 'RootManageSharedAccessKey';
const VALID_KEY = 'dGVzdGtleXZhbHVlMTIzNDU2Nzg5MA==';

describe('hyco-websocket parameter validation', () => {

  describe('createRelayToken() with invalid URI', () => {

    test('throws when URI is null', () => {
      expect(() => {
        WebSocketServer.createRelayToken(null, VALID_KEY_NAME, VALID_KEY);
      }).toThrow();
    });

    test('throws when URI is undefined', () => {
      expect(() => {
        WebSocketServer.createRelayToken(undefined, VALID_KEY_NAME, VALID_KEY);
      }).toThrow();
    });

    test('throws when URI is empty string', () => {
      expect(() => {
        WebSocketServer.createRelayToken('', VALID_KEY_NAME, VALID_KEY);
      }).toThrow();
    });
  });
});
