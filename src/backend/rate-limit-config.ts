import { FixedWindowRateLimiter } from './fixed-window-rate-limiter.ts';
import type { RateLimiter } from './rate-limiter.ts';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

export const DEFAULT_CREATE_LIMIT = 30;
export const DEFAULT_CREATE_WINDOW_SECONDS = SECONDS_PER_HOUR;
export const DEFAULT_ACCESS_LIMIT = 300;
export const DEFAULT_ACCESS_WINDOW_SECONDS = SECONDS_PER_MINUTE;

/** Limites por IP aplicados pelo servidor HTTP. */
export interface RateLimits {
    /** Criação de links (`POST /api/urls`). */
    readonly create: RateLimiter;
    /** Todas as outras requisições, inclusive o redirecionamento. */
    readonly access: RateLimiter;
    /** Se o IP do cliente vem do header X-Forwarded-For (só atrás de um proxy confiável). */
    readonly trustProxy: boolean;
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Lê os limites das variáveis de ambiente, com os padrões das constantes acima.
 * Valor inválido lança erro, para a API não subir com um limite diferente do esperado.
 */
export function rateLimitsFromEnv(env: Env, now: () => number = Date.now): RateLimits {
    const limiter = (limitVar: string, defaultLimit: number, windowVar: string, defaultWindow: number) =>
        new FixedWindowRateLimiter(
            positiveInteger(env, limitVar, defaultLimit),
            positiveInteger(env, windowVar, defaultWindow) * MS_PER_SECOND,
            now,
        );

    return {
        create: limiter('CREATE_RATE_LIMIT', DEFAULT_CREATE_LIMIT, 'CREATE_RATE_WINDOW_SECONDS', DEFAULT_CREATE_WINDOW_SECONDS),
        access: limiter('ACCESS_RATE_LIMIT', DEFAULT_ACCESS_LIMIT, 'ACCESS_RATE_WINDOW_SECONDS', DEFAULT_ACCESS_WINDOW_SECONDS),
        trustProxy: booleanFlag(env, 'TRUST_PROXY'),
    };
}

function positiveInteger(env: Env, name: string, defaultValue: number): number {
    const value = env[name];
    if (value === undefined) {
        return defaultValue;
    }

    if (!POSITIVE_INTEGER.test(value)) {
        throw new Error(`A variável ${name} deve ser um número inteiro positivo, mas é "${value}".`);
    }

    return Number(value);
}

function booleanFlag(env: Env, name: string): boolean {
    const value = env[name];
    if (value === undefined || value === 'false') {
        return false;
    }

    if (value !== 'true') {
        throw new Error(`A variável ${name} deve ser "true" ou "false", mas é "${value}".`);
    }

    return true;
}
