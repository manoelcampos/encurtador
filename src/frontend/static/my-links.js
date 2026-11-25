// "Meus links": os links criados neste navegador, com o token de gestão, guardados no localStorage. Sem DOM e testado.
import { MARCADOR_CODIGO } from './logic.js';

const CHAVE_MEUS_LINKS = 'meus-links';
const CAMPOS_OBRIGATORIOS = Object.freeze(['code', 'shortUrl', 'manageToken']);

/**
 * Link guardado neste navegador.
 * @typedef {import('./logic.js').LinkCurto & { createdAt: string }} LinkGuardado
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
    return CAMPOS_OBRIGATORIOS.every(campo => typeof campos[campo] === 'string');
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
