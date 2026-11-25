import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPrivateNetworkHost } from '../src/backend/private-network.ts';

/** Como o serviço recebe o host: pelo `hostname` do `URL`, que já normaliza as formas alternativas. */
const isPrivateUrl = (url: string) => isPrivateNetworkHost(new URL(url).hostname);

test('recusa localhost e subdomínios .localhost', () => {
    for (const url of ['http://localhost/', 'http://LOCALHOST:8080/', 'http://localhost./', 'http://app.localhost/']) {
        assert.ok(isPrivateUrl(url), url);
    }
});

test('recusa IPv4 de loopback, privados, link-local, 0.0.0.0/8 e CGNAT', () => {
    const urls = [
        'http://127.0.0.1/', 'http://127.255.0.9/', 'http://10.1.2.3/', 'http://172.16.0.1/', 'http://172.31.255.255/',
        'http://192.168.0.1/', 'http://169.254.169.254/', 'http://0.0.0.0/', 'http://100.64.0.1/', 'http://100.127.255.255/',
    ];

    for (const url of urls) {
        assert.ok(isPrivateUrl(url), url);
    }
});

test('recusa formas numéricas alternativas de IPv4 normalizadas pelo URL', () => {
    for (const url of ['http://2130706433/', 'http://0x7f.1/', 'http://0177.0.0.1/', 'http://127.1/', 'http://0/']) {
        assert.ok(isPrivateUrl(url), url);
    }
});

test('recusa IPv6 de loopback, não especificado, ULA, link-local e IPv4 mapeado', () => {
    const urls = [
        'http://[::1]/', 'http://[::]/', 'http://[fc00::1]/', 'http://[fd12:3456::1]/', 'http://[fe80::1]/',
        'http://[::ffff:127.0.0.1]/', 'http://[::ffff:10.0.0.1]/', 'http://[::ffff:192.168.1.1]/',
    ];

    for (const url of urls) {
        assert.ok(isPrivateUrl(url), url);
    }
});

test('aceita domínios e IPs públicos', () => {
    const urls = [
        'https://example.com/', 'http://8.8.8.8/', 'http://172.32.0.1/', 'http://100.128.0.1/', 'http://11.0.0.1/',
        'http://[2001:4860:4860::8888]/', 'http://[::ffff:8.8.8.8]/', 'https://localhost.example.com/', 'https://mylocalhost/',
    ];

    for (const url of urls) {
        assert.ok(!isPrivateUrl(url), url);
    }
});
