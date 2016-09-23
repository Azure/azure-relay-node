'use strict';

var crypto = require('crypto')
var moment = require('moment')

/*!
 * Adapted from 
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 * 
 */

var WS = module.exports = require('ws');

WS.RelayedServer = require('./lib/HybridConnectionWebSocketServer');

/**
 * Create a new WebSocket server.
 *
 * @param {Object} options Server options
 * @param {Function} fn Optional connection listener.
 * @returns {WS.Server}
 * @api public
 */
WS.createRelayedServer = function createRelayedServer(options, fn) {
  var server = new WS.RelayedServer(options);

  if (typeof fn === 'function') {
    server.on('connection', fn);
  }

  return server;
};

/**
 * Create a new WebSocket connection.
 *
 * @param {String} address The URL/address we need to connect to.
 * @param {Function} fn Open listener.
 * @returns {WS}
 * @api public
 */
WS.relayedConnect = WS.createRelayedConnection = function relayedConnect(address, token, fn) {
  var opt = null;
  if ( token != null) {
    opt = { headers : { 'ServiceBusAuthorization' : token}};
  };
  var client = new WS(address, null, opt);

  if (typeof fn === 'function') {
    client.on('open', function() { fn(client) });
  }

  return client;
};

WS.createRelayToken = function createRelayToken(uri, key_name, key) {

    // Token expires in one hour
    var expiry = moment().add(1, 'hours').unix();

    var string_to_sign = encodeURIComponent(uri) + '\n' + expiry;
    var hmac = crypto.createHmac('sha256', key);
    hmac.update(string_to_sign);
    var signature = hmac.digest('base64');
    var token = 'SharedAccessSignature sr=' + encodeURIComponent(uri) + '&sig=' + encodeURIComponent(signature) + '&se=' + expiry + '&skn=' + key_name;

    return token;
};

WS.createRelaySendUri = function createRelaySendUri(serviceBusNamespace, path, token, id)
{
    var uri = 'wss://' + serviceBusNamespace + ':443/$hc/'+ path;
    uri = uri + ( uri.indexOf('?') == -1 ?'?':'&') + 'sb-hc-action=connect';
    if ( token != null ) {
         uri = uri + '&sb-hc-token=' +  encodeURIComponent(token);
    }
    if ( id != null ) {
         uri = uri + '&sb-hc-id=' +  encodeURIComponent(id);
    }
    return uri;
}

WS.createRelayListenUri = function createRelayListenUri(serviceBusNamespace, path, token, id)
{
    var uri = 'wss://' + serviceBusNamespace + ':443/$hc/'+ path;
    uri = uri + ( uri.indexOf('?') == -1 ?'?':'&') + 'sb-hc-action=listen';
    if ( token != null ) {
         uri = uri + '&sb-hc-token=' +  encodeURIComponent(token);
    }
    if ( id != null ) {
         uri = uri + '&sb-hc-id=' +  encodeURIComponent(id);
    }
    return uri;
}