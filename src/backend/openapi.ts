import { ALIAS_MAX_LENGTH, ALIAS_MIN_LENGTH } from './alias-validator.ts';
import { LINK_PATH, PREVIEW_SUFFIX, QRCODE_PATH, SHORTEN_PATH, STATS_PATH } from './api-paths.ts';
import { EXPIRATION_OPTIONS } from './expiration.ts';
import { UrlErrorCode } from './invalid-url-error.ts';
import { MAX_CLICKS_LIMIT } from './max-clicks.ts';
import { STATS_DAYS } from './url-shortener-service.ts';
import { MAX_URL_LENGTH } from './url-validator.ts';

const CODE_PARAMETER = { name: 'code', in: 'path', required: true, schema: { type: 'string' } };

const errorResponse = (description: string) => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const LINK_GONE_RESPONSE = {
    description: 'O link passou do prazo de validade (`code` = `LINK_EXPIRED`) '
        + 'ou já teve todos os acessos do limite `maxClicks` (`code` = `LINK_EXHAUSTED`).',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/UrlError' } } },
};

const urlErrorResponse = (description: string) => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/UrlError' } } },
});

const MANAGE_TOKEN_SCHEME = 'manageToken';

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
            description: 'API pública e aberta, sem contas, com limite de requisições por IP. '
                + 'Só apagar um link exige o token de gestão devolvido na criação.',
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
                                + 'apelido fora do formato, prazo de validade inválido, `removeTracking` que não é boolean '
                                + 'ou `maxClicks` inválido. Quando a URL, o apelido, o prazo, o `removeTracking` ou o `maxClicks` são recusados, '
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
            [LINK_PATH]: {
                delete: {
                    summary: 'Apaga o link curto',
                    description: 'Exige o token de gestão (`manageToken`) devolvido na criação, no header '
                        + '`Authorization: Bearer <token>`. Apaga também os cliques, e o código (ou apelido) fica livre de novo. '
                        + 'Funciona com o link expirado. Links criados antes do token não têm token e não podem ser apagados (403).',
                    parameters: [CODE_PARAMETER],
                    security: [{ [MANAGE_TOKEN_SCHEME]: [] }],
                    responses: {
                        204: { description: 'Link apagado' },
                        401: {
                            ...urlErrorResponse('Token ausente (`code` = `MANAGE_TOKEN_REQUIRED`).'),
                            headers: {
                                'WWW-Authenticate': { description: 'Esquema de autenticação esperado', schema: { type: 'string', const: 'Bearer' } },
                            },
                        },
                        403: urlErrorResponse('Token errado, ou link antigo sem token (`code` = `INVALID_MANAGE_TOKEN`).'),
                        404: errorResponse('Código não encontrado'),
                        429: TOO_MANY_REQUESTS_RESPONSE,
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
                        410: LINK_GONE_RESPONSE,
                        429: TOO_MANY_REQUESTS_RESPONSE,
                    },
                },
            },
            [STATS_PATH]: {
                get: {
                    summary: 'Estatísticas de cliques do link curto',
                    description: `Total de cliques desde a criação e cliques por dia (UTC) nos últimos ${STATS_DAYS} dias, `
                        + 'contando hoje. Dias sem cliques não aparecem. Continua disponível depois que o link expira ou esgota os acessos.',
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
                        + 'Em link com `maxClicks`, cada GET que redireciona gasta um acesso; sem acesso restante, responde 410. '
                        + 'HEAD não gasta acesso; em link com `maxClicks`, HEAD responde 200 sem `Location`, para não revelar o destino. '
                        + 'O Swagger UI segue o redirecionamento, então teste esta rota direto no navegador.',
                    parameters: [CODE_PARAMETER],
                    responses: {
                        302: {
                            description: 'Redireciona para a URL original',
                            headers: { Location: { schema: { type: 'string', format: 'uri' } } },
                        },
                        404: errorResponse('Código não encontrado'),
                        410: LINK_GONE_RESPONSE,
                        429: TOO_MANY_REQUESTS_RESPONSE,
                    },
                },
            },
            [`/{code}${PREVIEW_SUFFIX}`]: {
                get: {
                    summary: 'Mostra o destino do link curto, sem redirecionar',
                    description: 'Página HTML com o domínio e a URL de destino e um link "Continuar". Não conta clique. '
                        + `Também aceita o sufixo codificado (${encodeURIComponent(PREVIEW_SUFFIX)}). `
                        + 'O idioma vem do header Accept-Language. O título da página de destino não é buscado. '
                        + 'Em link com `maxClicks`, a página não mostra o destino e "Continuar" leva ao link curto (o GET gasta um acesso).',
                    parameters: [CODE_PARAMETER],
                    responses: {
                        200: { description: 'Página de pré-visualização', content: { 'text/html': { schema: { type: 'string' } } } },
                        404: errorResponse('Código não encontrado'),
                        410: LINK_GONE_RESPONSE,
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
                        removeTracking: {
                            type: ['boolean', 'null'],
                            description: 'Com true, remove os parâmetros de rastreamento (`utm_*`, `fbclid`, `gclid` etc.) antes de gravar. '
                                + 'Os outros parâmetros e o fragmento ficam como estão. Padrão: false.',
                            default: false,
                            example: true,
                        },
                        maxClicks: {
                            type: ['integer', 'null'],
                            description: 'Limite opcional de acessos: o link redireciona só esse número de vezes e depois responde 410 '
                                + '(`LINK_EXHAUSTED`). Só o GET que redireciona gasta acesso (HEAD, pré-visualização, QR Code e '
                                + 'estatísticas não). Sem ele, o link não tem limite. Vale junto com o prazo: o que acabar primeiro.',
                            minimum: 1,
                            maximum: MAX_CLICKS_LIMIT,
                            example: 1,
                        },
                    },
                },
                ShortenResponse: {
                    type: 'object',
                    properties: {
                        code: { type: 'string', example: 'AbC234xYz' },
                        shortUrl: { type: 'string', format: 'uri', example: `${baseUrl}AbC234xYz` },
                        url: {
                            type: 'string',
                            format: 'uri',
                            description: 'URL de destino gravada (normalizada e, com `removeTracking`, sem parâmetros de rastreamento).',
                            example: 'https://example.com/pagina?id=1',
                        },
                        expiresAt: {
                            type: ['string', 'null'],
                            format: 'date-time',
                            description: 'Data de expiração em UTC, ou null se o link não expira.',
                            example: '2026-12-02T12:00:00.000Z',
                        },
                        maxClicks: {
                            type: ['integer', 'null'],
                            description: 'Limite de acessos do link, ou null se não tem limite.',
                            example: 1,
                        },
                        manageToken: {
                            type: 'string',
                            description: 'Token secreto para apagar o link. Só aparece nesta resposta: guarde-o, ele não pode ser recuperado.',
                            example: 'q3Jx8m0pZ1vK7yT2nB5cW9eR4uH6aL0dS3fG8jQ1wE4',
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
            securitySchemes: {
                [MANAGE_TOKEN_SCHEME]: {
                    type: 'http',
                    scheme: 'bearer',
                    description: 'Token de gestão (`manageToken`) devolvido pelo POST que criou o link.',
                },
            },
        },
    };
}
