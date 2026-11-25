import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { SHORTEN_PATH } from '../src/backend/api-paths.ts';
import { ApiError, encurtar } from '../src/frontend/static/api.js';
import { UrlErrorCode } from '../src/backend/invalid-url-error.ts';
import { CHAVES_DOS_CODIGOS_DE_ERRO, mensagemDeFalha } from '../src/frontend/static/logic.js';
import { texto } from '../src/frontend/static/messages.js';

const MENSAGEM_PADRAO = texto('MENSAGEM_PADRAO');
const MENSAGEM_CONEXAO = texto('MENSAGEM_CONEXAO');

const URL_LONGA = 'https://example.com/pagina';
const fetchOriginal = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = fetchOriginal;
});

/** Troca o fetch global por um que sempre devolve esta resposta. */
function responder(status: number, corpo: string) {
    globalThis.fetch = async () => new Response(corpo, { status });
}

test('devolve o código e o shortUrl quando a API responde 201', async () => {
    let pedido: { input: unknown; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
        pedido = { input, init };
        return new Response(JSON.stringify({ code: 'abc', shortUrl: 'https://encurta.do/abc', url: URL_LONGA, manageToken: 'segredo' }), { status: 201 });
    };

    assert.deepEqual(await encurtar(SHORTEN_PATH, URL_LONGA),
        { code: 'abc', shortUrl: 'https://encurta.do/abc', url: URL_LONGA, expiresAt: null, maxClicks: null, manageToken: 'segredo' });
    assert.equal(pedido?.input, SHORTEN_PATH);
    assert.equal(pedido?.init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(pedido?.init?.body)), { url: URL_LONGA });

    await encurtar(SHORTEN_PATH, URL_LONGA, '', '', true);
    assert.deepEqual(JSON.parse(String(pedido?.init?.body)), { url: URL_LONGA, removeTracking: true });

    await encurtar(SHORTEN_PATH, URL_LONGA, '', '', false, ' 3 ');
    assert.deepEqual(JSON.parse(String(pedido?.init?.body)), { url: URL_LONGA, maxClicks: 3 });
});

test('lança ApiError com status 400 e a mensagem traduzida de URL inválida', async () => {
    responder(400, JSON.stringify({ error: 'URL inválida.' }));
    await assert.rejects(encurtar(SHORTEN_PATH, 'x'), (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 400);
        assert.equal(error.message, texto('MENSAGEM_URL_INVALIDA'));
        return true;
    });
});

test('400 com code usa a mensagem traduzida do motivo; code desconhecido usa a de URL inválida', async () => {
    const casos = [
        ['MALICIOUS_URL', 'MENSAGEM_URL_MALICIOSA'],
        ['PRIVATE_NETWORK', 'MENSAGEM_URL_REDE_LOCAL'],
        ['OWN_DOMAIN', 'MENSAGEM_URL_PROPRIO_ENCURTADOR'],
        ['DESCONHECIDO', 'MENSAGEM_URL_INVALIDA'],
        ['toString', 'MENSAGEM_URL_INVALIDA'],
    ] as const;

    for (const [code, chave] of casos) {
        responder(400, JSON.stringify({ error: 'Recusada.', code }));
        await assert.rejects(encurtar(SHORTEN_PATH, URL_LONGA), { message: texto(chave) }, code);
    }
});

test('envia o apelido e lança ApiError 409 com o código ALIAS_TAKEN', async () => {
    let corpo: unknown;
    globalThis.fetch = async (_input, init) => {
        corpo = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ error: 'Em uso.', code: 'ALIAS_TAKEN' }), { status: 409 });
    };

    await assert.rejects(encurtar(SHORTEN_PATH, URL_LONGA, 'promo'), (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 409);
        assert.equal(error.codigo, 'ALIAS_TAKEN');
        assert.equal(error.message, texto('MENSAGEM_APELIDO_EM_USO'));
        return true;
    });
    assert.deepEqual(corpo, { url: URL_LONGA, alias: 'promo' });
});

test('envia a validade escolhida e devolve a data de expiração da API', async () => {
    const expiresAt = '2026-12-02T12:00:00.000Z';
    let corpo: unknown;
    globalThis.fetch = async (_input, init) => {
        corpo = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ code: 'abc', shortUrl: 'https://encurta.do/abc', expiresAt }), { status: 201 });
    };

    assert.equal((await encurtar(SHORTEN_PATH, URL_LONGA, '', '7d')).expiresAt, expiresAt);
    assert.deepEqual(corpo, { url: URL_LONGA, expiresIn: '7d' });
});

test('os códigos de erro do frontend são os mesmos do backend', () => {
    assert.deepEqual(Object.keys(CHAVES_DOS_CODIGOS_DE_ERRO).sort(), Object.values(UrlErrorCode).sort());
});

test('lança ApiError 429 com os minutos de espera lidos do Retry-After', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Limite.' }), { status: 429, headers: { 'Retry-After': '90' } });
    await assert.rejects(encurtar(SHORTEN_PATH, URL_LONGA), (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 429);
        assert.equal(error.message, texto('MENSAGEM_LIMITE_EXCEDIDO_MINUTOS').replace('{minutos}', '2'));
        return true;
    });
});

test('lança ApiError com a mensagem padrão quando o corpo não é JSON (ex.: 502 de proxy)', async () => {
    responder(502, '<html>Bad Gateway</html>');
    await assert.rejects(encurtar(SHORTEN_PATH, URL_LONGA), (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 502);
        assert.equal(error.message, MENSAGEM_PADRAO);
        return true;
    });
});

test('falha de rede resulta na mensagem de conexão', async () => {
    globalThis.fetch = async () => {
        throw new TypeError('fetch failed');
    };

    await assert.rejects(encurtar(SHORTEN_PATH, URL_LONGA), (error: unknown) => {
        assert.equal(mensagemDeFalha(error), MENSAGEM_CONEXAO);
        return true;
    });
});
