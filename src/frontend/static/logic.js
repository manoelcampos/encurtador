// Regras da página sem DOM, testáveis com node --test.
import { ALT_QRCODE, AVISO_COPIADO, AVISO_FALHA_COPIA, MENSAGEM_CONEXAO, MENSAGEM_PADRAO } from './messages.js';

const STATUS_URL_INVALIDA = 400;
/** Marcador do código na rota do QR Code. Deve ser igual ao CODE_PARAM do backend. */
export const MARCADOR_CODIGO = '{code}';
const PREFIXO_ARQUIVO_QRCODE = 'qrcode-';
const EXTENSAO_QRCODE = '.svg';

/**
 * Mensagem de erro a partir do corpo da resposta da API.
 * @param {unknown} dados corpo JSON da resposta, ou `{}` se não era JSON
 * @returns {string}
 */
export function mensagemDaApi(dados) {
    const erro = typeof dados === 'object' && dados !== null && 'error' in dados ? dados.error : undefined;
    return typeof erro === 'string' ? erro : MENSAGEM_PADRAO;
}

/**
 * Mensagem para o erro capturado ao encurtar.
 * @param {unknown} error
 * @returns {string}
 */
export function mensagemDeFalha(error) {
    // O fetch lança TypeError quando não consegue falar com o servidor.
    if (error instanceof TypeError) return MENSAGEM_CONEXAO;
    return error instanceof Error ? error.message : MENSAGEM_PADRAO;
}

/**
 * Se o campo de URL deve ser marcado como inválido.
 * @param {number} status código HTTP da resposta
 */
export function urlInvalida(status) {
    return status === STATUS_URL_INVALIDA;
}

/**
 * Outra URL pode ter sido encurtada enquanto a cópia rodava.
 * @param {string} copiado link que estava sendo copiado
 * @param {string} atual link mostrado agora
 */
export function linkMudou(copiado, atual) {
    return atual !== copiado;
}

/** @param {boolean} sucesso */
export function avisoDeCopia(sucesso) {
    return sucesso ? AVISO_COPIADO : AVISO_FALHA_COPIA;
}

/**
 * @typedef {object} DependenciasCopia
 * @property {(texto: string) => Promise<boolean>} copiar copia o texto e diz se deu certo
 * @property {() => string} linkAtual link mostrado agora
 * @property {(mensagem: string) => void} avisar escreve o aviso para o leitor de tela
 * @property {() => void} selecionar seleciona o link para cópia manual
 * @property {(acao: () => void) => void} aposAtraso executa a ação depois do atraso do aviso
 */

/**
 * Copia o link mostrado e avisa o resultado, sem avisar se outro link aparecer no meio.
 * @param {DependenciasCopia} deps
 */
export async function copiarLink({ copiar, linkAtual, avisar, selecionar, aposAtraso }) {
    const copiado = linkAtual();
    const sucesso = await copiar(copiado);
    if (linkMudou(copiado, linkAtual())) return;

    // Limpa e escreve depois, para o leitor de tela anunciar de novo um texto repetido.
    avisar('');
    aposAtraso(() => {
        if (!linkMudou(copiado, linkAtual())) avisar(avisoDeCopia(sucesso));
    });
    if (!sucesso) selecionar();
}

/**
 * Código curto, que é o último trecho do caminho do link curto.
 * @param {string} shortUrl
 */
export function codigoDoLink(shortUrl) {
    return new URL(shortUrl).pathname.split('/').pop() ?? '';
}

/**
 * Endereço, nome do arquivo para download e texto alternativo do QR Code do link curto.
 * @param {string} rotaQrCode rota da API com o marcador do código
 * @param {string} shortUrl
 */
export function qrCodeDoLink(rotaQrCode, shortUrl) {
    const codigo = codigoDoLink(shortUrl);
    return {
        src: rotaQrCode.replace(MARCADOR_CODIGO, encodeURIComponent(codigo)),
        nomeArquivo: PREFIXO_ARQUIVO_QRCODE + codigo + EXTENSAO_QRCODE,
        alt: `${ALT_QRCODE} ${shortUrl}`,
    };
}
