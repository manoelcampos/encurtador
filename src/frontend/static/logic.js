// Regras da página sem DOM, testáveis com node --test.
import { texto } from './messages.js';

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
    return typeof erro === 'string' ? erro : texto('MENSAGEM_PADRAO');
}

/**
 * Mensagem para o erro capturado ao encurtar.
 * @param {unknown} error
 * @returns {string}
 */
export function mensagemDeFalha(error) {
    // O fetch lança TypeError quando não consegue falar com o servidor.
    if (error instanceof TypeError) return texto('MENSAGEM_CONEXAO');
    return error instanceof Error ? error.message : texto('MENSAGEM_PADRAO');
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
    return sucesso ? texto('AVISO_COPIADO') : texto('AVISO_FALHA_COPIA');
}

/**
 * @typedef {object} DependenciasAviso
 * @property {(mensagem: string) => void} avisar escreve o aviso para o leitor de tela
 * @property {(acao: () => void) => void} aposAtraso executa a ação depois do atraso do aviso
 */

/**
 * Limpa o aviso e escreve depois, para o leitor de tela anunciar de novo um texto repetido.
 * @param {DependenciasAviso} deps
 * @param {string} mensagem
 * @param {() => boolean} [aindaValido] se a mensagem ainda deve ser escrita depois do atraso
 */
export function avisarDeNovo({ avisar, aposAtraso }, mensagem, aindaValido = () => true) {
    avisar('');
    aposAtraso(() => {
        if (aindaValido()) avisar(mensagem);
    });
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

    avisarDeNovo({ avisar, aposAtraso }, avisoDeCopia(sucesso), () => !linkMudou(copiado, linkAtual()));
    if (!sucesso) selecionar();
}

/**
 * Link curto devolvido pela API.
 * @typedef {object} LinkCurto
 * @property {string} code
 * @property {string} shortUrl
 */

/**
 * Endereço, nome do arquivo para download e texto alternativo do QR Code do link curto.
 * @param {string} rotaQrCode rota da API com o marcador do código
 * @param {LinkCurto} linkCurto
 */
export function qrCodeDoLink(rotaQrCode, { code, shortUrl }) {
    return {
        src: rotaQrCode.replace(MARCADOR_CODIGO, encodeURIComponent(code)),
        nomeArquivo: PREFIXO_ARQUIVO_QRCODE + code + EXTENSAO_QRCODE,
        alt: `${texto('ALT_QRCODE')} ${shortUrl}`,
    };
}
