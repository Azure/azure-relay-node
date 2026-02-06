/**
 * Unit tests for WebSocketFrame serialization.
 * Migrated from hyco-websocket/test/unit/websocketFrame.js (Tape → Jest).
 * Covers FIN flag, OPCODE values, mask bytes, and payload size encoding.
 */

var WebSocketFrame = require('websocket/lib/WebSocketFrame');

function createFrame() {
  var maskBytesBuffer = Buffer.alloc(4);
  var frameHeaderBuffer = Buffer.alloc(10);
  return new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, {});
}

describe('WebSocketFrame', () => {
  test('Serializing a frame with no data should produce correct bytes', () => {
    var frame = createFrame();
    frame.fin = true;
    frame.mask = true;
    frame.opcode = 0x09; // PING

    var frameBytes;
    expect(() => { frameBytes = frame.toBuffer(true); }).not.toThrow();
    expect(frameBytes.equals(Buffer.from('898000000000', 'hex'))).toBe(true);
  });

  describe('FIN flag', () => {
    test('FIN=true sets the high bit of the first byte', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x01; // TEXT
      var buf = frame.toBuffer(true);
      expect(buf[0] & 0x80).toBe(0x80);
    });

    test('FIN=false clears the high bit of the first byte', () => {
      var frame = createFrame();
      frame.fin = false;
      frame.mask = false;
      frame.opcode = 0x01; // TEXT
      var buf = frame.toBuffer(true);
      expect(buf[0] & 0x80).toBe(0x00);
    });

    test('FIN=false with CONTINUATION opcode for fragmented frame', () => {
      var frame = createFrame();
      frame.fin = false;
      frame.mask = false;
      frame.opcode = 0x00; // CONTINUATION
      var buf = frame.toBuffer(true);
      expect(buf[0] & 0x80).toBe(0x00);
      expect(buf[0] & 0x0F).toBe(0x00);
    });
  });

  describe('OPCODE values', () => {
    test('TEXT opcode (0x01) is encoded in low nibble of first byte', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x01;
      var buf = frame.toBuffer(true);
      expect(buf[0] & 0x0F).toBe(0x01);
    });

    test('BINARY opcode (0x02) is encoded correctly', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x02;
      var buf = frame.toBuffer(true);
      expect(buf[0] & 0x0F).toBe(0x02);
    });

    test('CLOSE opcode (0x08) is encoded correctly', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x08;
      frame.closeStatus = 1000;
      var buf = frame.toBuffer(true);
      expect(buf[0] & 0x0F).toBe(0x08);
    });

    test('PING opcode (0x09) is encoded correctly', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x09;
      var buf = frame.toBuffer(true);
      expect(buf[0] & 0x0F).toBe(0x09);
    });

    test('PONG opcode (0x0A) is encoded correctly', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x0A;
      var buf = frame.toBuffer(true);
      expect(buf[0] & 0x0F).toBe(0x0A);
    });

    test('CONTINUATION opcode (0x00) is encoded correctly', () => {
      var frame = createFrame();
      frame.fin = false;
      frame.mask = false;
      frame.opcode = 0x00;
      var buf = frame.toBuffer(true);
      expect(buf[0] & 0x0F).toBe(0x00);
    });

    test('FIN and opcode combine correctly in first byte', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x02; // BINARY
      var buf = frame.toBuffer(true);
      // FIN=1, RSV=000, opcode=0010 → 10000010 → 0x82
      expect(buf[0]).toBe(0x82);
    });
  });

  describe('Mask handling', () => {
    test('mask=true sets the high bit of the second byte', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = true;
      frame.opcode = 0x01;
      var buf = frame.toBuffer(true);
      expect(buf[1] & 0x80).toBe(0x80);
    });

    test('mask=false clears the high bit of the second byte', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x01;
      var buf = frame.toBuffer(true);
      expect(buf[1] & 0x80).toBe(0x00);
    });

    test('mask=true adds 4 mask bytes to the header', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = true;
      frame.opcode = 0x09; // PING, no payload
      var maskedBuf = frame.toBuffer(true);

      var frame2 = createFrame();
      frame2.fin = true;
      frame2.mask = false;
      frame2.opcode = 0x09;
      var unmaskedBuf = frame2.toBuffer(true);

      // Masked frame has 4 extra bytes for the mask key
      expect(maskedBuf.length - unmaskedBuf.length).toBe(4);
    });

    test('mask=true with payload XORs payload with mask bytes', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = true;
      frame.opcode = 0x01; // TEXT
      frame.binaryPayload = Buffer.from('Hi');
      var buf = frame.toBuffer(true);

      // Second byte: mask=1, length=2
      expect(buf[1] & 0x80).toBe(0x80);
      expect(buf[1] & 0x7F).toBe(2);

      // Mask bytes are at positions 2-5, payload at positions 6-7
      var maskBytes = buf.slice(2, 6);
      var maskedPayload = buf.slice(6);
      // Unmasked payload = maskedPayload XOR maskBytes
      var original = Buffer.from('Hi');
      for (var i = 0; i < original.length; i++) {
        expect(maskedPayload[i] ^ maskBytes[i % 4]).toBe(original[i]);
      }
    });
  });

  describe('Payload size encoding', () => {
    test('Small payload (<=125 bytes) uses 7-bit length field directly', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x01;
      frame.binaryPayload = Buffer.alloc(100, 0x41);
      var buf = frame.toBuffer(true);
      // Length in 7-bit field of second byte
      expect(buf[1] & 0x7F).toBe(100);
      // Header is 2 bytes, then 100 bytes payload
      expect(buf.length).toBe(2 + 100);
    });

    test('Medium payload (126 bytes) uses extended 16-bit length', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x02;
      frame.binaryPayload = Buffer.alloc(126, 0x42);
      var buf = frame.toBuffer(true);
      // 7-bit field should be 126
      expect(buf[1] & 0x7F).toBe(126);
      // 16-bit length in bytes 2-3
      var extLen = buf.readUInt16BE(2);
      expect(extLen).toBe(126);
      // Header is 2 + 2 = 4 bytes, then payload
      expect(buf.length).toBe(4 + 126);
    });

    test('Medium payload (1000 bytes) uses extended 16-bit length', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x02;
      frame.binaryPayload = Buffer.alloc(1000, 0x43);
      var buf = frame.toBuffer(true);
      expect(buf[1] & 0x7F).toBe(126);
      var extLen = buf.readUInt16BE(2);
      expect(extLen).toBe(1000);
      expect(buf.length).toBe(4 + 1000);
    });

    test('Large payload (>65535 bytes) uses extended 64-bit length', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x02;
      var size = 70000;
      frame.binaryPayload = Buffer.alloc(size, 0x44);
      var buf = frame.toBuffer(true);
      // 7-bit field should be 127
      expect(buf[1] & 0x7F).toBe(127);
      // 64-bit length in bytes 2-9 (high 4 bytes should be 0 for this size)
      var highBits = buf.readUInt32BE(2);
      var lowBits = buf.readUInt32BE(6);
      expect(highBits).toBe(0);
      expect(lowBits).toBe(size);
      // Header is 2 + 8 = 10 bytes, then payload
      expect(buf.length).toBe(10 + size);
    });

    test('Empty payload produces length 0 in header', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x09; // PING
      var buf = frame.toBuffer(true);
      expect(buf[1] & 0x7F).toBe(0);
      expect(buf.length).toBe(2);
    });

    test('Boundary: 125-byte payload uses direct encoding', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x02;
      frame.binaryPayload = Buffer.alloc(125, 0x45);
      var buf = frame.toBuffer(true);
      expect(buf[1] & 0x7F).toBe(125);
      expect(buf.length).toBe(2 + 125);
    });

    test('Boundary: 65535-byte payload uses 16-bit encoding', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x02;
      frame.binaryPayload = Buffer.alloc(65535, 0x46);
      var buf = frame.toBuffer(true);
      expect(buf[1] & 0x7F).toBe(126);
      var extLen = buf.readUInt16BE(2);
      expect(extLen).toBe(65535);
      expect(buf.length).toBe(4 + 65535);
    });

    test('Boundary: 65536-byte payload uses 64-bit encoding', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x02;
      frame.binaryPayload = Buffer.alloc(65536, 0x47);
      var buf = frame.toBuffer(true);
      expect(buf[1] & 0x7F).toBe(127);
      expect(buf.length).toBe(10 + 65536);
    });
  });

  describe('CLOSE frame', () => {
    test('CLOSE frame with status code includes 2-byte status in payload', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x08; // CLOSE
      frame.closeStatus = 1000; // Normal closure
      var buf = frame.toBuffer(true);
      expect(buf[0] & 0x0F).toBe(0x08);
      // Length should be 2 (for the close status)
      expect(buf[1] & 0x7F).toBe(2);
      // Close status in big-endian at byte 2
      expect(buf.readUInt16BE(2)).toBe(1000);
    });

    test('CLOSE frame with status -1 throws on serialization', () => {
      var frame = createFrame();
      frame.fin = true;
      frame.mask = false;
      frame.opcode = 0x08;
      frame.closeStatus = -1;
      expect(() => frame.toBuffer(true)).toThrow();
    });
  });
});
