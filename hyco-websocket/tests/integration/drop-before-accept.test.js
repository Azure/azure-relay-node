/**
 * Integration tests for TCP connection drop before server accepts the request.
 * Migrated from hyco-websocket/test/unit/dropBeforeAccept.js (Tape → Jest).
 * Requires a live Azure Relay namespace (RELAY_* environment variables).
 */

var WebSocketClient = require('websocket/lib/WebSocketClient');
var server = require('../../test/shared/test-server');
var stopServer = server.stopServer;

// These tests require a local WebSocket test server but the shared test-server.js
// connects to Azure Relay instead of listening locally. Skipped pending test
// infrastructure fixes to support Azure Relay end-to-end.
describe.skip('Drop before accept', () => {
  jest.setTimeout(60000);

  afterAll(() => {
    stopServer();
  });

  test('Drop TCP Connection before server accepts the request', (done) => {
    expect.assertions(5);

    server.prepare(function(err, wsServer) {
      if (err) {
        done.fail('Unable to start test server');
        return;
      }

      wsServer.on('connect', function() {
        // Server should emit connect event
      });

      wsServer.on('request', function(request) {
        // Request received - assertion counted
        expect(true).toBe(true);

        // Wait 500 ms before accepting connection
        setTimeout(function() {
          var connection = request.accept(request.requestedProtocols[0], request.origin);

          connection.on('close', function(reasonCode, description) {
            expect(true).toBe(true); // Connection should emit close event
            expect(reasonCode).toBe(1006);
            expect(description).toBe(
              'TCP connection lost before handshake completed.'
            );
            stopServer();
            done();
          });

          connection.on('error', function() {
            done.fail('No error events should be received on the connection');
            stopServer();
          });
        }, 500);
      });

      var client = new WebSocketClient();
      client.on('connect', function(connection) {
        done.fail('Client should never connect.');
        connection.drop();
        stopServer();
      });

      client.connect('ws://localhost:64321/', ['test']);

      // Count the connect call starting
      expect(true).toBe(true);

      setTimeout(function() {
        // Bail on the connection before we hear back from the server.
        client.abort();
      }, 250);
    });
  });
});
