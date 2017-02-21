var WebSocket = require('../../');
var WebSocketServer = require('../../lib/HybridConnectionsWebSocketServer');

var wsServer;

function prepare(callback) {
  if (typeof(callback) !== 'function') { callback = function() {}; }

  var ns = process.env.RELAY_NAMESPACE;
  var path = process.env.RELAY_PATH;
  var keyrule = process.env.RELAY_KEYRULE;
  var key = process.env.RELAY_KEY;

  var uri = WebSocket.createRelayListenUri(ns, path);

  wsServer = new WebSocketServer({
    server : uri,
    token: WebSocket.createRelayToken(uri, keyrule, key),
    autoAcceptConnections: false,
    maxReceivedFrameSize: 64*1024*1024,   // 64MiB
    maxReceivedMessageSize: 64*1024*1024, // 64MiB
    fragmentOutgoingMessages: false,
    keepalive: false,
    disableNagleAlgorithm: false
  });
}

function stopServer() {
  try {
    wsServer.shutDown();
  }
  catch (e) {
    console.warn('stopServer threw', e);
  }
}

module.exports = {
  prepare: prepare,
  stopServer: stopServer
};
