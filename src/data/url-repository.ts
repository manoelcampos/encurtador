/** URL gravada e a data de expiração (ISO 8601 em UTC), ou null se o link não expira. */
export interface StoredUrl {
    url: string;
    expiresAt: string | null;
}

/** Contrato da camada de acesso a dados para as URLs encurtadas. */
export interface UrlRepository {
    /**
     * Se o `add` recusa um código igual a outro ignorando maiúsculas. Sem isso, apelidos ficam desativados,
     * pois um apelido poderia imitar um código gerado para quem digita o link com outra caixa.
     */
    readonly uniqueIgnoringCase: boolean;

    /**
     * Grava a URL com o código e a data de expiração (null ou ausente: sem prazo).
     * Retorna false se o código já existir (ignorando maiúsculas, quando `uniqueIgnoringCase`).
     */
    add(code: string, url: string, expiresAt?: string | null): Promise<boolean>;

    /** Retorna a URL do código e a data de expiração, ou undefined se o código não existir. */
    find(code: string): Promise<StoredUrl | undefined>;
}
