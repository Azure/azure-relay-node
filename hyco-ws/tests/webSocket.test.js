'use strict';

/**
 * WebSocket Tests
 *
 * Requires a live Azure Relay namespace. Set environment variables:
 *   RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY
 */

const {
    WebSocket, namespace, path, keyrule, key, skipLiveTests,
    createListener, createClient, closeServer, closeClient,
    waitForConnection, waitForMessage, waitForClose, generateData
} = require('./testUtility');

const LIVE_TEST_TIMEOUT = 30000;

const liveDescribe = skipLiveTests ? describe.skip : describe;

liveDescribe('WebSocketTests', () => {
    let server;
    let client;
    let serverSocket;

    afterEach(async () => {
        const cleanups = [];
        if (client && client.readyState !== WebSocket.CLOSED) {
            cleanups.push(closeClient(client).catch(() => {}));
        }
        if (serverSocket && serverSocket.readyState !== WebSocket.CLOSED) {
            cleanups.push(closeClient(serverSocket).catch(() => {}));
        }
        if (server) {
            cleanups.push(closeServer(server).catch(() => {}));
        }
        await Promise.all(cleanups);
        server = null;
        client = null;
        serverSocket = null;
    });

    // --- RawWebSocketSenderTest ---
    test('RawWebSocketSenderTest - binary data exchange via WebSocket', async () => {
        server = await createListener();
        const connectionPromise = waitForConnection(server);

        client = await createClient();
        serverSocket = await connectionPromise;

        // Send binary data from client
        const binaryData = generateData(1024);
        const msgPromise = waitForMessage(serverSocket);
        client.send(binaryData);
        const received = await msgPromise;
        const receivedBuf = Buffer.from(received);
        expect(receivedBuf.length).toBe(binaryData.length);
        expect(receivedBuf.equals(binaryData)).toBe(true);

        // Send binary data back from listener
        const replyData = generateData(2048);
        const replyPromise = waitForMessage(client);
        serverSocket.send(replyData);
        const reply = await replyPromise;
        const replyBuf = Buffer.from(reply);
        expect(replyBuf.length).toBe(replyData.length);
        expect(replyBuf.equals(replyData)).toBe(true);
    }, LIVE_TEST_TIMEOUT);

    // --- HeadersEventTest ---
    test('HeadersEventTest - server emits headers event on incoming connection', async () => {
        server = await createListener();

        // The 'headers' event is emitted just before accepting a connection,
        // allowing inspection/modification of response headers.
        const headersReceived = new Promise((resolve) => {
            server.on('headers', (headers) => {
                resolve(headers);
            });
        });

        const connectionPromise = waitForConnection(server);
        client = await createClient();
        serverSocket = await connectionPromise;

        const headers = await headersReceived;
        // The headers event fires with an array of header strings
        expect(headers).toBeDefined();
        expect(Array.isArray(headers)).toBe(true);
    }, LIVE_TEST_TIMEOUT);

    // --- ServerLifecycleTest ---
    test('ServerLifecycleTest - server tracks clients and emits close event', async () => {
        server = await createListener(null, { clientTracking: true });
        const connectionPromise = waitForConnection(server);

        client = await createClient();
        serverSocket = await connectionPromise;

        // Verify client tracking
        expect(server.clients).toBeDefined();
        expect(server.clients.length).toBeGreaterThanOrEqual(1);

        // Close the client connection and verify tracking updates
        const serverSocketClosePromise = waitForClose(serverSocket, 10000);
        client.close();
        await serverSocketClosePromise;

        // After the server-side socket closes, client tracking should remove it
        // (give a moment for the close handler to fire)
        await new Promise((resolve) => setTimeout(resolve, 500));
        const openClients = server.clients.filter(
            (c) => c.readyState === WebSocket.OPEN
        );
        expect(openClients.length).toBe(0);
    }, LIVE_TEST_TIMEOUT);
});
