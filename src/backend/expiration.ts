import { InvalidUrlError, UrlErrorCode } from './invalid-url-error.ts';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Prazos de validade aceitos no campo `expiresIn` do `POST /api/urls`, com a duração de cada um.
 * Uma lista fixa evita problemas de fuso e datas absurdas. O `<select>` da interface é montado com estas chaves.
 */
export const EXPIRATION_OPTIONS: Readonly<Record<string, number>> = Object.freeze({
    '1h': MS_PER_HOUR,
    '1d': MS_PER_DAY,
    '7d': 7 * MS_PER_DAY,
    '30d': 30 * MS_PER_DAY,
});

/**
 * Data de expiração (ISO 8601 em UTC) contada a partir de `now`, ou null se o prazo não foi informado (link sem prazo).
 * Lança InvalidUrlError com INVALID_EXPIRATION se o valor não for uma das EXPIRATION_OPTIONS.
 */
export function expirationDate(input: unknown, now: Date): string | null {
    if (input === undefined || input === null) {
        return null;
    }

    const duration = typeof input === 'string' && Object.hasOwn(EXPIRATION_OPTIONS, input) ? EXPIRATION_OPTIONS[input] : undefined;
    if (duration === undefined) {
        throw new InvalidUrlError(
            `O prazo de validade deve ser um destes: ${Object.keys(EXPIRATION_OPTIONS).join(', ')}.`,
            UrlErrorCode.INVALID_EXPIRATION,
        );
    }

    return new Date(now.getTime() + duration).toISOString();
}

/** Se o link com esta data de expiração (null: sem prazo) já expirou no instante `now`. */
export const isExpired = (expiresAt: string | null, now: Date) => expiresAt !== null && Date.parse(expiresAt) <= now.getTime();
