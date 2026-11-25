/**
 * Códigos estáveis dos motivos de recusa de uma URL, do apelido ou do token de gestão, devolvidos pela API no campo `code`.
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
    /** Prazo de validade (`expiresIn`) fora da lista aceita (EXPIRATION_OPTIONS). */
    INVALID_EXPIRATION: 'INVALID_EXPIRATION',
    /** `removeTracking` com valor que não é boolean. */
    INVALID_REMOVE_TRACKING: 'INVALID_REMOVE_TRACKING',
    /** `maxClicks` que não é um inteiro de 1 a MAX_CLICKS_LIMIT. */
    INVALID_MAX_CLICKS: 'INVALID_MAX_CLICKS',
    /** O link passou do prazo de validade; `/:code` e o QR Code respondem 410. */
    LINK_EXPIRED: 'LINK_EXPIRED',
    /** O link já teve todos os acessos de `maxClicks`; `/:code`, `/:code+` e o QR Code respondem 410. */
    LINK_EXHAUSTED: 'LINK_EXHAUSTED',
    /** `DELETE` sem o token de gestão no header Authorization; a API responde 401. */
    MANAGE_TOKEN_REQUIRED: 'MANAGE_TOKEN_REQUIRED',
    /** Token de gestão errado, ou link antigo, criado sem token; a API responde 403. */
    INVALID_MANAGE_TOKEN: 'INVALID_MANAGE_TOKEN',
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
