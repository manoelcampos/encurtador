import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { DOCS_PATH, OPENAPI_PATH, SHORTEN_PATH } from '../src/backend/api-paths.ts';
import { createApiServer } from '../src/backend/http-server.ts';
import { UrlShortenerService } from '../src/backend/url-shortener-service.ts';
import { SqliteUrlRepository } from '../src/data/sqlite-url-repository.ts';

const BASE_URL = 'https://encurta.do/';
const server = createApiServer(new UrlShortenerService(new SqliteUrlRepository(':memory:')), BASE_URL);
let apiUrl: string;

before(async () => {
    await new Promise<void>(resolve => server.listen(0, resolve));
    apiUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

const post = (body: string) => fetch(apiUrl + SHORTEN_PATH, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });

test('POST encurta e GET redireciona', async () => {
    const res = await post(JSON.stringify({ url: 'https://example.com/page' }));
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');

    const { code, shortUrl } = await res.json();
    assert.equal(shortUrl, BASE_URL + code);

    const redirect = await fetch(`${apiUrl}/${code}`, { redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), 'https://example.com/page');
});

test('código antigo em base64url continua redirecionando', async () => {
    const legacyCode = 'aB-_lO01';
    const legacyServer = createApiServer(new UrlShortenerService(new SqliteUrlRepository(':memory:'), () => legacyCode), BASE_URL);
    await new Promise<void>(resolve => legacyServer.listen(0, resolve));
    const legacyUrl = `http://localhost:${(legacyServer.address() as AddressInfo).port}`;

    try {
        await fetch(legacyUrl + SHORTEN_PATH, { method: 'POST', body: JSON.stringify({ url: 'https://example.com/antigo' }) });
        const redirect = await fetch(`${legacyUrl}/${legacyCode}`, { redirect: 'manual' });
        assert.equal(redirect.status, 302);
        assert.equal(redirect.headers.get('location'), 'https://example.com/antigo');
    } finally {
        legacyServer.close();
    }
});

test('devolve 400 para JSON ou URL inválidos', async () => {
    assert.equal((await post('{quebrado')).status, 400);
    assert.equal((await post('null')).status, 400);
    assert.equal((await post(JSON.stringify({ url: 'javascript:alert(1)' }))).status, 400);
});

test('devolve 413 para corpo grande demais', async () => {
    assert.equal((await post('x'.repeat(20 * 1024))).status, 413);
});

test('devolve 404 para código ou rota inexistente', async () => {
    assert.equal((await fetch(`${apiUrl}/naoexiste`)).status, 404);
    assert.equal((await fetch(`${apiUrl}/a/b`)).status, 404);
});

test('responde ao preflight de CORS', async () => {
    const res = await fetch(apiUrl + SHORTEN_PATH, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
    assert.match(res.headers.get('access-control-allow-methods') ?? '', /POST/);
});

test('serve a especificação OpenAPI com as rotas da API', async () => {
    const res = await fetch(apiUrl + OPENAPI_PATH);
    assert.equal(res.status, 200);

    const spec = await res.json();
    assert.deepEqual(Object.keys(spec.paths), [SHORTEN_PATH, '/{code}']);
    assert.equal(spec.servers[0].url, BASE_URL);
});

test('serve o Swagger UI apontando para a especificação', async () => {
    const res = await fetch(apiUrl + DOCS_PATH);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    assert.match(await res.text(), new RegExp(OPENAPI_PATH));
});

test('serve a interface web na raiz, chamando a API de encurtar', async () => {
    const res = await fetch(`${apiUrl}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);

    const html = await res.text();
    assert.match(html, /<label for="url">/);
    assert.match(html, new RegExp(`fetch\\('${SHORTEN_PATH}'`));
});

test('responde HEAD na raiz', async () => {
    const res = await fetch(`${apiUrl}/`, { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
});
