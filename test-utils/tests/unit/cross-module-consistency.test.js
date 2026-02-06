/**
 * Cross-module consistency tests for token and URI generation.
 * Verifies that createRelayToken, createRelayListenUri, and createRelaySendUri
 * produce identical results across hyco-https, hyco-websocket, and hyco-ws modules.
 */
'use strict';

// Mock HybridConnectionWebSocketServer to avoid ws require.cache issue in Jest
jest.mock('../../../hyco-ws/lib/HybridConnectionWebSocketServer', () => {
  return class MockServer {};
});

const hycoHttps = require('../../../hyco-https');
const hycoWebSocket = require('../../../hyco-websocket');
const hycoWs = require('../../../hyco-ws');

const TEST_NAMESPACE = 'contoso.servicebus.windows.net';
const TEST_PATH = 'myhybridconnection';
const TEST_URI = `wss://${TEST_NAMESPACE}:443/$hc/${TEST_PATH}`;
const TEST_KEY_NAME = 'RootManageSharedAccessKey';
const TEST_KEY = 'dGVzdGtleXZhbHVlMTIzNDU2Nzg5MA==';

describe('Cross-module token & URI consistency', () => {

  describe('createRelayToken() produces identical tokens across all modules', () => {

    test('tokens from all three modules have identical sr, skn fields', () => {
      const tokenHttps = hycoHttps.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY, 3600);
      const tokenWSocket = hycoWebSocket.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY, 3600);
      const tokenWs = hycoWs.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY, 3600);

      const parse = (t) => new URLSearchParams(t.replace('SharedAccessSignature ', ''));

      const paramsHttps = parse(tokenHttps);
      const paramsWSocket = parse(tokenWSocket);
      const paramsWs = parse(tokenWs);

      // sr (audience) must be identical
      expect(paramsHttps.get('sr')).toBe(paramsWSocket.get('sr'));
      expect(paramsHttps.get('sr')).toBe(paramsWs.get('sr'));

      // skn (key name) must be identical
      expect(paramsHttps.get('skn')).toBe(paramsWSocket.get('skn'));
      expect(paramsHttps.get('skn')).toBe(paramsWs.get('skn'));
    });

    test('tokens generated at same instant have identical se and sig fields', () => {
      // Generate all three tokens as close together as possible
      const tokenHttps = hycoHttps.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY, 3600);
      const tokenWSocket = hycoWebSocket.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY, 3600);
      const tokenWs = hycoWs.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY, 3600);

      const parse = (t) => new URLSearchParams(t.replace('SharedAccessSignature ', ''));

      const paramsHttps = parse(tokenHttps);
      const paramsWSocket = parse(tokenWSocket);
      const paramsWs = parse(tokenWs);

      // se (expiry) values should be identical or differ by at most 1 second
      const seHttps = parseInt(paramsHttps.get('se'), 10);
      const seWSocket = parseInt(paramsWSocket.get('se'), 10);
      const seWs = parseInt(paramsWs.get('se'), 10);

      expect(Math.abs(seHttps - seWSocket)).toBeLessThanOrEqual(1);
      expect(Math.abs(seHttps - seWs)).toBeLessThanOrEqual(1);

      // If se values are the same, sig must be identical
      if (seHttps === seWSocket) {
        expect(paramsHttps.get('sig')).toBe(paramsWSocket.get('sig'));
      }
      if (seHttps === seWs) {
        expect(paramsHttps.get('sig')).toBe(paramsWs.get('sig'));
      }
    });

    test('tokens with custom expiry produce consistent results', () => {
      const customExpiry = 7200;
      const tokenHttps = hycoHttps.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY, customExpiry);
      const tokenWSocket = hycoWebSocket.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY, customExpiry);
      const tokenWs = hycoWs.createRelayToken(TEST_URI, TEST_KEY_NAME, TEST_KEY, customExpiry);

      // All should be valid SAS tokens
      expect(tokenHttps).toMatch(/^SharedAccessSignature /);
      expect(tokenWSocket).toMatch(/^SharedAccessSignature /);
      expect(tokenWs).toMatch(/^SharedAccessSignature /);

      const parse = (t) => new URLSearchParams(t.replace('SharedAccessSignature ', ''));
      const paramsHttps = parse(tokenHttps);
      const paramsWSocket = parse(tokenWSocket);
      const paramsWs = parse(tokenWs);

      // sr must be identical across all
      expect(paramsHttps.get('sr')).toBe(paramsWSocket.get('sr'));
      expect(paramsHttps.get('sr')).toBe(paramsWs.get('sr'));
    });
  });

  describe('createRelayListenUri() produces identical URIs across all modules', () => {

    test('listen URIs without token are identical', () => {
      const uriHttps = hycoHttps.createRelayListenUri(TEST_NAMESPACE, TEST_PATH);
      const uriWSocket = hycoWebSocket.createRelayListenUri(TEST_NAMESPACE, TEST_PATH);
      const uriWs = hycoWs.createRelayListenUri(TEST_NAMESPACE, TEST_PATH);

      expect(uriHttps).toBe(uriWSocket);
      expect(uriHttps).toBe(uriWs);
    });

    test('listen URIs with token are identical', () => {
      const token = 'SharedAccessSignature sr=test&sig=test&se=123&skn=test';
      const uriHttps = hycoHttps.createRelayListenUri(TEST_NAMESPACE, TEST_PATH, token);
      const uriWSocket = hycoWebSocket.createRelayListenUri(TEST_NAMESPACE, TEST_PATH, token);
      const uriWs = hycoWs.createRelayListenUri(TEST_NAMESPACE, TEST_PATH, token);

      expect(uriHttps).toBe(uriWSocket);
      expect(uriHttps).toBe(uriWs);
    });

    test('listen URIs with token and id are identical', () => {
      const token = 'SharedAccessSignature sr=test&sig=test&se=123&skn=test';
      const id = 'test-id-12345';
      const uriHttps = hycoHttps.createRelayListenUri(TEST_NAMESPACE, TEST_PATH, token, id);
      const uriWSocket = hycoWebSocket.createRelayListenUri(TEST_NAMESPACE, TEST_PATH, token, id);
      const uriWs = hycoWs.createRelayListenUri(TEST_NAMESPACE, TEST_PATH, token, id);

      expect(uriHttps).toBe(uriWSocket);
      expect(uriHttps).toBe(uriWs);
    });
  });

  describe('createRelaySendUri() produces identical URIs across all modules', () => {

    test('send URIs without token are identical', () => {
      const uriHttps = hycoHttps.createRelaySendUri(TEST_NAMESPACE, TEST_PATH);
      const uriWSocket = hycoWebSocket.createRelaySendUri(TEST_NAMESPACE, TEST_PATH);
      const uriWs = hycoWs.createRelaySendUri(TEST_NAMESPACE, TEST_PATH);

      expect(uriHttps).toBe(uriWSocket);
      expect(uriHttps).toBe(uriWs);
    });

    test('send URIs with token are identical', () => {
      const token = 'SharedAccessSignature sr=test&sig=test&se=123&skn=test';
      const uriHttps = hycoHttps.createRelaySendUri(TEST_NAMESPACE, TEST_PATH, token);
      const uriWSocket = hycoWebSocket.createRelaySendUri(TEST_NAMESPACE, TEST_PATH, token);
      const uriWs = hycoWs.createRelaySendUri(TEST_NAMESPACE, TEST_PATH, token);

      expect(uriHttps).toBe(uriWSocket);
      expect(uriHttps).toBe(uriWs);
    });

    test('send URIs with token and id are identical', () => {
      const token = 'SharedAccessSignature sr=test&sig=test&se=123&skn=test';
      const id = 'test-id-12345';
      const uriHttps = hycoHttps.createRelaySendUri(TEST_NAMESPACE, TEST_PATH, token, id);
      const uriWSocket = hycoWebSocket.createRelaySendUri(TEST_NAMESPACE, TEST_PATH, token, id);
      const uriWs = hycoWs.createRelaySendUri(TEST_NAMESPACE, TEST_PATH, token, id);

      expect(uriHttps).toBe(uriWSocket);
      expect(uriHttps).toBe(uriWs);
    });
  });

  describe('createRelayBaseUri() produces identical URIs across all modules', () => {

    test('base URIs are identical', () => {
      const uriHttps = hycoHttps.createRelayBaseUri(TEST_NAMESPACE, TEST_PATH);
      const uriWSocket = hycoWebSocket.createRelayBaseUri(TEST_NAMESPACE, TEST_PATH);
      const uriWs = hycoWs.createRelayBaseUri(TEST_NAMESPACE, TEST_PATH);

      expect(uriHttps).toBe(uriWSocket);
      expect(uriHttps).toBe(uriWs);
    });
  });
});
