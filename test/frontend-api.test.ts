import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { SHORTEN_PATH } from '../src/backend/api-paths.ts';
import { ApiError, encurtar } from '../src/frontend/static/api.js';
import { mensagemDeFalha } from '../src/frontend/static/logic.js';
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
        return new Response(JSON.stringify({ code: 'abc', shortUrl: 'https://encurta.do/abc' }), { status: 201 });
    };

    assert.deepEqual(await encurtar(SHORTEN_PATH, URL_LONGA), { code: 'abc', shortUrl: 'https://encurta.do/abc' });
    assert.equal(pedido?.input, SHORTEN_PATH);
    assert.equal(pedido?.init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(pedido?.init?.body)), { url: URL_LONGA });
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
