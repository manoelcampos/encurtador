import { ALIAS_MAX_LENGTH } from '../backend/alias-validator.ts';
import { QRCODE_PATH, SHORTEN_PATH } from '../backend/api-paths.ts';
import { EXPIRATION_OPTIONS } from '../backend/expiration.ts';
import { STATIC_PATH } from './static-files.ts';
import { chaveDaValidade } from './static/logic.js';
import { IDIOMA_DO_HTML, IDIOMAS, TRADUCOES } from './static/messages.js';

// O HTML vem em IDIOMA_DO_HTML; o main.js troca os textos marcados com data-i18n* pelo idioma escolhido.
const t = TRADUCOES[IDIOMA_DO_HTML];

const opcoesDeIdioma = IDIOMAS
    .map(idioma => `<option value="${idioma}" lang="${idioma}">${TRADUCOES[idioma].NOME_IDIOMA}</option>`)
    .join('');

// Os valores vêm da mesma lista que o backend aceita; o vazio (padrão) é sem prazo.
const opcoesDeValidade = [
    `<option value="" data-i18n="VALIDADE_SEM_PRAZO" selected>${t.VALIDADE_SEM_PRAZO}</option>`,
    ...Object.keys(EXPIRATION_OPTIONS).map(valor => {
        const chave = chaveDaValidade(valor);
        return `<option value="${valor}" data-i18n="${chave}">${t[chave]}</option>`;
    }),
].join('');

// A página só fala com o backend pela API HTTP (POST em SHORTEN_PATH e GET em QRCODE_PATH). O JS fica em static/.
export const HOME_PAGE_HTML = `<!doctype html>
<html lang="${IDIOMA_DO_HTML}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${t.TITULO_PAGINA}</title>
    <style>
        :root { font-family: system-ui, sans-serif; color: #1f2328; background: #ffffff; }
        body { margin: 0 auto; max-width: 40rem; padding: 2rem 1rem; line-height: 1.5; }
        label { display: block; font-weight: 600; margin-bottom: .25rem; }
        .row { display: flex; flex-wrap: wrap; gap: .5rem; }
        input { flex: 1 1 16rem; min-width: 0; font-size: 1rem; padding: .6rem; border: 1px solid #57606a; border-radius: 6px; }
        input[aria-invalid="true"] { border-color: #b42318; }
        button, .botao { font-size: 1rem; padding: .6rem 1.2rem; border: 0; border-radius: 6px; background: #1a56db; color: #ffffff; cursor: pointer; text-decoration: none; }
        button:disabled { opacity: .7; cursor: wait; }
        input:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid #0b3d91; outline-offset: 2px; }
        #campo-apelido, #campo-validade { margin-top: .75rem; }
        #expiracao { margin: .25rem 0 0; color: #57606a; }
        #dica-apelido { margin: .25rem 0 0; font-size: .9rem; color: #57606a; }
        #erro { color: #b42318; margin: .5rem 0 0; min-height: 1.5em; }
        #resultado { margin-top: 1rem; word-break: break-all; }
        a { color: #0b3d91; }
        #acoes { margin-top: .5rem; }
        #qrcode { display: block; margin-top: 1rem; max-width: 100%; height: auto; }
        #redes { list-style: none; margin: .5rem 0 0; padding: 0; }
        .row[hidden] { display: none; }
        #aviso { margin: .5rem 0 0; min-height: 1.5em; }
        #seletor-idioma { display: flex; gap: .5rem; align-items: center; justify-content: flex-end; }
        #seletor-idioma label { margin: 0; }
        select { font-size: 1rem; padding: .3rem; }
        select:focus-visible { outline: 3px solid #0b3d91; outline-offset: 2px; }
    </style>
</head>
<body>
    <main>
        <div id="seletor-idioma">
            <label for="idioma" data-i18n="ROTULO_IDIOMA">${t.ROTULO_IDIOMA}</label>
            <select id="idioma">${opcoesDeIdioma}</select>
        </div>
        <h1 data-i18n="TITULO_PAGINA">${t.TITULO_PAGINA}</h1>
        <form id="form" data-api="${SHORTEN_PATH}" data-qrcode="${QRCODE_PATH}" novalidate>
            <label for="url" data-i18n="ROTULO_URL">${t.ROTULO_URL}</label>
            <div class="row">
                <input id="url" name="url" type="url" inputmode="url" autocomplete="url" required
                    placeholder="${t.EXEMPLO_URL}" data-i18n-placeholder="EXEMPLO_URL" aria-describedby="erro">
                <button type="submit" data-i18n="BOTAO_ENCURTAR">${t.BOTAO_ENCURTAR}</button>
            </div>
            <div id="campo-apelido">
                <label for="apelido" data-i18n="ROTULO_APELIDO">${t.ROTULO_APELIDO}</label>
                <div class="row">
                    <input id="apelido" name="alias" type="text" autocomplete="off" autocapitalize="none" spellcheck="false"
                        maxlength="${ALIAS_MAX_LENGTH}" aria-describedby="dica-apelido erro">
                </div>
                <p id="dica-apelido" data-i18n="DICA_APELIDO">${t.DICA_APELIDO}</p>
            </div>
            <div id="campo-validade">
                <label for="validade" data-i18n="ROTULO_VALIDADE">${t.ROTULO_VALIDADE}</label>
                <select id="validade" name="expiresIn" aria-describedby="erro">${opcoesDeValidade}</select>
            </div>
            <p id="erro" role="alert"></p>
        </form>
        <!-- Só o link fica na região aria-live, para a troca de idioma do rótulo não ser anunciada. -->
        <p id="resultado"><span id="rotulo-link" data-i18n="ROTULO_LINK_CURTO" hidden>${t.ROTULO_LINK_CURTO}</span>
            <span aria-live="polite"><a id="link" aria-describedby="expiracao"></a></span></p>
        <p id="expiracao" hidden></p>
        <img id="qrcode" alt="" hidden>
        <div id="acoes" class="row" hidden>
            <button type="button" id="copiar" data-i18n="BOTAO_COPIAR">${t.BOTAO_COPIAR}</button>
            <a id="baixar" class="botao" download data-i18n="BOTAO_BAIXAR_QRCODE">${t.BOTAO_BAIXAR_QRCODE}</a>
            <button type="button" id="compartilhar" data-i18n="BOTAO_COMPARTILHAR">${t.BOTAO_COMPARTILHAR}</button>
        </div>
        <ul id="redes" class="row" aria-label="${t.ROTULO_OPCOES_COMPARTILHAMENTO}" data-i18n-aria-label="ROTULO_OPCOES_COMPARTILHAMENTO" hidden></ul>
        <p id="aviso" role="status"></p>
    </main>
    <script type="module" src="${STATIC_PATH}main.js"></script>
</body>
</html>`;
