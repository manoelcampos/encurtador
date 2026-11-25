import type { RateLimiter, RateLimitResult } from './rate-limiter.ts';

const MS_PER_SECOND = 1000;
const ALLOWED: RateLimitResult = { allowed: true, retryAfterSeconds: 0 };

interface Window {
    readonly start: number;
    count: number;
}

/**
 * Limite por janela fixa: no máximo `limit` requisições por chave a cada `windowMs`.
 * shortcut: o estado fica em memória, então não é compartilhado entre várias instâncias
 * nem sobrevive a reinícios; troque por uma implementação em Redis/SQLite se a API escalar horizontalmente.
 */
export class FixedWindowRateLimiter implements RateLimiter {
    readonly #windows = new Map<string, Window>();
    readonly #limit: number;
    readonly #windowMs: number;
    readonly #now: () => number;
    #nextCleanup: number;

    constructor(limit: number, windowMs: number, now: () => number = Date.now) {
        this.#limit = limit;
        this.#windowMs = windowMs;
        this.#now = now;
        this.#nextCleanup = now() + windowMs;
    }

    consume(key: string): RateLimitResult {
        const now = this.#now();
        this.#cleanupIfDue(now);

        const window = this.#currentWindow(key, now);
        if (window.count >= this.#limit) {
            return { allowed: false, retryAfterSeconds: Math.ceil((window.start + this.#windowMs - now) / MS_PER_SECOND) };
        }

        window.count++;
        return ALLOWED;
    }

    /** Quantidade de chaves guardadas (para testar a limpeza). */
    get size(): number {
        return this.#windows.size;
    }

    #currentWindow(key: string, now: number): Window {
        const window = this.#windows.get(key);
        if (window && !this.#expired(window, now)) {
            return window;
        }

        const fresh = { start: now, count: 0 };
        this.#windows.set(key, fresh);
        return fresh;
    }

    #expired(window: Window, now: number): boolean {
        return now >= window.start + this.#windowMs;
    }

    // Limpa no máximo uma vez por janela, sem timer, para não vazar memória com IPs que não voltam.
    #cleanupIfDue(now: number) {
        if (now < this.#nextCleanup) {
            return;
        }

        for (const [key, window] of this.#windows) {
            if (this.#expired(window, now)) {
                this.#windows.delete(key);
            }
        }

        this.#nextCleanup = now + this.#windowMs;
    }
}
