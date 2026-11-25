import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { CODE_PARAM, DOCS_PATH, OPENAPI_PATH, QRCODE_PATH, SHORTEN_PATH } from '../src/backend/api-paths.ts';
import { createApiServer } from '../src/backend/http-server.ts';
import { createQrCodeSvg } from '../src/backend/qr-code.ts';
import { UrlShortenerService } from '../src/backend/url-shortener-service.ts';
import { SqliteUrlRepository } from '../src/data/sqlite-url-repository.ts';
import { STATIC_DIR, STATIC_PATH } from '../src/frontend/static-files.ts';
import { MARCADOR_CODIGO } from '../src/frontend/static/logic.js';

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
        const created = await fetch(legacyUrl + SHORTEN_PATH, { method: 'POST', body: JSON.stringify({ url: 'https://example.com/antigo' }) });
        assert.equal(created.status, 201);

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

const qrCodeUrl = (code: string) => apiUrl + QRCODE_PATH.replace(CODE_PARAM, code);

test('devolve o QR Code em SVG que codifica o link curto', async () => {
    const { code, shortUrl } = await (await post(JSON.stringify({ url: 'https://example.com/qr' }))).json();
    const res = await fetch(qrCodeUrl(code));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/svg+xml');

    const svg = await res.text();
    assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.equal(svg, createQrCodeSvg(shortUrl));
    assert.notEqual(svg, createQrCodeSvg(BASE_URL + 'outro'));
});

test('devolve 404 para QR Code de código inexistente ou inválido', async () => {
    for (const code of ['naoexiste', 'a.b', 'a%2Fb', 'x'.repeat(65)]) {
        assert.equal((await fetch(qrCodeUrl(code))).status, 404, code);
    }
});

test('responde HEAD na rota do QR Code', async () => {
    const { code } = await (await post(JSON.stringify({ url: 'https://example.com/qr-head' }))).json();
    const res = await fetch(qrCodeUrl(code), { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/svg+xml');
});

test('o marcador do código no frontend é o mesmo da rota do backend', () => {
    assert.equal(MARCADOR_CODIGO, CODE_PARAM);
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
    assert.deepEqual(Object.keys(spec.paths), [SHORTEN_PATH, QRCODE_PATH, '/{code}']);
    assert.equal(spec.servers[0].url, BASE_URL);
});

test('serve o Swagger UI apontando para a especificação', async () => {
    const res = await fetch(apiUrl + DOCS_PATH);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    assert.match(await res.text(), new RegExp(OPENAPI_PATH));
});

test('serve a interface web na raiz, apontando para a API de encurtar e para o JS', async () => {
    const res = await fetch(`${apiUrl}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);

    const html = await res.text();
    assert.match(html, /<label for="url"[ >]/);
    assert.match(html, /<label for="idioma"[ >]/);
    assert.match(html, /<select id="idioma">/);
    assert.match(html, new RegExp(`data-api="${SHORTEN_PATH}"`));
    assert.match(html, new RegExp(`<script type="module" src="${STATIC_PATH}main\\.js"></script>`));
});

test('a interface web tem botão para copiar o link curto', async () => {
    const html = await (await fetch(`${apiUrl}/`)).text();
    assert.match(html, /<button type="button" id="copiar" data-i18n="BOTAO_COPIAR">Copiar link<\/button>/);
    assert.match(html, /<p id="aviso" role="status"><\/p>/);
    assert.match(html, /id="compartilhar"/);
    assert.match(html, /id="redes"/);

    const js = await (await fetch(`${apiUrl}${STATIC_PATH}main.js`)).text();
    assert.match(js, /navigator\.clipboard\.writeText\(/);
});

test('a interface web tem o QR Code e o link para baixá-lo', async () => {
    const html = await (await fetch(`${apiUrl}/`)).text();
    assert.match(html, new RegExp(`data-qrcode="${QRCODE_PATH}"`));
    assert.match(html, /<img [^>]*id="qrcode"/);
    assert.match(html, /<a (?=[^>]*id="baixar")(?=[^>]*\bdownload\b)[^>]*>/);
});

test('serve todos os arquivos JS da interface, em GET e HEAD', async () => {
    const files = (await readdir(STATIC_DIR)).filter(name => name.endsWith('.js'));
    assert.ok(files.includes('main.js'));
    for (const file of files) {
        for (const method of ['GET', 'HEAD']) {
            const res = await fetch(`${apiUrl}${STATIC_PATH}${file}`, { method });
            assert.equal(res.status, 200, `${method} ${file}`);
            assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8');
        }
    }
});

test('não serve arquivos fora da pasta estática nem de tipo não permitido', async () => {
    const paths = ['nao-existe.js', '..%2f..%2fpackage.json', '..%2fhome-page.ts', '%2e%2e/home-page.ts', '..%5cstatic-files.ts', 'sub/main.js', '', 'main'];
    for (const path of paths) {
        assert.equal((await fetch(`${apiUrl}${STATIC_PATH}${path}`)).status, 404, path);
    }

    // O URL normaliza "/static/../package.json" para "/package.json", que não é rota.
    assert.equal((await fetch(`${apiUrl}${STATIC_PATH}../package.json`)).status, 404);
});

test('responde HEAD na raiz', async () => {
    const res = await fetch(`${apiUrl}/`, { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
});
