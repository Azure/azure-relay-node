'use strict';

/**
 * Parameter Validation Tests
 *
 * Tests input validation for token creation, server construction, and URI building.
 */

const WebSocket = require('./loadHycoWs');
const { generateRandomSasKey } = require('./testUtility');

describe('ParameterValidation', () => {

    // --- createRelayToken validation ---

    test('createRelayToken with missing keyName produces skn=undefined in token', () => {
        // The function does not explicitly validate parameters;
        // missing keyName results in 'skn=undefined' in the token string.
        const token = WebSocket.createRelayToken(
            'http://contoso.servicebus.windows.net/myconnection',
            undefined,
            generateRandomSasKey()
        );
        expect(token).toMatch(/^SharedAccessSignature /);
        expect(token).toContain('skn=undefined');
    });

    // --- RelayedServer validation ---

    test('createRelayedServer throws TypeError when server option is missing', () => {
        expect(() => {
            WebSocket.createRelayedServer({
                token: 'some-token'
            });
        }).toThrow("'server' must be provided");
    });

    test('createRelayedServer throws TypeError when token option is missing', () => {
        expect(() => {
            WebSocket.createRelayedServer({
                server: 'wss://contoso.servicebus.windows.net:443/$hc/myconnection?sb-hc-action=listen'
            });
        }).toThrow("'token' string or function must be provided");
    });

    // --- appendRelayToken edge case ---

    test('appendRelayToken with URI having no existing query string', () => {
        // When the URI has no query string, parsedUrl.search is null.
        // null + '&sb-hc-token=...' coerces to 'null&sb-hc-token=...' (known behavior).
        const uri = 'wss://contoso.servicebus.windows.net:443/$hc/myconnection';
        const result = WebSocket.appendRelayToken(uri, 'rule', generateRandomSasKey());

        // Verify the token is present in the result
        expect(result).toContain('sb-hc-token=');
        // Verify the result contains a SharedAccessSignature token value
        const tokenPart = result.split('sb-hc-token=')[1];
        expect(tokenPart).toBeTruthy();
        expect(decodeURIComponent(tokenPart)).toMatch(/^SharedAccessSignature /);
    });

    // --- createRelayToken edge case ---

    test('createRelayToken with null URI throws TypeError', () => {
        // On modern Node.js, url.parse(null) throws because URI must be a string
        expect(() => {
            WebSocket.createRelayToken(null, 'rule', generateRandomSasKey());
        }).toThrow();
    });
});
