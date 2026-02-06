/**
 * Integration tests for regression issues.
 * Migrated from hyco-websocket/test/unit/regressions.js (Tape → Jest).
 * Requires a live Azure Relay namespace (RELAY_* environment variables).
 */

var WebSocketClient = require('websocket/lib/WebSocketClient');
var startEchoServer = require('../../test/shared/start-echo-server');

// These tests require a local WebSocket echo server but the shared echo-server.js
// connects to Azure Relay instead of listening locally. Skipped pending test
// infrastructure fixes to support Azure Relay end-to-end.
describe.skip('Regression tests', () => {
  jest.setTimeout(60000);

  test('Issue 195 - passing number to connection.send() should not throw', (done) => {
    startEchoServer(function(err, echoServer) {
      if (err) {
        done.fail('Unable to start echo server: ' + err);
        return;
      }

      var client = new WebSocketClient();
      client.on('connect', function(connection) {
        expect(() => {
          connection.send(12345);
        }).not.toThrow();

        connection.close();
        echoServer.kill();
        done();
      });

      client.on('connectFailed', function(errorDescription) {
        echoServer.kill();
        done.fail(errorDescription);
      });

      client.connect('ws://localhost:8080', null);
    });
  });
});
