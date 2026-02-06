/**
 * Parameter validation unit tests for hyco-https module.
 * Verifies that createRelayToken() throws or handles gracefully
 * when called with invalid inputs (null, undefined, empty URI and key name).
 */
'use strict';

const https = require('../../index');

const VALID_URI = 'wss://contoso.servicebus.windows.net:443/$hc/mypath';
const VALID_KEY_NAME = 'RootManageSharedAccessKey';
const VALID_KEY = 'dGVzdGtleXZhbHVlMTIzNDU2Nzg5MA==';

describe('hyco-https parameter validation', () => {

  describe('createRelayToken() with invalid URI', () => {

    test('throws when URI is null', () => {
      expect(() => {
        https.createRelayToken(null, VALID_KEY_NAME, VALID_KEY);
      }).toThrow();
    });

    test('throws when URI is undefined', () => {
      expect(() => {
        https.createRelayToken(undefined, VALID_KEY_NAME, VALID_KEY);
      }).toThrow();
    });

    test('throws when URI is empty string', () => {
      expect(() => {
        https.createRelayToken('', VALID_KEY_NAME, VALID_KEY);
      }).toThrow();
    });
  });

  describe('createRelayToken() with invalid key name', () => {

    test('handles null key name gracefully (produces token with skn=null)', () => {
      const token = https.createRelayToken(VALID_URI, null, VALID_KEY);
      expect(typeof token).toBe('string');
      expect(token).toContain('SharedAccessSignature');
      expect(token).toContain('skn=null');
    });

    test('handles undefined key name gracefully (produces token with skn=undefined)', () => {
      const token = https.createRelayToken(VALID_URI, undefined, VALID_KEY);
      expect(typeof token).toBe('string');
      expect(token).toContain('SharedAccessSignature');
      expect(token).toContain('skn=undefined');
    });

    test('handles empty string key name gracefully (produces token with skn=)', () => {
      const token = https.createRelayToken(VALID_URI, '', VALID_KEY);
      expect(typeof token).toBe('string');
      expect(token).toContain('SharedAccessSignature');
      expect(token).toMatch(/skn=$/);
    });
  });

  describe('createRelayToken() with invalid key value', () => {

    test('throws when key value is null', () => {
      expect(() => {
        https.createRelayToken(VALID_URI, VALID_KEY_NAME, null);
      }).toThrow();
    });

    test('throws when key value is undefined', () => {
      expect(() => {
        https.createRelayToken(VALID_URI, VALID_KEY_NAME, undefined);
      }).toThrow();
    });

    test('handles empty string key value gracefully (produces a token)', () => {
      const token = https.createRelayToken(VALID_URI, VALID_KEY_NAME, '');
      expect(typeof token).toBe('string');
      expect(token).toContain('SharedAccessSignature');
      expect(token).toContain('skn=' + VALID_KEY_NAME);
    });
  });
});
