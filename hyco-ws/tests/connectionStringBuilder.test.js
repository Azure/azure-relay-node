'use strict';

/**
 * ConnectionStringBuilder Tests
 *
 * Tests the URI builder and SAS token helper functions (pure unit tests, no live service required).
 */

const WebSocket = require('./loadHycoWs');
const { generateRandomSasKey, generateRandomSasToken } = require('./testUtility');

describe('ConnectionStringBuilder', () => {

    // --- createRelayBaseUri ---

    test('createRelayBaseUri creates correct wss:// URI format', () => {
        const uri = WebSocket.createRelayBaseUri('contoso.servicebus.windows.net', 'myconnection');
        expect(uri).toBe('wss://contoso.servicebus.windows.net:443/$hc/myconnection');
    });

    // --- createRelaySendUri ---

    test('createRelaySendUri creates URI with sb-hc-action=connect', () => {
        const uri = WebSocket.createRelaySendUri('contoso.servicebus.windows.net', 'myconnection');
        expect(uri).toContain('wss://contoso.servicebus.windows.net:443/$hc/myconnection');
        expect(uri).toContain('sb-hc-action=connect');
        expect(uri).not.toContain('sb-hc-token');
        expect(uri).not.toContain('sb-hc-id');
    });

    test('createRelaySendUri includes token when provided', () => {
        const token = generateRandomSasToken();
        const uri = WebSocket.createRelaySendUri('contoso.servicebus.windows.net', 'myconnection', token);
        expect(uri).toContain('sb-hc-action=connect');
        expect(uri).toContain('sb-hc-token=' + encodeURIComponent(token));
    });

    test('createRelaySendUri includes id when provided', () => {
        const id = 'test-correlation-id-123';
        const uri = WebSocket.createRelaySendUri('contoso.servicebus.windows.net', 'myconnection', null, id);
        expect(uri).toContain('sb-hc-action=connect');
        expect(uri).toContain('sb-hc-id=' + encodeURIComponent(id));
        expect(uri).not.toContain('sb-hc-token');
    });

    // --- createRelayListenUri ---

    test('createRelayListenUri creates URI with sb-hc-action=listen', () => {
        const uri = WebSocket.createRelayListenUri('contoso.servicebus.windows.net', 'myconnection');
        expect(uri).toContain('wss://contoso.servicebus.windows.net:443/$hc/myconnection');
        expect(uri).toContain('sb-hc-action=listen');
        expect(uri).not.toContain('sb-hc-token');
        expect(uri).not.toContain('sb-hc-id');
    });

    test('createRelayListenUri includes token when provided', () => {
        const token = generateRandomSasToken();
        const uri = WebSocket.createRelayListenUri('contoso.servicebus.windows.net', 'myconnection', token);
        expect(uri).toContain('sb-hc-action=listen');
        expect(uri).toContain('sb-hc-token=' + encodeURIComponent(token));
    });

    test('createRelayListenUri includes id when provided', () => {
        const id = 'listener-id-456';
        const uri = WebSocket.createRelayListenUri('contoso.servicebus.windows.net', 'myconnection', null, id);
        expect(uri).toContain('sb-hc-action=listen');
        expect(uri).toContain('sb-hc-id=' + encodeURIComponent(id));
        expect(uri).not.toContain('sb-hc-token');
    });

    // --- createRelayToken ---

    test('createRelayToken generates valid SharedAccessSignature format', () => {
        const token = WebSocket.createRelayToken(
            'http://contoso.servicebus.windows.net/myconnection',
            'RootManageSharedAccessKey',
            generateRandomSasKey()
        );

        expect(token).toMatch(/^SharedAccessSignature /);
        expect(token).toContain('sr=');
        expect(token).toContain('sig=');
        expect(token).toContain('se=');
        expect(token).toContain('skn=RootManageSharedAccessKey');
    });

    test('createRelayToken uses default 1-hour expiration', () => {
        const beforeSec = Math.floor(Date.now() / 1000);
        const token = WebSocket.createRelayToken(
            'http://contoso.servicebus.windows.net/myconnection',
            'rule',
            generateRandomSasKey()
        );

        const seMatch = token.match(/se=(\d+)/);
        expect(seMatch).not.toBeNull();
        const expiry = parseInt(seMatch[1], 10);

        // Default expiration is 3600 seconds (1 hour)
        expect(expiry).toBeGreaterThanOrEqual(beforeSec + 3590);
        expect(expiry).toBeLessThanOrEqual(beforeSec + 3610);
    });

    test('createRelayToken uses custom expiration seconds', () => {
        const beforeSec = Math.floor(Date.now() / 1000);
        const token = WebSocket.createRelayToken(
            'http://contoso.servicebus.windows.net/myconnection',
            'rule',
            generateRandomSasKey(),
            600
        );

        const seMatch = token.match(/se=(\d+)/);
        expect(seMatch).not.toBeNull();
        const expiry = parseInt(seMatch[1], 10);

        // Custom expiration of 600 seconds (10 minutes)
        expect(expiry).toBeGreaterThanOrEqual(beforeSec + 590);
        expect(expiry).toBeLessThanOrEqual(beforeSec + 610);
    });

    test('createRelayToken normalizes URI by stripping $hc/ and using http scheme', () => {
        // Token from a wss URI with $hc/ should normalize: strip $hc/, use http scheme
        const token = WebSocket.createRelayToken(
            'wss://contoso.servicebus.windows.net:443/$hc/myconnection?sb-hc-action=listen',
            'rule',
            generateRandomSasKey()
        );

        const sr = token.match(/sr=([^&]+)/)[1];
        const decodedSr = decodeURIComponent(sr);

        // Verify http scheme is used and $hc/ is stripped
        expect(decodedSr).toContain('http://');
        expect(decodedSr).not.toContain('$hc/');
        expect(decodedSr).toContain('myconnection');
        // Query string (sb-hc-action) should be stripped
        expect(decodedSr).not.toContain('sb-hc-action');
    });

    // --- appendRelayToken ---

    test('appendRelayToken appends token to URI with existing query string', () => {
        const baseUri = WebSocket.createRelayListenUri('contoso.servicebus.windows.net', 'myconnection');
        // baseUri already has ?sb-hc-action=listen
        expect(baseUri).toContain('?');

        const result = WebSocket.appendRelayToken(baseUri, 'rule', generateRandomSasKey());
        expect(result).toContain('sb-hc-action=listen');
        expect(result).toContain('sb-hc-token=');
        // The appended token should be a valid SAS token
        const tokenParam = decodeURIComponent(result.split('sb-hc-token=')[1]);
        expect(tokenParam).toMatch(/^SharedAccessSignature /);
    });
});
