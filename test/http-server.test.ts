import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { CODE_PARAM, DOCS_PATH, LINK_PATH, OPENAPI_PATH, PREVIEW_SUFFIX, QRCODE_PATH, SHORTEN_PATH, STATS_PATH } from '../src/backend/api-paths.ts';
import { createApiServer } from '../src/backend/http-server.ts';
import { UrlErrorCode } from '../src/backend/invalid-url-error.ts';
import { createQrCodeSvg } from '../src/backend/qr-code.ts';
import { UrlShortenerService } from '../src/backend/url-shortener-service.ts';
import { NO_CLICK_REPOSITORY } from '../src/data/click-repository.ts';
import { SqliteUrlRepository } from '../src/data/sqlite-url-repository.ts';
import { STATIC_DIR, STATIC_PATH } from '../src/frontend/static-files.ts';
import { MARCADOR_CODIGO } from '../src/frontend/static/logic.js';

const BASE_URL = 'https://encurta.do/';
const MALICIOUS_URL = 'https://malicioso.example/';
const threatChecker = { isMalicious: async (url: string) => url === MALICIOUS_URL };
// Relógio fixo para as datas das estatísticas não dependerem do dia em que o teste roda.
const NOW = new Date('2026-11-25T12:00:00Z');
const TODAY = '2026-11-25';
const repository = new SqliteUrlRepository(':memory:');
const server = createApiServer(new UrlShortenerService(repository, BASE_URL, { threatChecker, clicks: repository, now: () => NOW }), BASE_URL);
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
    const legacyServer = createApiServer(new UrlShortenerService(new SqliteUrlRepository(':memory:'), BASE_URL, { generateCode: () => legacyCode }), BASE_URL);
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

test('devolve 400 com o código do motivo para URLs recusadas', async () => {
    const cases = [
        ['javascript:alert(1)', UrlErrorCode.INVALID_URL],
        [`${BASE_URL}abc`, UrlErrorCode.OWN_DOMAIN],
        ['http://localhost/x', UrlErrorCode.PRIVATE_NETWORK],
        ['http://2130706433/', UrlErrorCode.PRIVATE_NETWORK],
        [MALICIOUS_URL, UrlErrorCode.MALICIOUS_URL],
    ];

    for (const [url, code] of cases) {
        const res = await post(JSON.stringify({ url }));
        assert.equal(res.status, 400, url);

        const body = await res.json();
        assert.equal(body.code, code, url);
        assert.equal(typeof body.error, 'string');
    }
});

const postAlias = (alias: unknown, url = 'https://example.com/promo') => post(JSON.stringify({ url, alias }));

test('apelido livre cria o link, que redireciona sem diferenciar maiúsculas', async () => {
    const res = await postAlias('Promo-Natal');
    assert.equal(res.status, 201);
    const { manageToken, ...link } = await res.json();
    assert.deepEqual(link, { code: 'promo-natal', shortUrl: `${BASE_URL}promo-natal`, expiresAt: null });
    assert.equal(typeof manageToken, 'string');

    for (const path of ['/promo-natal', '/PROMO-Natal']) {
        const redirect = await fetch(apiUrl + path, { redirect: 'manual' });
        assert.equal(redirect.status, 302, path);
        assert.equal(redirect.headers.get('location'), 'https://example.com/promo');
    }
});

test('apelido em uso ou reservado devolve 409 com ALIAS_TAKEN', async () => {
    assert.equal((await postAlias('em-uso')).status, 201);
    for (const alias of ['em-uso', 'EM-USO', 'api', 'static']) {
        const res = await postAlias(alias, 'https://example.com/outra');
        assert.equal(res.status, 409, alias);
        assert.equal((await res.json()).code, UrlErrorCode.ALIAS_TAKEN);
    }
});

test('apelido com formato inválido devolve 400 com INVALID_ALIAS', async () => {
    for (const alias of ['ab', '-x-', 'com espaço', 'a_b', 42]) {
        const res = await postAlias(alias);
        assert.equal(res.status, 400, String(alias));
        assert.equal((await res.json()).code, UrlErrorCode.INVALID_ALIAS);
    }
});

test('o QR Code do apelido pedido com outra caixa leva o código gravado', async () => {
    assert.equal((await postAlias('qr-promo')).status, 201);
    const res = await fetch(apiUrl + QRCODE_PATH.replace(CODE_PARAM, 'QR-Promo'));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), createQrCodeSvg(`${BASE_URL}qr-promo`));
});

test('com apelidos desativados no repositório, responde 503 com ALIAS_UNAVAILABLE', async () => {
    const sqlite = new SqliteUrlRepository(':memory:');
    const legacyRepository = { uniqueIgnoringCase: false, add: sqlite.add.bind(sqlite), find: sqlite.find.bind(sqlite) };
    const legacyServer = createApiServer(new UrlShortenerService(legacyRepository, BASE_URL), BASE_URL);
    await new Promise<void>(resolve => legacyServer.listen(0, resolve));
    const legacyUrl = `http://localhost:${(legacyServer.address() as AddressInfo).port}`;

    try {
        const res = await fetch(legacyUrl + SHORTEN_PATH, { method: 'POST', body: JSON.stringify({ url: 'https://example.com/', alias: 'promo' }) });
        assert.equal(res.status, 503);
        assert.equal((await res.json()).code, UrlErrorCode.ALIAS_UNAVAILABLE);
    } finally {
        legacyServer.close();
    }
});

test('dois POSTs simultâneos com o mesmo apelido: um 201 e um 409', async () => {
    const statuses = (await Promise.all([postAlias('corrida'), postAlias('corrida')])).map(res => res.status);
    assert.deepEqual(statuses.sort(), [201, 409]);
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

const statsUrl = (code: string) => apiUrl + STATS_PATH.replace(CODE_PARAM, code);
const totalClicks = async (code: string) => (await (await fetch(statsUrl(code))).json()).totalClicks;

test('cada GET no link curto aumenta o contador, mas HEAD não', async () => {
    const { code } = await (await post(JSON.stringify({ url: 'https://example.com/cliques' }))).json();
    assert.equal(await totalClicks(code), 0);

    await fetch(`${apiUrl}/${code}`, { redirect: 'manual' });
    await fetch(`${apiUrl}/${code}`, { redirect: 'manual' });
    assert.equal(await totalClicks(code), 2);

    const head = await fetch(`${apiUrl}/${code}`, { method: 'HEAD', redirect: 'manual' });
    assert.equal(head.status, 302);
    assert.equal(await totalClicks(code), 2);
});

test('devolve as estatísticas em JSON, com os cliques por dia', async () => {
    const { code } = await (await post(JSON.stringify({ url: 'https://example.com/stats' }))).json();
    await fetch(`${apiUrl}/${code}`, { redirect: 'manual' });

    const res = await fetch(statsUrl(code));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);

    assert.deepEqual(await res.json(), { code, totalClicks: 1, clicksByDay: [{ date: TODAY, clicks: 1 }] });
    assert.equal((await fetch(statsUrl(code), { method: 'HEAD' })).status, 200);
});

test('redireciona mesmo quando a gravação do clique falha', async (t) => {
    t.mock.method(console, 'error', () => {});
    const clicks = {
        ...NO_CLICK_REPOSITORY,
        addClick: async () => {
            throw new Error('falha simulada ao gravar o clique');
        },
    };

    const failingService = new UrlShortenerService(new SqliteUrlRepository(':memory:'), BASE_URL, { clicks });
    const failingServer = createApiServer(failingService, BASE_URL);
    await new Promise<void>(resolve => failingServer.listen(0, resolve));
    const failingUrl = `http://localhost:${(failingServer.address() as AddressInfo).port}`;

    try {
        const { code } = await (await fetch(failingUrl + SHORTEN_PATH, { method: 'POST', body: JSON.stringify({ url: 'https://example.com/falha' }) })).json();
        const redirect = await fetch(`${failingUrl}/${code}`, { redirect: 'manual' });
        assert.equal(redirect.status, 302);
        assert.equal(redirect.headers.get('location'), 'https://example.com/falha');
    } finally {
        failingServer.close();
    }
});

test('prazo de validade: redireciona antes, responde 410 depois (sem contar clique) e as estatísticas continuam', async () => {
    let now = new Date('2026-11-25T12:00:00Z');
    const sqlite = new SqliteUrlRepository(':memory:');
    const expiringServer = createApiServer(new UrlShortenerService(sqlite, BASE_URL, { clicks: sqlite, now: () => now }), BASE_URL);
    await new Promise<void>(resolve => expiringServer.listen(0, resolve));
    const expiringUrl = `http://localhost:${(expiringServer.address() as AddressInfo).port}`;
    const create = (body: object) => fetch(expiringUrl + SHORTEN_PATH, { method: 'POST', body: JSON.stringify(body) });
    const created = await create({ url: 'https://example.com/prazo', expiresIn: '1d' });
    const aliasCreated = await create({ url: 'https://example.com/prazo-apelido', alias: 'prazo-promo', expiresIn: '1d' });

    try {
        assert.equal(created.status, 201);
        assert.equal(aliasCreated.status, 201);
        const { code, expiresAt } = await created.json();
        assert.equal(expiresAt, '2026-11-26T12:00:00.000Z');
        assert.equal((await fetch(`${expiringUrl}/${code}`, { redirect: 'manual' })).status, 302);

        now = new Date(expiresAt);
        const expired = await fetch(`${expiringUrl}/${code}`, { redirect: 'manual' });
        assert.equal(expired.status, 410);
        assert.equal((await expired.json()).code, UrlErrorCode.LINK_EXPIRED);
        assert.equal((await fetch(`${expiringUrl}/${code}`, { method: 'HEAD', redirect: 'manual' })).status, 410);

        const expiredAlias = await fetch(`${expiringUrl}/PRAZO-Promo`, { redirect: 'manual' });
        assert.equal(expiredAlias.status, 410);
        assert.equal((await expiredAlias.json()).code, UrlErrorCode.LINK_EXPIRED);
        assert.equal((await fetch(expiringUrl + QRCODE_PATH.replace(CODE_PARAM, code))).status, 410);

        const stats = await fetch(expiringUrl + STATS_PATH.replace(CODE_PARAM, code));
        assert.equal(stats.status, 200);
        assert.equal((await stats.json()).totalClicks, 1);
    } finally {
        expiringServer.close();
    }
});

test('prazo de validade inválido devolve 400 com INVALID_EXPIRATION', async () => {
    for (const expiresIn of ['2h', '', 30]) {
        const res = await post(JSON.stringify({ url: 'https://example.com/', expiresIn }));
        assert.equal(res.status, 400, String(expiresIn));
        assert.equal((await res.json()).code, UrlErrorCode.INVALID_EXPIRATION);
    }
});

test('devolve 404 para estatísticas de código inexistente ou inválido', async () => {
    for (const code of ['naoexiste', 'a.b', 'x'.repeat(65)]) {
        assert.equal((await fetch(statsUrl(code))).status, 404, code);
    }
});

test('o marcador do código no frontend é o mesmo da rota do backend', () => {
    assert.equal(MARCADOR_CODIGO, CODE_PARAM);
});

test('responde ao preflight de CORS, liberando o DELETE com Authorization', async () => {
    const res = await fetch(apiUrl + SHORTEN_PATH, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
    assert.match(res.headers.get('access-control-allow-methods') ?? '', /POST/);

    const preflight = await fetch(linkUrl('abc'), {
        method: 'OPTIONS',
        headers: { Origin: 'https://outro.example', 'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'authorization' },
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /DELETE/);
    assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /Authorization/i);
});

const linkUrl = (code: string) => apiUrl + LINK_PATH.replace(CODE_PARAM, code);
const deleteLink = (code: string, authorization?: string) =>
    fetch(linkUrl(code), { method: 'DELETE', headers: authorization ? { Authorization: authorization } : {} });

test('a criação devolve o token de gestão, e o DELETE com ele apaga o link e os cliques', async () => {
    const { code, manageToken } = await (await post(JSON.stringify({ url: 'https://example.com/apagar' }))).json();
    assert.equal(typeof manageToken, 'string');
    await fetch(`${apiUrl}/${code}`, { redirect: 'manual' });
    assert.equal(await totalClicks(code), 1);

    const res = await deleteLink(code, `Bearer ${manageToken}`);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.equal((await fetch(`${apiUrl}/${code}`, { redirect: 'manual' })).status, 404);
    assert.equal((await fetch(statsUrl(code))).status, 404);
    assert.equal(await repository.countClicks(code), 0);
    assert.equal((await deleteLink(code, `Bearer ${manageToken}`)).status, 404);
});

test('DELETE sem token dá 401, com token errado dá 403 e com código inexistente dá 404', async () => {
    const { code, manageToken } = await (await post(JSON.stringify({ url: 'https://example.com/protegido' }))).json();

    const semToken = await deleteLink(code);
    assert.equal(semToken.status, 401);
    assert.equal(semToken.headers.get('www-authenticate'), 'Bearer');
    assert.equal((await semToken.json()).code, UrlErrorCode.MANAGE_TOKEN_REQUIRED);
    assert.equal((await deleteLink(code, manageToken)).status, 401, 'sem o esquema Bearer');

    const errado = await deleteLink(code, `Bearer ${manageToken}x`);
    assert.equal(errado.status, 403);
    assert.equal((await errado.json()).code, UrlErrorCode.INVALID_MANAGE_TOKEN);

    assert.equal((await deleteLink('naoexiste', `Bearer ${manageToken}`)).status, 404);
    assert.equal((await fetch(`${apiUrl}/${code}`, { redirect: 'manual' })).status, 302);
});

test('DELETE de link antigo, criado sem token, dá 403', async () => {
    await repository.add('antigo-sem-token', 'https://example.com/antigo');
    assert.equal((await deleteLink('antigo-sem-token', 'Bearer qualquer')).status, 403);
});

test('serve a especificação OpenAPI com as rotas da API', async () => {
    const res = await fetch(apiUrl + OPENAPI_PATH);
    assert.equal(res.status, 200);

    const spec = await res.json();
    assert.deepEqual(Object.keys(spec.paths), [SHORTEN_PATH, LINK_PATH, QRCODE_PATH, STATS_PATH, '/{code}', `/{code}${PREVIEW_SUFFIX}`]);
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
    assert.match(html, /<label for="validade"[ >]/);
    assert.match(html, /<select id="validade" name="expiresIn"/);
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

const ENCODED_PREVIEW_SUFFIX = encodeURIComponent(PREVIEW_SUFFIX);
const preview = (code: string, init: RequestInit = {}, base = apiUrl) => fetch(`${base}/${code}${PREVIEW_SUFFIX}`, { redirect: 'manual', ...init });

test('o sufixo de pré-visualização mostra o destino sem redirecionar nem contar clique', async () => {
    const { code } = await (await post(JSON.stringify({ url: 'https://example.com/destino?a=1&b=2' }))).json();

    const encoded = (suffix: string) => fetch(`${apiUrl}/${code}${suffix}`, { redirect: 'manual' });
    const responses = [await preview(code), await encoded(ENCODED_PREVIEW_SUFFIX), await encoded(ENCODED_PREVIEW_SUFFIX.toLowerCase())];
    for (const res of responses) {
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('location'), null);
        assert.match(res.headers.get('content-type') ?? '', /text\/html/);

        const html = await res.text();
        assert.match(html, /<p id="dominio">example\.com<\/p>/);
        assert.match(html, /<a class="botao" href="https:\/\/example\.com\/destino\?a=1&amp;b=2" rel="noopener noreferrer">/);
        assert.match(html, /<a href="\/">/);
    }

    assert.equal((await preview(code, { method: 'HEAD' })).status, 200);
    assert.equal(await totalClicks(code), 0);
});

test('a pré-visualização envia headers que impedem scripts e embutir a página', async () => {
    const { code } = await (await post(JSON.stringify({ url: 'https://example.com/seguro' }))).json();
    const res = await preview(code);
    const csp = res.headers.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'none'/);
    assert.doesNotMatch(csp, /script-src/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.doesNotMatch(await res.text(), /<script/);
});

test('a pré-visualização busca o apelido sem diferenciar maiúsculas e escolhe o idioma pelo Accept-Language', async () => {
    await post(JSON.stringify({ url: 'https://example.com/previa-apelido', alias: 'previa-promo' }));

    const res = await preview('PREVIA-Promo', { headers: { 'Accept-Language': 'fr;q=1, es;q=0.8, en;q=0.5' } });
    assert.equal(res.status, 200);

    const html = await res.text();
    assert.match(html, /<html lang="es">/);
    assert.match(html, /Continuar/);
    assert.match(html, /https:\/\/example\.com\/previa-apelido/);
});

test('a pré-visualização devolve 404 para código inexistente e não aceita o sufixo duplicado', async () => {
    assert.equal((await preview('naoexiste1')).status, 404);
    assert.equal((await preview(`naoexiste1${PREVIEW_SUFFIX}`)).status, 404);
});

test('a pré-visualização de link expirado devolve 410', async () => {
    let now = new Date('2026-11-25T12:00:00Z');
    const sqlite = new SqliteUrlRepository(':memory:');
    const expiringServer = createApiServer(new UrlShortenerService(sqlite, BASE_URL, { clicks: sqlite, now: () => now }), BASE_URL);
    await new Promise<void>(resolve => expiringServer.listen(0, resolve));
    const expiringUrl = `http://localhost:${(expiringServer.address() as AddressInfo).port}`;

    try {
        const created = await fetch(expiringUrl + SHORTEN_PATH, { method: 'POST', body: JSON.stringify({ url: 'https://example.com/x', expiresIn: '1h' }) });
        const { code, expiresAt } = await created.json();
        now = new Date(expiresAt);

        const expired = await preview(code, {}, expiringUrl);
        assert.equal(expired.status, 410);
        assert.equal((await expired.json()).code, UrlErrorCode.LINK_EXPIRED);
    } finally {
        expiringServer.close();
    }
});
