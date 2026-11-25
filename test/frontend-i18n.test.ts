import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { afterEach, test } from 'node:test';
import { HOME_PAGE_HTML } from '../src/frontend/home-page.ts';
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
