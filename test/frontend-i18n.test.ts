import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { afterEach, test } from 'node:test';
import { ALIAS_MAX_LENGTH, ALIAS_MIN_LENGTH } from '../src/backend/alias-validator.ts';
import { EXPIRATION_OPTIONS } from '../src/backend/expiration.ts';
import { MAX_CLICKS_LIMIT } from '../src/backend/max-clicks.ts';
import { HOME_PAGE_HTML } from '../src/frontend/home-page.ts';
import { chaveDaValidade } from '../src/frontend/static/logic.js';
import { STATIC_DIR } from '../src/frontend/static-files.ts';
import {
    definirIdioma, escolherIdioma, IDIOMA_DO_HTML, IDIOMA_PADRAO, IDIOMAS, texto, TRADUCOES,
} from '../src/frontend/static/messages.js';
import { linksDeCompartilhamento } from '../src/frontend/static/share.js';

const ARQUIVO_DE_TRADUCAO = /^i18n-(.+)\.js$/;

afterEach(() => definirIdioma(IDIOMA_DO_HTML));

/** Lê todos os arquivos i18n-*.js da pasta, por idioma, mesmo os que não foram registrados em TRADUCOES. */
async function lerArquivosDeTraducao() {
    const arquivos = (await readdir(STATIC_DIR)).filter(nome => ARQUIVO_DE_TRADUCAO.test(nome));
    const traducoes = await Promise.all(arquivos.map(async nome => {
        const { default: traducao } = await import(new URL(nome, STATIC_DIR).href);
        return [nome.replace(ARQUIVO_DE_TRADUCAO, '$1'), traducao] as const;
    }));

    return new Map<string, Record<string, unknown>>(traducoes);
}

test('todos os arquivos de tradução têm as mesmas chaves e nenhum texto vazio', async () => {
    const traducoes = await lerArquivosDeTraducao();
    const chavesEsperadas = Object.keys(TRADUCOES[IDIOMA_DO_HTML]).sort();

    for (const [idioma, traducao] of traducoes) {
        assert.deepEqual(Object.keys(traducao).sort(), chavesEsperadas, idioma);
        for (const [chave, valor] of Object.entries(traducao)) {
            assert.ok(typeof valor === 'string' && valor.trim() !== '', `${idioma}.${chave} está vazio`);
        }
    }
});

test('todo arquivo de tradução está registrado em TRADUCOES', async () => {
    const idiomasDosArquivos = [...(await lerArquivosDeTraducao()).keys()].sort();
    assert.deepEqual(idiomasDosArquivos, [...IDIOMAS].sort());
    assert.ok(IDIOMAS.includes(IDIOMA_PADRAO));
});

test('usa o idioma salvo pelo usuário, se estiver disponível', () => {
    assert.equal(escolherIdioma('es', ['pt-BR']), 'es');
    assert.equal(escolherIdioma('fr', ['pt-BR']), 'pt-BR');
});

test('usa o primeiro idioma do navegador que tiver tradução', () => {
    assert.equal(escolherIdioma(null, ['fr-FR', 'es', 'en']), 'es');
    assert.equal(escolherIdioma(null, ['PT-br']), 'pt-BR');
});

test('casa só o idioma base quando a variante não tem tradução', () => {
    assert.equal(escolherIdioma(null, ['es-AR']), 'es');
    assert.equal(escolherIdioma(null, ['pt-PT', 'en']), 'pt-BR');
    assert.equal(escolherIdioma(null, ['en-GB']), 'en');
});

test('usa inglês quando o navegador não pede nenhum idioma com tradução', () => {
    assert.equal(escolherIdioma(null, ['fr', 'de-DE']), IDIOMA_PADRAO);
    assert.equal(escolherIdioma(null, []), IDIOMA_PADRAO);
    assert.equal(IDIOMA_PADRAO, 'en');
});

test('troca os textos ao definir o idioma, inclusive os gerados pelo JS', () => {
    definirIdioma('es');
    assert.equal(texto('BOTAO_ENCURTAR'), TRADUCOES.es.BOTAO_ENCURTAR);
    assert.equal(linksDeCompartilhamento('https://encurta.do/a')[0].rotulo, TRADUCOES.es.COMPARTILHAR_WHATSAPP);

    definirIdioma('xx');
    assert.equal(texto('BOTAO_ENCURTAR'), TRADUCOES[IDIOMA_PADRAO].BOTAO_ENCURTAR);
});

/** Valores de data-i18n e data-i18n-<atributo> no HTML, que são chaves de texto. */
const CHAVE_NO_HTML = /data-i18n(?:-[\w-]+)?="([^"]*)"/g;

test('toda chave usada no HTML existe nas traduções', () => {
    const chaves = [...HOME_PAGE_HTML.matchAll(CHAVE_NO_HTML)].map(([, chave]) => chave);
    assert.ok(chaves.length > 0);
    for (const chave of chaves) {
        assert.ok(Object.hasOwn(TRADUCOES[IDIOMA_DO_HTML], chave), chave);
    }
});

// O HTML de home-page.ts insere esses textos sem escapar.
const CARACTERE_ESPECIAL_DE_HTML = /["<>&]/;

test('os textos usados no HTML não têm caracteres especiais de HTML', () => {
    const textosDoHtml = [
        ...Object.values(TRADUCOES[IDIOMA_DO_HTML]),
        ...IDIOMAS.map(idioma => TRADUCOES[idioma].NOME_IDIOMA),
    ];
    for (const valor of textosDoHtml) {
        assert.doesNotMatch(valor, CARACTERE_ESPECIAL_DE_HTML);
    }
});

test('o seletor de validade tem "Sem prazo" e as opções do backend, todas com tradução', () => {
    const valores = [...HOME_PAGE_HTML.matchAll(/<option value="([^"]*)" data-i18n="/g)].map(([, valor]) => valor);
    assert.deepEqual(valores, ['', ...Object.keys(EXPIRATION_OPTIONS)]);
    for (const valor of Object.keys(EXPIRATION_OPTIONS)) {
        assert.ok(Object.hasOwn(TRADUCOES[IDIOMA_DO_HTML], chaveDaValidade(valor)), valor);
    }
});

test('a dica e a mensagem de apelido citam os mesmos limites do backend', () => {
    for (const idioma of IDIOMAS) {
        for (const chave of ['DICA_APELIDO', 'MENSAGEM_APELIDO_INVALIDO'] as const) {
            const valor = TRADUCOES[idioma][chave];
            assert.ok(valor.includes(String(ALIAS_MIN_LENGTH)) && valor.includes(String(ALIAS_MAX_LENGTH)), `${idioma} ${chave}`);
        }
    }
});

test('a dica e a mensagem do limite de acessos citam o máximo aceito pelo backend', () => {
    for (const idioma of IDIOMAS) {
        for (const chave of ['DICA_LIMITE_ACESSOS', 'MENSAGEM_LIMITE_ACESSOS_INVALIDO'] as const) {
            assert.ok(TRADUCOES[idioma][chave].includes(String(MAX_CLICKS_LIMIT)), `${idioma} ${chave}`);
        }
    }
});

test('a página tem o campo de limite de acessos, com rótulo e dica, e o lugar do texto de usos', () => {
    assert.match(HOME_PAGE_HTML, /<label for="limite-acessos" data-i18n="ROTULO_LIMITE_ACESSOS">/);
    assert.match(HOME_PAGE_HTML, /<input id="limite-acessos" name="maxClicks" type="text" inputmode="numeric"/);
    assert.match(HOME_PAGE_HTML, /aria-describedby="dica-limite erro"/);
    assert.match(HOME_PAGE_HTML, /<p id="usos" hidden><\/p>/);
});
