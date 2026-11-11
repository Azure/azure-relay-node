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
        ['the extensions header is malformed', Object.assign({ 'Sec-WebSocket-Extensions': 'permessage-deflate;;' }, validHeaders)]
    ])('rejects the rendezvous when %s', (_, connectHeaders) => {
        const server = createListeningServer();
        const errors = [];
        server.on('error', (err) => errors.push(err));

        expect(() => sendControlMessage(server, acceptMessage(connectHeaders))).not.toThrow();

        expect(errors).toEqual([]);
        expect(WebSocket.instances.length).toBe(2);
        const rejectClient = WebSocket.instances[1];
        expect(rejectClient.address).toBe(rendezvousAddress + '&sb-hc-statusCode=400&sb-hc-statusDescription=Bad%20Request');
        // the Relay fails the reject handshake; that must not crash the listener either
        expect(() => rejectClient.emit('error', new Error('Unexpected server response: 400'))).not.toThrow();
    });

    test('ignores an accept message without a rendezvous address', () => {
        const server = createListeningServer();
        expect(() => sendControlMessage(server, { accept: { connectHeaders: {} } })).not.toThrow();
        expect(WebSocket.instances.length).toBe(1);
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
