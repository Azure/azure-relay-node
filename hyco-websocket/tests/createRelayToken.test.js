var crypto = require('crypto');
var WS = require('..');

test('createRelayToken produces a valid SharedAccessSignature token', () => {
    var uri = 'https://contoso.servicebus.windows.net/path';
    var keyName = 'myKeyRule';
    var key = 'mySecretKey123';

    var token = WS.createRelayToken(uri, keyName, key, 3600);

    expect(token).toBeDefined();
    expect(token).toMatch(/^SharedAccessSignature /);
    expect(token).toContain('sr=');
    expect(token).toContain('sig=');
    expect(token).toContain('se=');
    expect(token).toContain('skn=' + keyName);
});

test('createRelayToken uses built-in crypto for HMAC-SHA256', () => {
    var uri = 'https://contoso.servicebus.windows.net/path';
    var keyName = 'myKeyRule';
    var key = 'mySecretKey123';

    var token = WS.createRelayToken(uri, keyName, key, 3600);
    var params = {};
    token.replace('SharedAccessSignature ', '').split('&').forEach(function(part) {
        var pair = part.split('=');
        params[pair[0]] = decodeURIComponent(pair[1]);
    });

    // Verify that the signature can be reproduced using the built-in crypto module
    var url = require('url');
    var parsedUrl = url.parse(uri);
    parsedUrl.protocol = 'http';
    parsedUrl.search = parsedUrl.hash = parsedUrl.port = null;
    parsedUrl.pathname = parsedUrl.pathname.replace('$hc/','');
    var targetUri = url.format(parsedUrl);

    var string_to_sign = encodeURIComponent(targetUri) + '\n' + params['se'];
    var hmac = crypto.createHmac('sha256', key);
    hmac.update(string_to_sign);
    var expectedSignature = hmac.digest('base64');

    expect(params['sig']).toBe(expectedSignature);
});
