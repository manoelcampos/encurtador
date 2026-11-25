import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { LINK_PATH, PREVIEW_SUFFIX, STATS_PATH } from '../src/backend/api-paths.ts';
import { UrlErrorCode } from '../src/backend/invalid-url-error.ts';
import { HOME_PAGE_HTML } from '../src/frontend/home-page.ts';
import { ApiError, apagar } from '../src/frontend/static/api.js';
import { mensagemDaApi } from '../src/frontend/static/logic.js';
import { texto } from '../src/frontend/static/messages.js';
import { enderecosDoLink, esquecerLink, guardarLink, lerMeusLinks } from '../src/frontend/static/my-links.js';

const AGORA = new Date('2026-11-25T12:00:00Z');
const LINK = { code: 'abc', shortUrl: 'https://encurta.do/abc', expiresAt: null, manageToken: 'segredo' };
const OUTRO = { ...LINK, code: 'xyz', shortUrl: 'https://encurta.do/xyz', manageToken: 'outro' };
const fetchOriginal = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = fetchOriginal;
});

/** Armazenamento em memória, como o localStorage. */
function memoria() {
    const dados = new Map<string, string>();
    return {
        getItem: (chave: string) => dados.get(chave) ?? null,
        setItem: (chave: string, valor: string) => { dados.set(chave, valor); },
    };
}

/** Armazenamento bloqueado pelo navegador: todo acesso lança erro. */
const bloqueado = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('SecurityError'); },
};

test('guarda os links com o token e a data de criação, do mais novo para o mais antigo', () => {
    const armazenamento = memoria();
    assert.deepEqual(lerMeusLinks(armazenamento), []);

    assert.equal(guardarLink(armazenamento, LINK, AGORA), true);
    assert.equal(guardarLink(armazenamento, OUTRO, AGORA), true);
    assert.deepEqual(lerMeusLinks(armazenamento), [
        { ...OUTRO, createdAt: AGORA.toISOString() },
        { ...LINK, createdAt: AGORA.toISOString() },
    ]);
});

test('esquece o link apagado e não duplica um código guardado de novo', () => {
    const armazenamento = memoria();
    guardarLink(armazenamento, LINK, AGORA);
    guardarLink(armazenamento, OUTRO, AGORA);
    guardarLink(armazenamento, LINK, AGORA);
    assert.deepEqual(lerMeusLinks(armazenamento).map(link => link.code), ['abc', 'xyz']);

    assert.equal(esquecerLink(armazenamento, 'abc'), true);
    assert.deepEqual(lerMeusLinks(armazenamento).map(link => link.code), ['xyz']);
});

test('com o armazenamento bloqueado, lê lista vazia e avisa que não guardou', () => {
    assert.deepEqual(lerMeusLinks(bloqueado), []);
    assert.equal(guardarLink(bloqueado, LINK, AGORA), false);
    assert.equal(esquecerLink(bloqueado, 'abc'), false);
});

test('ignora dados guardados inválidos ou alterados', () => {
    const armazenamento = memoria();
    armazenamento.setItem('meus-links', '{quebrado');
    assert.deepEqual(lerMeusLinks(armazenamento), []);

    armazenamento.setItem('meus-links', JSON.stringify([null, { code: 'sem-token' }, { ...LINK, createdAt: 'x' }]));
    assert.deepEqual(lerMeusLinks(armazenamento), [{ ...LINK, createdAt: 'x' }]);
});

test('monta os endereços das estatísticas e da pré-visualização com as rotas do backend', () => {
    const link = { ...LINK, createdAt: AGORA.toISOString() };
    assert.deepEqual(enderecosDoLink(STATS_PATH, PREVIEW_SUFFIX, link), {
        estatisticas: '/api/urls/abc/stats',
        previa: 'https://encurta.do/abc+',
    });
});

test('a página tem a seção "Meus links" com as rotas do backend e o aviso de que o token fica no navegador', () => {
    assert.match(HOME_PAGE_HTML, /<section id="meus-links" aria-labelledby="titulo-meus-links"/);
    assert.ok(HOME_PAGE_HTML.includes(`data-link="${LINK_PATH}"`));
    assert.ok(HOME_PAGE_HTML.includes(`data-stats="${STATS_PATH}"`));
    assert.ok(HOME_PAGE_HTML.includes(`data-previa="${PREVIEW_SUFFIX}"`));
    assert.ok(HOME_PAGE_HTML.includes('data-i18n="AVISO_MEUS_LINKS"'));
});

test('apagar envia DELETE na rota do link com o token no header Authorization', async () => {
    let pedido: { input: unknown; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
        pedido = { input, init };
        return new Response(null, { status: 204 });
    };

    await apagar(LINK_PATH, LINK);
    assert.equal(pedido?.input, '/api/urls/abc');
    assert.equal(pedido?.init?.method, 'DELETE');
    assert.deepEqual(pedido?.init?.headers, { Authorization: 'Bearer segredo' });
});

test('apagar lança ApiError com a mensagem traduzida quando o token é recusado', async () => {
    const corpo = JSON.stringify({ error: 'Token inválido.', code: UrlErrorCode.INVALID_MANAGE_TOKEN });
    globalThis.fetch = async () => new Response(corpo, { status: 403 });

    await assert.rejects(apagar(LINK_PATH, LINK), (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 403);
        assert.equal(error.message, texto('MENSAGEM_TOKEN_INVALIDO'));
        return true;
    });
    assert.equal(mensagemDaApi({ code: UrlErrorCode.MANAGE_TOKEN_REQUIRED }, 401), texto('MENSAGEM_TOKEN_AUSENTE'));
});
