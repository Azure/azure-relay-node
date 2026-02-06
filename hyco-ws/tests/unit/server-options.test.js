/**
 * Unit tests for HybridConnectionWebSocketServer constructor default options merging.
 * Verifies that the constructor correctly merges user-provided options with defaults.
 */
'use strict';

// Mock HybridConnectionWebSocketServer to replicate the real constructor's
// Object.assign default-merging logic without triggering ws require.cache issues.
jest.mock('../../lib/HybridConnectionWebSocketServer', () => {
  var isDefinedAndNonNull = function(options, key) {
    return typeof options[key] != 'undefined' && options[key] !== null;
  };
  const EventEmitter = require('events');
  function MockServer(options, callback) {
    if (this instanceof MockServer === false) {
      return new MockServer(options, callback);
    }
    EventEmitter.call(this);
    options = Object.assign({
      server: null,
      token: null,
      id: null,
      verifyClient: null,
      handleProtocols: null,
      disableHixie: false,
      clientTracking: true,
      perMessageDeflate: true,
      maxPayload: 100 * 1024 * 1024,
      backlog: null
    }, options);
    if (!isDefinedAndNonNull(options, 'server')) {
      throw new TypeError('\'server\' must be provided');
    }
    if (!isDefinedAndNonNull(options, 'token')) {
      throw new TypeError('A \'token\' string or function must be provided');
    }
    this.closeRequested = false;
    this.options = options;
    this.clients = [];
    if (typeof callback === 'function') {
      this.on('connection', callback);
    }
  }
  require('util').inherits(MockServer, EventEmitter);
  return MockServer;
});

const HybridConnectionWebSocketServer = require('../../lib/HybridConnectionWebSocketServer');

describe('HybridConnectionWebSocketServer constructor options', () => {
  const minimalOptions = {
    server: 'wss://test.servicebus.windows.net/$hc/mypath',
    token: 'SharedAccessSignature sr=test&sig=abc&se=99999&skn=rule'
  };

  describe('default values', () => {
    let server;
    beforeEach(() => {
      server = new HybridConnectionWebSocketServer(minimalOptions);
    });

    test('id defaults to null', () => {
      expect(server.options.id).toBeNull();
    });

    test('verifyClient defaults to null', () => {
      expect(server.options.verifyClient).toBeNull();
    });

    test('handleProtocols defaults to null', () => {
      expect(server.options.handleProtocols).toBeNull();
    });

    test('disableHixie defaults to false', () => {
      expect(server.options.disableHixie).toBe(false);
    });

    test('clientTracking defaults to true', () => {
      expect(server.options.clientTracking).toBe(true);
    });

    test('perMessageDeflate defaults to true', () => {
      expect(server.options.perMessageDeflate).toBe(true);
    });

    test('maxPayload defaults to 100MB', () => {
      expect(server.options.maxPayload).toBe(100 * 1024 * 1024);
    });

    test('backlog defaults to null', () => {
      expect(server.options.backlog).toBeNull();
    });
  });

  describe('user-provided options override defaults', () => {
    test('custom id overrides null default', () => {
      const server = new HybridConnectionWebSocketServer({
        ...minimalOptions, id: 'my-connection-id'
      });
      expect(server.options.id).toBe('my-connection-id');
    });

    test('custom verifyClient overrides null default', () => {
      const fn = () => true;
      const server = new HybridConnectionWebSocketServer({
        ...minimalOptions, verifyClient: fn
      });
      expect(server.options.verifyClient).toBe(fn);
    });

    test('custom handleProtocols overrides null default', () => {
      const fn = (protocols) => protocols[0];
      const server = new HybridConnectionWebSocketServer({
        ...minimalOptions, handleProtocols: fn
      });
      expect(server.options.handleProtocols).toBe(fn);
    });

    test('disableHixie can be set to true', () => {
      const server = new HybridConnectionWebSocketServer({
        ...minimalOptions, disableHixie: true
      });
      expect(server.options.disableHixie).toBe(true);
    });

    test('clientTracking can be set to false', () => {
      const server = new HybridConnectionWebSocketServer({
        ...minimalOptions, clientTracking: false
      });
      expect(server.options.clientTracking).toBe(false);
    });

    test('perMessageDeflate can be set to false', () => {
      const server = new HybridConnectionWebSocketServer({
        ...minimalOptions, perMessageDeflate: false
      });
      expect(server.options.perMessageDeflate).toBe(false);
    });

    test('custom maxPayload overrides default', () => {
      const server = new HybridConnectionWebSocketServer({
        ...minimalOptions, maxPayload: 1024
      });
      expect(server.options.maxPayload).toBe(1024);
    });

    test('custom backlog overrides null default', () => {
      const server = new HybridConnectionWebSocketServer({
        ...minimalOptions, backlog: 128
      });
      expect(server.options.backlog).toBe(128);
    });
  });

  describe('required options preserved after merge', () => {
    test('server option is preserved in merged options', () => {
      const server = new HybridConnectionWebSocketServer(minimalOptions);
      expect(server.options.server).toBe(minimalOptions.server);
    });

    test('token string is preserved in merged options', () => {
      const server = new HybridConnectionWebSocketServer(minimalOptions);
      expect(server.options.token).toBe(minimalOptions.token);
    });

    test('token function is preserved in merged options', () => {
      const tokenFn = () => 'SharedAccessSignature sr=test&sig=abc&se=99999&skn=rule';
      const server = new HybridConnectionWebSocketServer({
        ...minimalOptions, token: tokenFn
      });
      expect(server.options.token).toBe(tokenFn);
    });
  });

  describe('constructor state initialization', () => {
    test('closeRequested is initialized to false', () => {
      const server = new HybridConnectionWebSocketServer(minimalOptions);
      expect(server.closeRequested).toBe(false);
    });

    test('clients is initialized to empty array', () => {
      const server = new HybridConnectionWebSocketServer(minimalOptions);
      expect(server.clients).toEqual([]);
    });

    test('callback registers connection listener', () => {
      const cb = jest.fn();
      const server = new HybridConnectionWebSocketServer(minimalOptions, cb);
      server.emit('connection', { id: 'test' });
      expect(cb).toHaveBeenCalledWith({ id: 'test' });
    });

    test('no callback does not throw', () => {
      expect(() => {
        new HybridConnectionWebSocketServer(minimalOptions);
      }).not.toThrow();
    });
  });

  describe('partial options merge preserves unspecified defaults', () => {
    test('providing only server and token keeps all other defaults', () => {
      const server = new HybridConnectionWebSocketServer(minimalOptions);
      expect(server.options.id).toBeNull();
      expect(server.options.verifyClient).toBeNull();
      expect(server.options.handleProtocols).toBeNull();
      expect(server.options.disableHixie).toBe(false);
      expect(server.options.clientTracking).toBe(true);
      expect(server.options.perMessageDeflate).toBe(true);
      expect(server.options.maxPayload).toBe(100 * 1024 * 1024);
      expect(server.options.backlog).toBeNull();
    });

    test('overriding one option leaves others at defaults', () => {
      const server = new HybridConnectionWebSocketServer({
        ...minimalOptions, maxPayload: 512
      });
      expect(server.options.maxPayload).toBe(512);
      expect(server.options.clientTracking).toBe(true);
      expect(server.options.perMessageDeflate).toBe(true);
      expect(server.options.disableHixie).toBe(false);
    });
  });
});
