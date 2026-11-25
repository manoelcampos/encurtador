// Textos mostrados ao usuário no idioma escolhido. Os textos de cada idioma ficam nos arquivos i18n-*.js.
import en from './i18n-en.js';
import es from './i18n-es.js';
import ptBR from './i18n-pt-BR.js';

/** @typedef {import('./i18n-pt-BR.js').Traducao} Traducao */
/** @typedef {keyof Traducao} ChaveDeTexto */

/**
 * Traduções por código de idioma (BCP 47). Para adicionar um idioma, crie o arquivo i18n-*.js e inclua-o aqui.
 * @type {Readonly<Record<string, Traducao>>}
 */
export const TRADUCOES = Object.freeze({ 'pt-BR': ptBR, en, es });
export const IDIOMAS = Object.freeze(Object.keys(TRADUCOES));
/** Idioma usado quando o navegador não pede nenhum dos disponíveis. */
export const IDIOMA_PADRAO = 'en';
/** Idioma em que o HTML vem do servidor, antes de o JS aplicar o escolhido. */
export const IDIOMA_DO_HTML = 'pt-BR';

let traducaoAtual = TRADUCOES[IDIOMA_DO_HTML];

/** @param {string} idioma um dos IDIOMAS; outro valor usa o IDIOMA_PADRAO */
export function definirIdioma(idioma) {
    traducaoAtual = TRADUCOES[idioma] ?? TRADUCOES[IDIOMA_PADRAO];
}

/** @param {ChaveDeTexto} chave */
export function texto(chave) {
    return traducaoAtual[chave];
}

/** @param {string} idioma ex.: `es-AR` → `es` */
const idiomaBase = idioma => idioma.toLowerCase().split('-')[0];

/**
 * Idioma disponível que atende ao pedido: primeiro o exato, depois o de mesmo idioma base (ex.: `pt-PT` → `pt-BR`).
 * @param {string} pedido
 * @param {readonly string[]} disponiveis
 */
function idiomaParecido(pedido, disponiveis) {
    const alvo = pedido.toLowerCase();
    return disponiveis.find(idioma => idioma.toLowerCase() === alvo)
        ?? disponiveis.find(idioma => idiomaBase(idioma) === idiomaBase(alvo));
}

/**
 * Escolhe o idioma da interface: o salvo pelo usuário, senão o primeiro do navegador que houver, senão o padrão.
 * @param {string | null} salvo idioma guardado no localStorage
 * @param {readonly string[]} doNavegador `navigator.languages`, em ordem de preferência
 * @param {readonly string[]} [disponiveis]
 */
export function escolherIdioma(salvo, doNavegador, disponiveis = IDIOMAS) {
    if (salvo && disponiveis.includes(salvo)) return salvo;

    for (const pedido of doNavegador) {
        const idioma = idiomaParecido(pedido, disponiveis);
        if (idioma) return idioma;
    }

    return IDIOMA_PADRAO;
}
