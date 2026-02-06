/**
 * Parameter validation unit tests for hyco-ws module.
 * Verifies that createRelayToken() and createRelayedServer() throw or handle
 * gracefully when called with invalid inputs.
 */
'use strict';

// Mock HybridConnectionWebSocketServer to avoid ws require.cache issue in Jest.
// Preserves the real constructor validation logic for server/token options.
jest.mock('../../lib/HybridConnectionWebSocketServer', () => {
  var isDefinedAndNonNull = function(options, key) {
    return typeof options[key] != 'undefined' && options[key] !== null;
  };
  const EventEmitter = require('events');
  function MockServer(options) {
    EventEmitter.call(this);
    options = Object.assign({ server: null, token: null }, options);
    if (!isDefinedAndNonNull(options, 'server')) {
      throw new TypeError('\'server\' must be provided');
    }
    if (!isDefinedAndNonNull(options, 'token')) {
      throw new TypeError('A \'token\' string or function must be provided');
    }
  }
  require('util').inherits(MockServer, EventEmitter);
  return MockServer;
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

  describe('createRelayedServer() with missing required options', () => {

    test('throws TypeError when server option is missing', () => {
      expect(() => {
        WS.createRelayedServer({ token: 'test-token' });
      }).toThrow(TypeError);
      expect(() => {
        WS.createRelayedServer({ token: 'test-token' });
      }).toThrow("'server' must be provided");
    });

    test('throws TypeError when server option is null', () => {
      expect(() => {
        WS.createRelayedServer({ server: null, token: 'test-token' });
      }).toThrow(TypeError);
      expect(() => {
        WS.createRelayedServer({ server: null, token: 'test-token' });
      }).toThrow("'server' must be provided");
    });

    test('throws TypeError when token option is missing', () => {
      expect(() => {
        WS.createRelayedServer({ server: 'wss://contoso.servicebus.windows.net:443/$hc/mypath' });
      }).toThrow(TypeError);
      expect(() => {
        WS.createRelayedServer({ server: 'wss://contoso.servicebus.windows.net:443/$hc/mypath' });
      }).toThrow("'token' string or function must be provided");
    });

    test('throws TypeError when token option is null', () => {
      expect(() => {
        WS.createRelayedServer({ server: 'wss://contoso.servicebus.windows.net:443/$hc/mypath', token: null });
      }).toThrow(TypeError);
      expect(() => {
        WS.createRelayedServer({ server: 'wss://contoso.servicebus.windows.net:443/$hc/mypath', token: null });
      }).toThrow("'token' string or function must be provided");
    });

    test('throws TypeError when options is empty object', () => {
      expect(() => {
        WS.createRelayedServer({});
      }).toThrow(TypeError);
    });

    test('throws TypeError when options is undefined', () => {
      expect(() => {
        WS.createRelayedServer();
      }).toThrow();
    });

    test('does not throw when both server and token are provided', () => {
      expect(() => {
        WS.createRelayedServer({
          server: 'wss://contoso.servicebus.windows.net:443/$hc/mypath',
          token: 'test-token'
        });
      }).not.toThrow();
    });

    test('does not throw when token is a function', () => {
      expect(() => {
        WS.createRelayedServer({
          server: 'wss://contoso.servicebus.windows.net:443/$hc/mypath',
          token: () => 'dynamic-token'
        });
      }).not.toThrow();
    });
  });
});
