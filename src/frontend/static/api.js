// Cliente da API HTTP do backend.
import { mensagemDaApi } from './logic.js';

export class ApiError extends Error {
    /**
     * @param {string} mensagem
     * @param {number} status código HTTP da resposta
     */
    constructor(mensagem, status) {
        super(mensagem);
        this.status = status;
    }
}

/**
 * Encurta a URL e devolve o código e o link curto.
 * @param {string} caminho rota da API que encurta URLs
 * @param {string} url
 * @returns {Promise<import('./logic.js').LinkCurto>}
 */
export async function encurtar(caminho, url) {
    const res = await fetch(caminho, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
    });

    // Um proxy pode devolver HTML (ex.: 502); nesse caso usa a mensagem padrão.
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new ApiError(mensagemDaApi(dados, res.status, res.headers.get('Retry-After')), res.status);
    }

    return { code: dados.code, shortUrl: dados.shortUrl };
}
