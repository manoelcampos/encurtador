// Cliente da API HTTP do backend.
import { campoTexto, corpoDoPedido, mensagemDaApi } from './logic.js';

export class ApiError extends Error {
    /**
     * @param {string} mensagem
     * @param {number} status código HTTP da resposta
     * @param {string} [codigo] campo `code` do corpo da resposta, quando houver
     */
    constructor(mensagem, status, codigo) {
        super(mensagem);
        this.status = status;
        this.codigo = codigo;
    }
}

/**
 * Encurta a URL e devolve o código e o link curto.
 * @param {string} caminho rota da API que encurta URLs
 * @param {string} url
 * @param {string} [apelido] apelido opcional; vazio gera um código
 * @param {string} [validade] prazo de validade opcional (`expiresIn`); vazio é sem prazo
 * @returns {Promise<import('./logic.js').LinkCurto>}
 */
export async function encurtar(caminho, url, apelido = '', validade = '') {
    const res = await fetch(caminho, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpoDoPedido(url, apelido, validade)),
    });

    // Um proxy pode devolver HTML (ex.: 502); nesse caso usa a mensagem padrão.
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) {
        const mensagem = mensagemDaApi(dados, res.status, res.headers.get('Retry-After'));
        throw new ApiError(mensagem, res.status, campoTexto(dados, 'code'));
    }

    return { code: dados.code, shortUrl: dados.shortUrl, expiresAt: dados.expiresAt ?? null };
}
