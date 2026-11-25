import { InvalidUrlError, UrlErrorCode } from './invalid-url-error.ts';
import { isPrivateNetworkHost } from './private-network.ts';

export const MAX_URL_LENGTH = 2048;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const TRAILING_DOT = /\.$/;

/** Retorna a URL normalizada ou lança InvalidUrlError. */
export function validateUrl(input: unknown): string {
    if (typeof input !== 'string' || input.length === 0) {
        throw new InvalidUrlError('O campo "url" é obrigatório e deve ser texto.');
    }

    if (input.length > MAX_URL_LENGTH) {
        throw new InvalidUrlError(`A URL deve ter no máximo ${MAX_URL_LENGTH} caracteres.`);
    }

    const url = URL.parse(input);
    if (!url || !ALLOWED_PROTOCOLS.has(url.protocol)) {
        throw new InvalidUrlError('Informe uma URL válida com http ou https.');
    }

    return url.href;
}

/** Host comparável: o `URL` já põe em minúsculas; aqui também tira o ponto final (`exemplo.com.`). */
export const normalizedHostname = (url: string) => new URL(url).hostname.replace(TRAILING_DOT, '');

/**
 * Lança InvalidUrlError se a URL (já validada) aponta para o próprio encurtador (evita loops de
 * redirecionamento) ou para a rede local. Compara só o host, então qualquer porta do encurtador é recusada.
 */
export function validateDestination(url: string, ownHostname: string): void {
    const hostname = normalizedHostname(url);
    if (hostname === ownHostname) {
        throw new InvalidUrlError('Não é permitido encurtar links do próprio encurtador.', UrlErrorCode.OWN_DOMAIN);
    }

    if (isPrivateNetworkHost(hostname)) {
        throw new InvalidUrlError('Não é permitido encurtar endereços de rede local ou privada.', UrlErrorCode.PRIVATE_NETWORK);
    }
}
