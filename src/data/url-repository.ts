/** Contrato da camada de acesso a dados para as URLs encurtadas. */
export interface UrlRepository {
    /**
     * Se o `add` recusa um código igual a outro ignorando maiúsculas. Sem isso, apelidos ficam desativados,
     * pois um apelido poderia imitar um código gerado para quem digita o link com outra caixa.
     */
    readonly uniqueIgnoringCase: boolean;

    /** Grava a URL com o código informado. Retorna false se o código já existir (ignorando maiúsculas, quando `uniqueIgnoringCase`). */
    add(code: string, url: string): Promise<boolean>;

    /** Retorna a URL do código, ou undefined se ele não existir. */
    find(code: string): Promise<string | undefined>;
}
