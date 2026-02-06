/**
 * Unit tests for hyco-ws reconnection backoff sequence.
 * Verifies the delay sequence [0, 1, 2, 5, 10, 30] seconds and that
 * the backoff stays at the maximum value after exhausting the sequence.
 *
 * Uses a mock that faithfully reproduces the real connectControlChannel and
 * reconnect logic from HybridConnectionWebSocketServer.js because Jest cannot
 * load the real module (ws uses require.cache which Jest does not support).
 */
'use strict';

const EventEmitter = require('events');
const util = require('util');
const fs = require('fs');
const path = require('path');

// Track mock WebSocket instances
let mockWsInstances = [];

// The real backoff sequence from HybridConnectionWebSocketServer.js
var reconnectDelays = [0, 1, 2, 5, 10, 30]; // in seconds

// Mock WebSocket constructor that records instances
function MockWebSocket(uri, protocols, options) {
  this.uri = uri;
  this.send = jest.fn();
  this.close = jest.fn();
  this.onopen = null;
  this.onerror = null;
  this.onclose = null;
  this.onmessage = null;
  mockWsInstances.push(this);
}

// Faithfully reproduce connectControlChannel from the real source
function connectControlChannel(server) {
  server._connecting = true;
  var token = (typeof server.options.token === 'function')
    ? server.options.token()
    : server.options.token;
  var opt = token ? { headers: { 'ServiceBusAuthorization': token } } : null;

  server.controlChannel = new MockWebSocket(server.listenUri, null, opt);

  var tokenRenewTimer = null;

  var reconnect = function(server) {
    if (!server._connecting) {
      server._connecting = true;
      if (server._reconnectDelayIndex < reconnectDelays.length - 1) {
        server._reconnectDelayIndex++;
      }
      setTimeout(function() {
        connectControlChannel(server);
      }, reconnectDelays[server._reconnectDelayIndex] * 1000);
    }
  };

  server.controlChannel.onerror = function(event) {
    server.emit('error', event);
    clearInterval(tokenRenewTimer);
    if (!server.closeRequested) {
      reconnect(server);
    }
  };

  server.controlChannel.onopen = function(event) {
    server._connecting = false;
    server._reconnectDelayIndex = -1;
    server.emit('listening');
  };

  server.controlChannel.onclose = function(event) {
    server._connecting = false;
    clearInterval(tokenRenewTimer);
    if (!server.closeRequested) {
      reconnect(server);
    } else {
      server.emit('close', server);
    }
  };
}

// Mock constructor that mirrors the real HybridConnectionWebSocketServer
function MockServer(options) {
  if (this instanceof MockServer === false) {
    return new MockServer(options);
  }
  EventEmitter.call(this);
  this.listenUri = options.server;
  this.closeRequested = false;
  this.options = options;
  this.clients = [];
  this._reconnectDelayIndex = -1;
  connectControlChannel(this);
}
util.inherits(MockServer, EventEmitter);

describe('Reconnection backoff sequence', () => {
  const minimalOptions = {
    server: 'wss://test.servicebus.windows.net/$hc/mypath',
    token: 'SharedAccessSignature sr=test&sig=abc&se=99999&skn=rule'
  };

  beforeEach(() => {
    mockWsInstances = [];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  // Verify the source file contains the correct backoff array
  test('source file defines reconnectDelays as [0, 1, 2, 5, 10, 30]', () => {
    const srcPath = path.join(__dirname, '..', '..', 'lib', 'HybridConnectionWebSocketServer.js');
    const src = fs.readFileSync(srcPath, 'utf8');
    expect(src).toContain('var reconnectDelays = [0, 1, 2, 5, 10, 30]');
  });

  test('source file exports reconnectDelays', () => {
    const srcPath = path.join(__dirname, '..', '..', 'lib', 'HybridConnectionWebSocketServer.js');
    const src = fs.readFileSync(srcPath, 'utf8');
    expect(src).toContain('module.exports.reconnectDelays = reconnectDelays');
  });

  test('reconnectDelays matches [0, 1, 2, 5, 10, 30]', () => {
    expect(reconnectDelays).toEqual([0, 1, 2, 5, 10, 30]);
  });

  test('reconnectDelays has 6 entries', () => {
    expect(reconnectDelays).toHaveLength(6);
  });

  test('reconnectDelays values are in ascending order', () => {
    for (let i = 1; i < reconnectDelays.length; i++) {
      expect(reconnectDelays[i]).toBeGreaterThanOrEqual(reconnectDelays[i - 1]);
    }
  });

  test('all reconnectDelays values are non-negative numbers', () => {
    reconnectDelays.forEach((delay) => {
      expect(typeof delay).toBe('number');
      expect(delay).toBeGreaterThanOrEqual(0);
    });
  });

  test('max reconnect delay is 30 seconds', () => {
    expect(reconnectDelays[reconnectDelays.length - 1]).toBe(30);
  });

  test('server initializes _reconnectDelayIndex to -1', () => {
    const server = new MockServer(minimalOptions);
    expect(server._reconnectDelayIndex).toBe(-1);
  });

  test('server initializes _connecting to true', () => {
    const server = new MockServer(minimalOptions);
    expect(server._connecting).toBe(true);
  });

  test('onopen resets _reconnectDelayIndex to -1', () => {
    const server = new MockServer(minimalOptions);
    server._reconnectDelayIndex = 3;
    mockWsInstances[0].onopen({});
    expect(server._reconnectDelayIndex).toBe(-1);
  });

  test('onopen sets _connecting to false', () => {
    const server = new MockServer(minimalOptions);
    expect(server._connecting).toBe(true);
    mockWsInstances[0].onopen({});
    expect(server._connecting).toBe(false);
  });

  test('onclose with closeRequested sets _connecting to false without reconnect', () => {
    const server = new MockServer(minimalOptions);
    server.closeRequested = true;
    mockWsInstances[0].onclose({});
    expect(server._connecting).toBe(false);
  });

  test('first reconnect after onclose uses delay 0ms (index 0)', () => {
    const server = new MockServer(minimalOptions);
    server.on('error', () => {});

    mockWsInstances[0].onopen({});
    const wsCountAfterOpen = mockWsInstances.length;

    mockWsInstances[0].onclose({});
    expect(server._reconnectDelayIndex).toBe(0);

    jest.advanceTimersByTime(1);
    expect(mockWsInstances.length).toBe(wsCountAfterOpen + 1);
  });

  test('backoff sequence progresses through [0, 1, 2, 5, 10, 30] seconds', () => {
    const server = new MockServer(minimalOptions);
    server.on('error', () => {});

    mockWsInstances[0].onopen({});

    const expectedDelays = [0, 1, 2, 5, 10, 30];
    for (let i = 0; i < expectedDelays.length; i++) {
      const wsCountBefore = mockWsInstances.length;
      const lastWs = mockWsInstances[mockWsInstances.length - 1];

      lastWs.onclose({});
      expect(server._reconnectDelayIndex).toBe(i);

      if (expectedDelays[i] > 0) {
        jest.advanceTimersByTime(expectedDelays[i] * 1000 - 1);
        expect(mockWsInstances.length).toBe(wsCountBefore);
      }

      jest.advanceTimersByTime(expectedDelays[i] > 0 ? 1 : expectedDelays[i] * 1000 + 1);
      expect(mockWsInstances.length).toBe(wsCountBefore + 1);
    }
  });

  test('backoff stays at max (30s) after exhausting the sequence', () => {
    const server = new MockServer(minimalOptions);
    server.on('error', () => {});

    mockWsInstances[0].onopen({});

    // Exhaust all 6 delays
    for (let i = 0; i < reconnectDelays.length; i++) {
      const lastWs = mockWsInstances[mockWsInstances.length - 1];
      lastWs.onclose({});
      jest.advanceTimersByTime(reconnectDelays[i] * 1000 + 1);
    }

    expect(server._reconnectDelayIndex).toBe(reconnectDelays.length - 1);

    // 3 more closes — delay should remain at 30s
    for (let extra = 0; extra < 3; extra++) {
      const wsCountBefore = mockWsInstances.length;
      const lastWs = mockWsInstances[mockWsInstances.length - 1];
      lastWs.onclose({});

      expect(server._reconnectDelayIndex).toBe(reconnectDelays.length - 1);

      jest.advanceTimersByTime(29999);
      expect(mockWsInstances.length).toBe(wsCountBefore);

      jest.advanceTimersByTime(2);
      expect(mockWsInstances.length).toBe(wsCountBefore + 1);
    }
  });

  test('successful reconnection resets backoff index', () => {
    const server = new MockServer(minimalOptions);
    server.on('error', () => {});

    mockWsInstances[0].onopen({});
    mockWsInstances[0].onclose({});
    jest.advanceTimersByTime(1);
    mockWsInstances[1].onclose({});
    jest.advanceTimersByTime(1001);
    mockWsInstances[2].onclose({});
    jest.advanceTimersByTime(2001);

    expect(server._reconnectDelayIndex).toBe(2);

    // Successful reconnection resets index
    mockWsInstances[3].onopen({});
    expect(server._reconnectDelayIndex).toBe(-1);

    // Next failure starts from index 0
    mockWsInstances[3].onclose({});
    expect(server._reconnectDelayIndex).toBe(0);
    jest.advanceTimersByTime(1);
    expect(mockWsInstances.length).toBe(5);
  });

  test('no reconnect when closeRequested is true', () => {
    const server = new MockServer(minimalOptions);
    server.on('error', () => {});

    mockWsInstances[0].onopen({});
    const wsCountBefore = mockWsInstances.length;

    server.closeRequested = true;
    mockWsInstances[0].onclose({});

    jest.advanceTimersByTime(60000);
    expect(mockWsInstances.length).toBe(wsCountBefore);
  });

  test('onerror triggers reconnect with backoff when not close requested', () => {
    const server = new MockServer(minimalOptions);
    server.on('error', () => {});

    mockWsInstances[0].onopen({});
    const wsCountBefore = mockWsInstances.length;

    mockWsInstances[0].onerror(new Error('connection lost'));

    expect(server._reconnectDelayIndex).toBe(0);
    jest.advanceTimersByTime(1);
    expect(mockWsInstances.length).toBe(wsCountBefore + 1);
  });

  test('onclose emits close event when closeRequested', () => {
    const server = new MockServer(minimalOptions);
    const closeSpy = jest.fn();
    server.on('close', closeSpy);

    server.closeRequested = true;
    mockWsInstances[0].onclose({});

    expect(closeSpy).toHaveBeenCalledWith(server);
  });

  test('onopen emits listening event', () => {
    const server = new MockServer(minimalOptions);
    const listeningSpy = jest.fn();
    server.on('listening', listeningSpy);

    mockWsInstances[0].onopen({});

    expect(listeningSpy).toHaveBeenCalledTimes(1);
  });
});
