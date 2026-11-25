import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALIAS_MAX_LENGTH, ALIAS_MIN_LENGTH, RESERVED_ALIASES, validateAlias } from '../src/backend/alias-validator.ts';
import { CODE_PATTERN } from '../src/backend/code-generator.ts';
import { InvalidUrlError, UrlErrorCode } from '../src/backend/invalid-url-error.ts';

const throwsWith = (input: unknown, code: UrlErrorCode) =>
    assert.throws(() => validateAlias(input), (error: unknown) => error instanceof InvalidUrlError && error.code === code, String(input));

test('sem apelido devolve undefined', () => {
    assert.equal(validateAlias(undefined), undefined);
    assert.equal(validateAlias(null), undefined);
});

test('aceita letras, números e hífen e devolve em minúsculas', () => {
    assert.equal(validateAlias('Promo-Natal-2026'), 'promo-natal-2026');
    assert.equal(validateAlias('a'.repeat(ALIAS_MIN_LENGTH)), 'a'.repeat(ALIAS_MIN_LENGTH));
    assert.equal(validateAlias('a'.repeat(ALIAS_MAX_LENGTH)), 'a'.repeat(ALIAS_MAX_LENGTH));
});

test('recusa formato inválido com INVALID_ALIAS', () => {
    const invalid = [
        '', 'a'.repeat(ALIAS_MIN_LENGTH - 1), 'a'.repeat(ALIAS_MAX_LENGTH + 1), '-promo', 'promo-', 'pro mo', 'pro_mo',
        'promoção', 'a/b', '../x', 123, {},
    ];
    for (const input of invalid) {
        throwsWith(input, UrlErrorCode.INVALID_ALIAS);
    }
});

test('reserva o primeiro segmento das rotas da aplicação', () => {
    assert.ok(RESERVED_ALIASES.has('api'));
    assert.ok(RESERVED_ALIASES.has('static'));
});

test('recusa palavras reservadas, sem diferenciar maiúsculas, com ALIAS_TAKEN', () => {
    for (const input of ['api', 'API', 'static', 'admin', 'www']) {
        throwsWith(input, UrlErrorCode.ALIAS_TAKEN);
    }
});

test('todo apelido válido cabe no formato de código da rota', () => {
    assert.match('a'.repeat(ALIAS_MAX_LENGTH), CODE_PATTERN);
    assert.match('a-1', CODE_PATTERN);
});
