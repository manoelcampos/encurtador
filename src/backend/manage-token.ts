import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 bits: adivinhar o token é inviável, mesmo sem limite de tentativas. */
const MANAGE_TOKEN_BYTES = 32;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';

/** Token secreto de gestão do link, devolvido só uma vez, na criação. */
export const generateManageToken = () => randomBytes(MANAGE_TOKEN_BYTES).toString('base64url');

/**
 * Hash gravado no banco no lugar do token. Um SHA-256 simples basta: o token é aleatório e longo,
 * então não há dicionário a testar, e funções lentas (bcrypt, scrypt) só serviriam para senhas fracas.
 */
export const hashManageToken = (token: string) => createHash(HASH_ALGORITHM).update(token).digest(HASH_ENCODING);

/** Compara em tempo constante o hash do token com o gravado, para o tempo da resposta não revelar o hash. */
export function manageTokenMatches(token: string, storedHash: string): boolean {
    const expected = Buffer.from(storedHash, HASH_ENCODING);
    const actual = Buffer.from(hashManageToken(token), HASH_ENCODING);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}
