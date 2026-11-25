import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODE_ALPHABET, CODE_LENGTH, CODE_PATTERN, generateRandomCode } from '../src/backend/code-generator.ts';

const AMBIGUOUS_CHARS = /[lI1O0o_-]/;
const GENERATIONS = 1000;

test('gera códigos sem caracteres ambíguos e com o tamanho esperado', () => {
    for (let i = 0; i < GENERATIONS; i++) {
        const code = generateRandomCode();
        assert.equal(code.length, CODE_LENGTH);
        assert.doesNotMatch(code, AMBIGUOUS_CHARS);
        assert.match(code, CODE_PATTERN);
    }
});

test('mantém pelo menos as 2^48 combinações dos códigos antigos', () => {
    assert.ok(CODE_ALPHABET.length ** CODE_LENGTH >= 2 ** 48);
});
