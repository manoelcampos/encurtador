import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvalidUrlError } from '../src/backend/invalid-url-error.ts';
import { MAX_URL_LENGTH, validateUrl } from '../src/backend/url-validator.ts';

test('aceita URLs http e https', () => {
    assert.equal(validateUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
    assert.equal(validateUrl('http://example.com'), 'http://example.com/');
});

test('rejeita entradas inválidas', () => {
    const invalid = [undefined, 42, '', 'não é url', 'javascript:alert(1)', 'ftp://example.com', `https://a.com/${'x'.repeat(MAX_URL_LENGTH)}`];
    for (const input of invalid) {
        assert.throws(() => validateUrl(input), InvalidUrlError, String(input));
    }
});
