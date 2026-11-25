/** Contrato da camada de acesso a dados para as URLs encurtadas. */
export interface UrlRepository {
    /** Grava a URL com o código informado. Retorna false se o código já existir. */
    add(code: string, url: string): Promise<boolean>;

    /** Retorna a URL do código, ou undefined se ele não existir. */
    find(code: string): Promise<string | undefined>;
}
