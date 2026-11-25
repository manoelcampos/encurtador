import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rateLimitKey } from '../src/backend/client-ip.ts';

test('IPv4 e IPv4 mapeado em IPv6 continuam com o próprio endereço como chave', () => {
    for (const ip of ['203.0.113.1', '::ffff:203.0.113.1', 'desconhecido']) {
        assert.equal(rateLimitKey(ip), ip);
    }
});

test('endereços IPv6 do mesmo /64 têm a mesma chave, mesmo escritos de formas diferentes', () => {
    const sameBlock = [
        '2001:db8:1:2::1',
        '2001:db8:1:2:ffff:ffff:ffff:ffff',
        '2001:0DB8:0001:0002:0000:0000:0000:0abc',
        '2001:db8:1:2:a::b%eth0',
        '2001:db8:1:2:0:0:1.2.3.4',
    ];

    for (const ip of sameBlock) {
        assert.equal(rateLimitKey(ip), '2001:db8:1:2::/64', ip);
    }
});

test('/64 diferentes têm chaves diferentes, inclusive com o :: no prefixo', () => {
    assert.equal(rateLimitKey('2001:db8:1:3::1'), '2001:db8:1:3::/64');
    assert.equal(rateLimitKey('2001:db8::1'), '2001:db8:0:0::/64');
    assert.equal(rateLimitKey('::1'), '0:0:0:0::/64');
    assert.notEqual(rateLimitKey('2001:db8:1:2::1'), rateLimitKey('2001:db8:1:3::1'));
});
