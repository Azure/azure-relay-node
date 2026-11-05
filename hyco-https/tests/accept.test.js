jest.mock('ws', () => {
    const EventEmitter = require('events');
    class MockWebSocket extends EventEmitter {
        constructor(address, protocols, options) {
            super();
            this.address = address;
            this.protocols = protocols;
            this.options = options;
            MockWebSocket.instances.push(this);
        }
        send() {}
        close() {}
        pong() {}
    }
    MockWebSocket.instances = [];
    return MockWebSocket;
});

const WebSocket = require('ws');
const https = require('..');

const rendezvousAddress = 'wss://contoso.servicebus.windows.net/$hc/hc1?sb-hc-action=accept&sb-hc-id=abc';

function createListeningServer(options) {
    WebSocket.instances.length = 0;
    const server = https.createRelayedServer(Object.assign({
        server: 'wss://contoso.servicebus.windows.net/$hc/hc1?sb-hc-action=listen',
        token: 'token'
    }, options), () => {});
    server.listen();
    expect(WebSocket.instances.length).toBe(1);
    return server;
}

function sendControlMessage(server, message) {
    server.controlChannel.onmessage({ data: typeof message === 'string' ? message : JSON.stringify(message) });
}

function acceptMessage(connectHeaders) {
    return {
        accept: {
            address: rendezvousAddress,
            id: 'abc',
            connectHeaders: connectHeaders
        }
    };
}

const validHeaders = {
    'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    'Sec-WebSocket-Version': '13'
};

describe.each([
    ['accepting', 'accept', validHeaders],
    ['rejecting', 'accept', {}],
    ['receiving an HTTP request', 'request', undefined]
])('Relay rendezvous destination validation when %s', (_, messageType, connectHeaders) => {
    function rendezvousMessage(address) {
        return {
            [messageType]: {
                address: address,
                id: 'abc',
                connectHeaders: connectHeaders
            }
        };
    }

    test.each([
        undefined,
        null,
        '',
        42,
        {},
        'not a URL',
        'ws://contoso.servicebus.windows.net/$hc/hc1',
        'http://contoso.servicebus.windows.net/$hc/hc1',
        'https://contoso.servicebus.windows.net/$hc/hc1',
        'ws+unix:///tmp/relay.sock',
        'wss://localhost/$hc/hc1',
        'wss://127.0.0.1/$hc/hc1',
        'wss://[::1]/$hc/hc1',
        'wss://169.254.169.254/$hc/hc1',
        'wss://evil.example/$hc/hc1',
        'wss://contoso.servicebus.windows.net.evil.example/$hc/hc1',
        'wss://contoso-servicebus.windows.net/$hc/hc1',
        'wss://contoso.servicebus.windows.net@evil.example/$hc/hc1',
        'wss://user@contoso.servicebus.windows.net/$hc/hc1',
        'wss://user:password@contoso.servicebus.windows.net/$hc/hc1',
        'wss://contoso.servicebus.windows.net:8443/$hc/hc1',
        'wss://contoso.servicebus.windows.net/$hc/hc1#fragment',
        'wss://dc-node.servicebus.usgovcloudapi.net/$hc/hc1',
        'wss://dc-node.servicebus.chinacloudapi.cn/$hc/hc1'
    ])('does not connect to an invalid or untrusted destination: %p', (address) => {
        const server = createListeningServer();
        const errors = [];
        server.on('error', (err) => errors.push(err));
        const message = rendezvousMessage(address);

        expect(() => sendControlMessage(server, message)).not.toThrow();

        expect(WebSocket.instances.length).toBe(1);
        expect(errors.length).toBe(1);
        expect(errors[0].name).toBe('TypeError');
    });

    test.each([
        'servicebus.windows.net',
        'servicebus.usgovcloudapi.net',
        'servicebus.chinacloudapi.cn',
        'servicebus.cloudapi.de'
    ])('allows service-node rendezvous endpoints in the configured cloud: %s', (domain) => {
        const server = createListeningServer({
            server: 'wss://contoso.' + domain + '/$hc/hc1?sb-hc-action=listen'
        });
        const message = rendezvousMessage('wss://dc-node.' + domain + ':443/$hc/hc1/dispatch?sb-hc-action=accept&sb-hc-id=abc&value=a%2Fb');
        sendControlMessage(server, message);

        expect(WebSocket.instances.length).toBe(2);
        const client = WebSocket.instances[1];
        expect(client.address).toContain('wss://dc-node.' + domain + '/$hc/hc1/dispatch?sb-hc-action=accept&sb-hc-id=abc&value=a%2Fb');
        expect((client.options || client.protocols).followRedirects).toBe(false);
    });

    test('normalizes the destination before passing it to the WebSocket URL parser', () => {
        const server = createListeningServer();
        const message = rendezvousMessage('wss://DC-NODE.SERVICEBUS.WINDOWS.NET:443/$hc/hc1?sb-hc-action=accept&sb-hc-id=abc');
        sendControlMessage(server, message);

        expect(WebSocket.instances.length).toBe(2);
        expect(WebSocket.instances[1].address).toMatch(/^wss:\/\/dc-node\.servicebus\.windows\.net\/\$hc\/hc1\?/);
    });

    test('allows the configured non-Azure hostname but not sibling hostnames', () => {
        const server = createListeningServer({
            server: 'wss://relay.example/$hc/hc1?sb-hc-action=listen'
        });
        const errors = [];
        server.on('error', (err) => errors.push(err));
        const message = rendezvousMessage(rendezvousAddress.replace('contoso.servicebus.windows.net', 'relay.example'));
        sendControlMessage(server, message);
        expect(WebSocket.instances.length).toBe(2);
        expect(errors).toEqual([]);

        message[messageType].address = message[messageType].address.replace('relay.example', 'other.example');
        sendControlMessage(server, message);
        expect(WebSocket.instances.length).toBe(2);
        expect(errors.length).toBe(1);
    });
});

describe('HTTP response rendezvous destination validation', () => {
    function requestMessage(address) {
        return {
            request: {
                address: address,
                id: 'abc',
                method: 'GET',
                requestTarget: '/hc1',
                requestHeaders: {}
            }
        };
    }

    test('uses a validated service-node address when a response exceeds 64 KB', () => {
        const server = createListeningServer();
        server.on('request', (req, res) => res.end('x'.repeat(64 * 1024 + 1)));
        const address = rendezvousAddress.replace('contoso.', 'DC-NODE.');
        sendControlMessage(server, requestMessage(address));

        expect(WebSocket.instances.length).toBe(2);
        const client = WebSocket.instances[1];
        expect(client.address).toBe(address.replace('DC-NODE.', 'dc-node.'));
        expect(client.protocols.followRedirects).toBe(false);
    });

    test('does not dispatch an HTTP request with an untrusted response address', () => {
        const server = createListeningServer();
        const requests = [];
        const errors = [];
        server.on('request', (req) => requests.push(req));
        server.on('error', (err) => errors.push(err));
        sendControlMessage(server, requestMessage('wss://169.254.169.254/metadata'));

        expect(requests).toEqual([]);
        expect(WebSocket.instances.length).toBe(1);
        expect(errors.length).toBe(1);
    });
});

describe('control channel WebSocket accept', () => {
    test.each([
        ['without extensions', {}],
        ['with extensions', { 'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits' }]
    ])('completes the rendezvous instead of crashing (%s)', (_, extraHeaders) => {
        const server = createListeningServer();
        const errors = [];
        const connections = [];
        server.on('error', (err) => errors.push(err));
        server.on('connection', (client) => connections.push(client));

        expect(() => sendControlMessage(server, acceptMessage(Object.assign({}, validHeaders, extraHeaders)))).not.toThrow();

        expect(errors).toEqual([]);
        expect(WebSocket.instances.length).toBe(2);
        const client = WebSocket.instances[1];
        expect(client.address).toBe(rendezvousAddress);
        expect(client.options.headers).toEqual([]);
        expect(client.options.followRedirects).toBe(false);
        expect(connections).toEqual([client]);
    });

    test('negotiates permessage-deflate when enabled', () => {
        const server = createListeningServer({ perMessageDeflate: true });
        sendControlMessage(server, acceptMessage(Object.assign({
            'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits'
        }, validHeaders)));

        expect(WebSocket.instances.length).toBe(2);
        const headers = WebSocket.instances[1].options.headers;
        expect(headers.length).toBe(1);
        expect(headers[0]).toMatch(/^Sec-WebSocket-Extensions: permessage-deflate/);
    });

    test.each([
        ['the WebSocket key is missing', { 'Sec-WebSocket-Version': '13' }],
        ['the extensions header is malformed', Object.assign({ 'Sec-WebSocket-Extensions': 'permessage-deflate;;' }, validHeaders)],
        ['the extension parameters are invalid', Object.assign({ 'Sec-WebSocket-Extensions': 'permessage-deflate; server_max_window_bits=7' }, validHeaders)]
    ])('rejects the rendezvous when %s', (_, connectHeaders) => {
        const server = createListeningServer({ perMessageDeflate: true });
        const errors = [];
        server.on('error', (err) => errors.push(err));

        expect(() => sendControlMessage(server, acceptMessage(connectHeaders))).not.toThrow();

        expect(errors).toEqual([]);
        expect(WebSocket.instances.length).toBe(2);
        const rejectClient = WebSocket.instances[1];
        expect(rejectClient.address).toBe(rendezvousAddress + '&sb-hc-statusCode=400&sb-hc-statusDescription=Bad%20Request');
        expect(rejectClient.protocols.followRedirects).toBe(false);
        // the Relay fails the reject handshake; that must not crash the listener either
        expect(() => rejectClient.emit('error', new Error('Unexpected server response: 400'))).not.toThrow();
    });

    test.each([
        [(protocols, callback) => callback(false), 401, 'Unauthorized'],
        [() => {}, 501, 'Could%20not%20process%20protocols']
    ])('rejects protocol selection failures with status %p', (handleProtocols, status, reason) => {
        const server = createListeningServer({ handleProtocols: handleProtocols });
        expect(() => sendControlMessage(server, acceptMessage(validHeaders))).not.toThrow();

        expect(WebSocket.instances.length).toBe(2);
        expect(WebSocket.instances[1].address).toBe(rendezvousAddress +
            '&sb-hc-statusCode=' + status + '&sb-hc-statusDescription=' + reason);
    });

    test('reports an accept message without a rendezvous address', () => {
        const server = createListeningServer();
        const errors = [];
        server.on('error', (err) => errors.push(err));
        expect(() => sendControlMessage(server, { accept: { connectHeaders: {} } })).not.toThrow();
        expect(WebSocket.instances.length).toBe(1);
        expect(errors.length).toBe(1);
        expect(errors[0]).toBeInstanceOf(TypeError);
    });

    test('does not crash on a malformed control message', () => {
        const server = createListeningServer();
        const errors = [];
        expect(() => sendControlMessage(server, '{not json')).not.toThrow();
        expect(() => sendControlMessage(server, 'null')).not.toThrow();
        expect(() => sendControlMessage(server, { accept: { address: rendezvousAddress } })).not.toThrow();

        server.on('error', (err) => errors.push(err));
        sendControlMessage(server, '{not json');
        expect(errors.length).toBe(1);
        expect(errors[0]).toBeInstanceOf(SyntaxError);
    });
});
