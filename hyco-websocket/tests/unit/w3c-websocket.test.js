/**
 * Unit tests for W3CWebSocket event listeners.
 * Tests that onopen/onmessage/onclose/onerror fire in correct order
 * and that addEventListener registers listeners correctly.
 * Uses mocked WebSocketClient to avoid real network connections.
 */

// Mock WebSocketClient before requiring W3CWebSocket
jest.mock('websocket/lib/WebSocketClient', () => {
  const { EventEmitter } = require('events');
  const { inherits } = require('util');
  const MockClient = jest.fn().mockImplementation(function () {
    EventEmitter.call(this);
    this.connect = jest.fn();
  });
  inherits(MockClient, EventEmitter);
  return MockClient;
});

const EventEmitter = require('events');
const W3CWebSocket = require('websocket/lib/W3CWebSocket');

// Helper: create a W3CWebSocket and return it with its mock client
function createWs(url) {
  const ws = new W3CWebSocket(url || 'wss://test.example.com');
  const client = ws._client;
  return { ws, client };
}

// Helper: create a mock connection (EventEmitter with protocol/extensions)
function createMockConnection() {
  const conn = new EventEmitter();
  conn.protocol = 'test-protocol';
  conn.extensions = '';
  conn.sendUTF = jest.fn();
  conn.sendBytes = jest.fn();
  conn.close = jest.fn();
  return conn;
}

describe('W3CWebSocket', () => {

  describe('readyState constants', () => {
    test('CONNECTING = 0, OPEN = 1, CLOSING = 2, CLOSED = 3 on prototype', () => {
      const { ws } = createWs();
      expect(ws.CONNECTING).toBe(0);
      expect(ws.OPEN).toBe(1);
      expect(ws.CLOSING).toBe(2);
      expect(ws.CLOSED).toBe(3);
    });

    test('CONNECTING = 0, OPEN = 1, CLOSING = 2, CLOSED = 3 on constructor', () => {
      expect(W3CWebSocket.CONNECTING).toBe(0);
      expect(W3CWebSocket.OPEN).toBe(1);
      expect(W3CWebSocket.CLOSING).toBe(2);
      expect(W3CWebSocket.CLOSED).toBe(3);
    });

    test('initial readyState is CONNECTING', () => {
      const { ws } = createWs();
      expect(ws.readyState).toBe(0);
    });
  });

  describe('onopen / onmessage / onclose fire in correct order', () => {
    test('events fire in order: open → message → close via onXXX properties', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();
      const order = [];

      ws.onopen = () => { order.push('open'); };
      ws.onmessage = (event) => {
        order.push('message');
        expect(event.data).toBe('hello');
      };
      ws.onclose = (event) => {
        order.push('close');
        expect(event.code).toBe(1000);
      };

      // Simulate connect
      client.emit('connect', conn);
      expect(ws.readyState).toBe(1); // OPEN

      // Simulate message
      conn.emit('message', { utf8Data: 'hello' });

      // Simulate close
      conn.emit('close', 1000, '');

      expect(order).toEqual(['open', 'message', 'close']);
      expect(ws.readyState).toBe(3); // CLOSED
    });

    test('events fire in order: open → message → close via addEventListener', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();
      const order = [];

      ws.addEventListener('open', () => { order.push('open'); });
      ws.addEventListener('message', (event) => {
        order.push('message');
        expect(event.data).toBe('test');
      });
      ws.addEventListener('close', (event) => {
        order.push('close');
        expect(event.code).toBe(1000);
      });

      client.emit('connect', conn);
      conn.emit('message', { utf8Data: 'test' });
      conn.emit('close', 1000, '');

      expect(order).toEqual(['open', 'message', 'close']);
    });
  });

  describe('addEventListener registers multiple listeners', () => {
    test('multiple close listeners fire in registration order', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();
      const order = [];

      ws.addEventListener('close', () => { order.push('close1'); });
      ws.addEventListener('close', () => { order.push('close2'); });
      ws.addEventListener('close', () => { order.push('close3'); });

      client.emit('connect', conn);
      conn.emit('close', 1000, '');

      expect(order).toEqual(['close1', 'close2', 'close3']);
    });

    test('multiple open listeners fire in registration order', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();
      const order = [];

      ws.addEventListener('open', () => { order.push('open1'); });
      ws.addEventListener('open', () => { order.push('open2'); });

      client.emit('connect', conn);

      expect(order).toEqual(['open1', 'open2']);
    });

    test('multiple message listeners all receive the message', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();
      const received = [];

      ws.addEventListener('message', (e) => { received.push('a:' + e.data); });
      ws.addEventListener('message', (e) => { received.push('b:' + e.data); });

      client.emit('connect', conn);
      conn.emit('message', { utf8Data: 'hello' });

      expect(received).toEqual(['a:hello', 'b:hello']);
    });
  });

  describe('onopen event', () => {
    test('readyState is OPEN when onopen fires', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();
      let readyStateInHandler;

      ws.onopen = () => { readyStateInHandler = ws.readyState; };
      client.emit('connect', conn);

      expect(readyStateInHandler).toBe(1);
    });

    test('protocol is set from connection when onopen fires', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();
      conn.protocol = 'my-protocol';

      client.emit('connect', conn);
      expect(ws.protocol).toBe('my-protocol');
    });
  });

  describe('onmessage event', () => {
    test('text message sets event.data to string', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();
      let receivedData;

      ws.onmessage = (event) => { receivedData = event.data; };
      client.emit('connect', conn);
      conn.emit('message', { utf8Data: 'test message' });

      expect(receivedData).toBe('test message');
    });

    test('binary message sets event.data to ArrayBuffer', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();
      let receivedData;

      ws.onmessage = (event) => { receivedData = event.data; };
      client.emit('connect', conn);
      conn.emit('message', { binaryData: Buffer.from([1, 2, 3]) });

      expect(receivedData).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(receivedData)).toEqual(new Uint8Array([1, 2, 3]));
    });
  });

  describe('onclose event', () => {
    test('close event includes code and reason', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();
      let closeEvent;

      ws.onclose = (event) => { closeEvent = event; };
      client.emit('connect', conn);
      conn.emit('close', 1001, 'going away');

      expect(closeEvent.code).toBe(1001);
      expect(closeEvent.reason).toBe('going away');
      expect(closeEvent.wasClean).toBe(false);
    });

    test('close with code 1000 has wasClean=true', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();
      let closeEvent;

      ws.onclose = (event) => { closeEvent = event; };
      client.emit('connect', conn);
      conn.emit('close', 1000, '');

      expect(closeEvent.wasClean).toBe(true);
    });

    test('readyState is CLOSED after close event', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();

      client.emit('connect', conn);
      conn.emit('close', 1000, '');

      expect(ws.readyState).toBe(3);
    });
  });

  describe('onerror / connectFailed event', () => {
    test('connectFailed emits error then close events', () => {
      const { ws, client } = createWs();
      const order = [];

      ws.addEventListener('error', () => { order.push('error'); });
      ws.addEventListener('close', (event) => {
        order.push('close');
        expect(event.code).toBe(1006);
        expect(event.reason).toBe('connection failed');
      });

      client.emit('connectFailed');

      expect(order).toEqual(['error', 'close']);
      expect(ws.readyState).toBe(3);
    });

    test('onerror fires before onclose on connection failure', () => {
      const { ws, client } = createWs();
      const order = [];

      ws.onerror = () => { order.push('error'); };
      ws.onclose = () => { order.push('close'); };

      client.emit('connectFailed');

      expect(order).toEqual(['error', 'close']);
    });
  });

  describe('send()', () => {
    test('send() throws when not connected', () => {
      const { ws } = createWs();
      expect(() => ws.send('test')).toThrow('cannot call send() while not connected');
    });

    test('send() with string calls sendUTF', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();

      client.emit('connect', conn);
      ws.send('hello');

      expect(conn.sendUTF).toHaveBeenCalledWith('hello');
    });

    test('send() with Buffer calls sendBytes', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();
      const buf = Buffer.from([1, 2, 3]);

      client.emit('connect', conn);
      ws.send(buf);

      expect(conn.sendBytes).toHaveBeenCalledWith(buf);
    });
  });

  describe('close()', () => {
    test('close() while CONNECTING emits error then close', () => {
      const { ws } = createWs();
      const order = [];

      ws.onerror = () => { order.push('error'); };
      ws.onclose = () => { order.push('close'); };

      ws.close();

      expect(order).toEqual(['error', 'close']);
      expect(ws.readyState).toBe(3);
    });

    test('close() while OPEN sets readyState to CLOSING', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();

      client.emit('connect', conn);
      ws.close();

      expect(ws.readyState).toBe(2); // CLOSING
      expect(conn.close).toHaveBeenCalled();
    });

    test('close() with code and reason forwards to connection', () => {
      const { ws, client } = createWs();
      const conn = createMockConnection();

      client.emit('connect', conn);
      ws.close(1000, 'normal');

      expect(conn.close).toHaveBeenCalledWith(1000, 'normal');
    });
  });

  describe('read-only properties', () => {
    test('url returns the connection URL', () => {
      const { ws } = createWs('wss://my-relay.servicebus.windows.net');
      expect(ws.url).toBe('wss://my-relay.servicebus.windows.net');
    });

    test('extensions returns empty string initially', () => {
      const { ws } = createWs();
      expect(ws.extensions).toBe('');
    });

    test('bufferedAmount returns 0', () => {
      const { ws } = createWs();
      expect(ws.bufferedAmount).toBe(0);
    });

    test('binaryType defaults to arraybuffer', () => {
      const { ws } = createWs();
      expect(ws.binaryType).toBe('arraybuffer');
    });

    test('setting binaryType to non-arraybuffer throws SyntaxError', () => {
      const { ws } = createWs();
      expect(() => { ws.binaryType = 'blob'; }).toThrow(SyntaxError);
    });
  });
});
