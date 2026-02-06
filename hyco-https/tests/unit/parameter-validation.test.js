/**
 * Parameter validation unit tests for hyco-https module.
 * Verifies that createRelayToken() throws or handles gracefully
 * when called with invalid inputs (null, undefined, empty URI).
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
});
