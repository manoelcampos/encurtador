import { ALIAS_MAX_LENGTH, ALIAS_MIN_LENGTH } from './alias-validator.ts';
import { QRCODE_PATH, SHORTEN_PATH, STATS_PATH } from './api-paths.ts';
import { EXPIRATION_OPTIONS } from './expiration.ts';
import { UrlErrorCode } from './invalid-url-error.ts';
import { STATS_DAYS } from './url-shortener-service.ts';
import { MAX_URL_LENGTH } from './url-validator.ts';

const CODE_PARAMETER = { name: 'code', in: 'path', required: true, schema: { type: 'string' } };

const errorResponse = (description: string) => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const LINK_EXPIRED_RESPONSE = {
    description: 'O link passou do prazo de validade (`code` = `LINK_EXPIRED`).',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/UrlError' } } },
};

const TOO_MANY_REQUESTS_RESPONSE = {
    ...errorResponse('Limite de requisições por IP excedido'),
    headers: {
        'Retry-After': { description: 'Segundos até poder tentar de novo', schema: { type: 'integer' } },
    },
};

/** Especificação OpenAPI da API. `baseUrl` aparece como servidor no Swagger UI. */
export function createOpenApiSpec(baseUrl: string) {
    return {
        openapi: '3.1.0',
        info: {
            title: 'Encurtador de URLs',
            version: '0.1.0',
            description: 'API pública e aberta, sem autenticação, com limite de requisições por IP.',
        },
        servers: [{ url: baseUrl }],
        paths: {
            [SHORTEN_PATH]: {
                post: {
                    summary: 'Encurta uma URL',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/ShortenRequest' } } },
                    },
                    responses: {
                        201: {
                            description: 'URL encurtada',
                            content: { 'application/json': { schema: { $ref: '#/components/schemas/ShortenResponse' } } },
                        },
                        400: {
                            description: 'JSON ou URL inválidos, URL recusada (próprio encurtador, rede local ou maliciosa) '
                                + 'apelido fora do formato ou prazo de validade inválido. Quando a URL, o apelido ou o prazo são recusados, '
                                + '`code` diz o motivo.',
                            content: { 'application/json': { schema: { $ref: '#/components/schemas/UrlError' } } },
                        },
                        409: {
                            description: 'Apelido já em uso ou reservado pela aplicação (`code` = `ALIAS_TAKEN`).',
                            content: { 'application/json': { schema: { $ref: '#/components/schemas/UrlError' } } },
                        },
                        413: errorResponse('Corpo da requisição grande demais'),
                        429: TOO_MANY_REQUESTS_RESPONSE,
                        503: {
                            description: 'Apelidos desativados (`code` = `ALIAS_UNAVAILABLE`), porque o banco tem códigos antigos '
                                + 'que só diferem em maiúsculas. Encurte sem apelido.',
                            content: { 'application/json': { schema: { $ref: '#/components/schemas/UrlError' } } },
                        },
                    },
                },
            },
            [QRCODE_PATH]: {
                get: {
                    summary: 'QR Code do link curto',
                    description: 'Imagem SVG do QR Code que abre o link curto.',
                    parameters: [CODE_PARAMETER],
                    responses: {
                        200: {
                            description: 'QR Code em SVG',
                            content: { 'image/svg+xml': { schema: { type: 'string' } } },
                        },
                        404: errorResponse('Código não encontrado'),
                        410: LINK_EXPIRED_RESPONSE,
                        429: TOO_MANY_REQUESTS_RESPONSE,
                    },
                },
            },
            [STATS_PATH]: {
                get: {
                    summary: 'Estatísticas de cliques do link curto',
                    description: `Total de cliques desde a criação e cliques por dia (UTC) nos últimos ${STATS_DAYS} dias, `
                        + 'contando hoje. Dias sem cliques não aparecem. Continua disponível depois que o link expira.',
                    parameters: [CODE_PARAMETER],
                    responses: {
                        200: {
                            description: 'Estatísticas do link curto',
                            content: { 'application/json': { schema: { $ref: '#/components/schemas/ClickStats' } } },
                        },
                        404: errorResponse('Código não encontrado'),
                        429: TOO_MANY_REQUESTS_RESPONSE,
                    },
                },
            },
            '/{code}': {
                get: {
                    summary: 'Redireciona para a URL original',
                    description: 'Cada GET que redireciona conta como um clique (HEAD não conta). Link expirado não conta clique. '
                        + 'O Swagger UI segue o redirecionamento, então teste esta rota direto no navegador.',
                    parameters: [CODE_PARAMETER],
                    responses: {
                        302: {
                            description: 'Redireciona para a URL original',
                            headers: { Location: { schema: { type: 'string', format: 'uri' } } },
                        },
                        404: errorResponse('Código não encontrado'),
                        410: LINK_EXPIRED_RESPONSE,
                        429: TOO_MANY_REQUESTS_RESPONSE,
                    },
                },
            },
        },
        components: {
            schemas: {
                ShortenRequest: {
                    type: 'object',
                    required: ['url'],
                    properties: {
                        url: { type: 'string', format: 'uri', maxLength: MAX_URL_LENGTH, example: 'https://example.com/pagina' },
                        alias: {
                            type: 'string',
                            description: 'Apelido opcional usado como código do link. Letras, números e hífen, sem hífen no início ou no fim. '
                                + 'Não diferencia maiúsculas: é gravado em minúsculas.',
                            minLength: ALIAS_MIN_LENGTH,
                            maxLength: ALIAS_MAX_LENGTH,
                            example: 'promo-natal',
                        },
                        expiresIn: {
                            type: ['string', 'null'],
                            description: 'Prazo de validade opcional, contado a partir da criação (h = horas, d = dias). '
                                + 'Sem ele, o link não expira. Depois do prazo, o link responde 410.',
                            enum: Object.keys(EXPIRATION_OPTIONS),
                            example: '7d',
                        },
                    },
                },
                ShortenResponse: {
                    type: 'object',
                    properties: {
                        code: { type: 'string', example: 'AbC234xYz' },
                        shortUrl: { type: 'string', format: 'uri', example: `${baseUrl}AbC234xYz` },
                        expiresAt: {
                            type: ['string', 'null'],
                            format: 'date-time',
                            description: 'Data de expiração em UTC, ou null se o link não expira.',
                            example: '2026-12-02T12:00:00.000Z',
                        },
                    },
                },
                ClickStats: {
                    type: 'object',
                    properties: {
                        code: { type: 'string', example: 'AbC234xYz' },
                        totalClicks: { type: 'integer', example: 3 },
                        clicksByDay: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    date: { type: 'string', format: 'date', example: '2026-11-25' },
                                    clicks: { type: 'integer', example: 3 },
                                },
                            },
                        },
                    },
                },
                Error: {
                    type: 'object',
                    properties: { error: { type: 'string' } },
                },
                UrlError: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                        code: { type: 'string', enum: Object.values(UrlErrorCode) },
                    },
                },
            },
        },
    };
}
