/** Erro com o status HTTP que deve ser devolvido ao cliente. */
export class HttpError extends Error {
    readonly status: number;
    /** Headers extras da resposta de erro (ex.: Retry-After). */
    readonly headers: Readonly<Record<string, string>>;

    constructor(status: number, message: string, headers: Record<string, string> = {}) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.headers = headers;
    }
}
