/**
 * URL gravada, a data de expiração (ISO 8601 em UTC, ou null se o link não expira)
 * e quantos acessos ainda restam (null se o link não tem limite).
 */
export interface StoredUrl {
    url: string;
    expiresAt: string | null;
    remainingClicks: number | null;
}

/** Contrato da camada de acesso a dados para as URLs encurtadas. */
export interface UrlRepository {
    /**
     * Se o `add` recusa um código igual a outro ignorando maiúsculas. Sem isso, apelidos ficam desativados,
     * pois um apelido poderia imitar um código gerado para quem digita o link com outra caixa.
     */
    readonly uniqueIgnoringCase: boolean;

    /**
     * Grava a URL com o código, a data de expiração (null ou ausente: sem prazo) e o hash do token de gestão
     * (null ou ausente: sem token) e o limite de acessos (null ou ausente: sem limite).
     * Retorna false se o código já existir (ignorando maiúsculas, quando `uniqueIgnoringCase`).
     */
    add(code: string, url: string, expiresAt?: string | null, manageTokenHash?: string | null, maxClicks?: number | null): Promise<boolean>;

    /** Retorna a URL do código, a data de expiração e os acessos restantes, ou undefined se o código não existir. */
    find(code: string): Promise<StoredUrl | undefined>;

    /**
     * Gasta um acesso do link com limite, de forma atômica (dois acessos simultâneos não passam do limite).
     * Retorna false se não restar acesso ou se o código exato não existir. Não use em links sem limite.
     */
    consumeClick(code: string): Promise<boolean>;

    /** Hash do token de gestão do código exato; null se o link não tem token (links antigos), undefined se não existe. */
    findManageTokenHash(code: string): Promise<string | null | undefined>;

    /** Apaga o link do código exato e os cliques dele, numa transação. Retorna false se o código não existir. */
    delete(code: string): Promise<boolean>;
}
