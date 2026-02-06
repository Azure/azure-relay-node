/**
 * Parameter validation unit tests for hyco-ws module.
 * Verifies that createRelayToken() throws or handles gracefully
 * when called with invalid inputs (null, undefined, empty URI).
 */
'use strict';

// Mock HybridConnectionWebSocketServer to avoid ws require.cache issue in Jest
jest.mock('../../lib/HybridConnectionWebSocketServer', () => {
  return class MockServer {};
});

const WS = require('../../index');

const VALID_URI = 'wss://contoso.servicebus.windows.net:443/$hc/mypath';
const VALID_KEY_NAME = 'RootManageSharedAccessKey';
const VALID_KEY = 'dGVzdGtleXZhbHVlMTIzNDU2Nzg5MA==';

describe('hyco-ws parameter validation', () => {

  describe('createRelayToken() with invalid URI', () => {

    test('throws when URI is null', () => {
      expect(() => {
        WS.createRelayToken(null, VALID_KEY_NAME, VALID_KEY);
      }).toThrow();
    });

    test('throws when URI is undefined', () => {
      expect(() => {
        WS.createRelayToken(undefined, VALID_KEY_NAME, VALID_KEY);
      }).toThrow();
    });

    test('throws when URI is empty string', () => {
      expect(() => {
        WS.createRelayToken('', VALID_KEY_NAME, VALID_KEY);
      }).toThrow();
    });
  });
});
