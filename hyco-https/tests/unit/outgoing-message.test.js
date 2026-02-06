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
  });
});
