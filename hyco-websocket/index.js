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

WS.createRelaySendUri = function createRelaySendUri(serviceBusNamespace, path, token)
{
    var uri = 'wss://' + serviceBusNamespace + ':443/$servicebus/hybridconnection?action=connect&path=' + path;
    if ( token != null ) {
         uri = uri + '&token=' +  encodeURIComponent(token);
    }
    return uri;
}

WS.createRelayListenUri = function createRelayListenUri(serviceBusNamespace, path, token)
{
    var uri = 'wss://' + serviceBusNamespace + ':443/$servicebus/hybridconnection?action=listen&path=' + path;
    if ( token != null ) {
         uri = uri + '&token=' +  encodeURIComponent(token);
    }
    return uri;
}