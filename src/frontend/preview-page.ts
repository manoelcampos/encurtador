import { escolherIdioma, IDIOMA_PADRAO, TRADUCOES } from './static/messages.js';

const HTML_ESCAPES: Readonly<Record<string, string>> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

/** Escapa texto para conteúdo e atributos HTML entre aspas. */
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => HTML_ESCAPES[char] ?? char);

/** Idioma da página de pré-visualização, pelos idiomas pedidos pelo navegador (`Accept-Language`). */
export const previewLanguage = (requested: readonly string[]) => escolherIdioma(null, requested);

/**
 * Página que mostra o destino de um link curto sem redirecionar. Não tem JS: o servidor escolhe o idioma.
 * Todo valor interpolado é escapado, pois a URL de destino vem de quem criou o link.
 */
export function previewPageHtml(url: string, language: string, homePath: string): string {
    const t = TRADUCOES[language] ?? TRADUCOES[IDIOMA_PADRAO];
    return `<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="referrer" content="no-referrer">
    <title>${escapeHtml(t.TITULO_PREVIA)}</title>
    <style>
        :root { font-family: system-ui, sans-serif; color: #1f2328; background: #ffffff; }
        body { margin: 0 auto; max-width: 40rem; padding: 2rem 1rem; line-height: 1.5; }
        #dominio { font-size: 1.5rem; font-weight: 700; margin: 0; word-break: break-all; }
        #url { word-break: break-all; }
        .botao { display: inline-block; font-size: 1rem; padding: .6rem 1.2rem; border-radius: 6px; background: #1a56db; color: #ffffff; text-decoration: none; }
        a { color: #0b3d91; }
        a:focus-visible { outline: 3px solid #0b3d91; outline-offset: 2px; }
    </style>
</head>
<body>
    <main>
        <h1>${escapeHtml(t.TITULO_PREVIA)}</h1>
        <p>${escapeHtml(t.TEXTO_PREVIA)}</p>
        <p id="dominio">${escapeHtml(hostnameOf(url))}</p>
        <p>${escapeHtml(t.ROTULO_URL_COMPLETA)} <code id="url">${escapeHtml(url)}</code></p>
        <p><a class="botao" href="${escapeHtml(continueHref(url))}" rel="noopener noreferrer">${escapeHtml(t.BOTAO_CONTINUAR)}</a></p>
        <p><a href="${escapeHtml(homePath)}">${escapeHtml(t.LINK_PAGINA_INICIAL)}</a></p>
    </main>
</body>
</html>`;
}

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

function parseUrl(url: string): URL | undefined {
    try {
        return new URL(url);
    } catch {
        return undefined;
    }
}

/** Domínio de destino; se a URL não puder ser analisada, mostra o texto inteiro, sem quebrar a página. */
const hostnameOf = (url: string) => parseUrl(url)?.hostname ?? url;

const NO_HREF = '#';

/** Só http/https vira link: a validação da criação não é motivo para confiar num `javascript:` vindo do banco. */
const continueHref = (url: string) => (WEB_PROTOCOLS.has(parseUrl(url)?.protocol ?? '') ? url : NO_HREF);
