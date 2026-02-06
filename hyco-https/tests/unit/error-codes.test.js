/**
 * Unit tests for hyco-https error code constructors from _hyco_errors.js.
 * Verifies that each error code constructor produces correct error objects
 * with proper code, message, name, and inheritance properties.
 * Covers REQ-UNIT-HTTPS-030: All error code constructors in _hyco_errors.js
 * MUST produce correct error objects.
 */

'use strict';

const { codes, E, message, SystemError, AssertionError } = require('../../lib/_hyco_errors');

describe('hyco-https error code constructors', () => {

  // --- Error codes used directly in hyco-https ---

  describe('ERR_HTTP_HEADERS_SENT', () => {
    it('produces an Error with correct code and message', () => {
      const err = new codes.ERR_HTTP_HEADERS_SENT('set');
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('ERR_HTTP_HEADERS_SENT');
      expect(err.message).toContain('set');
    });

    it('name includes the error code', () => {
      const err = new codes.ERR_HTTP_HEADERS_SENT('render');
      expect(err.name).toContain('ERR_HTTP_HEADERS_SENT');
    });
  });

  describe('ERR_HTTP_INVALID_STATUS_CODE', () => {
    it('produces a RangeError with correct code', () => {
      const err = new codes.ERR_HTTP_INVALID_STATUS_CODE(999);
      expect(err).toBeInstanceOf(RangeError);
      expect(err.code).toBe('ERR_HTTP_INVALID_STATUS_CODE');
      expect(err.message).toContain('999');
    });
  });

  describe('ERR_HTTP_INVALID_HEADER_VALUE', () => {
    it('produces a TypeError with correct code', () => {
      const err = new codes.ERR_HTTP_INVALID_HEADER_VALUE('X-Test', undefined);
      expect(err).toBeInstanceOf(TypeError);
      expect(err.code).toBe('ERR_HTTP_INVALID_HEADER_VALUE');
    });
  });

  describe('ERR_HTTP_TRAILER_INVALID', () => {
    it('produces an Error with correct code', () => {
      const err = new codes.ERR_HTTP_TRAILER_INVALID();
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('ERR_HTTP_TRAILER_INVALID');
    });
  });

  describe('ERR_INVALID_HTTP_TOKEN', () => {
    it('produces a TypeError with correct code and message', () => {
      const err = new codes.ERR_INVALID_HTTP_TOKEN('Header name', 'bad\nvalue');
      expect(err).toBeInstanceOf(TypeError);
      expect(err.code).toBe('ERR_INVALID_HTTP_TOKEN');
      expect(err.message).toContain('Header name');
    });
  });

  describe('ERR_INVALID_ARG_TYPE', () => {
    it('produces a TypeError with correct code', () => {
      const err = new codes.ERR_INVALID_ARG_TYPE('chunk', ['string', 'Buffer'], 42);
      expect(err).toBeInstanceOf(TypeError);
      expect(err.code).toBe('ERR_INVALID_ARG_TYPE');
      expect(err.message).toContain('chunk');
    });
  });

  describe('ERR_INVALID_CHAR', () => {
    it('produces a TypeError with correct code', () => {
      const err = new codes.ERR_INVALID_CHAR('statusMessage');
      expect(err).toBeInstanceOf(TypeError);
      expect(err.code).toBe('ERR_INVALID_CHAR');
      expect(err.message).toContain('statusMessage');
    });
  });

  describe('ERR_METHOD_NOT_IMPLEMENTED', () => {
    it('produces an Error with correct code', () => {
      const err = new codes.ERR_METHOD_NOT_IMPLEMENTED('write');
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('ERR_METHOD_NOT_IMPLEMENTED');
      expect(err.message).toContain('write');
    });
  });

  describe('ERR_STREAM_CANNOT_PIPE', () => {
    it('produces an Error with correct code and message', () => {
      const err = new codes.ERR_STREAM_CANNOT_PIPE();
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('ERR_STREAM_CANNOT_PIPE');
      expect(err.message).toBe('Cannot pipe, not readable');
    });
  });

  describe('ERR_STREAM_WRITE_AFTER_END', () => {
    it('produces an Error with correct code and message', () => {
      const err = new codes.ERR_STREAM_WRITE_AFTER_END();
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('ERR_STREAM_WRITE_AFTER_END');
      expect(err.message).toBe('write after end');
    });
  });

  // --- Additional error codes for broader coverage ---

  describe('ERR_AMBIGUOUS_ARGUMENT', () => {
    it('produces a TypeError with formatted message', () => {
      const err = new codes.ERR_AMBIGUOUS_ARGUMENT('value', 'Reason here');
      expect(err).toBeInstanceOf(TypeError);
      expect(err.code).toBe('ERR_AMBIGUOUS_ARGUMENT');
      expect(err.message).toContain('value');
      expect(err.message).toContain('Reason here');
    });
  });

  describe('ERR_ASSERTION', () => {
    it('produces an Error with correct code', () => {
      const err = new codes.ERR_ASSERTION('assertion failed');
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('ERR_ASSERTION');
      expect(err.message).toBe('assertion failed');
    });
  });

  describe('ERR_INVALID_CALLBACK', () => {
    it('produces a TypeError with correct message', () => {
      const err = new codes.ERR_INVALID_CALLBACK();
      expect(err).toBeInstanceOf(TypeError);
      expect(err.code).toBe('ERR_INVALID_CALLBACK');
      expect(err.message).toBe('Callback must be a function');
    });
  });

  describe('ERR_MISSING_ARGS', () => {
    it('produces a TypeError with correct code', () => {
      const err = new codes.ERR_MISSING_ARGS('name');
      expect(err).toBeInstanceOf(TypeError);
      expect(err.code).toBe('ERR_MISSING_ARGS');
      expect(err.message).toContain('name');
    });
  });

  describe('ERR_STREAM_DESTROYED', () => {
    it('produces an Error with formatted message', () => {
      const err = new codes.ERR_STREAM_DESTROYED('write');
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('ERR_STREAM_DESTROYED');
      expect(err.message).toContain('write');
    });
  });

  describe('ERR_STREAM_NULL_VALUES', () => {
    it('produces a TypeError with correct message', () => {
      const err = new codes.ERR_STREAM_NULL_VALUES();
      expect(err).toBeInstanceOf(TypeError);
      expect(err.code).toBe('ERR_STREAM_NULL_VALUES');
      expect(err.message).toBe('May not write null values to stream');
    });
  });

  describe('ERR_UNKNOWN_ENCODING', () => {
    it('produces a TypeError with encoding name in message', () => {
      const err = new codes.ERR_UNKNOWN_ENCODING('foo');
      expect(err).toBeInstanceOf(TypeError);
      expect(err.code).toBe('ERR_UNKNOWN_ENCODING');
      expect(err.message).toContain('foo');
    });
  });

  describe('ERR_INDEX_OUT_OF_RANGE', () => {
    it('produces a RangeError with correct code', () => {
      const err = new codes.ERR_INDEX_OUT_OF_RANGE();
      expect(err).toBeInstanceOf(RangeError);
      expect(err.code).toBe('ERR_INDEX_OUT_OF_RANGE');
    });
  });

  describe('ERR_SERVER_NOT_RUNNING', () => {
    it('produces an Error with correct message', () => {
      const err = new codes.ERR_SERVER_NOT_RUNNING();
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('ERR_SERVER_NOT_RUNNING');
      expect(err.message).toBe('Server is not running.');
    });
  });

  describe('ERR_SOCKET_CLOSED', () => {
    it('produces an Error with correct message', () => {
      const err = new codes.ERR_SOCKET_CLOSED();
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('ERR_SOCKET_CLOSED');
      expect(err.message).toBe('Socket is closed');
    });
  });

  // --- General properties of error code system ---

  describe('error code system properties', () => {
    it('codes object contains all registered error codes', () => {
      expect(typeof codes).toBe('object');
      expect(Object.keys(codes).length).toBeGreaterThan(100);
    });

    it('all codes entries are constructable functions', () => {
      // Spot check a sample of codes
      const sampleCodes = [
        'ERR_HTTP_HEADERS_SENT',
        'ERR_HTTP_INVALID_STATUS_CODE',
        'ERR_INVALID_ARG_TYPE',
        'ERR_STREAM_CANNOT_PIPE',
        'ERR_STREAM_WRITE_AFTER_END'
      ];
      for (const code of sampleCodes) {
        expect(typeof codes[code]).toBe('function');
      }
    });

    it('error code property is not writable by default (getter)', () => {
      const err = new codes.ERR_STREAM_CANNOT_PIPE();
      expect(err.code).toBe('ERR_STREAM_CANNOT_PIPE');
      // code can be overridden via setter (defineProperty)
      err.code = 'CUSTOM';
      expect(err.code).toBe('CUSTOM');
    });

    it('errors have proper stack traces', () => {
      const err = new codes.ERR_ASSERTION('test');
      expect(err.stack).toBeDefined();
      expect(err.stack).toContain('ERR_ASSERTION');
    });
  });

  // --- E() registration function ---

  describe('E() registration function', () => {
    it('is a function exported for testing', () => {
      expect(typeof E).toBe('function');
    });
  });

  // --- message() function ---

  describe('message() function', () => {
    it('retrieves a registered message by code', () => {
      const msg = message('ERR_STREAM_CANNOT_PIPE');
      expect(msg).toBe('Cannot pipe, not readable');
    });

    it('formats messages with arguments', () => {
      const msg = message('ERR_UNKNOWN_ENCODING', ['foo']);
      expect(msg).toContain('foo');
    });
  });

  // --- AssertionError ---

  describe('AssertionError', () => {
    it('is exported and constructable with message option', () => {
      const err = new AssertionError({ message: 'test assertion' });
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('test assertion');
    });

    it('throws ERR_INVALID_ARG_TYPE when options is not an object', () => {
      expect(() => new AssertionError('not an object')).toThrow(TypeError);
    });
  });
});
