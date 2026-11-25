import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvalidUrlError, UrlErrorCode } from '../src/backend/invalid-url-error.ts';
import { UrlShortenerService, type UrlShortenerOptions } from '../src/backend/url-shortener-service.ts';
import type { UrlThreatChecker } from '../src/backend/url-threat-checker.ts';
import { SqliteUrlRepository } from '../src/data/sqlite-url-repository.ts';

const BASE_URL = 'https://encurta.do/';
const MALICIOUS_URL = 'https://malicioso.example/';

const sequence = (...codes: string[]) => () => codes.shift() ?? 'fim';
const createService = (options?: UrlShortenerOptions) => new UrlShortenerService(new SqliteUrlRepository(':memory:'), BASE_URL, options);

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
    const code = await service.shorten('https://example.com');
    assert.equal(await service.resolve(code), 'https://example.com/');
    assert.equal(await service.resolve('inexistente'), undefined);
});

test('gera outro código quando há colisão', async () => {
    const service = createService({ generateCode: sequence('a', 'a', 'b') });
    assert.equal(await service.shorten('https://um.com'), 'a');
    assert.equal(await service.shorten('https://dois.com'), 'b');
    assert.equal(await service.resolve('a'), 'https://um.com/');
});

test('falha após muitas colisões seguidas', async () => {
    const service = createService({ generateCode: () => 'sempre' });
    await service.shorten('https://um.com');
    await assert.rejects(service.shorten('https://dois.com'), /código único/);
});

test('recusa links do próprio encurtador, com qualquer porta, maiúsculas ou ponto final', async () => {
    const service = createService();
    for (const url of ['https://encurta.do/abc', 'http://ENCURTA.DO/abc', 'https://encurta.do:443/x', 'https://encurta.do:8080/x', 'https://encurta.do./x']) {
        await rejectsWith(service.shorten(url), UrlErrorCode.OWN_DOMAIN);
    }
});

test('aceita subdomínios do próprio encurtador', async () => {
    assert.ok(await createService().shorten('https://blog.encurta.do/'));
});

test('recusa endereços de rede local', async () => {
    await rejectsWith(createService().shorten('http://localhost/x'), UrlErrorCode.PRIVATE_NETWORK);
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
