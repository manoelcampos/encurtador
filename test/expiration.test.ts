import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXPIRATION_OPTIONS, expirationDate, isExpired } from '../src/backend/expiration.ts';

const NOW = new Date('2026-11-25T12:00:00Z');

test('converte cada opção de prazo em data ISO a partir de agora', () => {
    assert.deepEqual(Object.keys(EXPIRATION_OPTIONS), ['1h', '1d', '7d', '30d']);
    assert.equal(expirationDate('1h', NOW), '2026-11-25T13:00:00.000Z');
    assert.equal(expirationDate('1d', NOW), '2026-11-26T12:00:00.000Z');
    assert.equal(expirationDate('7d', NOW), '2026-12-02T12:00:00.000Z');
    assert.equal(expirationDate('30d', NOW), '2026-12-25T12:00:00.000Z');
});

test('sem prazo devolve null', () => {
    assert.equal(expirationDate(undefined, NOW), null);
    assert.equal(expirationDate(null, NOW), null);
});

test('expira exatamente no prazo; sem prazo nunca expira', () => {
    const expiresAt = '2026-11-25T12:00:00.000Z';
    assert.equal(isExpired(expiresAt, new Date('2026-11-25T11:59:59.999Z')), false);
    assert.equal(isExpired(expiresAt, NOW), true);
    assert.equal(isExpired(null, new Date('2999-01-01T00:00:00Z')), false);
});
