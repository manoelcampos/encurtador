import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UrlShortenerService } from '../src/backend/url-shortener-service.ts';
import { SqliteUrlRepository } from '../src/data/sqlite-url-repository.ts';

const sequence = (...codes: string[]) => () => codes.shift() ?? 'fim';

test('encurta e resolve uma URL', async () => {
    const service = new UrlShortenerService(new SqliteUrlRepository(':memory:'));
    const code = await service.shorten('https://example.com');
    assert.equal(await service.resolve(code), 'https://example.com/');
    assert.equal(await service.resolve('inexistente'), undefined);
});

test('gera outro código quando há colisão', async () => {
    const service = new UrlShortenerService(new SqliteUrlRepository(':memory:'), sequence('a', 'a', 'b'));
    assert.equal(await service.shorten('https://um.com'), 'a');
    assert.equal(await service.shorten('https://dois.com'), 'b');
    assert.equal(await service.resolve('a'), 'https://um.com/');
});

test('falha após muitas colisões seguidas', async () => {
    const service = new UrlShortenerService(new SqliteUrlRepository(':memory:'), () => 'sempre');
    await service.shorten('https://um.com');
    await assert.rejects(service.shorten('https://dois.com'), /código único/);
});
