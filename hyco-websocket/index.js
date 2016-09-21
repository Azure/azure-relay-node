'use strict';

var crypto = require('crypto')
var moment = require('moment')

var WS = module.exports = require('./lib/hybridconnectionswebsocket');

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
    var uri = 'wss://' + serviceBusNamespace + ':443/$servicebus/hybridconnection/'+ path;
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
    var uri = 'wss://' + serviceBusNamespace + ':443/$servicebus/hybridconnection/'+ path;
    uri = uri + ( uri.indexOf('?') == -1 ?'?':'&') + 'sb-hc-action=listen';
    if ( token != null ) {
         uri = uri + '&sb-hc-token=' +  encodeURIComponent(token);
    }
    if ( id != null ) {
         uri = uri + '&sb-hc-id=' +  encodeURIComponent(id);
    }
    return uri;
}