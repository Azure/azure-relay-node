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

  describe('ERR_HTTP_HEADERS_SENT after writeHead() or body writes', () => {
    test('setHeader() after writeHead() throws ERR_HTTP_HEADERS_SENT', () => {
      const res = createResponse();
      res.writeHead(200);
      expect(() => res.setHeader('X-Late', 'value')).toThrow(/Cannot set headers after they are sent to the client/);
    });

    test('removeHeader() after writeHead() throws ERR_HTTP_HEADERS_SENT', () => {
      const res = createResponse();
      res.setHeader('X-Test', 'value');
      res.writeHead(200);
      expect(() => res.removeHeader('X-Test')).toThrow(/Cannot remove headers after they are sent to the client/);
    });

    test('setHeader() after writeHead() throws Error with code ERR_HTTP_HEADERS_SENT', () => {
      const res = createResponse();
      res.writeHead(200);
      try {
        res.setHeader('X-Late', 'value');
        expect(true).toBe(false); // should not reach here
      } catch (e) {
        expect(e.code).toBe('ERR_HTTP_HEADERS_SENT');
      }
    });

    test('removeHeader() after writeHead() throws Error with code ERR_HTTP_HEADERS_SENT', () => {
      const res = createResponse();
      res.setHeader('X-Existing', 'val');
      res.writeHead(200);
      try {
        res.removeHeader('X-Existing');
        expect(true).toBe(false); // should not reach here
      } catch (e) {
        expect(e.code).toBe('ERR_HTTP_HEADERS_SENT');
      }
    });

    test('headersSent is true after writeHead()', () => {
      const res = createResponse();
      expect(res.headersSent).toBe(false);
      res.writeHead(200);
      expect(res.headersSent).toBe(true);
    });

    test('setHeader() before writeHead() does not throw', () => {
      const res = createResponse();
      expect(() => res.setHeader('X-Before', 'value')).not.toThrow();
    });

    test('removeHeader() before writeHead() does not throw', () => {
      const res = createResponse();
      res.setHeader('X-Before', 'value');
      expect(() => res.removeHeader('X-Before')).not.toThrow();
    });
  });

  describe('write()', () => {
    test('write() with a string argument buffers the data', () => {
      const res = createResponse();
      res.writeHead(200);
      res.write('hello world');
      // Data is buffered in output array (preamble JSON + data)
      expect(res.output.length).toBeGreaterThanOrEqual(1);
      const hasStringData = res.output.some(item => item === 'hello world');
      expect(hasStringData).toBe(true);
    });

    test('write() with a Buffer argument buffers the data', () => {
      const res = createResponse();
      res.writeHead(200);
      const buf = Buffer.from('buffer data');
      res.write(buf);
      expect(res.output.length).toBeGreaterThanOrEqual(1);
      const hasBufferData = res.output.some(item =>
        Buffer.isBuffer(item) && item.equals(buf)
      );
      expect(hasBufferData).toBe(true);
    });

    test('write() with string and encoding argument buffers the data', () => {
      const res = createResponse();
      res.writeHead(200);
      res.write('encoded text', 'utf8');
      expect(res.output.length).toBeGreaterThanOrEqual(1);
      const hasData = res.output.some(item => item === 'encoded text');
      expect(hasData).toBe(true);
    });

    test('write() calls _implicitHeader() if writeHead() was not called', () => {
      const res = createResponse();
      // write() without calling writeHead() first should trigger _implicitHeader
      res.write('auto-header');
      expect(res.statusCode).toBe(200);
      expect(res._headerSent).toBe(true);
    });

    test('write() throws ERR_INVALID_ARG_TYPE for non-string non-Buffer chunk', () => {
      const res = createResponse();
      res.writeHead(200);
      expect(() => res.write(12345)).toThrow(/first argument/);
    });

    test('write() returns true for empty string (no-op)', () => {
      const res = createResponse();
      res.writeHead(200);
      const ret = res.write('');
      expect(ret).toBe(true);
    });

    test('write() returns true for empty Buffer (no-op)', () => {
      const res = createResponse();
      res.writeHead(200);
      const ret = res.write(Buffer.alloc(0));
      expect(ret).toBe(true);
    });
  });

  describe('end()', () => {
    // Helper: stub _assignSocket to avoid real WebSocket connection attempts
    function stubSocket(res) {
      res._assignSocket = function() {};
    }

    test('end() with no arguments marks response as finished', () => {
      const res = createResponse();
      stubSocket(res);
      expect(res.finished).toBe(false);
      res.end();
      expect(res.finished).toBe(true);
    });

    test('end() returns the response object (this)', () => {
      const res = createResponse();
      stubSocket(res);
      const ret = res.end();
      expect(ret).toBe(res);
    });

    test('end() with no arguments calls _implicitHeader if writeHead() not called', () => {
      const res = createResponse();
      stubSocket(res);
      res.end();
      // _implicitHeader calls writeHead(200), so statusCode should be 200 and _headerSent true
      expect(res.statusCode).toBe(200);
      expect(res._headerSent).toBe(true);
    });

    test('end(chunk) writes the chunk and marks response as finished', () => {
      const res = createResponse();
      stubSocket(res);
      res.writeHead(200);
      res.end('final chunk');
      expect(res.finished).toBe(true);
      expect(res._hasBody).toBe(true);
      const hasChunkData = res.output.some(item => item === 'final chunk');
      expect(hasChunkData).toBe(true);
    });

    test('end(chunk) with Buffer writes the Buffer and marks response as finished', () => {
      const res = createResponse();
      stubSocket(res);
      res.writeHead(200);
      const buf = Buffer.from('buffer end');
      res.end(buf);
      expect(res.finished).toBe(true);
      expect(res._hasBody).toBe(true);
    });

    test('end(chunk, encoding) applies encoding and marks response as finished', () => {
      const res = createResponse();
      stubSocket(res);
      res.writeHead(200);
      res.end('encoded end', 'utf8');
      expect(res.finished).toBe(true);
      expect(res._hasBody).toBe(true);
    });

    test('end(callback) registers callback on finish event when chunk is a function', () => {
      const res = createResponse();
      stubSocket(res);
      const cb = jest.fn();
      res.end(cb);
      expect(res.finished).toBe(true);
      // callback is registered as a 'finish' listener
      expect(res.listenerCount('finish')).toBe(1);
    });

    test('end(chunk, callback) writes chunk and registers callback', () => {
      const res = createResponse();
      stubSocket(res);
      res.writeHead(200);
      const cb = jest.fn();
      res.end('data', cb);
      expect(res.finished).toBe(true);
      expect(res.listenerCount('finish')).toBe(1);
    });

    test('end(chunk, encoding, callback) writes chunk with encoding and registers callback', () => {
      const res = createResponse();
      stubSocket(res);
      res.writeHead(200);
      const cb = jest.fn();
      res.end('data', 'utf8', cb);
      expect(res.finished).toBe(true);
      expect(res.listenerCount('finish')).toBe(1);
    });

    test('end() is a no-op when called after response is already finished', () => {
      const res = createResponse();
      stubSocket(res);
      res.end();
      expect(res.finished).toBe(true);
      // Calling end() again should return this without error
      const ret = res.end();
      expect(ret).toBe(res);
    });

    test('end() throws ERR_INVALID_ARG_TYPE if chunk is not string or Buffer', () => {
      const res = createResponse();
      stubSocket(res);
      res.writeHead(200);
      expect(() => res.end(12345)).toThrow(/chunk/);
    });
  });

  describe('pipe()', () => {
    test('pipe() emits an error event (disabled operation)', (done) => {
      const res = createResponse();
      res.on('error', (err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toMatch(/Cannot pipe/);
        expect(err.code).toBe('ERR_STREAM_CANNOT_PIPE');
        done();
      });
      res.pipe(process.stdout);
    });
  });

  describe('setTimeout()', () => {
    test('setTimeout() returns this for chaining', () => {
      const res = createResponse();
      const ret = res.setTimeout(1000);
      expect(ret).toBe(res);
    });

    test('setTimeout() registers callback on timeout event', () => {
      const res = createResponse();
      const cb = jest.fn();
      res.setTimeout(1000, cb);
      expect(res.listenerCount('timeout')).toBe(1);
      res.emit('timeout');
      expect(cb).toHaveBeenCalledTimes(1);
    });

    test('setTimeout() without callback does not add timeout listener', () => {
      const res = createResponse();
      res.setTimeout(1000);
      expect(res.listenerCount('timeout')).toBe(0);
    });

    test('setTimeout() calls socket.setTimeout when socket is already assigned', () => {
      const res = createResponse();
      const mockSocket = { setTimeout: jest.fn() };
      res.socket = mockSocket;
      res.setTimeout(5000);
      expect(mockSocket.setTimeout).toHaveBeenCalledWith(5000);
    });

    test('setTimeout() defers socket.setTimeout via once("socket") when no socket yet', () => {
      const res = createResponse();
      res.setTimeout(3000);
      // No socket yet, so a 'socket' listener should be queued
      expect(res.listenerCount('socket')).toBe(1);
      // Emit socket event with a mock
      const mockSocket = { setTimeout: jest.fn() };
      res.emit('socket', mockSocket);
      expect(mockSocket.setTimeout).toHaveBeenCalledWith(3000);
    });
  });

  describe('flushHeaders()', () => {
    test('flushHeaders() calls _implicitHeader if headers not yet sent', () => {
      const res = createResponse();
      // Before flushHeaders, _header should be falsy
      expect(res._header).toBeFalsy();
      res.flushHeaders();
      // After flushHeaders, _header should be truthy (headers have been stored)
      expect(res._header).toBeTruthy();
    });

    test('flushHeaders() sets headersSent to true', () => {
      const res = createResponse();
      expect(res.headersSent).toBe(false);
      res.flushHeaders();
      expect(res.headersSent).toBe(true);
    });

    test('flushHeaders() does not call _implicitHeader if headers already sent', () => {
      const res = createResponse();
      res.writeHead(200);
      const spy = jest.spyOn(res, '_implicitHeader');
      res.flushHeaders();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    test('flush() is an alias for flushHeaders()', () => {
      const res = createResponse();
      expect(res.flush).toBeDefined();
      res.flush();
      expect(res.headersSent).toBe(true);
    });
  });

  describe('writeContinue()', () => {
    test('writeContinue() sets _sent100 to true', () => {
      const res = createResponse();
      expect(res._sent100).toBe(false);
      res.writeContinue();
      expect(res._sent100).toBe(true);
    });

    test('writeContinue() accepts a callback parameter without throwing', () => {
      const res = createResponse();
      expect(() => res.writeContinue(() => {})).not.toThrow();
      expect(res._sent100).toBe(true);
    });
  });

  describe('writeProcessing()', () => {
    test('writeProcessing() accepts a callback parameter without throwing', () => {
      const res = createResponse();
      expect(() => res.writeProcessing(() => {})).not.toThrow();
    });

    test('writeProcessing() can be called multiple times without error', () => {
      const res = createResponse();
      expect(() => {
        res.writeProcessing();
        res.writeProcessing();
        res.writeProcessing();
      }).not.toThrow();
    });
  });
});
