// Liga as regras da página ao DOM.
import { ApiError, encurtar } from './api.js';
import { copiarLink, mensagemDeFalha, qrCodeDoLink, urlInvalida } from './logic.js';

/**
 * @template {Element} T
 * @param {Element | null} el
 * @param {new () => T} tipo
 * @returns {T}
 */
function exigir(el, tipo) {
    if (!(el instanceof tipo)) throw new Error(`Elemento ${tipo.name} não encontrado.`);
    return el;
}

/**
 * @template {Element} T
 * @param {string} id
 * @param {new () => T} tipo
 */
const elemento = (id, tipo) => exigir(document.getElementById(id), tipo);

const form = elemento('form', HTMLFormElement);
const input = elemento('url', HTMLInputElement);
const button = exigir(form.querySelector('button'), HTMLButtonElement);
const erro = elemento('erro', HTMLElement);
const resultado = elemento('resultado', HTMLElement);
const link = elemento('link', HTMLAnchorElement);
const acoes = elemento('acoes', HTMLElement);
const aviso = elemento('aviso', HTMLElement);
const qrCode = elemento('qrcode', HTMLImageElement);
const baixar = elemento('baixar', HTMLAnchorElement);
const caminhoApi = form.dataset.api ?? '';
const rotaQrCode = form.dataset.qrcode ?? '';

/**
 * @param {string} mensagem
 * @param {boolean} invalida
 */
function mostrarErro(mensagem, invalida) {
    erro.textContent = mensagem;
    resultado.hidden = true;
    acoes.hidden = true;
    qrCode.hidden = true;
    if (invalida) {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
    }
}

/** @param {import('./logic.js').LinkCurto} linkCurto */
function mostrarLink(linkCurto) {
    link.href = linkCurto.shortUrl;
    link.textContent = linkCurto.shortUrl;
    resultado.hidden = false;
    acoes.hidden = false;
    mostrarQrCode(linkCurto);
}

/** @param {import('./logic.js').LinkCurto} linkCurto */
function mostrarQrCode(linkCurto) {
    const { src, nomeArquivo, alt } = qrCodeDoLink(rotaQrCode, linkCurto);
    qrCode.src = src;
    qrCode.alt = alt;
    qrCode.hidden = false;
    baixar.href = src;
    baixar.download = nomeArquivo;
}

function selecionarLink() {
    window.getSelection()?.selectAllChildren(link);
}

const ATRASO_AVISO_MS = 100;

/**
 * Sem HTTPS, navigator.clipboard não existe: o TypeError cai no catch.
 * @param {string} texto
 */
async function copiar(texto) {
    try {
        await navigator.clipboard.writeText(texto);
        return true;
    } catch {
        return false;
    }
}

const dependenciasCopia = {
    copiar,
    linkAtual: () => link.textContent,
    /** @param {string} mensagem */
    avisar: mensagem => { aviso.textContent = mensagem; },
    selecionar: selecionarLink,
    /** @param {() => void} acao */
    aposAtraso: acao => { setTimeout(acao, ATRASO_AVISO_MS); },
};

elemento('copiar', HTMLButtonElement).addEventListener('click', () => copiarLink(dependenciasCopia));

form.addEventListener('submit', async event => {
    event.preventDefault();
    // Limpa antes, para que o mesmo erro seja anunciado de novo pelo leitor de tela.
    erro.textContent = '';
    aviso.textContent = '';
    input.removeAttribute('aria-invalid');
    button.disabled = true;

    try {
        mostrarLink(await encurtar(caminhoApi, input.value.trim()));
    } catch (error) {
        mostrarErro(mensagemDeFalha(error), error instanceof ApiError && urlInvalida(error.status));
    } finally {
        button.disabled = false;
    }
});
