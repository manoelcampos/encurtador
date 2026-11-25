// Liga as regras da página ao DOM.
import { ApiError, encurtar } from './api.js';
import { avisoDeCopia, linkMudou, mensagemDeFalha, urlInvalida } from './logic.js';

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
const caminhoApi = form.dataset.api ?? '';

/**
 * @param {string} mensagem
 * @param {boolean} invalida
 */
function mostrarErro(mensagem, invalida) {
    erro.textContent = mensagem;
    resultado.hidden = true;
    acoes.hidden = true;
    if (invalida) {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
    }
}

/** @param {string} shortUrl */
function mostrarLink(shortUrl) {
    link.href = shortUrl;
    link.textContent = shortUrl;
    resultado.hidden = false;
    acoes.hidden = false;
}

function selecionarLink() {
    window.getSelection()?.selectAllChildren(link);
}

const ATRASO_AVISO_MS = 100;

/**
 * Limpa e escreve depois, para o leitor de tela anunciar de novo um texto repetido.
 * @param {string} copiado
 * @param {string} mensagem
 */
function avisarCopia(copiado, mensagem) {
    aviso.textContent = '';
    setTimeout(() => {
        if (!linkMudou(copiado, link.textContent)) aviso.textContent = mensagem;
    }, ATRASO_AVISO_MS);
}

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

async function copiarLink() {
    const copiado = link.textContent;
    const sucesso = await copiar(copiado);
    if (linkMudou(copiado, link.textContent)) return;

    avisarCopia(copiado, avisoDeCopia(sucesso));
    if (!sucesso) selecionarLink();
}

elemento('copiar', HTMLButtonElement).addEventListener('click', copiarLink);

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
