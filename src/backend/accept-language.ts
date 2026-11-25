const QUALITY_PARAM = /;\s*q\s*=\s*([\d.]+)/i;
const DEFAULT_QUALITY = 1;
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
    const quality = Number(entry.match(QUALITY_PARAM)?.[1] ?? DEFAULT_QUALITY);
    return { tag: tag.trim(), quality: Number.isNaN(quality) ? 0 : quality };
}
