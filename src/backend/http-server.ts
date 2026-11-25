import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { CODE_PARAM, DOCS_PATH, OPENAPI_PATH, QRCODE_PATH, SHORTEN_PATH } from './api-paths.ts';
import { CODE_PATTERN } from './code-generator.ts';
import { HttpError } from './http-error.ts';
import { InvalidUrlError } from './invalid-url-error.ts';
import { HOME_PAGE_HTML } from '../frontend/home-page.ts';
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
const QRCODE_ROUTE = new RegExp(`^${QRCODE_PATH.replace(CODE_PARAM, '([^/]+)')}$`);
const CODE_NOT_FOUND_MESSAGE = 'Código não encontrado.';
const TOO_MANY_REQUESTS = 429;
const TOO_MANY_REQUESTS_MESSAGE = 'Limite de requisições excedido. Tente de novo mais tarde.';

// API pública e aberta: qualquer origem pode chamá-la.
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

    const qrCode = path.match(QRCODE_ROUTE)?.[1];
    if (isRead && qrCode && CODE_PATTERN.test(qrCode)) {
        return sendQrCode(service, baseUrl, qrCode, res);
    }

    if (isRead && path.startsWith(STATIC_PATH)) {
        return sendStatic(res, path.slice(STATIC_PATH.length));
    }

    const code = path.slice(1);
    if (isRead && CODE_PATTERN.test(code)) {
        return redirect(service, code, res);
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
    const code = await service.shorten(body?.url);
    sendJson(res, 201, { code, shortUrl: shortUrlOf(code, baseUrl) });
}

async function sendQrCode(service: UrlShortenerService, baseUrl: string, code: string, res: ServerResponse) {
    await requireUrl(service, code);
    send(res, 200, { 'Content-Type': 'image/svg+xml' }, createQrCodeSvg(shortUrlOf(code, baseUrl)));
}

/** Retorna a URL original do código, ou lança 404 se ele não existir. */
async function requireUrl(service: UrlShortenerService, code: string): Promise<string> {
    const url = await service.resolve(code);
    if (!url) {
        throw new HttpError(404, CODE_NOT_FOUND_MESSAGE);
    }

    return url;
}

async function redirect(service: UrlShortenerService, code: string, res: ServerResponse) {
    send(res, 302, { Location: await requireUrl(service, code) });
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

function parseJson(text: string): { url?: unknown } | undefined {
    try {
        const value = JSON.parse(text);
        return typeof value === 'object' && value !== null ? value : undefined;
    } catch {
        throw new HttpError(400, 'O corpo da requisição deve ser um JSON válido.');
    }
}

function sendError(res: ServerResponse, error: unknown) {
    if (error instanceof HttpError) {
        return sendJson(res, error.status, { error: error.message }, error.headers);
    }

    if (error instanceof InvalidUrlError) {
        return sendJson(res, 400, { error: error.message, code: error.code });
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
