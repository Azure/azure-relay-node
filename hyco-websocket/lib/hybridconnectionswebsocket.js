var websocket = require('websocket');

module.exports = {
    'server'         : websocket.server,
    'relayedServer'  : require('./HybridConnectionsWebSocketServer'),
    'client'         : websocket.client,
    'router'         : websocket.router,
    'frame'          : websocket.frame,
    'request'        : websocket.request,
    'relayedRequest' : require('./HybridConnectionsWebSocketRequest'),
    'connection'     : websocket.connection,
    'w3cwebsocket'   : websocket.w3cwebsocket,
    'deprecation'    : websocket.deprecation,
    'version'        : require('./version')
};
