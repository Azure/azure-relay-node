/**
 * Unit tests for HybridConnectionsWebSocketRequest.
 * Tests accept/reject resolution, readHandshake header validation,
 * parseCookies parsing, and protocol mismatch handling.
 * REQ-UNIT-WS-020 through REQ-UNIT-WS-024
 */

// Mock websocket client to avoid real network connections
jest.mock('websocket', () => {
  const { EventEmitter } = require('events');

  const MockConnection = Object.assign(Object.create(EventEmitter.prototype), {
    close: jest.fn(),
    drop: jest.fn()
  });
  EventEmitter.call(MockConnection);

  class MockClient extends EventEmitter {
    connect(address, protocol) {
      const self = this;
      setTimeout(() => {
        self.emit('connect', MockConnection);
      }, 0);
    }
  }

  return {
    client: MockClient,
    connection: function MockWebSocketConnection() {}
  };
});

const HybridConnectionsWebSocketRequest = require('../../lib/HybridConnectionsWebSocketRequest');

function createRequest(headersOverrides, configOverrides) {
  const defaultHeaders = {
    'host': 'test.servicebus.windows.net',
    'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
    'sec-websocket-version': '13',
    'sec-websocket-protocol': 'foo, bar'
  };
  const headers = Object.assign({}, defaultHeaders, headersOverrides);
  const config = Object.assign({ ignoreXForwardedFor: true }, configOverrides);
  const req = new HybridConnectionsWebSocketRequest(
    'wss://test.servicebus.windows.net:443/$hc/mypath?sb-hc-action=accept&sb-hc-id=123',
    'request-id-123',
    headers,
    config
  );
  req.readHandshake();
  return req;
}

describe('HybridConnectionsWebSocketRequest', () => {

  describe('_verifyResolution()', () => {
    test('does not throw when _resolved is false', () => {
      const req = createRequest();
      expect(() => req._verifyResolution()).not.toThrow();
    });

    test('throws when _resolved is true', () => {
      const req = createRequest();
      req._resolved = true;
      expect(() => req._verifyResolution()).toThrow(
        'HybridConnectionsWebSocketRequest may only be accepted or rejected one time.'
      );
    });
  });

  describe('accept()', () => {
    test('accept() sets _resolved to true', () => {
      const req = createRequest();
      expect(req._resolved).toBe(false);
      req.accept('foo', 'http://example.com');
      expect(req._resolved).toBe(true);
    });

    test('accept() emits requestResolved event', (done) => {
      const req = createRequest();
      req.on('requestResolved', (r) => {
        expect(r).toBe(req);
        done();
      });
      req.accept('foo', 'http://example.com');
    });

    test('accept() emits requestAccepted event with connection', (done) => {
      const req = createRequest();
      req.on('requestAccepted', (conn) => {
        expect(conn).toBeDefined();
        done();
      });
      req.accept('foo', 'http://example.com');
    });

    test('accept() with null protocol succeeds', () => {
      const req = createRequest();
      expect(() => req.accept(null, 'http://example.com')).not.toThrow();
      expect(req._resolved).toBe(true);
    });

    test('accept() invokes callback with connection', (done) => {
      const req = createRequest();
      req.accept('foo', 'http://example.com', null, (conn) => {
        expect(conn).toBeDefined();
        done();
      });
    });
  });

  describe('reject()', () => {
    test('reject() creates a client and connects with status code in URI', () => {
      const req = createRequest();
      // reject doesn't throw for valid calls
      expect(() => req.reject(403, 'Forbidden', {}, jest.fn())).not.toThrow();
    });

    test('reject() URI includes statusCode and statusDescription', () => {
      const req = createRequest();
      const originalConnect = require('websocket').client.prototype.connect;
      let capturedUri;
      require('websocket').client.prototype.connect = function(uri) {
        capturedUri = uri;
        // Don't emit events
      };
      req.reject(401, 'Unauthorized', {}, jest.fn());
      expect(capturedUri).toContain('statusCode=401');
      expect(capturedUri).toContain('statusDescription=Unauthorized');
      // Restore
      require('websocket').client.prototype.connect = originalConnect;
    });
  });

  describe('Protocol mismatch handling', () => {
    test('accept() with protocol not in requestedProtocols throws', () => {
      const req = createRequest();
      expect(() => req.accept('nonexistent_protocol', 'http://example.com'))
        .toThrow('Specified protocol was not requested by the client.');
    });

    test('accept() with illegal character in protocol throws', () => {
      const req = createRequest({ 'sec-websocket-protocol': 'foo bar' });
      // 'foo bar' contains space which is a separator character
      expect(() => req.accept('foo bar', 'http://example.com'))
        .toThrow(/Illegal character/);
    });

    test('accept() with requested protocol succeeds (case-insensitive)', () => {
      const req = createRequest({ 'sec-websocket-protocol': 'MyProto' });
      expect(() => req.accept('myproto', 'http://example.com')).not.toThrow();
    });
  });

  describe('readHandshake()', () => {
    test('throws when Host header is missing', () => {
      expect(() => {
        createRequest({ 'host': undefined });
      }).toThrow('Client must provide a Host header.');
    });

    test('throws when Sec-WebSocket-Key header is missing', () => {
      expect(() => {
        createRequest({ 'sec-websocket-key': undefined });
      }).toThrow('Client must provide a value for Sec-WebSocket-Key.');
    });

    test('throws when Sec-WebSocket-Version header is missing', () => {
      expect(() => {
        createRequest({ 'sec-websocket-version': undefined });
      }).toThrow('Client must provide a value for Sec-WebSocket-Version.');
    });

    test('throws when Sec-WebSocket-Version is non-numeric', () => {
      expect(() => {
        createRequest({ 'sec-websocket-version': 'abc' });
      }).toThrow('Client must provide a value for Sec-WebSocket-Version.');
    });

    test('parses host from headers', () => {
      const req = createRequest();
      expect(req.host).toBe('test.servicebus.windows.net');
    });

    test('parses key from headers', () => {
      const req = createRequest();
      expect(req.key).toBe('dGhlIHNhbXBsZSBub25jZQ==');
    });

    test('parses webSocketVersion from headers', () => {
      const req = createRequest();
      expect(req.webSocketVersion).toBe(13);
    });

    test('parses requestedProtocols from protocol header', () => {
      const req = createRequest();
      expect(req.requestedProtocols).toEqual(['foo', 'bar']);
    });

    test('requestedProtocols is empty when no protocol header', () => {
      const req = createRequest({ 'sec-websocket-protocol': undefined });
      expect(req.requestedProtocols).toEqual([]);
    });

    test('parses resourceURL from address', () => {
      const req = createRequest();
      expect(req.resourceURL).toBeDefined();
      expect(req.resourceURL.pathname).toContain('/$hc/mypath');
    });

    test('parses x-forwarded-for when ignoreXForwardedFor is false', () => {
      const req = createRequest(
        { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
        { ignoreXForwardedFor: false }
      );
      expect(req.remoteAddresses).toBeDefined();
      expect(req.remoteAddresses[0]).toBe('1.2.3.4');
      expect(req.remoteAddresses[1]).toBe('5.6.7.8');
    });

    test('ignores x-forwarded-for when ignoreXForwardedFor is true', () => {
      const req = createRequest(
        { 'x-forwarded-for': '1.2.3.4' },
        { ignoreXForwardedFor: true }
      );
      // remoteAddresses should not be set from x-forwarded-for
      expect(req.remoteAddresses).toBeUndefined();
    });

    test('parses extensions from sec-websocket-extensions header', () => {
      const req = createRequest({ 'sec-websocket-extensions': 'permessage-deflate; client_max_window_bits' });
      expect(req.requestedExtensions).toBeDefined();
      expect(req.requestedExtensions.length).toBeGreaterThan(0);
      expect(req.requestedExtensions[0].name).toBe('permessage-deflate');
    });

    test('requestedExtensions is empty when no extensions header', () => {
      const req = createRequest({ 'sec-websocket-extensions': undefined });
      expect(req.requestedExtensions).toEqual([]);
    });

    test('parses cookies from cookie header', () => {
      const req = createRequest({ 'cookie': 'session=abc123; user=test' });
      expect(req.cookies).toHaveLength(2);
      expect(req.cookies[0]).toEqual({ name: 'session', value: 'abc123' });
      expect(req.cookies[1]).toEqual({ name: 'user', value: 'test' });
    });
  });

  describe('parseCookies()', () => {
    let req;
    beforeEach(() => {
      req = createRequest();
    });

    test('returns empty array for null input', () => {
      expect(req.parseCookies(null)).toEqual([]);
    });

    test('returns empty array for undefined input', () => {
      expect(req.parseCookies(undefined)).toEqual([]);
    });

    test('returns empty array for non-string input', () => {
      expect(req.parseCookies(123)).toEqual([]);
    });

    test('parses single cookie', () => {
      const result = req.parseCookies('name=value');
      expect(result).toEqual([{ name: 'name', value: 'value' }]);
    });

    test('parses multiple cookies separated by semicolons', () => {
      const result = req.parseCookies('a=1; b=2; c=3');
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ name: 'a', value: '1' });
      expect(result[1]).toEqual({ name: 'b', value: '2' });
      expect(result[2]).toEqual({ name: 'c', value: '3' });
    });

    test('parses cookies separated by commas', () => {
      const result = req.parseCookies('a=1, b=2');
      expect(result).toHaveLength(2);
    });

    test('handles quoted cookie values', () => {
      const result = req.parseCookies('name="quoted value"');
      expect(result[0].value).toBe('quoted value');
    });

    test('decodes URI-encoded cookie values', () => {
      const result = req.parseCookies('name=hello%20world');
      expect(result[0].value).toBe('hello world');
    });

    test('handles cookie without value (no equals sign)', () => {
      const result = req.parseCookies('nameonly');
      expect(result).toEqual([{ name: 'nameonly', value: null }]);
    });

    test('trims whitespace from cookie names and values', () => {
      const result = req.parseCookies('  name  =  value  ');
      expect(result[0].name).toBe('name');
      expect(result[0].value).toBe('value');
    });

    test('handles empty string input', () => {
      const result = req.parseCookies('');
      expect(result).toEqual([]);
    });

    test('handles cookie with empty value', () => {
      const result = req.parseCookies('name=');
      expect(result[0]).toEqual({ name: 'name', value: '' });
    });
  });
});
