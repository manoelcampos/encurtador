/** Resultado de uma tentativa de consumir uma requisição do limite. */
export interface RateLimitResult {
    readonly allowed: boolean;
    /** Segundos até liberar de novo (só quando `allowed` é falso). */
    readonly retryAfterSeconds: number;
}

/** Limita a quantidade de requisições por chave (ex.: IP do cliente). */
export interface RateLimiter {
    /** Conta uma requisição da chave e diz se ela está dentro do limite. */
    consume(key: string): RateLimitResult;
}
