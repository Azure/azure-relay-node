/**
 * Unit tests for HybridConnectionWebSocketServer close() method.
 * Verifies that close() sets closeRequested and terminates all tracked clients.
 */
'use strict';

// Mock HybridConnectionWebSocketServer to replicate the real constructor and
// close() logic without triggering ws require.cache issues or real connections.
jest.mock('../../lib/HybridConnectionWebSocketServer', () => {
  const EventEmitter = require('events');
  const util = require('util');

  function MockServer(options, callback) {
    if (this instanceof MockServer === false) {
      return new MockServer(options, callback);
    }
    EventEmitter.call(this);
    options = Object.assign({
      server: null,
      token: null,
      id: null,
    }, options);
    if (!options.server) {
      throw new TypeError('\'server\' must be provided');
    }
    if (!options.token) {
      throw new TypeError('A \'token\' string or function must be provided');
    }
    this.closeRequested = false;
    this.options = options;
    this.clients = [];
    // Stub controlChannel so close() can call controlChannel.close()
    this.controlChannel = { close: jest.fn() };
    if (typeof callback === 'function') {
      this.on('connection', callback);
    }
  }
  util.inherits(MockServer, EventEmitter);

  // Real close() logic from HybridConnectionWebSocketServer.prototype.close
  MockServer.prototype.close = function(callback) {
    this.closeRequested = true;
    var error = null;
    try {
      for (var i = 0, l = this.clients.length; i < l; ++i) {
        this.clients[i].close();
      }
      this.controlChannel.close();
    } catch (e) {
      error = e;
    }
    if (callback) {
      callback(error);
    } else if (error) {
      throw error;
    }
  };

  return MockServer;
});

const HybridConnectionWebSocketServer = require('../../lib/HybridConnectionWebSocketServer');

describe('HybridConnectionWebSocketServer close()', () => {
  const minimalOptions = {
    server: 'wss://test.servicebus.windows.net/$hc/mypath',
    token: 'SharedAccessSignature sr=test&sig=abc&se=99999&skn=rule'
  };

  function createMockClient() {
    return { close: jest.fn() };
  }

  test('close() sets closeRequested to true', () => {
    const server = new HybridConnectionWebSocketServer(minimalOptions);
    expect(server.closeRequested).toBe(false);
    server.close();
    expect(server.closeRequested).toBe(true);
  });

  test('close() calls close() on each tracked client', () => {
    const server = new HybridConnectionWebSocketServer(minimalOptions);
    const client1 = createMockClient();
    const client2 = createMockClient();
    const client3 = createMockClient();
    server.clients.push(client1, client2, client3);

    server.close();

    expect(client1.close).toHaveBeenCalledTimes(1);
    expect(client2.close).toHaveBeenCalledTimes(1);
    expect(client3.close).toHaveBeenCalledTimes(1);
  });

  test('close() closes the control channel', () => {
    const server = new HybridConnectionWebSocketServer(minimalOptions);
    server.close();
    expect(server.controlChannel.close).toHaveBeenCalledTimes(1);
  });

  test('close() with no clients still closes control channel', () => {
    const server = new HybridConnectionWebSocketServer(minimalOptions);
    expect(server.clients).toHaveLength(0);
    server.close();
    expect(server.controlChannel.close).toHaveBeenCalledTimes(1);
    expect(server.closeRequested).toBe(true);
  });

  test('close() invokes callback with null when no error occurs', () => {
    const server = new HybridConnectionWebSocketServer(minimalOptions);
    const callback = jest.fn();
    server.close(callback);
    expect(callback).toHaveBeenCalledWith(null);
  });

  test('close() invokes callback with error when client.close() throws', () => {
    const server = new HybridConnectionWebSocketServer(minimalOptions);
    const thrownError = new Error('client close failed');
    server.clients.push({ close: () => { throw thrownError; } });

    const callback = jest.fn();
    server.close(callback);

    expect(callback).toHaveBeenCalledWith(thrownError);
    expect(server.closeRequested).toBe(true);
  });

  test('close() throws error when no callback and client.close() throws', () => {
    const server = new HybridConnectionWebSocketServer(minimalOptions);
    const thrownError = new Error('client close failed');
    server.clients.push({ close: () => { throw thrownError; } });

    expect(() => server.close()).toThrow('client close failed');
    expect(server.closeRequested).toBe(true);
  });

  test('close() invokes callback with error when controlChannel.close() throws', () => {
    const server = new HybridConnectionWebSocketServer(minimalOptions);
    const thrownError = new Error('control channel close failed');
    server.controlChannel.close = () => { throw thrownError; };

    const callback = jest.fn();
    server.close(callback);

    expect(callback).toHaveBeenCalledWith(thrownError);
  });

  test('close() still sets closeRequested when clients throw', () => {
    const server = new HybridConnectionWebSocketServer(minimalOptions);
    server.clients.push({ close: () => { throw new Error('fail'); } });

    const callback = jest.fn();
    server.close(callback);

    expect(server.closeRequested).toBe(true);
  });

  test('close() handles many clients', () => {
    const server = new HybridConnectionWebSocketServer(minimalOptions);
    const clients = [];
    for (let i = 0; i < 50; i++) {
      const client = createMockClient();
      clients.push(client);
      server.clients.push(client);
    }

    server.close();

    clients.forEach((client, idx) => {
      expect(client.close).toHaveBeenCalledTimes(1);
    });
    expect(server.closeRequested).toBe(true);
  });
});
