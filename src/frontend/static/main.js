// Liga as regras da página ao DOM.
import { ApiError, encurtar } from './api.js';
import { avisarDeNovo, copiarLink, mensagemDeFalha, qrCodeDoLink, urlInvalida } from './logic.js';
import { definirIdioma, escolherIdioma, texto } from './messages.js';
import { compartilhar, linksDeCompartilhamento, RESULTADO } from './share.js';

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
const rotuloLink = elemento('rotulo-link', HTMLElement);
const link = elemento('link', HTMLAnchorElement);
const acoes = elemento('acoes', HTMLElement);
const aviso = elemento('aviso', HTMLElement);
const qrCode = elemento('qrcode', HTMLImageElement);
const baixar = elemento('baixar', HTMLAnchorElement);
const redes = elemento('redes', HTMLUListElement);
const seletorIdioma = elemento('idioma', HTMLSelectElement);
const caminhoApi = form.dataset.api ?? '';
const rotaQrCode = form.dataset.qrcode ?? '';
/**
 * Link mostrado agora, para traduzir o texto alternativo do QR Code ao trocar de idioma.
 * @type {import('./logic.js').LinkCurto | undefined}
 */
let linkMostrado;

/**
 * @param {string} mensagem
 * @param {boolean} invalida
 */
function mostrarErro(mensagem, invalida) {
    erro.textContent = mensagem;
    linkMostrado = undefined;
    rotuloLink.hidden = true;
    link.removeAttribute('href');
    link.textContent = '';
    acoes.hidden = true;
    redes.hidden = true;
    qrCode.hidden = true;
    if (invalida) {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
    }
}

/** @param {import('./logic.js').LinkCurto} linkCurto */
function mostrarLink(linkCurto) {
    linkMostrado = linkCurto;
    link.href = linkCurto.shortUrl;
    link.textContent = linkCurto.shortUrl;
    rotuloLink.hidden = false;
    acoes.hidden = false;
    redes.hidden = true;
    mostrarQrCode(linkCurto);
}

/** @param {import('./share.js').LinkDeCompartilhamento} opcao */
function criarOpcaoDeRede({ rotulo, href, externo }) {
    const a = document.createElement('a');
    a.className = 'botao';
    a.href = href;
    a.textContent = rotulo;
    if (externo) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
    }

    const item = document.createElement('li');
    item.append(a);
    return item;
}

function criarRedes() {
    redes.replaceChildren(...linksDeCompartilhamento(link.textContent).map(criarOpcaoDeRede));
}

function mostrarRedes() {
    criarRedes();
    redes.hidden = false;
    avisarDeNovo(dependenciasAviso, texto('AVISO_OPCOES_COMPARTILHAMENTO'));
}

async function compartilharLink() {
    aviso.textContent = '';
    const share = 'share' in navigator ? navigator.share.bind(navigator) : undefined;
    if (await compartilhar(link.textContent, share) === RESULTADO.ALTERNATIVO) mostrarRedes();
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

/** @type {import('./logic.js').DependenciasAviso} */
const dependenciasAviso = {
    avisar: mensagem => { aviso.textContent = mensagem; },
    aposAtraso: acao => { setTimeout(acao, ATRASO_AVISO_MS); },
};

const dependenciasCopia = {
    ...dependenciasAviso,
    copiar,
    linkAtual: () => link.textContent,
    selecionar: selecionarLink,
};

elemento('copiar', HTMLButtonElement).addEventListener('click', () => copiarLink(dependenciasCopia));
elemento('compartilhar', HTMLButtonElement).addEventListener('click', compartilharLink);

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

const CHAVE_IDIOMA_SALVO = 'idioma';
/** O elemento com data-i18n-<atributo>="CHAVE" recebe o texto da CHAVE nesse atributo. */
const ATRIBUTOS_TRADUZIDOS = Object.freeze(['placeholder', 'aria-label']);

function lerIdiomaSalvo() {
    try {
        return localStorage.getItem(CHAVE_IDIOMA_SALVO);
    } catch {
        return null;
    }
}

/** @param {string} idioma */
function salvarIdioma(idioma) {
    try {
        localStorage.setItem(CHAVE_IDIOMA_SALVO, idioma);
    } catch {
        // Sem localStorage (ex.: bloqueado pelo navegador), a escolha vale só até recarregar a página.
    }
}

/**
 * @param {Element} el
 * @param {string} atributo atributo data-i18n* com a chave do texto
 */
const textoDo = (el, atributo) => texto(/** @type {import('./messages.js').ChaveDeTexto} */ (el.getAttribute(atributo)));

function traduzirHtml() {
    document.title = texto('TITULO_PAGINA');
    for (const el of document.querySelectorAll('[data-i18n]')) {
        el.textContent = textoDo(el, 'data-i18n');
    }

    for (const atributo of ATRIBUTOS_TRADUZIDOS) {
        const dado = `data-i18n-${atributo}`;
        for (const el of document.querySelectorAll(`[${dado}]`)) {
            el.setAttribute(atributo, textoDo(el, dado));
        }
    }
}

/** Textos criados pelo JS que continuam na tela. */
function traduzirConteudoGerado() {
    if (linkMostrado) qrCode.alt = qrCodeDoLink(rotaQrCode, linkMostrado).alt;
    if (!redes.hidden) criarRedes();
}

/** @param {string} idioma um dos idiomas disponíveis */
function aplicarIdioma(idioma) {
    definirIdioma(idioma);
    document.documentElement.lang = idioma;
    seletorIdioma.value = idioma;
    traduzirHtml();
    traduzirConteudoGerado();
    // Erros e avisos são passageiros: limpa para não ficarem no idioma antigo.
    erro.textContent = '';
    aviso.textContent = '';
}

seletorIdioma.addEventListener('change', () => {
    aplicarIdioma(seletorIdioma.value);
    salvarIdioma(seletorIdioma.value);
});

aplicarIdioma(escolherIdioma(lerIdiomaSalvo(), navigator.languages ?? [navigator.language]));
