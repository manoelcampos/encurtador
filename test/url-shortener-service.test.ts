import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvalidUrlError, UrlErrorCode } from '../src/backend/invalid-url-error.ts';
import { STATS_DAYS, UrlShortenerService, type UrlShortenerOptions } from '../src/backend/url-shortener-service.ts';
import type { UrlThreatChecker } from '../src/backend/url-threat-checker.ts';
import { NO_CLICK_REPOSITORY } from '../src/data/click-repository.ts';
import { SqliteUrlRepository } from '../src/data/sqlite-url-repository.ts';

const BASE_URL = 'https://encurta.do/';
const MALICIOUS_URL = 'https://malicioso.example/';

const sequence = (...codes: string[]) => () => codes.shift() ?? 'fim';
/** Serviço com URLs e cliques no mesmo banco em memória, como no main.ts. */
function createService(options?: UrlShortenerOptions) {
    const repository = new SqliteUrlRepository(':memory:');
    return new UrlShortenerService(repository, BASE_URL, { clicks: repository, ...options });
}

/** Checker falso que marca só MALICIOUS_URL e guarda as URLs consultadas. */
function fakeChecker(checked: string[] = []): UrlThreatChecker {
    return {
        isMalicious: async url => {
            checked.push(url);
            return url === MALICIOUS_URL;
        },
    };
}

const rejectsWith = (promise: Promise<unknown>, code: UrlErrorCode) =>
    assert.rejects(promise, (error: unknown) => error instanceof InvalidUrlError && error.code === code);

test('encurta e resolve uma URL', async () => {
    const service = createService();
    const { code } = await service.shorten('https://example.com');
    assert.equal(await service.resolve(code), 'https://example.com/');
    assert.equal(await service.resolve('inexistente'), undefined);
});

test('gera outro código quando há colisão', async () => {
    const service = createService({ generateCode: sequence('a', 'a', 'b') });
    assert.equal((await service.shorten('https://um.com')).code, 'a');
    assert.equal((await service.shorten('https://dois.com')).code, 'b');
    assert.equal(await service.resolve('a'), 'https://um.com/');
});

test('sem apelido continua gerando o código', async () => {
    const service = createService({ generateCode: sequence('Gerado') });
    assert.equal((await service.shorten('https://um.com', undefined)).code, 'Gerado');
});

test('apelido é gravado em minúsculas e os cliques e estatísticas vão para ele', async () => {
    const service = createService({ generateCode: () => assert.fail('não deve gerar código') });
    assert.equal((await service.shorten('https://um.com', 'Promo')).code, 'promo');
    assert.equal(await service.visit('PROMO'), 'https://um.com/');
    assert.equal((await service.stats('Promo'))?.code, 'promo');
    assert.equal((await service.stats('promo'))?.totalClicks, 1);
});

test('código gerado continua diferenciando maiúsculas', async () => {
    const service = createService({ generateCode: sequence('AbcDef') });
    await service.shorten('https://gerado.com');
    assert.equal(await service.resolve('AbcDef'), 'https://gerado.com/');
    assert.equal(await service.resolve('ABCDEF'), undefined);
    assert.equal(await service.resolve('abcdef'), undefined);
});

test('apelido em uso lança ALIAS_TAKEN; formato inválido lança INVALID_ALIAS antes de consultar o provedor externo', async () => {
    const checked: string[] = [];
    const service = createService({ threatChecker: fakeChecker(checked) });
    await service.shorten('https://um.com', 'promo');
    await rejectsWith(service.shorten('https://dois.com', 'promo'), UrlErrorCode.ALIAS_TAKEN);
    await rejectsWith(service.shorten('https://tres.com', 'x'), UrlErrorCode.INVALID_ALIAS);
    assert.deepEqual(checked, ['https://um.com/', 'https://dois.com/']);
});

test('apelido igual a um código gerado em outra caixa dá ALIAS_TAKEN', async () => {
    const service = createService({ generateCode: sequence('Xk7Pq2Rt9') });
    await service.shorten('https://gerado.com');
    await rejectsWith(service.shorten('https://phishing.com', 'xk7pq2rt9'), UrlErrorCode.ALIAS_TAKEN);
    assert.equal(await service.resolve('xk7pq2rt9'), undefined);
});

test('código gerado igual a um apelido em outra caixa é trocado por outro', async () => {
    const service = createService({ generateCode: sequence('PROMO', 'Outro') });
    await service.shorten('https://apelido.com', 'promo');
    assert.equal((await service.shorten('https://gerado.com')).code, 'Outro');
    assert.equal(await service.resolve('PROMO'), 'https://apelido.com/');
});

test('repositório sem unicidade ignorando maiúsculas recusa apelidos com ALIAS_UNAVAILABLE, mas gera códigos', async () => {
    const sqlite = new SqliteUrlRepository(':memory:');
    const legacyRepository = { uniqueIgnoringCase: false, add: sqlite.add.bind(sqlite), find: sqlite.find.bind(sqlite) };
    const service = new UrlShortenerService(legacyRepository, BASE_URL, { generateCode: sequence('Gerado') });
    await rejectsWith(service.shorten('https://um.com', 'promo'), UrlErrorCode.ALIAS_UNAVAILABLE);
    assert.equal((await service.shorten('https://um.com')).code, 'Gerado');
});

test('falha após muitas colisões seguidas', async () => {
    const service = createService({ generateCode: () => 'sempre' });
    await service.shorten('https://um.com');
    await assert.rejects(service.shorten('https://dois.com'), /código único/);
});

test('recusa links do próprio encurtador, com qualquer porta, maiúsculas, ponto final ou www.', async () => {
    const service = createService();
    const urls = [
        'https://encurta.do/abc', 'http://ENCURTA.DO/abc', 'https://encurta.do:443/x', 'https://encurta.do:8080/x',
        'https://encurta.do./x', 'https://www.encurta.do/x', 'https://WWW.Encurta.Do./x',
    ];

    for (const url of urls) {
        await rejectsWith(service.shorten(url), UrlErrorCode.OWN_DOMAIN);
    }
});

test('com www. na BASE_URL, recusa o domínio com e sem www.', async () => {
    const service = new UrlShortenerService(new SqliteUrlRepository(':memory:'), 'https://www.encurta.do/');
    for (const url of ['https://encurta.do/x', 'https://www.encurta.do/x']) {
        await rejectsWith(service.shorten(url), UrlErrorCode.OWN_DOMAIN);
    }
});

test('aceita outros subdomínios do próprio encurtador', async () => {
    const service = createService();
    assert.ok(await service.shorten('https://blog.encurta.do/'));
    assert.ok(await service.shorten('https://www.blog.encurta.do/'));
});

test('recusa endereços de rede local', async () => {
    await rejectsWith(createService().shorten('http://localhost/x'), UrlErrorCode.PRIVATE_NETWORK);
});

test('rede local tem prioridade sobre o próprio domínio (ex.: BASE_URL de desenvolvimento)', async () => {
    const service = new UrlShortenerService(new SqliteUrlRepository(':memory:'), 'http://localhost:8080/');
    await rejectsWith(service.shorten('http://localhost:8080/abc'), UrlErrorCode.PRIVATE_NETWORK);
});

test('recusa URL maliciosa e aceita as outras', async () => {
    const service = createService({ threatChecker: fakeChecker() });
    await rejectsWith(service.shorten(MALICIOUS_URL), UrlErrorCode.MALICIOUS_URL);
    assert.ok(await service.shorten('https://example.com/'));
});

test('não consulta o provedor externo quando a URL já é recusada localmente', async () => {
    const checked: string[] = [];
    const service = createService({ threatChecker: fakeChecker(checked) });
    await rejectsWith(service.shorten('http://127.0.0.1/'), UrlErrorCode.PRIVATE_NETWORK);
    await rejectsWith(service.shorten('javascript:alert(1)'), UrlErrorCode.INVALID_URL);
    assert.deepEqual(checked, []);
});

/** Relógio falso: devolve a data atual e permite trocá-la. */
function fakeClock(start: string) {
    let current = new Date(start);
    return {
        now: () => current,
        set: (date: string) => { current = new Date(date); },
    };
}

test('cada visita aumenta o contador e os cliques são agrupados por dia em UTC', async () => {
    const clock = fakeClock('2026-11-24T23:59:59Z');
    const service = createService({ now: clock.now });
    const { code } = await service.shorten('https://example.com/');

    await service.visit(code);
    clock.set('2026-11-25T00:00:00Z');
    await service.visit(code);
    await service.visit(code);

    assert.deepEqual(await service.stats(code), {
        code,
        totalClicks: 3,
        clicksByDay: [{ date: '2026-11-24', clicks: 1 }, { date: '2026-11-25', clicks: 2 }],
    });
});

test(`clicksByDay só mostra os últimos ${STATS_DAYS} dias, mas o total conta todos`, async () => {
    const clock = fakeClock('2026-10-26T12:00:00Z');
    const service = createService({ now: clock.now });
    const { code } = await service.shorten('https://example.com/');
    await service.visit(code);
    clock.set('2026-10-27T00:00:00Z');
    await service.visit(code);

    clock.set('2026-11-25T23:00:00Z');
    const stats = await service.stats(code);
    assert.equal(stats?.totalClicks, 2);
    assert.deepEqual(stats?.clicksByDay, [{ date: '2026-10-27', clicks: 1 }]);
});

test('resolve não conta clique e código inexistente não tem estatísticas', async () => {
    const service = createService();
    const { code } = await service.shorten('https://example.com/');
    await service.resolve(code);
    assert.equal((await service.stats(code))?.totalClicks, 0);
    assert.equal(await service.stats('inexistente'), undefined);
    assert.equal(await service.visit('inexistente'), undefined);
});

test('falha ao registrar o clique não impede o redirecionamento', async (t) => {
    const errorLog = t.mock.method(console, 'error', () => {});
    const clicks = {
        ...NO_CLICK_REPOSITORY,
        addClick: async () => {
            throw new Error('falha simulada ao gravar o clique');
        },
    };

    const service = createService({ clicks });
    const { code } = await service.shorten('https://example.com/');
    assert.equal(await service.visit(code), 'https://example.com/');
    assert.equal(errorLog.mock.callCount(), 1);
});

test('link com prazo redireciona antes de expirar e lança LINK_EXPIRED depois, sem contar clique', async () => {
    const clock = fakeClock('2026-11-25T12:00:00Z');
    const service = createService({ now: clock.now });
    const { code, expiresAt } = await service.shorten('https://example.com/', undefined, '1h');
    assert.equal(expiresAt, '2026-11-25T13:00:00.000Z');

    clock.set('2026-11-25T12:59:59Z');
    assert.equal(await service.visit(code), 'https://example.com/');

    clock.set('2026-11-25T13:00:00Z');
    await rejectsWith(service.visit(code), UrlErrorCode.LINK_EXPIRED);
    await rejectsWith(service.resolve(code), UrlErrorCode.LINK_EXPIRED);
    await rejectsWith(service.findActive(code), UrlErrorCode.LINK_EXPIRED);
    assert.equal((await service.stats(code))?.totalClicks, 1);
});

test('link sem prazo não expira e devolve expiresAt null', async () => {
    const clock = fakeClock('2026-11-25T12:00:00Z');
    const service = createService({ now: clock.now });
    const { code, expiresAt } = await service.shorten('https://example.com/', undefined, null);
    assert.equal(expiresAt, null);

    clock.set('2126-11-25T12:00:00Z');
    assert.equal(await service.visit(code), 'https://example.com/');
});

test('apelido de link expirado continua ocupado', async () => {
    const clock = fakeClock('2026-11-25T12:00:00Z');
    const service = createService({ now: clock.now });
    await service.shorten('https://um.com', 'promo', '1d');
    clock.set('2026-12-25T12:00:00Z');
    await rejectsWith(service.shorten('https://dois.com', 'promo'), UrlErrorCode.ALIAS_TAKEN);
});

test('prazo fora da lista lança INVALID_EXPIRATION antes de consultar o provedor externo', async () => {
    const checked: string[] = [];
    const service = createService({ threatChecker: fakeChecker(checked) });
    for (const expiresIn of ['2h', '', '1H', 7, 'constructor', { d: 1 }]) {
        await rejectsWith(service.shorten('https://example.com/', undefined, expiresIn), UrlErrorCode.INVALID_EXPIRATION);
    }

    assert.deepEqual(checked, []);
});
