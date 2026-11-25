import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODE_LENGTH, CODE_PATTERN, generateRandomCode } from '../src/backend/code-generator.ts';

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
