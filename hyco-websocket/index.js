'use strict';

var crypto = require('crypto')
var moment = require('moment')
var url = require('url');

var WS = module.exports = require('./lib/hybridconnectionswebsocket');

/**
 * Create a Relay Token
 *
 * @param {String} address The URL/address we need to connect to.
 * @param {String} key_name The SharedAccessSignature key name.
 * @param {String} key The SharedAccessSignature key value.
 * @param {number} expirationSeconds Optional number of seconds until the generated token should expire.  Default is 1 hour (3600) if not specified.
 * @api public
 */
WS.createRelayToken = function createRelayToken(uri, key_name, key, expirationSeconds) {
    var parsedUrl = url.parse(uri);
    parsedUrl.protocol = "http";
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
    var token = 'SharedAccessSignature sr=' + encodeURIComponent(uri) + '&sig=' + encodeURIComponent(signature) + '&se=' + unixSeconds + '&skn=' + key_name;
    return token;
};

WS.appendRelayToken = function appendRelayToken(uri, key_name, key, expirationSeconds) {
   var token = WS.createRelayToken(uri, key_name, key, expirationSeconds);

    var parsedUrl = url.parse(uri);
    parsedUrl.search = parsedUrl.search + '&sb-hc-token=' + encodeURIComponent(token);
    return url.format(parsedUrl);
}

WS.createRelayBaseUri = function createRelayBaseUri(serviceBusNamespace, path) {
    return 'wss://' + serviceBusNamespace + ':443/$hc/' + path;
}

WS.createRelaySendUri = function createRelaySendUri(serviceBusNamespace, path, token, id) {
    var uri = WS.createRelayBaseUri(serviceBusNamespace, path);
    uri = uri + (uri.indexOf('?') == -1 ? '?' : '&') + 'sb-hc-action=connect';
    if (token != null) {
        uri = uri + '&sb-hc-token=' + encodeURIComponent(token);
    }
    if (id != null) {
        uri = uri + '&sb-hc-id=' + encodeURIComponent(id);
    }
    return uri;
}

WS.createRelayListenUri = function createRelayListenUri(serviceBusNamespace, path, token, id) {
    var uri = WS.createRelayBaseUri(serviceBusNamespace, path);
    uri = uri + (uri.indexOf('?') == -1 ? '?' : '&') + 'sb-hc-action=listen';
    if (token != null) {
        uri = uri + '&sb-hc-token=' + encodeURIComponent(token);
    }
    if (id != null) {
        uri = uri + '&sb-hc-id=' + encodeURIComponent(id);
    }
    return uri;
}