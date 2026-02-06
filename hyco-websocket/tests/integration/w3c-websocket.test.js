/**
 * Integration tests for W3CWebSocket event listeners.
 * Migrated from hyco-websocket/test/unit/w3cwebsocket.js (Tape → Jest).
 * Requires a live Azure Relay namespace (RELAY_* environment variables).
 */

var WebSocket = require('websocket/lib/W3CWebSocket');
var startEchoServer = require('../../test/shared/start-echo-server');

// These tests require a local WebSocket echo server but the shared echo-server.js
// connects to Azure Relay instead of listening locally. Skipped pending test
// infrastructure fixes to support Azure Relay end-to-end.
describe.skip('W3CWebSocket', () => {
  jest.setTimeout(60000);

  test('adding event listeners with ws.onxxxxx', (done) => {
    var counter = 0;
    var message = 'This is a test message.';

    startEchoServer(function(err, echoServer) {
      if (err) {
        done.fail('Unable to start echo server: ' + err);
        return;
      }

      var ws = new WebSocket('ws://localhost:8080/');

      ws.onopen = function() {
        expect(++counter).toBe(1);
        ws.send(message);
      };
      ws.onerror = function(event) {
        echoServer.kill();
        done.fail('No errors are expected: ' + event);
      };
      ws.onmessage = function(event) {
        expect(++counter).toBe(2);
        expect(event.data).toBe(message);
        ws.close();
      };
      ws.onclose = function() {
        expect(++counter).toBe(3);
        echoServer.kill();
        done();
      };
    });
  });

  test('adding event listeners with ws.addEventListener', (done) => {
    var counter = 0;
    var message = 'This is a test message.';

    startEchoServer(function(err, echoServer) {
      if (err) {
        done.fail('Unable to start echo server: ' + err);
        return;
      }

      var ws = new WebSocket('ws://localhost:8080/');

      ws.addEventListener('open', function() {
        expect(++counter).toBe(1);
        ws.send(message);
      });
      ws.addEventListener('error', function(event) {
        echoServer.kill();
        done.fail('No errors are expected: ' + event);
      });
      ws.addEventListener('message', function(event) {
        expect(++counter).toBe(2);
        expect(event.data).toBe(message);
        ws.close();
      });
      ws.addEventListener('close', function() {
        expect(++counter).toBe(3);
      });
      ws.addEventListener('close', function() {
        expect(++counter).toBe(4);
        echoServer.kill();
        done();
      });
    });
  });
});
