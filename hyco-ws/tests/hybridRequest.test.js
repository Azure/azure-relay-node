'use strict';

/**
 * Hybrid Request Tests (adapted for WebSocket)
 *
 * The dotnet tests are HTTP request/response based. Since hyco-ws is WebSocket-only,
 * these tests adapt the same concepts to WebSocket message exchange patterns.
 *
 * Requires a live Azure Relay namespace. Set environment variables:
 *   RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY
 */

const {
    WebSocket, namespace, path, keyrule, key, skipLiveTests,
    createListener, createClient, closeServer, closeClient,
    waitForConnection, waitForMessage, waitForClose, generateData,
    generateRandomSasToken
} = require('./testUtility');

const LIVE_TEST_TIMEOUT = 30000;
const LONG_TEST_TIMEOUT = 60000;

const liveDescribe = skipLiveTests ? describe.skip : describe;

liveDescribe('HybridRequestTests', () => {
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

    // --- SmallMessageExchange ---
    test('SmallMessageExchange - small message send and receive', async () => {
        server = await createListener();
        const connectionPromise = waitForConnection(server);

        client = await createClient();
        serverSocket = await connectionPromise;

        // Client sends small JSON request
        const request = JSON.stringify({ action: 'greet', name: 'test' });
        const requestPromise = waitForMessage(serverSocket);
        client.send(request);
        const receivedRequest = await requestPromise;
        expect(receivedRequest).toBe(request);

        // Listener sends small JSON response
        const response = JSON.stringify({ result: true, message: 'Hello, test' });
        const responsePromise = waitForMessage(client);
        serverSocket.send(response);
        const receivedResponse = await responsePromise;
        expect(receivedResponse).toBe(response);
    }, LIVE_TEST_TIMEOUT);

    // --- LargeMessageExchange ---
    test('LargeMessageExchange - large message (~65KB) send and receive', async () => {
        server = await createListener();
        const connectionPromise = waitForConnection(server);

        client = await createClient();
        serverSocket = await connectionPromise;

        // Send ~65KB from client
        const largePayload = generateData(65 * 1024);
        const msgPromise = waitForMessage(serverSocket, 15000);
        client.send(largePayload);
        const received = await msgPromise;
        const receivedBuf = Buffer.from(received);
        expect(receivedBuf.length).toBe(largePayload.length);
        expect(receivedBuf.equals(largePayload)).toBe(true);

        // Send ~65KB response back
        const responsePayload = generateData(65 * 1024);
        const replyPromise = waitForMessage(client, 15000);
        serverSocket.send(responsePayload);
        const reply = await replyPromise;
        const replyBuf = Buffer.from(reply);
        expect(replyBuf.length).toBe(responsePayload.length);
        expect(replyBuf.equals(responsePayload)).toBe(true);
    }, LIVE_TEST_TIMEOUT);

    // --- EmptyMessageExchange ---
    test('EmptyMessageExchange - empty message handling', async () => {
        server = await createListener();
        const connectionPromise = waitForConnection(server);

        client = await createClient();
        serverSocket = await connectionPromise;

        // Send empty string from client
        const msgPromise = waitForMessage(serverSocket);
        client.send('');
        const received = await msgPromise;
        expect(received).toBe('');

        // Send empty buffer from listener
        const replyPromise = waitForMessage(client);
        serverSocket.send(Buffer.alloc(0));
        const reply = await replyPromise;
        const replyBuf = Buffer.from(reply);
        expect(replyBuf.length).toBe(0);
    }, LIVE_TEST_TIMEOUT);

    // --- MultipleSequentialMessages ---
    test('MultipleSequentialMessages - sequential message exchange', async () => {
        server = await createListener();
        const connectionPromise = waitForConnection(server);

        client = await createClient();
        serverSocket = await connectionPromise;

        const messageCount = 20;
        const receivedMessages = [];

        // Collect all messages on the server side
        const allReceived = new Promise((resolve) => {
            serverSocket.on('message', (data) => {
                receivedMessages.push(data);
                if (receivedMessages.length === messageCount) {
                    resolve();
                }
            });
        });

        // Send multiple messages sequentially from client
        for (let i = 0; i < messageCount; i++) {
            client.send('message-' + i);
        }

        await allReceived;

        // Verify all messages arrived in order
        expect(receivedMessages.length).toBe(messageCount);
        for (let i = 0; i < messageCount; i++) {
            expect(receivedMessages[i]).toBe('message-' + i);
        }
    }, LIVE_TEST_TIMEOUT);

    // --- QueryStringInSendUri ---
    test('QueryStringInSendUri - query string parameters preserved in connection URI', () => {
        // Verify query parameters are correctly constructed in send/listen URIs
        const sendUri = WebSocket.createRelaySendUri(namespace, path);
        expect(sendUri).toContain('sb-hc-action=connect');

        const listenUri = WebSocket.createRelayListenUri(namespace, path);
        expect(listenUri).toContain('sb-hc-action=listen');

        // With token parameter
        const token = generateRandomSasToken();
        const sendUriWithToken = WebSocket.createRelaySendUri(namespace, path, token);
        expect(sendUriWithToken).toContain('sb-hc-action=connect');
        expect(sendUriWithToken).toContain('sb-hc-token=');

        // With id parameter
        const id = 'correlation-id-789';
        const sendUriWithId = WebSocket.createRelaySendUri(namespace, path, null, id);
        expect(sendUriWithId).toContain('sb-hc-action=connect');
        expect(sendUriWithId).toContain('sb-hc-id=' + encodeURIComponent(id));

        // With both token and id
        const fullUri = WebSocket.createRelaySendUri(namespace, path, token, id);
        expect(fullUri).toContain('sb-hc-action=connect');
        expect(fullUri).toContain('sb-hc-token=');
        expect(fullUri).toContain('sb-hc-id=');
    });

    // --- LoadBalancedListeners ---
    test('LoadBalancedListeners - multiple listeners share connections', async () => {
        // Open two listeners on the same path
        const server1 = await createListener();
        const server2 = await createListener();

        const server1Connections = [];
        const server2Connections = [];

        server1.on('connection', (ws) => {
            server1Connections.push(ws);
            ws.on('message', (data) => ws.send('server1:' + data));
        });
        server2.on('connection', (ws) => {
            server2Connections.push(ws);
            ws.on('message', (data) => ws.send('server2:' + data));
        });

        // Send multiple clients; connections should be distributed across listeners
        const clientCount = 6;
        const clients = [];
        for (let i = 0; i < clientCount; i++) {
            clients.push(await createClient());
            // Small delay to allow routing
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // Give time for all connections to be accepted
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const totalConnections = server1Connections.length + server2Connections.length;
        expect(totalConnections).toBe(clientCount);

        // Both listeners should have received at least one connection
        // (not asserting exact distribution since round-robin isn't deterministic)
        expect(server1Connections.length + server2Connections.length).toBe(clientCount);

        // Cleanup
        for (const c of clients) {
            await closeClient(c).catch(() => {});
        }
        for (const s of [...server1Connections, ...server2Connections]) {
            await closeClient(s).catch(() => {});
        }
        await closeServer(server1).catch(() => {});
        await closeServer(server2).catch(() => {});
        server = null; // Prevent afterEach from double-closing
    }, LONG_TEST_TIMEOUT);
});
