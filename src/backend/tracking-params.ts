import { InvalidUrlError, UrlErrorCode } from './invalid-url-error.ts';

/** Prefixos de parâmetros de rastreamento (em minúsculas), como `utm_source` e `utm_campaign`. */
export const TRACKING_PARAM_PREFIXES: readonly string[] = Object.freeze(['utm_']);

/**
 * Nomes exatos (em minúsculas) de parâmetros de rastreamento de anúncios, redes sociais e e-mail marketing.
 * Só entram parâmetros que não mudam o conteúdo da página, para a limpeza nunca quebrar o link.
 */
export const TRACKING_PARAM_NAMES: ReadonlySet<string> = new Set([
    'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', '_gl', 'msclkid', 'mc_cid', 'mc_eid', 'igshid',
    'yclid', '_hsenc', '_hsmi', 'mkt_tok', 'twclid', 'ttclid', 'li_fat_id',
]);

const PAIR_SEPARATOR = '&';
const NAME_SEPARATOR = '=';
const FORM_SPACE = /\+/g;

/** Se o parâmetro é de rastreamento, sem diferenciar maiúsculas. */
export function isTrackingParam(name: string): boolean {
    const lower = name.toLowerCase();
    return TRACKING_PARAM_NAMES.has(lower) || TRACKING_PARAM_PREFIXES.some(prefix => lower.startsWith(prefix));
}

/** Nome decodificado do par `nome=valor` da query; se a codificação for inválida, o nome como veio. */
function paramName(pair: string): string {
    const raw = pair.split(NAME_SEPARATOR, 1)[0].replace(FORM_SPACE, ' ');
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/**
 * Cópia da URL sem os parâmetros de rastreamento. Os outros pares ficam na mesma ordem e com o texto original:
 * a query é remontada a partir dos pares crus, pois o URLSearchParams trocaria `%20` por `+`.
 * Mantém o fragmento e não deixa `?` sobrando quando nenhum parâmetro resta.
 */
export function removeTrackingParams(url: URL): URL {
    const clean = new URL(url);
    const pairs = url.search.slice(1).split(PAIR_SEPARATOR);
    if (!pairs.some(pair => isTrackingParam(paramName(pair)))) {
        return clean;
    }

    // Pares vazios (`a=1&&b=2`) também saem, para não sobrar `&` no lugar do parâmetro removido.
    clean.search = pairs.filter(pair => pair !== '' && !isTrackingParam(paramName(pair))).join(PAIR_SEPARATOR);
    return clean;
}

/**
 * Valor do campo `removeTracking` do `POST /api/urls`: ausente (ou null) é false, para não mudar o comportamento
 * de quem já usa a API. Outro tipo que não boolean lança InvalidUrlError com INVALID_REMOVE_TRACKING.
 */
export function validateRemoveTracking(input: unknown): boolean {
    if (input === undefined || input === null) {
        return false;
    }

    if (typeof input !== 'boolean') {
        throw new InvalidUrlError('O campo "removeTracking" deve ser true ou false.', UrlErrorCode.INVALID_REMOVE_TRACKING);
    }

    return input;
}
