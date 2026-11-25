// Regras de compartilhamento do link curto, sem DOM, testáveis com node --test.
import { texto } from './messages.js';

/**
 * Rede para onde o link pode ser compartilhado sem a Web Share API.
 * @typedef {object} Rede
 * @property {import('./messages.js').ChaveDeTexto} rotulo chave do texto com o nome acessível do link
 * @property {(url: string, titulo: string) => string} endereco monta o endereço de compartilhamento
 */

/**
 * Para adicionar uma rede, basta incluí-la aqui.
 * @type {readonly Rede[]}
 */
export const REDES = Object.freeze([
    { rotulo: 'COMPARTILHAR_WHATSAPP', endereco: url => `https://wa.me/?text=${encodeURIComponent(url)}` },
    { rotulo: 'COMPARTILHAR_TELEGRAM', endereco: url => `https://t.me/share/url?url=${encodeURIComponent(url)}` },
    { rotulo: 'COMPARTILHAR_X', endereco: url => `https://x.com/intent/tweet?url=${encodeURIComponent(url)}` },
    {
        rotulo: 'COMPARTILHAR_EMAIL',
        endereco: (url, titulo) => `mailto:?subject=${encodeURIComponent(titulo)}&body=${encodeURIComponent(url)}`,
    },
]);

const PROTOCOLO_WEB = /^https?:/;

/**
 * Link de compartilhamento pronto para a página.
 * @typedef {object} LinkDeCompartilhamento
 * @property {string} rotulo
 * @property {string} href
 * @property {boolean} externo se abre numa nova aba (`mailto:` não abre)
 */

/**
 * @param {string} url link curto
 * @param {readonly Rede[]} [redes]
 * @returns {LinkDeCompartilhamento[]}
 */
export function linksDeCompartilhamento(url, redes = REDES) {
    return redes.map(({ rotulo, endereco }) => {
        const href = endereco(url, texto('TITULO_COMPARTILHAMENTO'));
        return { rotulo: texto(rotulo), href, externo: PROTOCOLO_WEB.test(href) };
    });
}

/** Resultados possíveis de `compartilhar`. */
export const RESULTADO = Object.freeze({ NATIVO: 'nativo', CANCELADO: 'cancelado', ALTERNATIVO: 'alternativo' });

/**
 * Compartilha pelo menu nativo. Sem suporte ou com erro, pede as opções alternativas.
 * @param {string} url link curto
 * @param {((dados: ShareData) => Promise<void>) | undefined} share `navigator.share`, se existir
 * @returns {Promise<string>} um dos valores de RESULTADO
 */
export async function compartilhar(url, share) {
    if (!share) return RESULTADO.ALTERNATIVO;

    try {
        await share({ url, title: texto('TITULO_COMPARTILHAMENTO') });
        return RESULTADO.NATIVO;
    } catch (error) {
        // AbortError: o usuário fechou o menu, o que não é erro.
        return error instanceof Error && error.name === 'AbortError' ? RESULTADO.CANCELADO : RESULTADO.ALTERNATIVO;
    }
}
