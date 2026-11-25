import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { DOCS_PATH, OPENAPI_PATH, SHORTEN_PATH } from './api-paths.ts';
import { CODE_PATTERN } from './code-generator.ts';
import { HttpError } from './http-error.ts';
import { InvalidUrlError } from './invalid-url-error.ts';
import { HOME_PAGE_HTML } from '../frontend/home-page.ts';
import { STATIC_CONTENT_TYPES, STATIC_DIR, STATIC_PATH } from '../frontend/static-files.ts';
import { createOpenApiSpec } from './openapi.ts';
import { SWAGGER_UI_HTML } from './swagger-ui.ts';
import type { UrlShortenerService } from './url-shortener-service.ts';

const MAX_BODY_BYTES = 10 * 1024;
const HOME_PATH = '/';
const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' };
const NOT_FOUND_MESSAGE = 'Recurso não encontrado.';
// Só nomes simples (sem barras nem "..") dentro de STATIC_DIR, o que impede path traversal.
const STATIC_FILE_NAME = /^[\w-]+\.\w+$/;

// API pública e aberta: qualquer origem pode chamá-la.
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

/** Cria o servidor HTTP da API. `baseUrl` é usado para montar as URLs curtas devolvidas. */
export function createApiServer(service: UrlShortenerService, baseUrl: string): Server {
    return createServer((req, res) => {
        handleRequest(service, baseUrl, req, res).catch(error => sendError(res, error));
    });
}

async function handleRequest(service: UrlShortenerService, baseUrl: string, req: IncomingMessage, res: ServerResponse) {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const isRead = req.method === 'GET' || req.method === 'HEAD';

    if (req.method === 'OPTIONS') {
        return send(res, 204);
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

    if (req.method === 'POST' && path === SHORTEN_PATH) {
        return shorten(service, baseUrl, req, res);
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

async function shorten(service: UrlShortenerService, baseUrl: string, req: IncomingMessage, res: ServerResponse) {
    const body = parseJson(await readBody(req));
    const code = await service.shorten(body?.url);
    const shortUrl = new URL(code, baseUrl).href;
    sendJson(res, 201, { code, shortUrl });
}

async function redirect(service: UrlShortenerService, code: string, res: ServerResponse) {
    const url = await service.resolve(code);
    if (!url) {
        throw new HttpError(404, 'Código não encontrado.');
    }

    send(res, 302, { Location: url });
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
        return sendJson(res, error.status, { error: error.message });
    }

    if (error instanceof InvalidUrlError) {
        return sendJson(res, 400, { error: error.message });
    }

    console.error(error);
    sendJson(res, 500, { error: 'Erro interno do servidor.' });
}

function sendJson(res: ServerResponse, status: number, body: object) {
    send(res, status, { 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify(body));
}

function send(res: ServerResponse, status: number, headers: Record<string, string> = {}, body?: string) {
    if (res.headersSent) {
        return res.end();
    }

    res.writeHead(status, { ...CORS_HEADERS, ...headers });
    res.end(body);
}
