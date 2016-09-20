var websocket = require('websocket')

module.exports = {
    'server'       : require('./HybridConnectionsWebSocketServer'),
    'client'       : websocket.client,
    'router'       : websocket.router,
    'frame'        : websocket.frame,
    'request'      : require('./HybridConnectionsWebSocketRequest'),
    'connection'   : websocket.connection,
    'w3cwebsocket' : websocket.w3cwebsocket,
    'deprecation'  : websocket.deprecation,
    'version'      : require('./version')
};
