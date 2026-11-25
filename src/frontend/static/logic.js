// Regras da página sem DOM, testáveis com node --test.
import { texto } from './messages.js';

const STATUS_URL_INVALIDA = 400;
const STATUS_LIMITE_EXCEDIDO = 429;
const STATUS_CONFLITO = 409;
const SEGUNDOS_POR_MINUTO = 60;
const MARCADOR_MINUTOS = '{minutos}';
const SEGUNDOS_INTEIROS = /^\d+$/;
/** Marcador do código na rota do QR Code. Deve ser igual ao CODE_PARAM do backend. */
export const MARCADOR_CODIGO = '{code}';
const PREFIXO_ARQUIVO_QRCODE = 'qrcode-';
const EXTENSAO_QRCODE = '.svg';

/**
 * Mensagem de erro a partir da resposta da API.
 * A API só responde em português; para URL ou apelido recusados e limite excedido, usa o texto traduzido do frontend.
 * @param {unknown} dados corpo JSON da resposta, ou `{}` se não era JSON
 * @param {number} status código HTTP da resposta
 * @param {string | null} [retryAfter] header Retry-After da resposta
 * @returns {string}
 */
export function mensagemDaApi(dados, status, retryAfter = null) {
    if (status === STATUS_CONFLITO) return texto('MENSAGEM_APELIDO_EM_USO');
    if (status === STATUS_URL_INVALIDA) return mensagemDeUrlRecusada(campoTexto(dados, 'code'));
    if (campoTexto(dados, 'code') === CODIGO_APELIDOS_INDISPONIVEIS) return texto('MENSAGEM_APELIDOS_INDISPONIVEIS');
    if (status === STATUS_LIMITE_EXCEDIDO) return mensagemDeLimite(retryAfter);

    return campoTexto(dados, 'error') ?? texto('MENSAGEM_PADRAO');
}

/**
 * Chave da tradução para cada `code` de erro 400, 409 ou 503 da API. Deve ter os mesmos códigos que o
 * UrlErrorCode do backend (há teste).
 * @type {Readonly<Record<string, import('./messages.js').ChaveDeTexto>>}
 */
export const CHAVES_DOS_CODIGOS_DE_ERRO = Object.freeze({
    INVALID_URL: 'MENSAGEM_URL_INVALIDA',
    OWN_DOMAIN: 'MENSAGEM_URL_PROPRIO_ENCURTADOR',
    PRIVATE_NETWORK: 'MENSAGEM_URL_REDE_LOCAL',
    MALICIOUS_URL: 'MENSAGEM_URL_MALICIOSA',
    INVALID_ALIAS: 'MENSAGEM_APELIDO_INVALIDO',
    ALIAS_TAKEN: 'MENSAGEM_APELIDO_EM_USO',
    ALIAS_UNAVAILABLE: 'MENSAGEM_APELIDOS_INDISPONIVEIS',
    INVALID_EXPIRATION: 'MENSAGEM_VALIDADE_INVALIDA',
    // Só vem de /:code e do QR Code (410), não do POST; fica aqui para a lista seguir o backend.
    LINK_EXPIRED: 'MENSAGEM_LINK_EXPIRADO',
});

const CODIGO_VALIDADE_INVALIDA = 'INVALID_EXPIRATION';

/** Vem com status 503: o servidor desativou os apelidos. */
const CODIGO_APELIDOS_INDISPONIVEIS = 'ALIAS_UNAVAILABLE';

/** Códigos de erro causados pelo apelido, não pela URL. */
const CODIGOS_DO_APELIDO = Object.freeze(['INVALID_ALIAS', 'ALIAS_TAKEN', CODIGO_APELIDOS_INDISPONIVEIS]);

/** Campos do formulário que a API pode recusar; os valores são os ids dos campos no HTML. */
export const CAMPO = Object.freeze({ URL: 'url', APELIDO: 'apelido', VALIDADE: 'validade' });

/**
 * Mensagem traduzida para a URL recusada; a de URL inválida quando o código falta ou é desconhecido.
 * @param {string | undefined} codigo
 */
function mensagemDeUrlRecusada(codigo) {
    const chave = codigo !== undefined && Object.hasOwn(CHAVES_DOS_CODIGOS_DE_ERRO, codigo)
        ? CHAVES_DOS_CODIGOS_DE_ERRO[codigo]
        : 'MENSAGEM_URL_INVALIDA';
    return texto(chave);
}

/**
 * Valor do campo do corpo JSON, se for texto.
 * @param {unknown} dados
 * @param {string} campo
 * @returns {string | undefined}
 */
export function campoTexto(dados, campo) {
    const valor = typeof dados === 'object' && dados !== null ? /** @type {Record<string, unknown>} */ (dados)[campo] : undefined;
    return typeof valor === 'string' ? valor : undefined;
}

/**
 * Mensagem de limite excedido, com os minutos de espera quando o Retry-After traz segundos válidos.
 * @param {string | null} retryAfter
 */
export function mensagemDeLimite(retryAfter) {
    const minutos = minutosDeEspera(retryAfter);
    return minutos === undefined
        ? texto('MENSAGEM_LIMITE_EXCEDIDO')
        : texto('MENSAGEM_LIMITE_EXCEDIDO_MINUTOS').replace(MARCADOR_MINUTOS, String(minutos));
}

/**
 * Minutos (arredondados para cima) do Retry-After em segundos, ou `undefined` se ele faltar ou for inválido.
 * @param {string | null} retryAfter
 */
export function minutosDeEspera(retryAfter) {
    const valor = retryAfter?.trim() ?? '';
    if (!SEGUNDOS_INTEIROS.test(valor)) return undefined;

    // Mesmo poucos segundos de espera aparecem como 1 minuto.
    return Math.max(1, Math.ceil(Number(valor) / SEGUNDOS_POR_MINUTO));
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
 * Campo a marcar como inválido para o erro da API, ou `undefined` se o erro não é de nenhum campo.
 * @param {number} status código HTTP da resposta
 * @param {string | undefined} codigo campo `code` do corpo da resposta
 * @returns {string | undefined} um dos valores de CAMPO
 */
export function campoInvalido(status, codigo) {
    if (status === STATUS_CONFLITO || (codigo !== undefined && CODIGOS_DO_APELIDO.includes(codigo))) return CAMPO.APELIDO;
    if (codigo === CODIGO_VALIDADE_INVALIDA) return CAMPO.VALIDADE;
    return status === STATUS_URL_INVALIDA ? CAMPO.URL : undefined;
}

/**
 * Corpo do pedido para encurtar; o apelido e a validade só vão quando preenchidos.
 * @param {string} url
 * @param {string} apelido
 * @param {string} [validade] uma das opções de prazo do backend (`expiresIn`); vazio é sem prazo
 */
export function corpoDoPedido(url, apelido, validade = '') {
    return {
        url,
        ...(apelido && { alias: apelido }),
        ...(validade && { expiresIn: validade }),
    };
}

/**
 * Chave da tradução do texto de uma opção de validade (ex.: `7d` → `VALIDADE_7D`). Há teste de que toda opção
 * do backend tem tradução.
 * @param {string} valor opção de prazo do backend
 * @returns {import('./messages.js').ChaveDeTexto}
 */
export function chaveDaValidade(valor) {
    return /** @type {import('./messages.js').ChaveDeTexto} */ (`VALIDADE_${valor.toUpperCase()}`);
}

/**
 * Texto da data de expiração do link no idioma informado, ou vazio se o link não expira.
 * @param {string | null} expiresAt data ISO 8601 devolvida pela API
 * @param {string} idioma código BCP 47 do idioma atual
 * @param {string} [fusoHorario] fuso da data mostrada; o padrão é o do navegador
 */
export function textoDaExpiracao(expiresAt, idioma, fusoHorario) {
    if (!expiresAt) return '';

    const formato = new Intl.DateTimeFormat(idioma, { dateStyle: 'long', timeStyle: 'short', timeZone: fusoHorario });
    return `${texto('ROTULO_EXPIRA_EM')} ${formato.format(new Date(expiresAt))}`;
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
 * @property {string | null} expiresAt data de expiração ISO 8601, ou null se o link não expira
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
