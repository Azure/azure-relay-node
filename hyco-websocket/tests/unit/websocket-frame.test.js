/**
 * Unit tests for WebSocketFrame serialization.
 * Migrated from hyco-websocket/test/unit/websocketFrame.js (Tape → Jest).
 */

var WebSocketFrame = require('websocket/lib/WebSocketFrame');

describe('WebSocketFrame', () => {
  test('Serializing a WebSocket frame with no data should produce correct bytes', () => {
    // WebSocketFrame uses a per-connection buffer for the mask bytes
    // and the frame header to avoid allocating tons of small chunks of RAM.
    var maskBytesBuffer = Buffer.alloc(4);
    var frameHeaderBuffer = Buffer.alloc(10);

    var frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, {});
    frame.fin = true;
    frame.mask = true;
    frame.opcode = 0x09; // WebSocketFrame.PING

    var frameBytes;
    expect(() => { frameBytes = frame.toBuffer(true); }).not.toThrow();
    expect(frameBytes.equals(Buffer.from('898000000000', 'hex'))).toBe(true);
  });
});
