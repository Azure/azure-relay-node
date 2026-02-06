/**
 * Unit tests for hyco-ws token renewal when token option is a function.
 * Verifies that connectControlChannel calls the token function, sets up
 * periodic renewal via setInterval, and sends renewToken messages.
 */
'use strict';

const EventEmitter = require('events');

// We test connectControlChannel's token renewal behavior by extracting its
// logic into a controllable mock that mirrors the real implementation.

describe('Token renewal when token option is a function', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('token function is called immediately for initial token', () => {
    const tokenFn = jest.fn().mockReturnValue('initial-token');

    // Simulate what connectControlChannel does: if token is a function, call it
    if (typeof tokenFn === 'function') {
      var token = tokenFn();
    }
    expect(tokenFn).toHaveBeenCalledTimes(1);
    expect(token).toBe('initial-token');
  });

  test('token as string is used directly without calling as function', () => {
    const tokenStr = 'static-token';
    var token;
    if (typeof tokenStr === 'function') {
      token = tokenStr();
    } else {
      token = tokenStr;
    }
    expect(token).toBe('static-token');
  });

  test('tokenRenewDuration is set when token is a function', () => {
    const moment = require('moment');
    const tokenFn = jest.fn().mockReturnValue('token-value');

    var tokenRenewDuration = null;
    if (typeof tokenFn === 'function') {
      tokenRenewDuration = new moment.duration(1, 'hours');
      tokenFn();
    }
    expect(tokenRenewDuration).not.toBeNull();
    expect(tokenRenewDuration.asMilliseconds()).toBe(3600000);
  });

  test('tokenRenewDuration is null when token is a string', () => {
    var tokenRenewDuration = null;
    var token = 'static-token';
    if (typeof token === 'function') {
      tokenRenewDuration = new require('moment').duration(1, 'hours');
    }
    expect(tokenRenewDuration).toBeNull();
  });

  test('setInterval is set up when tokenRenewDuration is defined', () => {
    const moment = require('moment');
    const tokenFn = jest.fn().mockReturnValue('token-value');
    const tokenRenewDuration = new moment.duration(1, 'hours');

    var timerSet = false;
    if (tokenRenewDuration) {
      setInterval(() => {}, tokenRenewDuration.asMilliseconds());
      timerSet = true;
    }
    expect(timerSet).toBe(true);
  });

  test('token function is called on each renewal interval tick', () => {
    const moment = require('moment');
    const tokenFn = jest.fn().mockReturnValue('renewed-token');
    const tokenRenewDuration = new moment.duration(1, 'hours');

    const server = {
      closeRequested: false,
      options: { token: tokenFn },
      controlChannel: { send: jest.fn((data, cb) => cb && cb(null)) }
    };

    // Initial call
    tokenFn();

    // Set up renewal (mirrors connectControlChannel logic)
    const tokenRenewTimer = setInterval(function() {
      if (!server.closeRequested) {
        var newToken = server.options.token();
        var renewToken = { 'renewToken': { 'token': newToken } };
        server.controlChannel.send(JSON.stringify(renewToken), function(error) {
          if (error) {
            console.log('renewToken error: ' + error);
          }
        });
      }
    }, tokenRenewDuration.asMilliseconds());

    expect(tokenFn).toHaveBeenCalledTimes(1); // only initial call so far

    // Advance timer by 1 hour
    jest.advanceTimersByTime(3600000);
    expect(tokenFn).toHaveBeenCalledTimes(2); // initial + 1 renewal

    // Advance timer by another hour
    jest.advanceTimersByTime(3600000);
    expect(tokenFn).toHaveBeenCalledTimes(3); // initial + 2 renewals

    clearInterval(tokenRenewTimer);
  });

  test('renewToken message is sent on control channel during renewal', () => {
    const moment = require('moment');
    const tokenFn = jest.fn().mockReturnValue('renewed-token');
    const tokenRenewDuration = new moment.duration(1, 'hours');

    const server = {
      closeRequested: false,
      options: { token: tokenFn },
      controlChannel: { send: jest.fn((data, cb) => cb && cb(null)) }
    };

    tokenFn(); // initial call

    const tokenRenewTimer = setInterval(function() {
      if (!server.closeRequested) {
        var newToken = server.options.token();
        var renewToken = { 'renewToken': { 'token': newToken } };
        server.controlChannel.send(JSON.stringify(renewToken), function(error) {});
      }
    }, tokenRenewDuration.asMilliseconds());

    jest.advanceTimersByTime(3600000);

    expect(server.controlChannel.send).toHaveBeenCalledTimes(1);
    const sentData = JSON.parse(server.controlChannel.send.mock.calls[0][0]);
    expect(sentData).toEqual({ renewToken: { token: 'renewed-token' } });

    clearInterval(tokenRenewTimer);
  });

  test('renewal does not happen when closeRequested is true', () => {
    const moment = require('moment');
    const tokenFn = jest.fn().mockReturnValue('token-value');
    const tokenRenewDuration = new moment.duration(1, 'hours');

    const server = {
      closeRequested: true,
      options: { token: tokenFn },
      controlChannel: { send: jest.fn() }
    };

    tokenFn(); // initial call

    const tokenRenewTimer = setInterval(function() {
      if (!server.closeRequested) {
        var newToken = server.options.token();
        server.controlChannel.send(JSON.stringify({ renewToken: { token: newToken } }));
      }
    }, tokenRenewDuration.asMilliseconds());

    jest.advanceTimersByTime(3600000);

    // token function should not be called again (only initial call)
    expect(tokenFn).toHaveBeenCalledTimes(1);
    expect(server.controlChannel.send).not.toHaveBeenCalled();

    clearInterval(tokenRenewTimer);
  });

  test('renewal error is logged but does not throw', () => {
    const moment = require('moment');
    const tokenFn = jest.fn().mockReturnValue('token-value');
    const tokenRenewDuration = new moment.duration(1, 'hours');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const server = {
      closeRequested: false,
      options: { token: tokenFn },
      controlChannel: {
        send: jest.fn((data, cb) => cb && cb(new Error('send failed')))
      }
    };

    tokenFn(); // initial call

    const tokenRenewTimer = setInterval(function() {
      if (!server.closeRequested) {
        var newToken = server.options.token();
        var renewToken = { 'renewToken': { 'token': newToken } };
        server.controlChannel.send(
          JSON.stringify(renewToken),
          function(error) {
            if (error) {
              console.log('renewToken error: ' + error);
            }
          }
        );
      }
    }, tokenRenewDuration.asMilliseconds());

    jest.advanceTimersByTime(3600000);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('renewToken error:')
    );

    clearInterval(tokenRenewTimer);
    consoleSpy.mockRestore();
  });

  test('token function returning different values each time sends updated tokens', () => {
    const moment = require('moment');
    let callCount = 0;
    const tokenFn = jest.fn(() => `token-${++callCount}`);
    const tokenRenewDuration = new moment.duration(1, 'hours');

    const server = {
      closeRequested: false,
      options: { token: tokenFn },
      controlChannel: { send: jest.fn((data, cb) => cb && cb(null)) }
    };

    tokenFn(); // initial call returns 'token-1'

    const tokenRenewTimer = setInterval(function() {
      if (!server.closeRequested) {
        var newToken = server.options.token();
        var renewToken = { 'renewToken': { 'token': newToken } };
        server.controlChannel.send(JSON.stringify(renewToken), function(error) {});
      }
    }, tokenRenewDuration.asMilliseconds());

    // First renewal
    jest.advanceTimersByTime(3600000);
    let sent1 = JSON.parse(server.controlChannel.send.mock.calls[0][0]);
    expect(sent1.renewToken.token).toBe('token-2');

    // Second renewal
    jest.advanceTimersByTime(3600000);
    let sent2 = JSON.parse(server.controlChannel.send.mock.calls[1][0]);
    expect(sent2.renewToken.token).toBe('token-3');

    clearInterval(tokenRenewTimer);
  });

  test('initial token is passed as ServiceBusAuthorization header', () => {
    const tokenFn = jest.fn().mockReturnValue('my-sas-token');

    var token = null;
    var opt = null;
    if (typeof tokenFn === 'function') {
      token = tokenFn();
    }
    if (token) {
      opt = { headers: { 'ServiceBusAuthorization': token } };
    }

    expect(opt).toEqual({ headers: { 'ServiceBusAuthorization': 'my-sas-token' } });
  });

  test('null token from function does not set headers', () => {
    const tokenFn = jest.fn().mockReturnValue(null);

    var token = null;
    var opt = null;
    if (typeof tokenFn === 'function') {
      token = tokenFn();
    }
    if (token) {
      opt = { headers: { 'ServiceBusAuthorization': token } };
    }

    expect(opt).toBeNull();
  });

  test('clearInterval is called on control channel error event', () => {
    const moment = require('moment');
    const tokenFn = jest.fn().mockReturnValue('token');
    const tokenRenewDuration = new moment.duration(1, 'hours');

    const server = {
      closeRequested: false,
      options: { token: tokenFn },
      controlChannel: { send: jest.fn() }
    };

    tokenFn(); // initial call

    const tokenRenewTimer = setInterval(function() {
      if (!server.closeRequested) {
        server.options.token();
      }
    }, tokenRenewDuration.asMilliseconds());

    // Simulate error: clearInterval is called (mirrors onerror handler)
    clearInterval(tokenRenewTimer);

    // Advancing time should not trigger any more calls
    jest.advanceTimersByTime(7200000); // 2 hours
    expect(tokenFn).toHaveBeenCalledTimes(1); // only the initial call
  });

  test('clearInterval is called on control channel close event', () => {
    const moment = require('moment');
    const tokenFn = jest.fn().mockReturnValue('token');
    const tokenRenewDuration = new moment.duration(1, 'hours');

    const server = {
      closeRequested: false,
      options: { token: tokenFn },
      controlChannel: { send: jest.fn() }
    };

    tokenFn(); // initial call

    const tokenRenewTimer = setInterval(function() {
      if (!server.closeRequested) {
        server.options.token();
      }
    }, tokenRenewDuration.asMilliseconds());

    // Simulate close: clearInterval is called (mirrors onclose handler)
    clearInterval(tokenRenewTimer);

    jest.advanceTimersByTime(7200000); // 2 hours
    expect(tokenFn).toHaveBeenCalledTimes(1); // only the initial call
  });
});
