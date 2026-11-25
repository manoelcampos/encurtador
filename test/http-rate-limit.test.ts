import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { CODE_PARAM, HEALTH_PATH, LINK_PATH, SHORTEN_PATH } from '../src/backend/api-paths.ts';
import { createApiServer } from '../src/backend/http-server.ts';
import { rateLimitsFromEnv } from '../src/backend/rate-limit-config.ts';
import { UrlShortenerService } from '../src/backend/url-shortener-service.ts';
import { SqliteUrlRepository } from '../src/data/sqlite-url-repository.ts';

const BASE_URL = 'https://encurta.do/';
const CREATE_LIMIT = '2';
const ACCESS_LIMIT = '3';
// Maior que o MAX_BODY_BYTES do servidor (10 KiB).
const OVERSIZED_BODY_BYTES = 20 * 1024;
const FORWARDED_IPS = ['198.51.100.1', '198.51.100.2', '198.51.100.3'];

type Env = Record<string, string>;

/** Sobe um servidor com os limites das variáveis dadas, executa o teste e o fecha. */
async function withServer(env: Env, run: (apiUrl: string) => Promise<void>) {
    const limits = rateLimitsFromEnv({ CREATE_RATE_LIMIT: CREATE_LIMIT, ACCESS_RATE_LIMIT: ACCESS_LIMIT, ...env });
    const server = createApiServer(new UrlShortenerService(new SqliteUrlRepository(':memory:'), BASE_URL), BASE_URL, limits);
    await new Promise<void>(resolve => server.listen(0, resolve));
    try {
        await run(`http://localhost:${(server.address() as AddressInfo).port}`);
    } finally {
        server.close();
    }
}

const shorten = (apiUrl: string, forwardedFor?: string) => fetch(apiUrl + SHORTEN_PATH, {
    method: 'POST',
    body: JSON.stringify({ url: 'https://example.com/page' }),
    headers: forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {},
});

/** Status das criações, cada uma com o X-Forwarded-For da lista. */
async function shortenStatuses(apiUrl: string): Promise<number[]> {
    const statuses = [];
    for (const ip of FORWARDED_IPS) {
        statuses.push((await shorten(apiUrl, `10.0.0.9, ${ip}`)).status);
    }

    return statuses;
}

test('POST responde 429 com Retry-After e erro em JSON depois do limite de criação', () => withServer({}, async apiUrl => {
    for (let i = 0; i < Number(CREATE_LIMIT); i++) {
        assert.equal((await shorten(apiUrl)).status, 201);
    }

    const res = await shorten(apiUrl);
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
    assert.equal(res.headers.get('access-control-expose-headers'), 'Retry-After');
    assert.equal(typeof (await res.json()).error, 'string');
}));

test('o limite de criação não bloqueia o redirecionamento, que tem limite próprio', () => withServer({}, async apiUrl => {
    const { code } = await (await shorten(apiUrl)).json();
    await shorten(apiUrl);
    assert.equal((await shorten(apiUrl)).status, 429);

    for (let i = 0; i < Number(ACCESS_LIMIT); i++) {
        assert.equal((await fetch(`${apiUrl}/${code}`, { redirect: 'manual' })).status, 302);
    }

    const blocked = await fetch(`${apiUrl}/${code}`, { redirect: 'manual' });
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get('retry-after'));
}));

test('o DELETE conta no limite de acesso, não no de criação', () => withServer({}, async apiUrl => {
    const { code, manageToken } = await (await shorten(apiUrl)).json();
    const deleteLink = () => fetch(apiUrl + LINK_PATH.replace(CODE_PARAM, code), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${manageToken}x` },
    });

    for (let i = 0; i < Number(ACCESS_LIMIT); i++) {
        assert.equal((await deleteLink()).status, 403);
    }

    assert.equal((await deleteLink()).status, 429);
    assert.equal((await fetch(`${apiUrl}/${code}`, { redirect: 'manual' })).status, 429);
    assert.equal((await shorten(apiUrl)).status, 201);
}));

test('sem TRUST_PROXY, ignora o X-Forwarded-For e conta pelo IP da conexão', () => withServer({}, async apiUrl => {
    assert.deepEqual(await shortenStatuses(apiUrl), [201, 201, 429]);
}));

test('com TRUST_PROXY, conta pelo último IP do X-Forwarded-For', () => withServer({ TRUST_PROXY: 'true' }, async apiUrl => {
    assert.deepEqual(await shortenStatuses(apiUrl), [201, 201, 201]);
}));

test('OPTIONS não conta no limite', () => withServer({}, async apiUrl => {
    for (let i = 0; i <= Number(ACCESS_LIMIT); i++) {
        assert.equal((await fetch(apiUrl + SHORTEN_PATH, { method: 'OPTIONS' })).status, 204);
    }

    assert.equal((await shorten(apiUrl)).status, 201);
    assert.equal((await fetch(`${apiUrl}/`)).status, 200);
}));

test('a rota de saúde não conta no limite e responde mesmo com o limite esgotado', () => withServer({}, async apiUrl => {
    for (let i = 0; i <= Number(ACCESS_LIMIT); i++) {
        assert.equal((await fetch(apiUrl + HEALTH_PATH)).status, 200);
    }

    for (let i = 0; i < Number(ACCESS_LIMIT); i++) {
        assert.equal((await fetch(`${apiUrl}/`)).status, 200);
    }

    assert.equal((await fetch(`${apiUrl}/`)).status, 429);
    assert.equal((await fetch(apiUrl + HEALTH_PATH)).status, 200);
}));

test('depois do limite de criação, um corpo grande demais recebe 429 e não 413', () => withServer({}, async apiUrl => {
    for (let i = 0; i < Number(CREATE_LIMIT); i++) {
        await shorten(apiUrl);
    }

    const res = await fetch(apiUrl + SHORTEN_PATH, { method: 'POST', body: 'x'.repeat(OVERSIZED_BODY_BYTES) });
    assert.equal(res.status, 429);
}));
