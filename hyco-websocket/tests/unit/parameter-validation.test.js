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

  describe('URI creation functions with null/empty namespace or path', () => {

    test('createRelayBaseUri() handles null namespace gracefully', () => {
      const uri = WS.createRelayBaseUri(null, 'mypath');
      expect(typeof uri).toBe('string');
      expect(uri).toBe('wss://null:443/$hc/mypath');
    });

    test('createRelayBaseUri() handles empty namespace gracefully', () => {
      const uri = WS.createRelayBaseUri('', 'mypath');
      expect(typeof uri).toBe('string');
      expect(uri).toBe('wss://:443/$hc/mypath');
    });

    test('createRelayBaseUri() handles null path gracefully', () => {
      const uri = WS.createRelayBaseUri('contoso.servicebus.windows.net', null);
      expect(typeof uri).toBe('string');
      expect(uri).toBe('wss://contoso.servicebus.windows.net:443/$hc/null');
    });

    test('createRelayBaseUri() handles empty path gracefully', () => {
      const uri = WS.createRelayBaseUri('contoso.servicebus.windows.net', '');
      expect(typeof uri).toBe('string');
      expect(uri).toBe('wss://contoso.servicebus.windows.net:443/$hc/');
    });

    test('createRelayListenUri() handles null namespace gracefully', () => {
      const uri = WS.createRelayListenUri(null, 'mypath');
      expect(typeof uri).toBe('string');
      expect(uri).toContain('wss://null:443/$hc/mypath');
      expect(uri).toContain('sb-hc-action=listen');
    });

    test('createRelayListenUri() handles empty path gracefully', () => {
      const uri = WS.createRelayListenUri('contoso.servicebus.windows.net', '');
      expect(typeof uri).toBe('string');
      expect(uri).toContain('wss://contoso.servicebus.windows.net:443/$hc/');
      expect(uri).toContain('sb-hc-action=listen');
    });

    test('createRelaySendUri() handles null namespace gracefully', () => {
      const uri = WS.createRelaySendUri(null, 'mypath');
      expect(typeof uri).toBe('string');
      expect(uri).toContain('wss://null:443/$hc/mypath');
      expect(uri).toContain('sb-hc-action=connect');
    });

    test('createRelaySendUri() handles empty path gracefully', () => {
      const uri = WS.createRelaySendUri('contoso.servicebus.windows.net', '');
      expect(typeof uri).toBe('string');
      expect(uri).toContain('wss://contoso.servicebus.windows.net:443/$hc/');
      expect(uri).toContain('sb-hc-action=connect');
    });
  });
});
