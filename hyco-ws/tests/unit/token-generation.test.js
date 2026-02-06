/**
 * Token & URI generation unit tests for hyco-ws module.
 * Covers createRelayToken, appendRelayToken, createRelayBaseUri,
 * createRelayListenUri, and createRelaySendUri.
 */
'use strict';

const crypto = require('crypto');
const moment = require('moment');
const url = require('url');

// Mock HybridConnectionWebSocketServer to avoid ws require.cache issue in Jest
jest.mock('../../lib/HybridConnectionWebSocketServer', () => {
  return class MockServer {};
});

const WS = require('../../index');

// Fixed test inputs
const TEST_NAMESPACE = 'contoso.servicebus.windows.net';
const TEST_PATH = 'myhybridconnection';
const TEST_URI = `wss://${TEST_NAMESPACE}:443/$hc/${TEST_PATH}`;
const TEST_KEY_NAME = 'RootManageSharedAccessKey';
const TEST_KEY = 'dGVzdGtleXZhbHVlMTIzNDU2Nzg5MA==';

describe('hyco-ws token & URI generation', () => {

  describe('createRelayToken()', () => {

    test('generates a valid SharedAccessSignature string', () => {
      const token = WS.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY);
      expect(token).toMatch(/^SharedAccessSignature /);
    });

    test('token contains sr, sig, se, skn fields', () => {
      const token = WS.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY);
      expect(token).toContain('sr=');
      expect(token).toContain('sig=');
      expect(token).toContain('se=');
      expect(token).toContain('skn=');
    });

    test('skn field matches provided key name', () => {
      const token = WS.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY);
      const params = new URLSearchParams(token.replace('SharedAccessSignature ', ''));
      expect(params.get('skn')).toBe(TEST_KEY_NAME);
    });

    test('sr field is URI-encoded audience with $hc/ stripped and http protocol', () => {
      const token = WS.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY);
      const params = new URLSearchParams(token.replace('SharedAccessSignature ', ''));
      const sr = params.get('sr');
      // The audience should use http:// protocol, no port, no $hc/
      expect(sr).toContain('http:');
      expect(sr).toContain(TEST_NAMESPACE);
      expect(sr).toContain(TEST_PATH);
      expect(sr).not.toContain('$hc/');
    });

    test('se field is a valid unix timestamp in the future', () => {
      const token = WS.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY);
      const params = new URLSearchParams(token.replace('SharedAccessSignature ', ''));
      const se = parseInt(params.get('se'), 10);
      const now = moment().unix();
      expect(se).toBeGreaterThan(now);
    });

    test('defaults to 3600-second expiration when not specified', () => {
      const before = moment().add(3600, 'seconds').unix();
      const token = WS.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY);
      const after = moment().add(3600, 'seconds').unix();
      const params = new URLSearchParams(token.replace('SharedAccessSignature ', ''));
      const se = parseInt(params.get('se'), 10);
      expect(se).toBeGreaterThanOrEqual(before);
      expect(se).toBeLessThanOrEqual(after);
    });

    test('respects custom expiration value', () => {
      const customExpiry = 7200;
      const before = moment().add(customExpiry, 'seconds').unix();
      const token = WS.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY, customExpiry);
      const after = moment().add(customExpiry, 'seconds').unix();
      const params = new URLSearchParams(token.replace('SharedAccessSignature ', ''));
      const se = parseInt(params.get('se'), 10);
      expect(se).toBeGreaterThanOrEqual(before);
      expect(se).toBeLessThanOrEqual(after);
    });

    test('uses HMAC-SHA256 for signature generation', () => {
      const token = WS.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY);
      const params = new URLSearchParams(token.replace('SharedAccessSignature ', ''));
      const se = params.get('se');
      const sig = params.get('sig');

      // Extract the raw (encoded) sr from the token string
      const srMatch = token.match(/sr=([^&]+)/);
      const encodedSr = srMatch[1];

      // The code signs: encodeURIComponent(uri) + '\n' + unixSeconds
      const stringToSign = encodedSr + '\n' + se;
      const hmac = crypto.createHmac('sha256', TEST_KEY);
      hmac.update(stringToSign);
      const expectedSig = hmac.digest('base64');

      expect(sig).toBe(expectedSig);
    });

    test('URI-encodes the audience in the sr field', () => {
      const token = WS.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY);
      // The raw token string should have encoded sr value (e.g. %3A for colon not present in encoded form...)
      // sr= value in the raw string should be URI-encoded
      const srMatch = token.match(/sr=([^&]+)/);
      expect(srMatch).not.toBeNull();
      const encodedSr = srMatch[1];
      // The encoded sr should contain %3a or %3A (encoded colon from http://)
      expect(encodedSr.toLowerCase()).toContain('%3a');
    });
  });

  describe('appendRelayToken()', () => {
    // Use a URI with existing query string (appendRelayToken is designed for URIs that already have params)
    const LISTEN_URI = `wss://${TEST_NAMESPACE}:443/$hc/${TEST_PATH}?sb-hc-action=listen`;

    test('appends sb-hc-token query parameter to the URI', () => {
      const result = WS.appendRelayToken(LISTEN_URI, TEST_KEY_NAME, TEST_KEY);
      const parsed = url.parse(result, true);
      expect(parsed.query).toHaveProperty('sb-hc-token');
    });

    test('appended token is a valid SharedAccessSignature', () => {
      const result = WS.appendRelayToken(LISTEN_URI, TEST_KEY_NAME, TEST_KEY);
      const parsed = url.parse(result, true);
      const token = parsed.query['sb-hc-token'];
      expect(token).toMatch(/^SharedAccessSignature /);
    });

    test('preserves the original URI scheme and host', () => {
      const result = WS.appendRelayToken(LISTEN_URI, TEST_KEY_NAME, TEST_KEY);
      expect(result).toContain('wss://');
      expect(result).toContain(TEST_NAMESPACE);
    });
  });

  describe('createRelayBaseUri()', () => {

    test('returns wss://{namespace}:443/$hc/{path} format', () => {
      const uri = WS.createRelayBaseUri(TEST_NAMESPACE, TEST_PATH);
      expect(uri).toBe(`wss://${TEST_NAMESPACE}:443/$hc/${TEST_PATH}`);
    });

    test('works with different namespace and path values', () => {
      const uri = WS.createRelayBaseUri('other.servicebus.windows.net', 'mypath');
      expect(uri).toBe('wss://other.servicebus.windows.net:443/$hc/mypath');
    });
  });

  describe('createRelaySendUri()', () => {

    test('includes sb-hc-action=connect parameter', () => {
      const uri = WS.createRelaySendUri(TEST_NAMESPACE, TEST_PATH);
      expect(uri).toContain('sb-hc-action=connect');
    });

    test('includes sb-hc-token when token is provided', () => {
      const token = 'SharedAccessSignature sr=test&sig=test&se=123&skn=test';
      const uri = WS.createRelaySendUri(TEST_NAMESPACE, TEST_PATH, token);
      expect(uri).toContain('sb-hc-token=');
    });

    test('does not include sb-hc-token when token is null', () => {
      const uri = WS.createRelaySendUri(TEST_NAMESPACE, TEST_PATH, null);
      expect(uri).not.toContain('sb-hc-token');
    });

    test('includes sb-hc-id when id is provided', () => {
      const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const uri = WS.createRelaySendUri(TEST_NAMESPACE, TEST_PATH, null, id);
      expect(uri).toContain('sb-hc-id=');
      expect(uri).toContain(encodeURIComponent(id));
    });

    test('does not include sb-hc-id when id is null', () => {
      const uri = WS.createRelaySendUri(TEST_NAMESPACE, TEST_PATH, null, null);
      expect(uri).not.toContain('sb-hc-id');
    });

    test('starts with the base URI', () => {
      const uri = WS.createRelaySendUri(TEST_NAMESPACE, TEST_PATH);
      expect(uri).toMatch(new RegExp('^wss://' + TEST_NAMESPACE + ':443/\\$hc/' + TEST_PATH));
    });
  });

  describe('createRelayListenUri()', () => {

    test('includes sb-hc-action=listen parameter', () => {
      const uri = WS.createRelayListenUri(TEST_NAMESPACE, TEST_PATH);
      expect(uri).toContain('sb-hc-action=listen');
    });

    test('includes sb-hc-token when token is provided', () => {
      const token = 'SharedAccessSignature sr=test&sig=test&se=123&skn=test';
      const uri = WS.createRelayListenUri(TEST_NAMESPACE, TEST_PATH, token);
      expect(uri).toContain('sb-hc-token=');
    });

    test('does not include sb-hc-token when token is null', () => {
      const uri = WS.createRelayListenUri(TEST_NAMESPACE, TEST_PATH, null);
      expect(uri).not.toContain('sb-hc-token');
    });

    test('includes sb-hc-id when id is provided', () => {
      const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const uri = WS.createRelayListenUri(TEST_NAMESPACE, TEST_PATH, null, id);
      expect(uri).toContain('sb-hc-id=');
    });

    test('does not include sb-hc-id when id is null', () => {
      const uri = WS.createRelayListenUri(TEST_NAMESPACE, TEST_PATH, null, null);
      expect(uri).not.toContain('sb-hc-id');
    });

    test('starts with the base URI', () => {
      const uri = WS.createRelayListenUri(TEST_NAMESPACE, TEST_PATH);
      expect(uri).toMatch(new RegExp('^wss://' + TEST_NAMESPACE + ':443/\\$hc/' + TEST_PATH));
    });
  });
});
