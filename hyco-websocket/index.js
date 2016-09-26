'use strict';

var crypto = require('crypto')
var moment = require('moment')
var url = require('url');

var WS = module.exports = require('./lib/hybridconnectionswebsocket');

WS.createRelayToken = function createRelayToken(uri, key_name, key, expiry) {
    // Token expires in one hour
    var parsedUrl = url.parse(uri);
    parsedUrl.protocol = "http";
    parsedUrl.query = parsedUrl.hash = parsedUrl.port = null;
    uri = url.format(parsedUrl);

    if ( expiry == null) {
       expiry = moment().add(1, 'hours').unix();
    }
    var string_to_sign = encodeURIComponent(uri) + '\n' + expiry;
    var hmac = crypto.createHmac('sha256', key);
    hmac.update(string_to_sign);
    var signature = hmac.digest('base64');
    var token = 'SharedAccessSignature sr=' + encodeURIComponent(uri) + '&sig=' + encodeURIComponent(signature) + '&se=' + expiry + '&skn=' + key_name;
    return token;
};

WS.appendRelayToken = function appendRelayToken(uri, key_name, key, expiry) {
   var token = createRelayToken(uri, key_name, key, expiry);

    var parsedUrl = url.parse(uri);
    parsedUrl.query = parsedUrl.query + '&sb-hc-token=' + encodeURIComponent(token);
    return url.format(parsedUrl);
}


WS.createRelayBaseUri = function createRelayBaseUri(serviceBusNamespace, path) {
    return 'wss://' + serviceBusNamespace + ':443/$hc/' + path;
}

WS.createRelaySendUri = function createRelaySendUri(serviceBusNamespace, path, token, id) {
    var uri = createRelayBaseUri(serviceBusNamespace, path);
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
    var uri = createRelayBaseUri(serviceBusNamespace, path);
    uri = uri + (uri.indexOf('?') == -1 ? '?' : '&') + 'sb-hc-action=listen';
    if (token != null) {
        uri = uri + '&sb-hc-token=' + encodeURIComponent(token);
    }
    if (id != null) {
        uri = uri + '&sb-hc-id=' + encodeURIComponent(id);
    }
    return uri;
}