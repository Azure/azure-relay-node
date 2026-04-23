'use strict';

const WebSocket = require('./loadHycoWs');

/**
 * Generates a random SAS key suitable for use in tests.
 * Mirrors the format of Azure Service Bus SAS keys: a base64-encoded
 * sequence of random bytes (default 32 bytes => 44-character base64 string).
 *
 * Uses Math.random rather than the crypto module since these keys are only
 * used as opaque test inputs and do not require cryptographic strength.
 * (crypto.randomBytes / randomFillSync register async handles that trip
 * Jest's open-handle detection.)
 *
 * @param {number} [byteLength=32] - Number of random bytes to generate.
 * @returns {string} Base64-encoded random SAS key.
 */
function generateRandomSasKey(byteLength) {
    const len = byteLength || 32;
    const buf = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) {
        buf[i] = Math.floor(Math.random() * 256);
    }
    return buf.toString('base64');
}

/**
 * Generates a random SharedAccessSignature token string for use as an opaque
 * test fixture (e.g., when verifying URI construction). The token is
 * structurally valid but signed with a random throwaway key, so it cannot
 * authenticate against any real namespace.
 *
 * @returns {string} A SharedAccessSignature token string.
 */
function generateRandomSasToken() {
    return WebSocket.createRelayToken(
        'http://example.servicebus.windows.net/test',
        'rule',
        generateRandomSasKey()
    );
}

const namespace = process.env.RELAY_NAMESPACE;
const path = process.env.RELAY_PATH;
const keyrule = process.env.RELAY_KEYRULE;
const key = process.env.RELAY_KEY;

const skipLiveTests = !namespace || !path || !keyrule || !key;

/**
 * Creates a RelayedServer and resolves when the 'listening' event fires.
 * @param {string} [endpointPath] - Override path (defaults to RELAY_PATH env var)
 * @param {object} [extraOptions] - Additional options to pass to the server constructor
 * @returns {Promise<object>} The RelayedServer instance
 */
function createListener(endpointPath, extraOptions) {
    const listenPath = endpointPath || path;
    const uri = WebSocket.createRelayListenUri(namespace, listenPath);
    const tokenFn = function () {
        return WebSocket.createRelayToken('http://' + namespace, keyrule, key);
    };

    const options = Object.assign({
        server: uri,
        token: tokenFn
    }, extraOptions || {});

    return new Promise((resolve, reject) => {
        var server;
        try {
            server = WebSocket.createRelayedServer(options);
        } catch (err) {
            return reject(err);
        }

        const timeout = setTimeout(() => {
            reject(new Error('Timed out waiting for listener to start'));
        }, 15000);

        server.on('listening', () => {
            clearTimeout(timeout);
            resolve(server);
        });
        server.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/**
 * Creates a client WebSocket connection and resolves when 'open' fires.
 * @param {string} [endpointPath] - Override path
 * @param {object} [extraHeaders] - Additional headers to include
 * @returns {Promise<WebSocket>} The connected client WebSocket
 */
function createClient(endpointPath, extraHeaders) {
    const clientPath = endpointPath || path;
    const sendUri = WebSocket.createRelaySendUri(namespace, clientPath);
    const token = WebSocket.createRelayToken(sendUri, keyrule, key);

    return new Promise((resolve, reject) => {
        const headers = Object.assign({ 'ServiceBusAuthorization': token }, extraHeaders || {});
        const client = new WebSocket(sendUri, null, { headers: headers });

        const timeout = setTimeout(() => {
            reject(new Error('Timed out waiting for client connection'));
        }, 15000);

        client.on('open', () => {
            clearTimeout(timeout);
            resolve(client);
        });
        client.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/**
 * Creates a client using token-in-URI auth (no header) and resolves on 'open'.
 * @param {string} [endpointPath] - Override path
 * @returns {Promise<WebSocket>} The connected client WebSocket
 */
function createClientWithTokenInUri(endpointPath) {
    const clientPath = endpointPath || path;
    const sendUri = WebSocket.createRelaySendUri(namespace, clientPath);
    const uriWithToken = WebSocket.appendRelayToken(sendUri, keyrule, key);

    return new Promise((resolve, reject) => {
        const client = new WebSocket(uriWithToken);

        const timeout = setTimeout(() => {
            reject(new Error('Timed out waiting for client connection (token-in-URI)'));
        }, 15000);

        client.on('open', () => {
            clearTimeout(timeout);
            resolve(client);
        });
        client.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/**
 * Waits for the next 'connection' event on the server and returns the server-side socket.
 * @param {object} server - The RelayedServer instance
 * @param {number} [timeoutMs=15000] - Timeout in milliseconds
 * @returns {Promise<WebSocket>} The server-side WebSocket for the accepted connection
 */
function waitForConnection(server, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timed out waiting for server to accept connection'));
        }, timeoutMs || 15000);

        server.on('connection', function handler(ws) {
            clearTimeout(timeout);
            server.removeListener('connection', handler);
            resolve(ws);
        });
    });
}

/**
 * Closes a RelayedServer and waits for the 'close' event.
 * @param {object} server - The RelayedServer instance
 * @returns {Promise<void>}
 */
function closeServer(server) {
    return new Promise((resolve) => {
        if (!server) return resolve();
        server.on('close', () => resolve());
        try {
            server.close();
        } catch (e) {
            resolve();
        }
    });
}

/**
 * Closes a WebSocket client and waits for the 'close' event.
 * @param {WebSocket} client - The WebSocket client
 * @returns {Promise<void>}
 */
function closeClient(client) {
    return new Promise((resolve) => {
        if (!client || client.readyState === WebSocket.CLOSED) return resolve();
        client.on('close', () => resolve());
        try {
            client.close();
        } catch (e) {
            resolve();
        }
    });
}

/**
 * Generates a buffer of the specified size with a repeating byte pattern.
 * @param {number} size - Size in bytes
 * @returns {Buffer}
 */
function generateData(size) {
    const data = Buffer.alloc(size);
    for (let i = 0; i < size; i++) {
        data[i] = i % 256;
    }
    return data;
}

/**
 * Waits for a WebSocket message and returns it.
 * @param {WebSocket} ws - The WebSocket to listen on
 * @param {number} [timeoutMs=10000] - Timeout
 * @returns {Promise<*>} The message data
 */
function waitForMessage(ws, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timed out waiting for message'));
        }, timeoutMs || 10000);

        ws.once('message', (data) => {
            clearTimeout(timeout);
            resolve(data);
        });
    });
}

/**
 * Waits for a WebSocket 'close' event.
 * @param {WebSocket} ws
 * @param {number} [timeoutMs=10000]
 * @returns {Promise<void>}
 */
function waitForClose(ws, timeoutMs) {
    return new Promise((resolve, reject) => {
        if (ws.readyState === WebSocket.CLOSED) return resolve();
        const timeout = setTimeout(() => {
            reject(new Error('Timed out waiting for close'));
        }, timeoutMs || 10000);

        ws.once('close', () => {
            clearTimeout(timeout);
            resolve();
        });
    });
}

module.exports = {
    WebSocket,
    namespace,
    path,
    keyrule,
    key,
    skipLiveTests,
    createListener,
    createClient,
    createClientWithTokenInUri,
    waitForConnection,
    closeServer,
    closeClient,
    generateData,
    waitForMessage,
    waitForClose,
    generateRandomSasKey,
    generateRandomSasToken
};
