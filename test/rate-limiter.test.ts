import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FixedWindowRateLimiter } from '../src/backend/fixed-window-rate-limiter.ts';
import type { RateLimiter } from '../src/backend/rate-limiter.ts';
import { DEFAULT_ACCESS_LIMIT, DEFAULT_CREATE_LIMIT, rateLimitsFromEnv } from '../src/backend/rate-limit-config.ts';

const LIMIT = 2;
const WINDOW_MS = 60_000;
const IP = '203.0.113.1';
const OTHER_IP = '203.0.113.2';

/** Relógio controlado pelo teste. */
function fakeClock() {
    const clock = { time: 0, now: () => clock.time };
    return clock;
}

/** Consome o limite inteiro da chave. */
function exhaust(limiter: FixedWindowRateLimiter, key: string, times = LIMIT) {
    for (let i = 0; i < times; i++) {
        assert.equal(limiter.consume(key).allowed, true);
    }
}

test('permite requisições dentro do limite e bloqueia a seguinte com o tempo de espera', () => {
    const clock = fakeClock();
    const limiter = new FixedWindowRateLimiter(LIMIT, WINDOW_MS, clock.now);
    exhaust(limiter, IP);

    clock.time = 15_500;
    assert.deepEqual(limiter.consume(IP), { allowed: false, retryAfterSeconds: 45 });
});

test('libera de novo quando a janela termina', () => {
    const clock = fakeClock();
    const limiter = new FixedWindowRateLimiter(LIMIT, WINDOW_MS, clock.now);
    exhaust(limiter, IP);

    clock.time = WINDOW_MS;
    exhaust(limiter, IP);
    assert.equal(limiter.consume(IP).allowed, false);
});

test('conta cada IP separadamente', () => {
    const limiter = new FixedWindowRateLimiter(LIMIT, WINDOW_MS, fakeClock().now);
    exhaust(limiter, IP);
    assert.equal(limiter.consume(IP).allowed, false);
    assert.equal(limiter.consume(OTHER_IP).allowed, true);
});

test('remove as janelas expiradas para não acumular IPs', () => {
    const clock = fakeClock();
    const limiter = new FixedWindowRateLimiter(LIMIT, WINDOW_MS, clock.now);
    limiter.consume(IP);
    limiter.consume(OTHER_IP);
    assert.equal(limiter.size, 2);

    clock.time = WINDOW_MS;
    limiter.consume(IP);
    assert.equal(limiter.size, 1);
});

test('usa os limites padrão quando as variáveis não estão definidas', () => {
    const limits = rateLimitsFromEnv({}, fakeClock().now);
    assert.equal(limits.trustProxy, false);
    exhaustDefault(limits.create, DEFAULT_CREATE_LIMIT);
    exhaustDefault(limits.access, DEFAULT_ACCESS_LIMIT);
});

function exhaustDefault(limiter: RateLimiter, limit: number) {
    for (let i = 0; i < limit; i++) {
        limiter.consume(IP);
    }

    assert.equal(limiter.consume(IP).allowed, false);
}

test('lê os limites e o TRUST_PROXY das variáveis de ambiente', () => {
    const limits = rateLimitsFromEnv({ CREATE_RATE_LIMIT: '1', ACCESS_RATE_LIMIT: '3', TRUST_PROXY: 'true' }, fakeClock().now);
    assert.equal(limits.trustProxy, true);
    exhaustDefault(limits.create, 1);
    exhaustDefault(limits.access, 3);
});

test('falha ao iniciar com valor inválido, dizendo qual variável está errada', () => {
    for (const value of ['0', '-1', '1.5', 'abc', '']) {
        assert.throws(() => rateLimitsFromEnv({ CREATE_RATE_LIMIT: value }), /CREATE_RATE_LIMIT/);
    }

    assert.throws(() => rateLimitsFromEnv({ ACCESS_RATE_WINDOW_SECONDS: 'x' }), /ACCESS_RATE_WINDOW_SECONDS/);
    assert.throws(() => rateLimitsFromEnv({ TRUST_PROXY: 'yes' }), /TRUST_PROXY/);
});
