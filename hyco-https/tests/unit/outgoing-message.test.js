/**
 * Unit tests for hyco-https OutgoingMessage and ServerResponse classes.
 * Tests writeHead(), setHeader/getHeader/hasHeader/removeHeader, and related methods.
 */

'use strict';

const { ServerResponse } = require('../../lib/HybridConnectionHttpsServer');

// Helper to create a ServerResponse with a mock request
function createResponse(method) {
  const req = { method: method || 'GET' };
  return new ServerResponse(req);
}

describe('hyco-https ServerResponse', () => {

  describe('writeHead()', () => {
    test('writeHead() sets status code correctly', () => {
      const res = createResponse();
      res.writeHead(200);
      expect(res.statusCode).toBe(200);
    });

    test('writeHead() sets status code 201', () => {
      const res = createResponse();
      res.writeHead(201);
      expect(res.statusCode).toBe(201);
    });

    test('writeHead() sets status code 404', () => {
      const res = createResponse();
      res.writeHead(404);
      expect(res.statusCode).toBe(404);
    });

    test('writeHead() sets status message from STATUS_CODES map', () => {
      const res = createResponse();
      res.writeHead(200);
      expect(res.statusMessage).toBe('OK');
    });

    test('writeHead() sets status message for 404', () => {
      const res = createResponse();
      res.writeHead(404);
      expect(res.statusMessage).toBe('Not Found');
    });

    test('writeHead() sets custom reason phrase', () => {
      const res = createResponse();
      res.writeHead(200, 'Custom Reason');
      expect(res.statusMessage).toBe('Custom Reason');
    });

    test('writeHead() sets headers passed as object', () => {
      const res = createResponse();
      res.writeHead(200, { 'Content-Type': 'text/plain', 'X-Custom': 'value' });
      expect(res.getHeader('Content-Type')).toBe('text/plain');
      expect(res.getHeader('X-Custom')).toBe('value');
    });

    test('writeHead() sets headers when reason and headers both provided', () => {
      const res = createResponse();
      res.writeHead(200, 'OK', { 'X-Test': 'hello' });
      expect(res.statusMessage).toBe('OK');
      expect(res.getHeader('X-Test')).toBe('hello');
    });

    test('writeHead() uses "unknown" for unrecognized status codes', () => {
      const res = createResponse();
      res.writeHead(299);
      expect(res.statusMessage).toBe('unknown');
    });

    test('writeHead() disables body for 204 No Content', () => {
      const res = createResponse();
      res.writeHead(204);
      expect(res._hasBody).toBe(false);
    });

    test('writeHead() disables body for 304 Not Modified', () => {
      const res = createResponse();
      res.writeHead(304);
      expect(res._hasBody).toBe(false);
    });

    test('writeHead() disables body for 1xx informational responses', () => {
      const res = createResponse();
      res.writeHead(100);
      expect(res._hasBody).toBe(false);
    });

    test('writeHead() preserves existing headers set via setHeader()', () => {
      const res = createResponse();
      res.setHeader('X-Existing', 'existing-value');
      res.writeHead(200, { 'X-New': 'new-value' });
      expect(res.getHeader('X-Existing')).toBe('existing-value');
      expect(res.getHeader('X-New')).toBe('new-value');
    });

    test('writeHead() throws ERR_HTTP_INVALID_STATUS_CODE for status code 0', () => {
      const res = createResponse();
      expect(() => res.writeHead(0)).toThrow(RangeError);
    });

    test('writeHead() throws ERR_HTTP_INVALID_STATUS_CODE for status code 99', () => {
      const res = createResponse();
      expect(() => res.writeHead(99)).toThrow(RangeError);
    });

    test('writeHead() throws ERR_HTTP_INVALID_STATUS_CODE for status code 1000', () => {
      const res = createResponse();
      expect(() => res.writeHead(1000)).toThrow(RangeError);
    });

    test('writeHead() throws ERR_HTTP_INVALID_STATUS_CODE for negative status code', () => {
      const res = createResponse();
      expect(() => res.writeHead(-1)).toThrow(RangeError);
    });

    test('writeHead() does not throw for boundary status code 100', () => {
      const res = createResponse();
      expect(() => res.writeHead(100)).not.toThrow();
    });

    test('writeHead() does not throw for boundary status code 999', () => {
      const res = createResponse();
      expect(() => res.writeHead(999)).not.toThrow();
    });
  });

  describe('setHeader/getHeader/hasHeader/removeHeader', () => {
    test('setHeader() stores a header retrievable by getHeader()', () => {
      const res = createResponse();
      res.setHeader('X-Test', 'value');
      expect(res.getHeader('X-Test')).toBe('value');
    });

    test('getHeader() is case-insensitive', () => {
      const res = createResponse();
      res.setHeader('X-Custom-Header', 'hello');
      expect(res.getHeader('x-custom-header')).toBe('hello');
      expect(res.getHeader('X-CUSTOM-HEADER')).toBe('hello');
    });

    test('hasHeader() returns true for a set header', () => {
      const res = createResponse();
      res.setHeader('X-Test', 'value');
      expect(res.hasHeader('X-Test')).toBe(true);
    });

    test('hasHeader() returns false for a header that was not set', () => {
      const res = createResponse();
      expect(res.hasHeader('X-Missing')).toBe(false);
    });

    test('hasHeader() is case-insensitive', () => {
      const res = createResponse();
      res.setHeader('X-Test', 'value');
      expect(res.hasHeader('x-test')).toBe(true);
      expect(res.hasHeader('X-TEST')).toBe(true);
    });

    test('removeHeader() removes a previously set header', () => {
      const res = createResponse();
      res.setHeader('X-Test', 'value');
      expect(res.hasHeader('X-Test')).toBe(true);
      res.removeHeader('X-Test');
      expect(res.hasHeader('X-Test')).toBe(false);
      expect(res.getHeader('X-Test')).toBeUndefined();
    });

    test('removeHeader() is case-insensitive', () => {
      const res = createResponse();
      res.setHeader('X-Test', 'value');
      res.removeHeader('x-test');
      expect(res.hasHeader('X-Test')).toBe(false);
    });

    test('setHeader() overwrites existing header value', () => {
      const res = createResponse();
      res.setHeader('X-Test', 'old');
      res.setHeader('X-Test', 'new');
      expect(res.getHeader('X-Test')).toBe('new');
    });

    test('setHeader() supports array values', () => {
      const res = createResponse();
      res.setHeader('Set-Cookie', ['a=1', 'b=2']);
      expect(res.getHeader('Set-Cookie')).toEqual(['a=1', 'b=2']);
    });

    test('getHeader() returns undefined for unset header', () => {
      const res = createResponse();
      expect(res.getHeader('X-Missing')).toBeUndefined();
    });

    test('multiple headers can be set and retrieved independently', () => {
      const res = createResponse();
      res.setHeader('X-One', '1');
      res.setHeader('X-Two', '2');
      res.setHeader('X-Three', '3');
      expect(res.getHeader('X-One')).toBe('1');
      expect(res.getHeader('X-Two')).toBe('2');
      expect(res.getHeader('X-Three')).toBe('3');
    });

    test('removeHeader() does not affect other headers', () => {
      const res = createResponse();
      res.setHeader('X-Keep', 'keep');
      res.setHeader('X-Remove', 'remove');
      res.removeHeader('X-Remove');
      expect(res.getHeader('X-Keep')).toBe('keep');
      expect(res.hasHeader('X-Remove')).toBe(false);
    });
  });

  describe('getHeaders() and getHeaderNames()', () => {
    test('getHeaders() returns all set headers keyed by lowercase name', () => {
      const res = createResponse();
      res.setHeader('X-One', 'value1');
      res.setHeader('X-Two', 'value2');
      const headers = res.getHeaders();
      expect(headers['x-one']).toBe('value1');
      expect(headers['x-two']).toBe('value2');
    });

    test('getHeaders() returns empty object when no headers are set', () => {
      const res = createResponse();
      const headers = res.getHeaders();
      expect(Object.keys(headers).length).toBe(0);
    });

    test('getHeaders() returns a copy (modifying result does not affect response)', () => {
      const res = createResponse();
      res.setHeader('X-Test', 'original');
      const headers = res.getHeaders();
      headers['x-test'] = 'modified';
      expect(res.getHeader('X-Test')).toBe('original');
    });

    test('getHeaders() includes array-valued headers', () => {
      const res = createResponse();
      res.setHeader('Set-Cookie', ['a=1', 'b=2']);
      const headers = res.getHeaders();
      expect(headers['set-cookie']).toEqual(['a=1', 'b=2']);
    });

    test('getHeaderNames() returns lowercase header names', () => {
      const res = createResponse();
      res.setHeader('X-Mixed-Case', 'value1');
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('X-ALL-UPPER', 'value2');
      const names = res.getHeaderNames();
      expect(names).toContain('x-mixed-case');
      expect(names).toContain('content-type');
      expect(names).toContain('x-all-upper');
      // Ensure no original-case names leak through
      expect(names).not.toContain('X-Mixed-Case');
      expect(names).not.toContain('Content-Type');
      expect(names).not.toContain('X-ALL-UPPER');
    });

    test('getHeaderNames() returns empty array when no headers are set', () => {
      const res = createResponse();
      const names = res.getHeaderNames();
      expect(names).toEqual([]);
    });

    test('getHeaderNames() reflects headers added and removed', () => {
      const res = createResponse();
      res.setHeader('X-Keep', 'keep');
      res.setHeader('X-Remove', 'remove');
      res.removeHeader('X-Remove');
      const names = res.getHeaderNames();
      expect(names).toContain('x-keep');
      expect(names).not.toContain('x-remove');
    });
  });
});
