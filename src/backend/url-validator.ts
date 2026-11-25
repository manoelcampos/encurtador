import { InvalidUrlError } from './invalid-url-error.ts';

export const MAX_URL_LENGTH = 2048;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** Retorna a URL normalizada ou lança InvalidUrlError. */
export function validateUrl(input: unknown): string {
    if (typeof input !== 'string' || input.length === 0) {
        throw new InvalidUrlError('O campo "url" é obrigatório e deve ser texto.');
    }

    if (input.length > MAX_URL_LENGTH) {
        throw new InvalidUrlError(`A URL deve ter no máximo ${MAX_URL_LENGTH} caracteres.`);
    }

    const url = URL.parse(input);
    if (!url || !ALLOWED_PROTOCOLS.has(url.protocol)) {
        throw new InvalidUrlError('Informe uma URL válida com http ou https.');
    }

    return url.href;
}
