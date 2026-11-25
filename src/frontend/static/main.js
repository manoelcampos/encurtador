// Liga as regras da página ao DOM.
import { apagar, ApiError, encurtar } from './api.js';
import { avisarDeNovo, CAMPO, campoInvalido, copiarLink, mensagemDeFalha, qrCodeDoLink, textoDaExpiracao } from './logic.js';
import { definirIdioma, escolherIdioma, texto } from './messages.js';
import { avisoAoEsquecer, enderecosDoLink, esquecerLink, guardarLink, lerMeusLinks } from './my-links.js';
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
const input = elemento(CAMPO.URL, HTMLInputElement);
const apelido = elemento(CAMPO.APELIDO, HTMLInputElement);
const validade = elemento(CAMPO.VALIDADE, HTMLSelectElement);
const expiracao = elemento('expiracao', HTMLElement);
const dicaPrevia = elemento('dica-previa', HTMLElement);
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
 * @param {string | undefined} campo id do campo a marcar como inválido (um dos valores de CAMPO)
 */
function mostrarErro(mensagem, campo) {
    erro.textContent = mensagem;
    linkMostrado = undefined;
    rotuloLink.hidden = true;
    link.removeAttribute('href');
    link.textContent = '';
    expiracao.hidden = true;
    dicaPrevia.hidden = true;
    acoes.hidden = true;
    redes.hidden = true;
    qrCode.hidden = true;
    if (campo) {
        const invalido = elemento(campo, HTMLElement);
        invalido.setAttribute('aria-invalid', 'true');
        invalido.focus();
    }
}

/** @param {import('./logic.js').LinkCurto} linkCurto */
function mostrarLink(linkCurto) {
    linkMostrado = linkCurto;
    link.href = linkCurto.shortUrl;
    link.textContent = linkCurto.shortUrl;
    rotuloLink.hidden = false;
    dicaPrevia.hidden = false;
    acoes.hidden = false;
    redes.hidden = true;
    mostrarExpiracao(linkCurto);
    mostrarQrCode(linkCurto);
}

/** @param {import('./logic.js').LinkCurto} linkCurto */
function mostrarExpiracao({ expiresAt }) {
    expiracao.textContent = textoDaExpiracao(expiresAt, document.documentElement.lang);
    expiracao.hidden = !expiresAt;
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
    apelido.removeAttribute('aria-invalid');
    validade.removeAttribute('aria-invalid');
    button.disabled = true;

    try {
        const linkCurto = await encurtar(caminhoApi, input.value.trim(), apelido.value.trim(), validade.value);
        mostrarLink(linkCurto);
        lembrarLink(linkCurto);
        // O apelido já foi usado: deixá-lo no campo daria 409 na próxima URL.
        apelido.value = '';
    } catch (error) {
        mostrarErro(mensagemDeFalha(error), error instanceof ApiError ? campoInvalido(error.status, error.codigo) : undefined);
    } finally {
        button.disabled = false;
    }
});

const secaoMeusLinks = elemento('meus-links', HTMLElement);
const tituloMeusLinks = elemento('titulo-meus-links', HTMLElement);
const listaMeusLinks = elemento('lista-meus-links', HTMLUListElement);
const meusLinksVazio = elemento('meus-links-vazio', HTMLElement);
const avisoMeusLinks = elemento('aviso-meus-links', HTMLElement);
const { link: rotaDoLink = '', stats: rotaEstatisticas = '', previa: sufixoPrevia = '' } = secaoMeusLinks.dataset;

/**
 * O acesso ao localStorage fica dentro das funções, pois ele pode lançar erro (ex.: bloqueado pelo navegador).
 * @type {import('./my-links.js').Armazenamento}
 */
const armazenamento = {
    getItem: chave => localStorage.getItem(chave),
    setItem: (chave, valor) => localStorage.setItem(chave, valor),
};

/** @type {import('./logic.js').DependenciasAviso} */
const dependenciasAvisoMeusLinks = {
    avisar: mensagem => { avisoMeusLinks.textContent = mensagem; },
    aposAtraso: acao => { setTimeout(acao, ATRASO_AVISO_MS); },
};

/**
 * Uma falha aqui só vai para o log: o link já foi criado e mostrado, então o envio não deve virar erro.
 * @param {import('./logic.js').LinkCurto} linkCurto
 */
function lembrarLink(linkCurto) {
    try {
        if (!guardarLink(armazenamento, linkCurto)) avisarDeNovo(dependenciasAviso, texto('AVISO_FALHA_GUARDAR'));
        renderizarMeusLinks();
    } catch (error) {
        console.error('Não foi possível atualizar "Meus links":', error);
    }
}

function renderizarMeusLinks() {
    const links = lerMeusLinks(armazenamento);
    listaMeusLinks.replaceChildren(...links.map(criarItemDeMeusLinks));
    meusLinksVazio.hidden = links.length > 0;
}

/**
 * @param {import('./my-links.js').LinkGuardado} linkGuardado
 * @param {number} indice
 */
function criarItemDeMeusLinks(linkGuardado, indice) {
    // As ações de cada item são descritas pelo link curto, para o leitor de tela saber de qual link é cada "Apagar".
    const idDoLink = `meu-link-${indice}`;
    const { estatisticas, previa } = enderecosDoLink(rotaEstatisticas, sufixoPrevia, linkGuardado);
    const curto = criarAncora(linkGuardado.shortUrl, linkGuardado.shortUrl);
    curto.id = idDoLink;

    const acoesDoLink = document.createElement('div');
    acoesDoLink.className = 'row';
    acoesDoLink.append(
        criarAncora(estatisticas, texto('LINK_ESTATISTICAS'), idDoLink),
        criarAncora(previa, texto('LINK_VER_DESTINO'), idDoLink),
        criarBotaoApagar(linkGuardado, idDoLink),
    );

    const item = document.createElement('li');
    item.append(curto, criarExpiracaoDoItem(linkGuardado.expiresAt), acoesDoLink);
    return item;
}

/**
 * @param {string} href
 * @param {string} rotulo
 * @param {string} [descritoPor] id do elemento que descreve o link
 */
function criarAncora(href, rotulo, descritoPor) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = rotulo;
    if (descritoPor) a.setAttribute('aria-describedby', descritoPor);
    return a;
}

/** @param {string | null} expiresAt */
function criarExpiracaoDoItem(expiresAt) {
    const p = document.createElement('p');
    p.textContent = textoDaExpiracao(expiresAt, document.documentElement.lang);
    p.hidden = !expiresAt;
    return p;
}

/**
 * O primeiro clique só pede confirmação (sem window.confirm, que atrapalha leitores de tela); o segundo apaga.
 * @param {import('./my-links.js').LinkGuardado} linkGuardado
 * @param {string} descritoPor id do link curto
 */
function criarBotaoApagar(linkGuardado, descritoPor) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = texto('BOTAO_APAGAR');
    botao.setAttribute('aria-describedby', descritoPor);
    botao.addEventListener('click', () => cliqueEmApagar(botao, linkGuardado));
    // Sair do botão cancela a confirmação pendente.
    botao.addEventListener('blur', () => {
        delete botao.dataset.confirmando;
        botao.textContent = texto('BOTAO_APAGAR');
    });
    return botao;
}

/**
 * @param {HTMLButtonElement} botao
 * @param {import('./my-links.js').LinkGuardado} linkGuardado
 */
async function cliqueEmApagar(botao, linkGuardado) {
    if (!botao.dataset.confirmando) {
        botao.dataset.confirmando = 'true';
        botao.textContent = texto('BOTAO_CONFIRMAR_APAGAR');
        avisarDeNovo(dependenciasAvisoMeusLinks, texto('AVISO_CONFIRMAR_APAGAR'));
        return;
    }

    botao.disabled = true;
    try {
        await apagar(rotaDoLink, linkGuardado);
        concluirExclusao(linkGuardado.code, 'AVISO_LINK_APAGADO');
    } catch (error) {
        const chaveDoAviso = error instanceof ApiError ? avisoAoEsquecer(error.status, error.codigo) : undefined;
        if (chaveDoAviso) return concluirExclusao(linkGuardado.code, chaveDoAviso);

        botao.disabled = false;
        botao.focus();
        avisarDeNovo(dependenciasAvisoMeusLinks, mensagemDeFalha(error));
    }
}

/**
 * O botão apagado some da página; o foco vai para o título da seção, para não se perder.
 * @param {string} code
 * @param {import('./messages.js').ChaveDeTexto} chaveDoAviso
 */
function concluirExclusao(code, chaveDoAviso) {
    esquecerLink(armazenamento, code);
    renderizarMeusLinks();
    tituloMeusLinks.focus();
    avisarDeNovo(dependenciasAvisoMeusLinks, texto(chaveDoAviso));
}

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
    if (linkMostrado) {
        qrCode.alt = qrCodeDoLink(rotaQrCode, linkMostrado).alt;
        mostrarExpiracao(linkMostrado);
    }

    if (!redes.hidden) criarRedes();
    renderizarMeusLinks();
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
    avisoMeusLinks.textContent = '';
}

seletorIdioma.addEventListener('change', () => {
    aplicarIdioma(seletorIdioma.value);
    salvarIdioma(seletorIdioma.value);
});

aplicarIdioma(escolherIdioma(lerIdiomaSalvo(), navigator.languages ?? [navigator.language]));
