import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { SAFE_BROWSING_URL, SafeBrowsingThreatChecker } from '../src/backend/safe-browsing-threat-checker.ts';

const API_KEY = 'chave-falsa';
const URL_TESTADA = 'https://example.com/pagina';
const TIMEOUT_CURTO_MS = 10;

// Silencia o log de fail-open e permite conferir que ele aconteceu.
beforeEach(() => mock.method(console, 'warn', () => {}));
afterEach(() => mock.restoreAll());

const warnCalls = () => (console.warn as unknown as { mock: { callCount(): number } }).mock.callCount();
const responder = (status: number, corpo: object): typeof fetch => async () => new Response(JSON.stringify(corpo), { status });

test('envia a URL e a chave (no header) para a Lookup API v4', async () => {
    let pedido: { input: unknown; init?: RequestInit } | undefined;
    const checker = new SafeBrowsingThreatChecker(API_KEY, async (input, init) => {
        pedido = { input, init };
        return new Response('{}');
    });

    assert.equal(await checker.isMalicious(URL_TESTADA), false);
    assert.equal(pedido?.input, SAFE_BROWSING_URL);
    assert.equal(pedido?.init?.method, 'POST');
    assert.equal(new Headers(pedido?.init?.headers).get('X-Goog-Api-Key'), API_KEY);
    assert.ok(pedido?.init?.signal, 'deve ter timeout');
    assert.deepEqual(JSON.parse(String(pedido?.init?.body)).threatInfo.threatEntries, [{ url: URL_TESTADA }]);
});

test('URL com ocorrências em matches é maliciosa', async () => {
    const checker = new SafeBrowsingThreatChecker(API_KEY, responder(200, { matches: [{ threatType: 'MALWARE' }] }));
    assert.equal(await checker.isMalicious(URL_TESTADA), true);
});

test('fail-open: erro HTTP ou de rede deixa a URL passar e registra no log', async () => {
    const falhas: Array<typeof fetch> = [
        responder(500, { error: 'falhou' }),
        async () => {
            throw new TypeError('fetch failed');
        },
    ];

    for (const fetchFalso of falhas) {
        assert.equal(await new SafeBrowsingThreatChecker(API_KEY, fetchFalso).isMalicious(URL_TESTADA), false);
    }

    assert.equal(warnCalls(), falhas.length);
});

test('fail-open: timeout deixa a URL passar', async () => {
    // Fetch falso que só termina quando o sinal de timeout aborta.
    const lento: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });

    assert.equal(await new SafeBrowsingThreatChecker(API_KEY, lento, TIMEOUT_CURTO_MS).isMalicious(URL_TESTADA), false);
    assert.equal(warnCalls(), 1);
});
