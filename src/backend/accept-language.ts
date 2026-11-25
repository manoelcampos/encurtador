// RFC 9110: q vai de 0 a 1, com até 3 casas decimais.
const QUALITY_PARAM = /;\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/i;
const ANY_QUALITY_PARAM = /;\s*q\s*=/i;
const DEFAULT_QUALITY = 1;
const REJECTED_QUALITY = 0;
const ANY_LANGUAGE = '*';

/**
 * Idiomas do header `Accept-Language` em ordem de preferência (maior `q` primeiro; empate mantém a ordem),
 * sem `*` e sem os recusados (`q=0`). Ex.: `"es;q=0.5, en"` → `["en", "es"]`.
 */
export function languagesFromHeader(header: string | undefined): string[] {
    return (header ?? '')
        .split(',')
        .map(parseLanguage)
        .filter(({ tag, quality }) => tag !== '' && tag !== ANY_LANGUAGE && quality > 0)
        .sort((a, b) => b.quality - a.quality)
        .map(({ tag }) => tag);
}

function parseLanguage(entry: string) {
    const [tag = ''] = entry.split(';');
    return { tag: tag.trim(), quality: qualityOf(entry) };
}

/** `q` inválido (texto, negativo, maior que 1) vale 0, para não virar a preferência máxima. */
function qualityOf(entry: string): number {
    const valid = entry.match(QUALITY_PARAM)?.[1];
    if (valid !== undefined) return Number(valid);

    return ANY_QUALITY_PARAM.test(entry) ? REJECTED_QUALITY : DEFAULT_QUALITY;
}
