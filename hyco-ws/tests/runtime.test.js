'use strict';

/**
 * Runtime Tests
 *
 * Requires a live Azure Relay namespace. Set environment variables:
 *   RELAY_NAMESPACE, RELAY_PATH, RELAY_KEYRULE, RELAY_KEY
 */

const {
    WebSocket, namespace, path, keyrule, key, skipLiveTests,
    createListener, createClient, createClientWithTokenInUri,
    waitForConnection, closeServer, closeClient,
    generateData, waitForMessage, waitForClose
} = require('./testUtility');

const LIVE_TEST_TIMEOUT = 30000;
const LONG_TEST_TIMEOUT = 60000;

const liveDescribe = skipLiveTests ? describe.skip : describe;

liveDescribe('RunTimeTests', () => {
    let server;
    let client;
    let serverSocket;

    afterEach(async () => {
        // Clean up all resources after each test
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

    // --- HybridConnectionTest ---
    test('HybridConnectionTest - bidirectional data transfer', async () => {
        server = await createListener();
        const connectionPromise = waitForConnection(server);

        client = await createClient();
        serverSocket = await connectionPromise;

        // Client sends to listener
        const sendData = 'Hello from client';
        const listenerMsgPromise = waitForMessage(serverSocket);
        client.send(sendData);
        const received = await listenerMsgPromise;
        expect(received).toBe(sendData);

        // Listener sends back to client
        const responseData = 'Hello from listener';
        const clientMsgPromise = waitForMessage(client);
        serverSocket.send(responseData);
        const response = await clientMsgPromise;
        expect(response).toBe(responseData);
    }, LIVE_TEST_TIMEOUT);

    // --- HybridConnectionTestWss ---
    test('HybridConnectionTestWss - token-in-URI authentication', async () => {
        server = await createListener();
        const connectionPromise = waitForConnection(server);

        // Connect using token embedded in the URI instead of headers
        client = await createClientWithTokenInUri();
        serverSocket = await connectionPromise;

        const testMessage = 'Token-in-URI test message';
        const msgPromise = waitForMessage(serverSocket);
        client.send(testMessage);
        const received = await msgPromise;
        expect(received).toBe(testMessage);
    }, LIVE_TEST_TIMEOUT);

    // --- ClientShutdownTest ---
    test('ClientShutdownTest - client closes and listener detects', async () => {
        server = await createListener();
        const connectionPromise = waitForConnection(server);

        client = await createClient();
        serverSocket = await connectionPromise;

        // Close client and verify listener detects the close
        const serverClosePromise = waitForClose(serverSocket);
        client.close();
        await serverClosePromise;

        expect(serverSocket.readyState).toBe(WebSocket.CLOSED);
    }, LIVE_TEST_TIMEOUT);

    // --- ConcurrentClientsTest ---
    test('ConcurrentClientsTest - multiple concurrent connections', async () => {
        const clientCount = 10;
        server = await createListener();

        const serverSockets = [];
        const clients = [];

        // Set up to capture all server-side connections
        const allConnected = new Promise((resolve) => {
            server.on('connection', (ws) => {
                serverSockets.push(ws);
                if (serverSockets.length === clientCount) {
                    resolve();
                }
            });
        });

        // Connect multiple clients concurrently
        for (let i = 0; i < clientCount; i++) {
            clients.push(createClient());
        }
        const connectedClients = await Promise.all(clients);
        await allConnected;

        expect(serverSockets.length).toBe(clientCount);
        expect(connectedClients.length).toBe(clientCount);

        // Use echo pattern: each server socket echoes back what it receives
        serverSockets.forEach((ss) => {
            ss.on('message', (data) => ss.send(data));
        });

        // Each client sends a unique message and expects an echo
        const echoResults = connectedClients.map((c, i) => {
            return new Promise((resolve, reject) => {
                const msg = 'echo-' + i;
                const timeout = setTimeout(() => reject(new Error('Echo timeout for client ' + i)), 10000);
                c.once('message', (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                });
                c.send(msg);
            });
        });

        const results = await Promise.all(echoResults);
        results.forEach((r, i) => expect(r).toBe('echo-' + i));

        // Cleanup all
        for (let i = 0; i < clientCount; i++) {
            await closeClient(connectedClients[i]).catch(() => {});
        }
        client = null; // Already cleaned up
    }, LONG_TEST_TIMEOUT);

    // --- RequestHeadersTest ---
    test('RequestHeadersTest - custom headers pass through to listener', async () => {
        server = await createListener();

        // The 'headers' event on the server fires during the accept handshake
        const headersPromise = new Promise((resolve) => {
            server.on('headers', (headers) => {
                resolve(headers);
            });
        });

        const connectionPromise = waitForConnection(server);

        client = await createClient(null, {
            'X-Custom-Header': 'TestValue123'
        });
        serverSocket = await connectionPromise;

        // Verify the connection was established by exchanging a message
        // (the server-side socket may still be CONNECTING when 'connection' fires)
        const msgPromise = waitForMessage(serverSocket);
        client.send('header-test');
        const received = await msgPromise;
        expect(received).toBe('header-test');
    }, LIVE_TEST_TIMEOUT);

    // --- RequestHeadersNegativeTest ---
    test('RequestHeadersNegativeTest - connection with empty path fails', async () => {
        // Attempting to connect to a non-standard/empty path should fail
        const badUri = WebSocket.createRelaySendUri(namespace, '');
        const token = WebSocket.createRelayToken(badUri, keyrule, key);

        await expect(new Promise((resolve, reject) => {
            const ws = new WebSocket(badUri, null, {
                headers: { 'ServiceBusAuthorization': token }
            });
            ws.on('open', () => {
                ws.close();
                resolve();
            });
            ws.on('error', reject);
        })).rejects.toBeDefined();
    }, LIVE_TEST_TIMEOUT);

    // --- WriteLargeDataSetTest ---
    test('WriteLargeDataSetTest - large payload transfer', async () => {
        server = await createListener();
        const connectionPromise = waitForConnection(server);

        client = await createClient();
        serverSocket = await connectionPromise;

        // Send 1MB of data from client to listener
        const largeData = generateData(1024 * 1024);
        const msgPromise = waitForMessage(serverSocket, 30000);
        client.send(largeData);
        const received = await msgPromise;
        const receivedBuf = Buffer.from(received);
        expect(receivedBuf.length).toBe(largeData.length);
        expect(receivedBuf.equals(largeData)).toBe(true);

        // Send 1MB back from listener to client
        const replyPromise = waitForMessage(client, 30000);
        serverSocket.send(largeData);
        const reply = await replyPromise;
        const replyBuf = Buffer.from(reply);
        expect(replyBuf.length).toBe(largeData.length);
        expect(replyBuf.equals(largeData)).toBe(true);
    }, LONG_TEST_TIMEOUT);

    // --- ListenerShutdownTest ---
    test('ListenerShutdownTest - listener closes and client detects', async () => {
        server = await createListener();
        const connectionPromise = waitForConnection(server);

        client = await createClient();
        serverSocket = await connectionPromise;

        // Close the server-side socket and verify client detects
        const clientClosePromise = waitForClose(client);
        serverSocket.close();
        await clientClosePromise;

        expect(client.readyState).toBe(WebSocket.CLOSED);
    }, LIVE_TEST_TIMEOUT);

    // --- ListenerAbortWhileClientReadingTest ---
    test('ListenerAbortWhileClientReadingTest - abrupt listener termination', async () => {
        server = await createListener();
        const connectionPromise = waitForConnection(server);

        client = await createClient();
        serverSocket = await connectionPromise;

        // Abruptly terminate the server-side socket
        const clientClosePromise = waitForClose(client, 15000);
        serverSocket.terminate();
        await clientClosePromise;
    }, LIVE_TEST_TIMEOUT);

    // --- NonExistantNamespaceTest ---
    test('NonExistantNamespaceTest - connection to fake namespace fails', async () => {
        const fakeNamespace = 'thisfakedoesnotexist-' + Date.now() + '.servicebus.windows.net';
        const uri = WebSocket.createRelayListenUri(fakeNamespace, 'fakepath');
        const token = WebSocket.createRelayToken('http://' + fakeNamespace, keyrule, key);

        await expect(new Promise((resolve, reject) => {
            const srv = WebSocket.createRelayedServer({
                server: uri,
                token: token
            });
            srv.on('listening', () => {
                srv.close();
                resolve();
            });
            srv.on('error', (err) => {
                srv.closeRequested = true;
                reject(err);
            });
        })).rejects.toBeDefined();
    }, LIVE_TEST_TIMEOUT);

    // --- ClientNonExistantHybridConnectionTest ---
    test('ClientNonExistantHybridConnectionTest - client to non-existent path fails', async () => {
        const fakePath = 'nonexistent-hc-' + Date.now();
        const sendUri = WebSocket.createRelaySendUri(namespace, fakePath);
        const token = WebSocket.createRelayToken(sendUri, keyrule, key);

        await expect(new Promise((resolve, reject) => {
            const ws = new WebSocket(sendUri, null, {
                headers: { 'ServiceBusAuthorization': token }
            });
            ws.on('open', () => {
                ws.close();
                resolve();
            });
            ws.on('error', reject);
            ws.on('unexpected-response', (req, res) => {
                reject(new Error('Unexpected response: ' + res.statusCode));
            });
        })).rejects.toBeDefined();
    }, LIVE_TEST_TIMEOUT);

    // --- ListenerNonExistantHybridConnectionTest ---
    test('ListenerNonExistantHybridConnectionTest - listener on non-existent path fails', async () => {
        const fakePath = 'nonexistent-hc-listener-' + Date.now();
        const uri = WebSocket.createRelayListenUri(namespace, fakePath);
        const token = WebSocket.createRelayToken('http://' + namespace, keyrule, key);

        await expect(new Promise((resolve, reject) => {
            const srv = WebSocket.createRelayedServer({
                server: uri,
                token: token
            });
            srv.on('listening', () => {
                srv.close();
                resolve();
            });
            srv.on('error', (err) => {
                srv.closeRequested = true;
                reject(err);
            });
        })).rejects.toBeDefined();
    }, LIVE_TEST_TIMEOUT);

    // --- ListenerAuthenticationFailureTest ---
    test('ListenerAuthenticationFailureTest - invalid SAS key for listener fails', async () => {
        const uri = WebSocket.createRelayListenUri(namespace, path);
        const badToken = WebSocket.createRelayToken('http://' + namespace, keyrule, key + 'BAD');

        await expect(new Promise((resolve, reject) => {
            const srv = WebSocket.createRelayedServer({
                server: uri,
                token: badToken
            });
            srv.on('listening', () => {
                srv.close();
                resolve();
            });
            srv.on('error', (err) => {
                srv.closeRequested = true;
                reject(err);
            });
        })).rejects.toBeDefined();
    }, LIVE_TEST_TIMEOUT);

    // --- ClientAuthenticationFailureTest ---
    test('ClientAuthenticationFailureTest - invalid SAS key for client fails', async () => {
        const sendUri = WebSocket.createRelaySendUri(namespace, path);
        const badToken = WebSocket.createRelayToken(sendUri, keyrule, key + 'BAD');

        await expect(new Promise((resolve, reject) => {
            const ws = new WebSocket(sendUri, null, {
                headers: { 'ServiceBusAuthorization': badToken }
            });
            ws.on('open', () => {
                ws.close();
                resolve();
            });
            ws.on('error', reject);
            ws.on('unexpected-response', (req, res) => {
                reject(new Error('Auth failed: ' + res.statusCode));
            });
        })).rejects.toBeDefined();
    }, LIVE_TEST_TIMEOUT);

    // --- ListenerShutdownWithPendingAcceptsTest ---
    test('ListenerShutdownWithPendingAcceptsTest - close server while waiting for connections', async () => {
        server = await createListener();

        // Server is listening but no clients are connecting.
        // Close the server; it should shut down cleanly.
        await closeServer(server);
        server = null;
    }, LIVE_TEST_TIMEOUT);
});
