import { DOCS_PATH, HEALTH_PATH, OPENAPI_PATH, QRCODE_PATH, SHORTEN_PATH, STATS_PATH } from './api-paths.ts';
import { InvalidUrlError, UrlErrorCode } from './invalid-url-error.ts';
import { STATIC_PATH } from '../frontend/static-files.ts';

export const ALIAS_MIN_LENGTH = 3;
export const ALIAS_MAX_LENGTH = 50;

/** Letras minúsculas, números e hífen, sem hífen no início nem no fim. Cabe no CODE_PATTERN da rota (há teste). */
export const ALIAS_PATTERN = new RegExp(`^(?=.{${ALIAS_MIN_LENGTH},${ALIAS_MAX_LENGTH}}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`);

const firstSegment = (path: string) => path.split('/')[1];

/** Primeiros segmentos das rotas da aplicação, mais nomes que confundiriam quem recebe o link. */
export const RESERVED_ALIASES: ReadonlySet<string> = new Set([
    ...[SHORTEN_PATH, OPENAPI_PATH, DOCS_PATH, HEALTH_PATH, QRCODE_PATH, STATS_PATH, STATIC_PATH].map(firstSegment),
    'admin', 'www', 'login', 'help',
]);

/**
 * Apelido em minúsculas, para `Promo` e `promo` não virarem links diferentes, ou undefined se não foi informado.
 * Lança InvalidUrlError com INVALID_ALIAS (formato) ou ALIAS_TAKEN (reservado).
 */
export function validateAlias(input: unknown): string | undefined {
    if (input === undefined || input === null) {
        return undefined;
    }

    const alias = typeof input === 'string' ? input.toLowerCase() : '';
    if (!ALIAS_PATTERN.test(alias)) {
        throw new InvalidUrlError(
            `O apelido deve ter de ${ALIAS_MIN_LENGTH} a ${ALIAS_MAX_LENGTH} letras, números ou hífens, sem hífen no início ou no fim.`,
            UrlErrorCode.INVALID_ALIAS,
        );
    }

    if (RESERVED_ALIASES.has(alias)) {
        throw aliasTakenError();
    }

    return alias;
}

export const aliasUnavailableError = () => new InvalidUrlError(
    'Apelidos estão temporariamente indisponíveis. Encurte sem apelido.', UrlErrorCode.ALIAS_UNAVAILABLE,
);

export const aliasTakenError = () => new InvalidUrlError('Este apelido já está em uso. Escolha outro.', UrlErrorCode.ALIAS_TAKEN);
