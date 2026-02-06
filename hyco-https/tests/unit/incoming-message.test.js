/**
 * Unit tests for hyco-https IncomingMessage class.
 * Tests property exposure (url, method, headers, httpVersion),
 * handleBody() stream behavior, setTimeout(), and destroy().
 */

'use strict';

const { IncomingMessage } = require('../../lib/_hyco_incoming');

function createMockRelayMessage(overrides = {}) {
  return {
    request: {
      requestTarget: overrides.url || '/test-path?q=1',
      method: overrides.method || 'GET',
      requestHeaders: overrides.headers || {}
    }
  };
}

function createMockSocket(overrides = {}) {
  return {
    setTimeout: overrides.setTimeout || jest.fn(),
    ...overrides
  };
}

describe('IncomingMessage', () => {
  describe('url, method, headers, httpVersion properties', () => {
    test('url is set from relayRequestMessage.request.requestTarget', () => {
      const msg = new IncomingMessage(
        createMockRelayMessage({ url: '/api/data?key=val' }),
        createMockSocket()
      );
      expect(msg.url).toBe('/api/data?key=val');
    });

    test('method is set from relayRequestMessage.request.method', () => {
      const msg = new IncomingMessage(
        createMockRelayMessage({ method: 'POST' }),
        createMockSocket()
      );
      expect(msg.method).toBe('POST');
    });

    test('httpVersion is "1.1"', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      expect(msg.httpVersion).toBe('1.1');
    });

    test('httpVersionMajor is 1 and httpVersionMinor is 1', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      expect(msg.httpVersionMajor).toBe(1);
      expect(msg.httpVersionMinor).toBe(1);
    });

    test('headers are populated from requestHeaders', () => {
      const msg = new IncomingMessage(
        createMockRelayMessage({
          headers: { 'Content-Type': 'application/json', 'X-Custom': 'test' }
        }),
        createMockSocket()
      );
      expect(msg.headers['content-type']).toBe('application/json');
      expect(msg.headers['x-custom']).toBe('test');
    });

    test('headers object is empty when no request headers provided', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      expect(msg.headers).toEqual({});
    });

    test('known headers are lowercased', () => {
      const msg = new IncomingMessage(
        createMockRelayMessage({ headers: { 'Host': 'example.com', 'User-Agent': 'test-agent' } }),
        createMockSocket()
      );
      expect(msg.headers['host']).toBe('example.com');
      expect(msg.headers['user-agent']).toBe('test-agent');
    });

    test('duplicate no-duplicate headers are dropped (first wins)', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      msg._addHeaderLine('Content-Type', 'text/html', msg.headers);
      msg._addHeaderLine('Content-Type', 'application/json', msg.headers);
      expect(msg.headers['content-type']).toBe('text/html');
    });

    test('Set-Cookie headers are stored as array', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      msg._addHeaderLine('Set-Cookie', 'a=1', msg.headers);
      msg._addHeaderLine('Set-Cookie', 'b=2', msg.headers);
      expect(msg.headers['set-cookie']).toEqual(['a=1', 'b=2']);
    });

    test('Cookie headers are joined with "; "', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      msg._addHeaderLine('Cookie', 'a=1', msg.headers);
      msg._addHeaderLine('Cookie', 'b=2', msg.headers);
      expect(msg.headers['cookie']).toBe('a=1; b=2');
    });

    test('x-forwarded-for headers are joined with ", "', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      msg._addHeaderLine('X-Forwarded-For', '1.1.1.1', msg.headers);
      msg._addHeaderLine('X-Forwarded-For', '2.2.2.2', msg.headers);
      expect(msg.headers['x-forwarded-for']).toBe('1.1.1.1, 2.2.2.2');
    });

    test('socket and connection are set to relayWebSocket', () => {
      const mockSocket = createMockSocket();
      const msg = new IncomingMessage(createMockRelayMessage(), mockSocket);
      expect(msg.socket).toBe(mockSocket);
      expect(msg.connection).toBe(mockSocket);
    });

    test('readable is true by default', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      expect(msg.readable).toBe(true);
    });

    test('complete is false by default', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      expect(msg.complete).toBe(false);
    });

    test('aborted is false by default', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      expect(msg.aborted).toBe(false);
    });

    test('rawHeaders is an empty array', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      expect(msg.rawHeaders).toEqual([]);
    });

    test('trailers and rawTrailers are empty', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      expect(msg.trailers).toEqual({});
      expect(msg.rawTrailers).toEqual([]);
    });
  });

  describe('handleBody()', () => {
    test('pushes data into the readable stream', (done) => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      const testData = Buffer.from('hello world');
      const chunks = [];

      msg.on('data', (chunk) => chunks.push(chunk));
      msg.on('end', () => {
        const result = Buffer.concat(chunks);
        expect(result.equals(testData)).toBe(true);
        done();
      });

      msg.handleBody(testData);
    });

    test('pushes null to signal end of stream', (done) => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      msg.on('end', () => {
        done();
      });
      msg.resume(); // drain data
      msg.handleBody(Buffer.from('data'));
    });

    test('handles large buffer data', (done) => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      const largeData = Buffer.alloc(65536, 0xAB);
      const chunks = [];

      msg.on('data', (chunk) => chunks.push(chunk));
      msg.on('end', () => {
        const result = Buffer.concat(chunks);
        expect(result.length).toBe(65536);
        expect(result.equals(largeData)).toBe(true);
        done();
      });

      msg.handleBody(largeData);
    });

    test('IncomingMessage is readable as a stream', (done) => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      expect(typeof msg.read).toBe('function');
      expect(typeof msg.on).toBe('function');
      expect(typeof msg.pipe).toBe('function');

      const { Writable } = require('stream');
      const chunks = [];
      const writable = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });

      writable.on('finish', () => {
        const result = Buffer.concat(chunks);
        expect(result.toString()).toBe('piped data');
        done();
      });

      msg.pipe(writable);
      msg.handleBody(Buffer.from('piped data'));
    });
  });

  describe('setTimeout()', () => {
    test('delegates to socket.setTimeout', () => {
      const mockSetTimeout = jest.fn();
      const mockSocket = createMockSocket({ setTimeout: mockSetTimeout });
      const msg = new IncomingMessage(createMockRelayMessage(), mockSocket);

      msg.setTimeout(5000);
      expect(mockSetTimeout).toHaveBeenCalledWith(5000);
    });

    test('registers callback on timeout event', () => {
      const mockSocket = createMockSocket();
      const msg = new IncomingMessage(createMockRelayMessage(), mockSocket);
      const callback = jest.fn();

      msg.setTimeout(5000, callback);
      msg.emit('timeout');
      expect(callback).toHaveBeenCalled();
    });

    test('returns this for chaining', () => {
      const mockSocket = createMockSocket();
      const msg = new IncomingMessage(createMockRelayMessage(), mockSocket);
      const result = msg.setTimeout(5000);
      expect(result).toBe(msg);
    });

    test('does not register listener when callback is not provided', () => {
      const mockSocket = createMockSocket();
      const msg = new IncomingMessage(createMockRelayMessage(), mockSocket);
      msg.setTimeout(5000);
      expect(msg.listenerCount('timeout')).toBe(0);
    });
  });

  describe('destroy()', () => {
    test('can be called without error', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      expect(() => msg.destroy()).not.toThrow();
    });

    test('can be called with an error argument', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      expect(() => msg.destroy(new Error('test error'))).not.toThrow();
    });
  });

  describe('_dump()', () => {
    test('sets _dumped to true', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      expect(msg._dumped).toBe(false);
      msg._dump();
      expect(msg._dumped).toBe(true);
    });

    test('is idempotent (second call is no-op)', () => {
      const msg = new IncomingMessage(createMockRelayMessage(), createMockSocket());
      msg._dump();
      msg._dump();
      expect(msg._dumped).toBe(true);
    });
  });
});
