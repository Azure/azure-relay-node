var crypto = require('crypto');

test('built-in crypto createHmac produces valid HMAC-SHA256 signatures', () => {
    var key = 'mySecretKey123';
    var data = 'test-data-to-sign';

    var hmac = crypto.createHmac('sha256', key);
    hmac.update(data);
    var signature = hmac.digest('base64');

    expect(signature).toBeDefined();
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);

    // Verify deterministic output
    var hmac2 = crypto.createHmac('sha256', key);
    hmac2.update(data);
    var signature2 = hmac2.digest('base64');

    expect(signature).toBe(signature2);
});

test('built-in crypto HMAC-SHA256 produces different signatures for different keys', () => {
    var data = 'test-data-to-sign';

    var hmac1 = crypto.createHmac('sha256', 'key1');
    hmac1.update(data);
    var sig1 = hmac1.digest('base64');

    var hmac2 = crypto.createHmac('sha256', 'key2');
    hmac2.update(data);
    var sig2 = hmac2.digest('base64');

    expect(sig1).not.toBe(sig2);
});
