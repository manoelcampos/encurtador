import { randomInt } from 'node:crypto';

/** Alfabeto de geração, sem caracteres ambíguos (l, I, 1, O, 0, o) nem - e _. */
export const CODE_ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

// 56^9 ≈ 2^52,3, acima das 2^48 combinações dos antigos 8 caracteres base64url.
export const CODE_LENGTH = 9;

/** Formato aceito na rota: base64url, para que links gerados antes do alfabeto atual continuem válidos. */
export const CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type CodeGenerator = () => string;

const randomChar = () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];

export const generateRandomCode: CodeGenerator = () => Array.from({ length: CODE_LENGTH }, randomChar).join('');
