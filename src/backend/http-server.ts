import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { languagesFromHeader } from './accept-language.ts';
import { CODE_PARAM, DOCS_PATH, LINK_PATH, OPENAPI_PATH, PREVIEW_SUFFIX, QRCODE_PATH, SHORTEN_PATH, STATS_PATH } from './api-paths.ts';
import { CODE_PATTERN } from './code-generator.ts';
import { HttpError } from './http-error.ts';
import { InvalidUrlError, UrlErrorCode } from './invalid-url-error.ts';
import { HOME_PAGE_HTML } from '../frontend/home-page.ts';
import { previewLanguage, previewPageHtml } from '../frontend/preview-page.ts';
import { STATIC_CONTENT_TYPES, STATIC_DIR, STATIC_PATH } from '../frontend/static-files.ts';
import { createOpenApiSpec } from './openapi.ts';
import { createQrCodeSvg } from './qr-code.ts';
import { clientIp } from './client-ip.ts';
import type { RateLimits } from './rate-limit-config.ts';
import type { RateLimiter } from './rate-limiter.ts';
import { SWAGGER_UI_HTML } from './swagger-ui.ts';
import type { UrlShortenerService } from './url-shortener-service.ts';

const MAX_BODY_BYTES = 10 * 1024;
const HOME_PATH = '/';
const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' };
const NOT_FOUND_MESSAGE = 'Recurso não encontrado.';
// Só nomes simples (sem barras nem "..") dentro de STATIC_DIR, o que impede path traversal.
const STATIC_FILE_NAME = /^[\w-]+\.\w+$/;
const routeOf = (path: string) => new RegExp(`^${path.replace(CODE_PARAM, '([^/]+)')}$`);
const LINK_ROUTE = routeOf(LINK_PATH);
const QRCODE_ROUTE = routeOf(QRCODE_PATH);
const STATS_ROUTE = routeOf(STATS_PATH);
// A página de pré-visualização não tem JS: o CSP só libera o CSS embutido e impede que ela seja embutida em outro site.
const PREVIEW_HEADERS = {
    ...HTML_HEADERS,
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    Vary: 'Accept-Language',
};
// O navegador pode mandar o sufixo codificado (ex.: `%2B`), e o `URL` não decodifica o caminho.
const PREVIEW_SUFFIXES = [PREVIEW_SUFFIX, encodeURIComponent(PREVIEW_SUFFIX)].map(suffix => suffix.toUpperCase());
const CODE_NOT_FOUND_MESSAGE = 'Código não encontrado.';
const TOO_MANY_REQUESTS = 429;
const TOO_MANY_REQUESTS_MESSAGE = 'Limite de requisições excedido. Tente de novo mais tarde.';
const BAD_REQUEST = 400;
const CONFLICT = 409;
const SERVICE_UNAVAILABLE = 503;
const GONE = 410;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NO_CONTENT = 204;
const ERROR_STATUS: Readonly<Partial<Record<UrlErrorCode, number>>> = {
    [UrlErrorCode.ALIAS_TAKEN]: CONFLICT,
    [UrlErrorCode.ALIAS_UNAVAILABLE]: SERVICE_UNAVAILABLE,
    [UrlErrorCode.LINK_EXPIRED]: GONE,
    [UrlErrorCode.MANAGE_TOKEN_REQUIRED]: UNAUTHORIZED,
    [UrlErrorCode.INVALID_MANAGE_TOKEN]: FORBIDDEN,
};
// O 401 diz ao cliente qual esquema de autenticação usar.
const ERROR_HEADERS: Readonly<Partial<Record<UrlErrorCode, Readonly<Record<string, string>>>>> = {
    [UrlErrorCode.MANAGE_TOKEN_REQUIRED]: { 'WWW-Authenticate': 'Bearer' },
};
const BEARER_TOKEN = /^Bearer\s+(\S+)\s*$/i;

// API pública e aberta: qualquer origem pode chamá-la.
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    // Authorization leva o token de gestão no DELETE.
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    // Sem isso, o navegador esconde o Retry-After do JavaScript de outras origens.
    'Access-Control-Expose-Headers': 'Retry-After',
};

/**
 * Cria o servidor HTTP da API. `baseUrl` é usado para montar as URLs curtas devolvidas.
 * Sem `limits`, não limita as requisições.
 */
export function createApiServer(service: UrlShortenerService, baseUrl: string, limits?: RateLimits): Server {
    return createServer((req, res) => {
        handleRequest(service, baseUrl, limits, req, res).catch(error => sendError(res, error));
    });
}

async function handleRequest(
    service: UrlShortenerService, baseUrl: string, limits: RateLimits | undefined, req: IncomingMessage, res: ServerResponse,
) {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const isRead = req.method === 'GET' || req.method === 'HEAD';
    const isShorten = req.method === 'POST' && path === SHORTEN_PATH;

    if (req.method === 'OPTIONS') {
        return send(res, 204);
    }

    if (limits) {
        enforceLimit(isShorten ? limits.create : limits.access, clientIp(req, limits.trustProxy));
    }

    if (req.method === 'GET' && path === OPENAPI_PATH) {
        return sendJson(res, 200, createOpenApiSpec(baseUrl));
    }

    if (isRead && path === HOME_PATH) {
        return send(res, 200, HTML_HEADERS, HOME_PAGE_HTML);
    }

    if (req.method === 'GET' && path === DOCS_PATH) {
        return send(res, 200, HTML_HEADERS, SWAGGER_UI_HTML);
    }

    if (isShorten) {
        return shorten(service, baseUrl, req, res);
    }

    const linkCode = path.match(LINK_ROUTE)?.[1];
    if (req.method === 'DELETE' && linkCode && CODE_PATTERN.test(linkCode)) {
        return deleteLink(service, linkCode, req, res);
    }

    const qrCode = path.match(QRCODE_ROUTE)?.[1];
    if (isRead && qrCode && CODE_PATTERN.test(qrCode)) {
        return sendQrCode(service, baseUrl, qrCode, res);
    }

    const statsCode = path.match(STATS_ROUTE)?.[1];
    if (isRead && statsCode && CODE_PATTERN.test(statsCode)) {
        return sendStats(service, statsCode, res);
    }

    if (isRead && path.startsWith(STATIC_PATH)) {
        return sendStatic(res, path.slice(STATIC_PATH.length));
    }

    const previewCode = previewCodeOf(path);
    if (isRead && previewCode !== undefined && CODE_PATTERN.test(previewCode)) {
        return sendPreview(service, previewCode, req, res);
    }

    const code = path.slice(1);
    if (isRead && CODE_PATTERN.test(code)) {
        return redirect(service, code, req.method === 'GET', res);
    }

    throw new HttpError(404, NOT_FOUND_MESSAGE);
}

/** Lança 429 com Retry-After se o cliente passou do limite. */
function enforceLimit(limiter: RateLimiter, ip: string) {
    const { allowed, retryAfterSeconds } = limiter.consume(ip);
    if (!allowed) {
        throw new HttpError(TOO_MANY_REQUESTS, TOO_MANY_REQUESTS_MESSAGE, { 'Retry-After': String(retryAfterSeconds) });
    }
}

const shortUrlOf = (code: string, baseUrl: string) => new URL(code, baseUrl).href;

async function shorten(service: UrlShortenerService, baseUrl: string, req: IncomingMessage, res: ServerResponse) {
    const body = parseJson(await readBody(req));
    const { code, url, expiresAt, manageToken } = await service.shorten(body?.url, body?.alias, body?.expiresIn, body?.removeTracking);
    sendJson(res, 201, { code, shortUrl: shortUrlOf(code, baseUrl), url, expiresAt, manageToken });
}

/** Apaga o link com o token de gestão do header `Authorization: Bearer <token>`. */
async function deleteLink(service: UrlShortenerService, code: string, req: IncomingMessage, res: ServerResponse) {
    if (!await service.delete(code, bearerToken(req.headers.authorization))) {
        throw new HttpError(404, CODE_NOT_FOUND_MESSAGE);
    }

    send(res, NO_CONTENT);
}

/** Token do header `Authorization: Bearer <token>`, ou undefined se o header faltar ou tiver outro formato. */
const bearerToken = (header: string | undefined) => header?.match(BEARER_TOKEN)?.[1];

/** Link expirado responde 410 (LINK_EXPIRED): o QR Code levaria a um link que não abre mais. */
async function sendQrCode(service: UrlShortenerService, baseUrl: string, code: string, res: ServerResponse) {
    // O QR Code leva o código gravado (ex.: o apelido em minúsculas), não o texto pedido.
    const { code: storedCode } = requireCode(await service.findActive(code));
    send(res, 200, { 'Content-Type': 'image/svg+xml' }, createQrCodeSvg(shortUrlOf(storedCode, baseUrl)));
}

async function sendStats(service: UrlShortenerService, code: string, res: ServerResponse) {
    sendJson(res, 200, requireCode(await service.stats(code)));
}

/** Retorna o valor encontrado para o código, ou lança 404 se ele não existir. */
function requireCode<T>(found: T | undefined): T {
    if (!found) {
        throw new HttpError(404, CODE_NOT_FOUND_MESSAGE);
    }

    return found;
}

/** Só GET conta como clique: HEAD é usado por robôs e prévias de link, que não são visitas de pessoas. */
async function redirect(service: UrlShortenerService, code: string, countClick: boolean, res: ServerResponse) {
    const url = countClick ? await service.visit(code) : await service.resolve(code);
    send(res, 302, { Location: requireCode(url) });
}

/** Código pedido em `/{code}+` (ou `/{code}%2B`), ou undefined se o caminho não termina com o sufixo. */
function previewCodeOf(path: string): string | undefined {
    const suffix = PREVIEW_SUFFIXES.find(candidate => path.toUpperCase().endsWith(candidate));
    return suffix ? path.slice(1, -suffix.length) : undefined;
}

/** Mostra o destino sem redirecionar. Não conta clique; link expirado dá 410, como no redirecionamento. */
async function sendPreview(service: UrlShortenerService, code: string, req: IncomingMessage, res: ServerResponse) {
    const url = requireCode(await service.resolve(code));
    const language = previewLanguage(languagesFromHeader(req.headers['accept-language']));
    send(res, 200, PREVIEW_HEADERS, previewPageHtml(url, language, HOME_PATH));
}

async function sendStatic(res: ServerResponse, name: string) {
    const contentType = STATIC_FILE_NAME.test(name) ? STATIC_CONTENT_TYPES[extname(name)] : undefined;
    if (!contentType) {
        throw new HttpError(404, NOT_FOUND_MESSAGE);
    }

    const body = await readFile(new URL(name, STATIC_DIR), 'utf8').catch(() => {
        throw new HttpError(404, NOT_FOUND_MESSAGE);
    });
    send(res, 200, { 'Content-Type': contentType }, body);
}

async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
            throw new HttpError(413, `O corpo da requisição deve ter no máximo ${MAX_BODY_BYTES} bytes.`);
        }

        chunks.push(chunk);
    }

    return Buffer.concat(chunks).toString('utf8');
}

function parseJson(text: string): { url?: unknown; alias?: unknown; expiresIn?: unknown; removeTracking?: unknown } | undefined {
    try {
        const value = JSON.parse(text);
        return typeof value === 'object' && value !== null ? value : undefined;
    } catch {
        throw new HttpError(BAD_REQUEST, 'O corpo da requisição deve ser um JSON válido.');
    }
}

function sendError(res: ServerResponse, error: unknown) {
    if (error instanceof HttpError) {
        return sendJson(res, error.status, { error: error.message }, error.headers);
    }

    if (error instanceof InvalidUrlError) {
        const status = ERROR_STATUS[error.code] ?? BAD_REQUEST;
        return sendJson(res, status, { error: error.message, code: error.code }, ERROR_HEADERS[error.code]);
    }

    console.error(error);
    sendJson(res, 500, { error: 'Erro interno do servidor.' });
}

function sendJson(res: ServerResponse, status: number, body: object, headers: Readonly<Record<string, string>> = {}) {
    send(res, status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify(body));
}

function send(res: ServerResponse, status: number, headers: Record<string, string> = {}, body?: string) {
    if (res.headersSent) {
        return res.end();
    }

    res.writeHead(status, { ...CORS_HEADERS, ...headers });
    res.end(body);
}
