/**
 * Unit tests for shared test-utils helpers.
 * Validates createRelayConfig, safeClose, createBuffer, and describeIf utilities.
 */

'use strict';

var EventEmitter = require('events');
var testUtils = require('../../index');
var createRelayConfig = testUtils.createRelayConfig;
var safeClose = testUtils.safeClose;
var createBuffer = testUtils.createBuffer;
var describeIf = testUtils.describeIf;
var createEchoListener = testUtils.createEchoListener;
var createHycoWebSocketEchoListener = testUtils.createHycoWebSocketEchoListener;

describe('createRelayConfig', function () {
  var originalEnv;

  beforeEach(function () {
    originalEnv = Object.assign({}, process.env);
  });

  afterEach(function () {
    process.env = originalEnv;
  });

  test('returns config object when all RELAY_* env vars are set', function () {
    process.env.RELAY_NAMESPACE = 'myns.servicebus.windows.net';
    process.env.RELAY_PATH = 'mypath';
    process.env.RELAY_KEYRULE = 'RootManageSharedAccessKey';
    process.env.RELAY_KEY = 'base64key==';

    var config = createRelayConfig();
    expect(config).toEqual({
      namespace: 'myns.servicebus.windows.net',
      path: 'mypath',
      keyRule: 'RootManageSharedAccessKey',
      key: 'base64key=='
    });
  });

  test('returns null when RELAY_NAMESPACE is missing', function () {
    delete process.env.RELAY_NAMESPACE;
    delete process.env.SB_HC_NAMESPACE;
    process.env.RELAY_PATH = 'mypath';
    process.env.RELAY_KEYRULE = 'rule';
    process.env.RELAY_KEY = 'key';

    expect(createRelayConfig()).toBeNull();
  });

  test('returns null when RELAY_PATH is missing', function () {
    process.env.RELAY_NAMESPACE = 'myns.servicebus.windows.net';
    delete process.env.RELAY_PATH;
    delete process.env.SB_HC_PATH;
    process.env.RELAY_KEYRULE = 'rule';
    process.env.RELAY_KEY = 'key';

    expect(createRelayConfig()).toBeNull();
  });

  test('returns null when RELAY_KEYRULE is missing', function () {
    process.env.RELAY_NAMESPACE = 'myns.servicebus.windows.net';
    process.env.RELAY_PATH = 'mypath';
    delete process.env.RELAY_KEYRULE;
    delete process.env.SB_HC_KEYRULE;
    process.env.RELAY_KEY = 'key';

    expect(createRelayConfig()).toBeNull();
  });

  test('returns null when RELAY_KEY is missing', function () {
    process.env.RELAY_NAMESPACE = 'myns.servicebus.windows.net';
    process.env.RELAY_PATH = 'mypath';
    process.env.RELAY_KEYRULE = 'rule';
    delete process.env.RELAY_KEY;
    delete process.env.SB_HC_KEY;

    expect(createRelayConfig()).toBeNull();
  });

  test('returns null when all env vars are missing', function () {
    delete process.env.RELAY_NAMESPACE;
    delete process.env.RELAY_PATH;
    delete process.env.RELAY_KEYRULE;
    delete process.env.RELAY_KEY;
    delete process.env.SB_HC_NAMESPACE;
    delete process.env.SB_HC_PATH;
    delete process.env.SB_HC_KEYRULE;
    delete process.env.SB_HC_KEY;

    expect(createRelayConfig()).toBeNull();
  });

  test('falls back to SB_HC_* env vars when RELAY_* are not set', function () {
    delete process.env.RELAY_NAMESPACE;
    delete process.env.RELAY_PATH;
    delete process.env.RELAY_KEYRULE;
    delete process.env.RELAY_KEY;
    process.env.SB_HC_NAMESPACE = 'sbns.servicebus.windows.net';
    process.env.SB_HC_PATH = 'sbpath';
    process.env.SB_HC_KEYRULE = 'SBRule';
    process.env.SB_HC_KEY = 'sbkey==';

    var config = createRelayConfig();
    expect(config).toEqual({
      namespace: 'sbns.servicebus.windows.net',
      path: 'sbpath',
      keyRule: 'SBRule',
      key: 'sbkey=='
    });
  });

  test('RELAY_* env vars take precedence over SB_HC_*', function () {
    process.env.RELAY_NAMESPACE = 'relay-ns';
    process.env.RELAY_PATH = 'relay-path';
    process.env.RELAY_KEYRULE = 'relay-rule';
    process.env.RELAY_KEY = 'relay-key';
    process.env.SB_HC_NAMESPACE = 'sb-ns';
    process.env.SB_HC_PATH = 'sb-path';
    process.env.SB_HC_KEYRULE = 'sb-rule';
    process.env.SB_HC_KEY = 'sb-key';

    var config = createRelayConfig();
    expect(config.namespace).toBe('relay-ns');
    expect(config.path).toBe('relay-path');
    expect(config.keyRule).toBe('relay-rule');
    expect(config.key).toBe('relay-key');
  });

  test('strips surrounding quotes from namespace, keyRule, and key', function () {
    process.env.RELAY_NAMESPACE = '"quoted-ns"';
    process.env.RELAY_PATH = 'mypath';
    process.env.RELAY_KEYRULE = '"quoted-rule"';
    process.env.RELAY_KEY = '"quoted-key"';

    var config = createRelayConfig();
    expect(config.namespace).toBe('quoted-ns');
    expect(config.keyRule).toBe('quoted-rule');
    expect(config.key).toBe('quoted-key');
  });
});

describe('safeClose', function () {
  test('resolves when server is null', function () {
    return safeClose(null).then(function () {
      expect(true).toBe(true);
    });
  });

  test('resolves when server is undefined', function () {
    return safeClose(undefined).then(function () {
      expect(true).toBe(true);
    });
  });

  test('calls server.close and resolves', function () {
    var closed = false;
    var mockServer = {
      close: function (cb) { closed = true; cb(); }
    };

    return safeClose(mockServer).then(function () {
      expect(closed).toBe(true);
    });
  });

  test('resolves when server.close throws', function () {
    var mockServer = {
      close: function () { throw new Error('close error'); }
    };

    return safeClose(mockServer).then(function () {
      expect(true).toBe(true);
    });
  });

  test('resolves when server has no close method', function () {
    var mockServer = {};

    return safeClose(mockServer).then(function () {
      expect(true).toBe(true);
    });
  });
});

describe('createBuffer', function () {
  test('creates buffer of specified length', function () {
    var buf = createBuffer(100);
    expect(buf.length).toBe(100);
  });

  test('fills buffer with default pattern 0xAB', function () {
    var buf = createBuffer(4);
    expect(buf[0]).toBe(0xAB);
    expect(buf[1]).toBe(0xAB);
    expect(buf[2]).toBe(0xAB);
    expect(buf[3]).toBe(0xAB);
  });

  test('fills buffer with custom pattern', function () {
    var buf = createBuffer(4, 0xFF);
    expect(buf[0]).toBe(0xFF);
    expect(buf[3]).toBe(0xFF);
  });

  test('creates zero-length buffer', function () {
    var buf = createBuffer(0);
    expect(buf.length).toBe(0);
  });

  test('creates large buffer', function () {
    var buf = createBuffer(65536);
    expect(buf.length).toBe(65536);
  });
});

describe('describeIf', function () {
  test('returns describe when config is non-null', function () {
    expect(describeIf({})).toBe(describe);
  });

  test('returns describe.skip when config is null', function () {
    expect(describeIf(null)).toBe(describe.skip);
  });
});

describe('createEchoListener', function () {
  function createMockWs() {
    var ws = new EventEmitter();
    ws.sent = [];
    ws.send = function (data) { ws.sent.push(data); };
    return ws;
  }

  test('echoes text messages back to sender', function () {
    var handler = createEchoListener();
    var ws = createMockWs();
    handler(ws);

    ws.emit('message', 'hello world');
    expect(ws.sent).toEqual(['hello world']);
  });

  test('echoes binary data back to sender', function () {
    var handler = createEchoListener();
    var ws = createMockWs();
    handler(ws);

    var buf = Buffer.from([1, 2, 3, 4]);
    ws.emit('message', buf);
    expect(ws.sent).toEqual([buf]);
  });

  test('echoes multiple messages in order', function () {
    var handler = createEchoListener();
    var ws = createMockWs();
    handler(ws);

    ws.emit('message', 'first');
    ws.emit('message', 'second');
    ws.emit('message', 'third');
    expect(ws.sent).toEqual(['first', 'second', 'third']);
  });

  test('calls onConnection callback when connection is established', function () {
    var connected = null;
    var handler = createEchoListener({ onConnection: function (w) { connected = w; } });
    var ws = createMockWs();
    handler(ws);

    expect(connected).toBe(ws);
  });

  test('calls onClose callback when connection is closed', function () {
    var closed = null;
    var handler = createEchoListener({ onClose: function (w) { closed = w; } });
    var ws = createMockWs();
    handler(ws);

    ws.emit('close');
    expect(closed).toBe(ws);
  });

  test('works without options', function () {
    var handler = createEchoListener();
    var ws = createMockWs();
    handler(ws);

    ws.emit('message', 'test');
    ws.emit('close');
    expect(ws.sent).toEqual(['test']);
  });
});

describe('createHycoWebSocketEchoListener', function () {
  function createMockConnection() {
    var conn = new EventEmitter();
    conn.sentUTF = [];
    conn.sentBytes = [];
    conn.sendUTF = function (data) { conn.sentUTF.push(data); };
    conn.sendBytes = function (data) { conn.sentBytes.push(data); };
    return conn;
  }

  test('echoes UTF-8 messages back to sender', function () {
    var handler = createHycoWebSocketEchoListener();
    var conn = createMockConnection();
    handler(conn);

    conn.emit('message', { type: 'utf8', utf8Data: 'hello world' });
    expect(conn.sentUTF).toEqual(['hello world']);
    expect(conn.sentBytes).toEqual([]);
  });

  test('echoes binary messages back to sender', function () {
    var handler = createHycoWebSocketEchoListener();
    var conn = createMockConnection();
    handler(conn);

    var buf = Buffer.from([1, 2, 3, 4]);
    conn.emit('message', { type: 'binary', binaryData: buf });
    expect(conn.sentBytes).toEqual([buf]);
    expect(conn.sentUTF).toEqual([]);
  });

  test('echoes mixed message types in order', function () {
    var handler = createHycoWebSocketEchoListener();
    var conn = createMockConnection();
    handler(conn);

    conn.emit('message', { type: 'utf8', utf8Data: 'text' });
    var buf = Buffer.from([5, 6]);
    conn.emit('message', { type: 'binary', binaryData: buf });
    conn.emit('message', { type: 'utf8', utf8Data: 'more text' });

    expect(conn.sentUTF).toEqual(['text', 'more text']);
    expect(conn.sentBytes).toEqual([buf]);
  });

  test('calls onConnection callback when connection is established', function () {
    var connected = null;
    var handler = createHycoWebSocketEchoListener({ onConnection: function (c) { connected = c; } });
    var conn = createMockConnection();
    handler(conn);

    expect(connected).toBe(conn);
  });

  test('calls onClose callback with reasonCode and description', function () {
    var closeArgs = null;
    var handler = createHycoWebSocketEchoListener({
      onClose: function (c, code, desc) { closeArgs = { conn: c, code: code, desc: desc }; }
    });
    var conn = createMockConnection();
    handler(conn);

    conn.emit('close', 1000, 'Normal closure');
    expect(closeArgs.conn).toBe(conn);
    expect(closeArgs.code).toBe(1000);
    expect(closeArgs.desc).toBe('Normal closure');
  });

  test('works without options', function () {
    var handler = createHycoWebSocketEchoListener();
    var conn = createMockConnection();
    handler(conn);

    conn.emit('message', { type: 'utf8', utf8Data: 'test' });
    conn.emit('close', 1000, 'done');
    expect(conn.sentUTF).toEqual(['test']);
  });

  test('ignores unknown message types', function () {
    var handler = createHycoWebSocketEchoListener();
    var conn = createMockConnection();
    handler(conn);

    conn.emit('message', { type: 'unknown', data: 'something' });
    expect(conn.sentUTF).toEqual([]);
    expect(conn.sentBytes).toEqual([]);
  });
});
