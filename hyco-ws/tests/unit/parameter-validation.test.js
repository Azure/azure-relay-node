/**
 * Parameter validation unit tests for hyco-ws module.
 * Verifies that createRelayToken() throws or handles gracefully
 * when called with invalid inputs (null, undefined, empty URI and key name).
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

  describe('createRelayToken() with invalid key name', () => {

    test('handles null key name gracefully (produces token with skn=null)', () => {
      const token = WS.createRelayToken(VALID_URI, null, VALID_KEY);
      expect(typeof token).toBe('string');
      expect(token).toContain('SharedAccessSignature');
      expect(token).toContain('skn=null');
    });

    test('handles undefined key name gracefully (produces token with skn=undefined)', () => {
      const token = WS.createRelayToken(VALID_URI, undefined, VALID_KEY);
      expect(typeof token).toBe('string');
      expect(token).toContain('SharedAccessSignature');
      expect(token).toContain('skn=undefined');
    });

    test('handles empty string key name gracefully (produces token with skn=)', () => {
      const token = WS.createRelayToken(VALID_URI, '', VALID_KEY);
      expect(typeof token).toBe('string');
      expect(token).toContain('SharedAccessSignature');
      expect(token).toMatch(/skn=$/);
    });
  });
});
