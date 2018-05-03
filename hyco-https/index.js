'use strict';

var crypto = require('crypto')
var moment = require('moment')
var url = require('url');


var https = module.exports = require('https');
var relay = require('./lib/HybridConnectionHttpsServer');

https.Server = relay.Server;
https.ServerResponse = relay.ServerResponse; 

/**
 * Create a new HybridConnectionsHttpsServer.
 *
 * @param {Object} options Server options
 * @param {Function} fn Optional connection listener.
 * @returns {https.RelayedServer}
 * @api public
 */
https.createRelayedServer = function createServer(options, fn) {
  var server = new https.Server(options, fn);
  return server;
};

/**
 * Create a Relay Token
 *
 * @param {String} uri The URL/address to connect to.
 * @param {String} keyName The SharedAccessSignature key name.
 * @param {String} key The SharedAccessSignature key value.
 * @param {number} expirationSeconds Optional number of seconds until the generated token should expire.  Default is 1 hour (3600) if not specified.
 * @api public
 */
https.createRelayToken = function createRelayToken(uri, keyName, key, expirationSeconds) {
    var parsedUrl = url.parse(uri);
    parsedUrl.protocol = 'http';
    parsedUrl.search = parsedUrl.hash = parsedUrl.port = null;
    parsedUrl.pathname = parsedUrl.pathname.replace('$hc/','');
    uri = url.format(parsedUrl);

    if (!expirationSeconds) {
      // Token expires in one hour (3600 seconds)
      expirationSeconds = 3600;
    }

    var unixSeconds = moment().add(expirationSeconds, 'seconds').unix();
    var string_to_sign = encodeURIComponent(uri) + '\n' + unixSeconds;
    var hmac = crypto.createHmac('sha256', key);
    hmac.update(string_to_sign);
    var signature = hmac.digest('base64');
    var token = 'SharedAccessSignature sr=' + encodeURIComponent(uri) + '&sig=' + encodeURIComponent(signature) + '&se=' + unixSeconds + '&skn=' + keyName;
    return token;
};

/**
 * Create a Relay Token and append it to an existing Uri
 *
 * @param {String} uri The URL/address to connect to.
 * @param {String} keyName The SharedAccessSignature key name.
 * @param {String} key The SharedAccessSignature key value.
 * @param {number} expirationSeconds Optional number of seconds until the generated token should expire.  Default is 1 hour (3600) if not specified.
 * @api public
 */
https.appendRelayToken = function appendRelayToken(uri, keyName, key, expirationSeconds) {
   var token = https.createRelayToken(uri, keyName, key, expirationSeconds);

    var parsedUrl = url.parse(uri);
    parsedUrl.search = parsedUrl.search + (uri.indexOf('?') == -1 ? '?' : '&') + 'sb-hc-token=' + encodeURIComponent(token);
    return url.format(parsedUrl);
}

/**
 * Create a Uri for using with Relay Hybrid Connections
 *
 * @param {String} serviceBusNamespace The ServiceBus namespace, e.g. 'contoso.servicebus.windows.net'.
 * @param {String} path The endpoint path.
 * @api public
 */
https.createRelayBaseUri = function createRelayBaseUri(serviceBusNamespace, path) {
    return 'wss://' + serviceBusNamespace + ':443/$hc/' + path;
}

/**
 * Create a Uri for requesting from a Relay Hybrid Connection endpoint
 *
 * @param {String} serviceBusNamespace The ServiceBus namespace, e.g. 'contoso.servicebus.windows.net'.
 * @param {String} path The endpoint path.
 * @param {String} token Optional SharedAccessSignature token for authenticating the sender.
 * @param {String} id Optional A Guid string for end to end correlation.
 * @api public
 */
https.createRelayHttpsUri = function createRelayHttpsUri(serviceBusNamespace, path, token, id) {
    var uri = 'https://' + serviceBusNamespace + '/' + path;
    if (token != null) {
        uri = uri + (uri.indexOf('?') == -1 ? '?' : '&') + 'sb-hc-token=' + encodeURIComponent(token);
    }
    if (id != null) {
        uri = uri + (uri.indexOf('?') == -1 ? '?' : '&') + 'sb-hc-id=' + encodeURIComponent(id);
    }
    return uri;
}

/**
 * Create a Uri for sending to a Relay Hybrid Connection Websocket endpoint
 *
 * @param {String} serviceBusNamespace The ServiceBus namespace, e.g. 'contoso.servicebus.windows.net'.
 * @param {String} path The endpoint path.
 * @param {String} token Optional SharedAccessSignature token for authenticating the sender.
 * @param {String} id Optional A Guid string for end to end correlation.
 * @api public
 */

https.createRelaySendUri = function createRelaySendUri(serviceBusNamespace, path, token, id) {
    var uri = https.createRelayBaseUri(serviceBusNamespace, path);
    uri = uri + (uri.indexOf('?') == -1 ? '?' : '&') + 'sb-hc-action=connect';
    if (token != null) {
        uri = uri + '&sb-hc-token=' + encodeURIComponent(token);
    }
    if (id != null) {
        uri = uri + '&sb-hc-id=' + encodeURIComponent(id);
    }
    return uri;
}

/**
 * Create a Uri for listening on a Relay Hybrid Connection endpoint
 *
 * @param {String} serviceBusNamespace The ServiceBus namespace, e.g. 'contoso.servicebus.windows.net'.
 * @param {String} path The endpoint path.
 * @param {String} token Optional SharedAccessSignature token for authenticating the listener.
 * @param {String} id Optional A Guid string for end to end correlation.
 * @api public
 */
https.createRelayListenUri = function createRelayListenUri(serviceBusNamespace, path, token, id) {
    var uri = https.createRelayBaseUri(serviceBusNamespace, path);
    uri = uri + (uri.indexOf('?') == -1 ? '?' : '&') + 'sb-hc-action=listen';
    if (token != null) {
        uri = uri + '&sb-hc-token=' + encodeURIComponent(token);
    }
    if (id != null) {
        uri = uri + '&sb-hc-id=' + encodeURIComponent(id);
    }
    return uri;
}