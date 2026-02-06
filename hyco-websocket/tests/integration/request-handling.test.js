/**
 * Integration tests for WebSocket request accept/reject handling.
 * Migrated from hyco-websocket/test/unit/request.js (Tape → Jest).
 * Requires a live Azure Relay namespace (RELAY_* environment variables).
 */

var WebSocketClient = require('websocket/lib/WebSocketClient');
var server = require('../../test/shared/test-server');
var stopServer = server.stopServer;

// These tests require a local WebSocket test server but the shared test-server.js
// connects to Azure Relay instead of listening locally. Skipped pending test
// infrastructure fixes to support Azure Relay end-to-end.
describe.skip('WebSocket request handling', () => {
  jest.setTimeout(60000);

  afterAll(() => {
    stopServer();
  });

  test('Request can only be rejected or accepted once', (done) => {
    expect.assertions(6);

    server.prepare(function(err, wsServer) {
      if (err) {
        done.fail('Unable to start test server');
        return;
      }

      wsServer.once('request', firstReq);
      connect(2);

      function firstReq(request) {
        var accept = request.accept.bind(request, request.requestedProtocols[0], request.origin);
        var reject = request.reject.bind(request);

        expect(accept).not.toThrow();
        expect(accept).toThrow();
        expect(reject).toThrow();

        wsServer.once('request', secondReq);
      }

      function secondReq(request) {
        var accept = request.accept.bind(request, request.requestedProtocols[0], request.origin);
        var reject = request.reject.bind(request);

        expect(reject).not.toThrow();
        expect(reject).toThrow();
        expect(accept).toThrow();

        done();
      }

      function connect(numTimes) {
        var client;
        for (var i = 0; i < numTimes; i++) {
          client = new WebSocketClient();
          client.connect('ws://localhost:64321/', 'foo');
          client.on('connect', function(connection) { connection.close(); });
        }
      }
    });
  });

  test('Protocol mismatch should be handled gracefully', (done) => {
    expect.assertions(2);

    server.prepare(function(err, wsServer) {
      if (err) {
        done.fail('Unable to start test server');
        return;
      }

      wsServer.on('request', handleRequest);

      var client = new WebSocketClient();

      var timer = setTimeout(function() {
        done.fail('Timeout waiting for client event');
      }, 2000);

      client.connect('ws://localhost:64321/', 'some_protocol_here');
      client.on('connect', function(connection) {
        clearTimeout(timer);
        connection.close();
        done.fail('connect event should not be emitted on client');
      });
      client.on('connectFailed', function() {
        clearTimeout(timer);
        expect(true).toBe(true); // connectFailed event should be emitted on client
        done();
      });

      function handleRequest(request) {
        var accept = request.accept.bind(request, 'this_is_the_wrong_protocol', request.origin);
        expect(accept).toThrow();
      }
    });
  });
});
