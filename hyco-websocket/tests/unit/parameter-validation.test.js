/**
 * Parameter validation unit tests for hyco-websocket module.
 * Verifies that createRelayToken() throws or handles gracefully
 * when called with invalid inputs (null, undefined, empty URI and key name).
 */
'use strict';

const WS = require('../../index');

const VALID_URI = 'wss://contoso.servicebus.windows.net:443/$hc/mypath';
const VALID_KEY_NAME = 'RootManageSharedAccessKey';
const VALID_KEY = 'dGVzdGtleXZhbHVlMTIzNDU2Nzg5MA==';

describe('hyco-websocket parameter validation', () => {

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

  describe('createRelayToken() with invalid key value', () => {

    test('throws when key value is null', () => {
      expect(() => {
        WS.createRelayToken(VALID_URI, VALID_KEY_NAME, null);
      }).toThrow();
    });

    test('throws when key value is undefined', () => {
      expect(() => {
        WS.createRelayToken(VALID_URI, VALID_KEY_NAME, undefined);
      }).toThrow();
    });

    test('handles empty string key value gracefully (produces a token)', () => {
      const token = WS.createRelayToken(VALID_URI, VALID_KEY_NAME, '');
      expect(typeof token).toBe('string');
      expect(token).toContain('SharedAccessSignature');
      expect(token).toContain('skn=' + VALID_KEY_NAME);
    });
  });

  describe('createRelayToken() with negative expiration', () => {

    test('handles negative expiration gracefully (produces token with past expiry)', () => {
      const before = Math.floor(Date.now() / 1000);
      const token = WS.createRelayToken(VALID_URI, VALID_KEY_NAME, VALID_KEY, -60);
      expect(typeof token).toBe('string');
      expect(token).toContain('SharedAccessSignature');
      // The se field should be in the past (current time minus 60 seconds)
      const seMatch = token.match(/se=(\d+)/);
      expect(seMatch).not.toBeNull();
      const se = parseInt(seMatch[1], 10);
      expect(se).toBeLessThan(before);
    });
  });
});
