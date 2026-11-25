/**
 * Códigos estáveis dos motivos de recusa de uma URL ou do apelido, devolvidos pela API no campo `code`.
 * O frontend escolhe a mensagem traduzida por eles (CHAVES_DOS_CODIGOS_DE_ERRO em logic.js; há teste).
 */
export const UrlErrorCode = {
    INVALID_URL: 'INVALID_URL',
    OWN_DOMAIN: 'OWN_DOMAIN',
    PRIVATE_NETWORK: 'PRIVATE_NETWORK',
    MALICIOUS_URL: 'MALICIOUS_URL',
    /** Apelido fora do formato aceito. */
    INVALID_ALIAS: 'INVALID_ALIAS',
    /** Apelido já usado por outro link ou reservado pela aplicação; a API responde 409. */
    ALIAS_TAKEN: 'ALIAS_TAKEN',
    /** Apelidos desativados porque o banco tem códigos que só diferem em maiúsculas; a API responde 503. */
    ALIAS_UNAVAILABLE: 'ALIAS_UNAVAILABLE',
} as const;

export type UrlErrorCode = typeof UrlErrorCode[keyof typeof UrlErrorCode];

export class InvalidUrlError extends Error {
    readonly code: UrlErrorCode;

    constructor(message: string, code: UrlErrorCode = UrlErrorCode.INVALID_URL) {
        super(message);
        this.name = 'InvalidUrlError';
        this.code = code;
    }
}
