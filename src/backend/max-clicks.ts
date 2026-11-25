import { InvalidUrlError, UrlErrorCode } from './invalid-url-error.ts';

/** Maior limite de acessos aceito no campo `maxClicks` do `POST /api/urls`. O menor é 1 (link de uso único). */
export const MAX_CLICKS_LIMIT = 1000;
const MIN_CLICKS = 1;

/**
 * Limite de acessos do link, ou null se não foi informado (link sem limite).
 * Lança InvalidUrlError com INVALID_MAX_CLICKS se não for um inteiro de 1 a MAX_CLICKS_LIMIT (texto, como "5", também é recusado).
 */
export function validateMaxClicks(input: unknown): number | null {
    if (input === undefined || input === null) {
        return null;
    }

    if (typeof input !== 'number' || !Number.isInteger(input) || input < MIN_CLICKS || input > MAX_CLICKS_LIMIT) {
        throw new InvalidUrlError(
            `O limite de acessos ("maxClicks") deve ser um número inteiro de ${MIN_CLICKS} a ${MAX_CLICKS_LIMIT}.`,
            UrlErrorCode.INVALID_MAX_CLICKS,
        );
    }

    return input;
}
