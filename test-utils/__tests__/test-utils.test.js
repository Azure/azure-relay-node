/**
 * Unit tests for shared test-utils helpers.
 * Validates createRelayConfig, safeClose, createBuffer, and describeIf utilities.
 */

'use strict';

var testUtils = require('../index');
var createRelayConfig = testUtils.createRelayConfig;
var safeClose = testUtils.safeClose;
var createBuffer = testUtils.createBuffer;
var describeIf = testUtils.describeIf;

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
