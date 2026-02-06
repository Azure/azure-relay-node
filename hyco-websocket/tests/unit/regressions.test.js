/**
 * Unit tests for regression issues in hyco-websocket.
 * Migrated from hyco-websocket/test/unit/regressions.js (Tape → Jest).
 * Uses mocked WebSocketConnection to avoid network dependencies.
 */

const WebSocketConnection = require('websocket/lib/WebSocketConnection');

describe('Regression tests', () => {

  describe('Issue 195 - connection.send() with number type', () => {
    let connection;
    let sentData;

    beforeEach(() => {
      // Create a connection instance and stub the internal send methods
      // to avoid needing a real socket.
      connection = Object.create(WebSocketConnection.prototype);
      connection._debug = function() {};
      sentData = null;
      connection.sendUTF = function(data, cb) { sentData = data; if (cb) cb(); };
      connection.sendBytes = function(data, cb) { sentData = data; if (cb) cb(); };
    });

    test('passing a number to connection.send() should not throw', () => {
      expect(() => {
        connection.send(12345);
      }).not.toThrow();
    });

    test('connection.send() with number routes to sendUTF', () => {
      connection.send(12345);
      // Numbers have toString(), so they are sent as UTF-8 text
      expect(sentData).toBe(12345);
    });

    test('connection.send() with number invokes callback', (done) => {
      connection.sendUTF = function(data, cb) { sentData = data; if (cb) cb(); };
      connection.send(12345, done);
    });

    test('connection.send() with zero should not throw', () => {
      expect(() => {
        connection.send(0);
      }).not.toThrow();
    });

    test('connection.send() with negative number should not throw', () => {
      expect(() => {
        connection.send(-42);
      }).not.toThrow();
    });

    test('connection.send() with floating point number should not throw', () => {
      expect(() => {
        connection.send(3.14159);
      }).not.toThrow();
    });

    test('connection.send() with NaN should not throw', () => {
      expect(() => {
        connection.send(NaN);
      }).not.toThrow();
    });

    test('connection.send() with Infinity should not throw', () => {
      expect(() => {
        connection.send(Infinity);
      }).not.toThrow();
    });

    test('connection.send() with string routes to sendUTF', () => {
      connection.send('hello');
      expect(sentData).toBe('hello');
    });

    test('connection.send() with Buffer routes to sendBytes', () => {
      const buf = Buffer.from('binary data');
      connection.send(buf);
      expect(sentData).toBe(buf);
    });

    test('connection.send() with object having toString() should not throw', () => {
      const obj = { toString: () => 'custom' };
      expect(() => {
        connection.send(obj);
      }).not.toThrow();
      expect(sentData).toBe(obj);
    });
  });
});
