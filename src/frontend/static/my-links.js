// "Meus links": os links criados neste navegador, com o token de gestão, guardados no localStorage. Sem DOM e testado.
import { MARCADOR_CODIGO } from './logic.js';

const CHAVE_MEUS_LINKS = 'meus-links';
const CAMPOS_OBRIGATORIOS = Object.freeze(['code', 'shortUrl', 'manageToken']);
const PROTOCOLOS_WEB = Object.freeze(['http:', 'https:']);
const STATUS_NAO_ENCONTRADO = 404;
const STATUS_PROIBIDO = 403;
const CODIGO_TOKEN_INVALIDO = 'INVALID_MANAGE_TOKEN';

/**
 * Link guardado neste navegador.
 * @typedef {Omit<import('./logic.js').LinkCurto, 'url' | 'maxClicks'> & { createdAt: string }} LinkGuardado
 */

/**
 * Onde os links ficam (o `localStorage` na página). Os métodos podem lançar erro, por exemplo com o
 * armazenamento bloqueado pelo navegador.
 * @typedef {Pick<Storage, 'getItem' | 'setItem'>} Armazenamento
 */

/**
 * O valor vem do navegador e pode ter sido alterado: só aceita itens com os campos de texto obrigatórios.
 * @param {unknown} item
 * @returns {item is LinkGuardado}
 */
function ehLinkGuardado(item) {
    if (typeof item !== 'object' || item === null) return false;

    const campos = /** @type {Record<string, unknown>} */ (item);
    return CAMPOS_OBRIGATORIOS.every(campo => typeof campos[campo] === 'string')
        && ehUrlWeb(/** @type {string} */ (campos.shortUrl))
        && ehDataOpcional(campos.expiresAt);
}

/**
 * Só http/https vira href: um valor alterado como `javascript:` nunca chega ao link.
 * @param {string} texto
 */
function ehUrlWeb(texto) {
    try {
        return PROTOCOLOS_WEB.includes(new URL(texto).protocol);
    } catch {
        return false;
    }
}

/**
 * Ausente, null ou texto com data válida; outro valor faria a formatação da data lançar RangeError.
 * @param {unknown} valor
 */
const ehDataOpcional = valor => valor === undefined || valor === null
    || (typeof valor === 'string' && !Number.isNaN(Date.parse(valor)));

/**
 * Se o link deve sair da lista depois que a API recusou apagá-lo, e o aviso a mostrar. Sai quando já não existe
 * (404) ou quando o token guardado não confere (403 com INVALID_MANAGE_TOKEN), pois aí nunca poderá ser apagado.
 * @param {number} status código HTTP da resposta
 * @param {string | undefined} codigo campo `code` do corpo da resposta
 * @returns {import('./messages.js').ChaveDeTexto | undefined} chave do aviso, ou undefined se o link fica na lista
 */
export function avisoAoEsquecer(status, codigo) {
    if (status === STATUS_NAO_ENCONTRADO) return 'AVISO_LINK_APAGADO';
    if (status === STATUS_PROIBIDO && codigo === CODIGO_TOKEN_INVALIDO) return 'AVISO_LINK_REMOVIDO_TOKEN_INVALIDO';
    return undefined;
}

/**
 * Links guardados, do mais novo para o mais antigo; lista vazia se não houver ou o armazenamento falhar.
 * @param {Armazenamento} armazenamento
 * @returns {LinkGuardado[]}
 */
export function lerMeusLinks(armazenamento) {
    try {
        const dados = JSON.parse(armazenamento.getItem(CHAVE_MEUS_LINKS) ?? '[]');
        return Array.isArray(dados) ? dados.filter(ehLinkGuardado) : [];
    } catch {
        return [];
    }
}

/**
 * @param {Armazenamento} armazenamento
 * @param {LinkGuardado[]} links
 */
function gravar(armazenamento, links) {
    try {
        armazenamento.setItem(CHAVE_MEUS_LINKS, JSON.stringify(links));
        return true;
    } catch {
        return false;
    }
}

/**
 * Guarda o link recém-criado no início da lista. Retorna false se o armazenamento falhar
 * (aí o token se perde e o link não pode ser apagado depois).
 * @param {Armazenamento} armazenamento
 * @param {import('./logic.js').LinkCurto} link
 * @param {Date} [agora]
 */
export function guardarLink(armazenamento, { code, shortUrl, manageToken, expiresAt }, agora = new Date()) {
    const novo = { code, shortUrl, manageToken, expiresAt, createdAt: agora.toISOString() };
    const outros = lerMeusLinks(armazenamento).filter(link => link.code !== code);
    return gravar(armazenamento, [novo, ...outros]);
}

/**
 * Tira o link da lista (depois de apagado na API).
 * @param {Armazenamento} armazenamento
 * @param {string} code
 */
export function esquecerLink(armazenamento, code) {
    return gravar(armazenamento, lerMeusLinks(armazenamento).filter(link => link.code !== code));
}

/**
 * Endereços das estatísticas e da pré-visualização do link.
 * @param {string} rotaEstatisticas rota da API com o marcador do código
 * @param {string} sufixoPrevia sufixo que, depois do link curto, mostra o destino
 * @param {LinkGuardado} link
 */
export function enderecosDoLink(rotaEstatisticas, sufixoPrevia, { code, shortUrl }) {
    return {
        estatisticas: rotaEstatisticas.replace(MARCADOR_CODIGO, encodeURIComponent(code)),
        previa: shortUrl + sufixoPrevia,
    };
}
