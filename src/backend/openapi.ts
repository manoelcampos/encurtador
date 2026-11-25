import { QRCODE_PATH, SHORTEN_PATH } from './api-paths.ts';
import { MAX_URL_LENGTH } from './url-validator.ts';

const CODE_PARAMETER = { name: 'code', in: 'path', required: true, schema: { type: 'string' } };

const errorResponse = (description: string) => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

/** Especificação OpenAPI da API. `baseUrl` aparece como servidor no Swagger UI. */
export function createOpenApiSpec(baseUrl: string) {
    return {
        openapi: '3.1.0',
        info: {
            title: 'Encurtador de URLs',
            version: '0.1.0',
            description: 'API pública e aberta, sem autenticação.',
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
                        400: errorResponse('JSON ou URL inválidos'),
                        413: errorResponse('Corpo da requisição grande demais'),
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
                    },
                },
            },
            '/{code}': {
                get: {
                    summary: 'Redireciona para a URL original',
                    description: 'O Swagger UI segue o redirecionamento, então teste esta rota direto no navegador.',
                    parameters: [CODE_PARAMETER],
                    responses: {
                        302: {
                            description: 'Redireciona para a URL original',
                            headers: { Location: { schema: { type: 'string', format: 'uri' } } },
                        },
                        404: errorResponse('Código não encontrado'),
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
                    },
                },
                ShortenResponse: {
                    type: 'object',
                    properties: {
                        code: { type: 'string', example: 'AbC234xYz' },
                        shortUrl: { type: 'string', format: 'uri', example: `${baseUrl}AbC234xYz` },
                    },
                },
                Error: {
                    type: 'object',
                    properties: { error: { type: 'string' } },
                },
            },
        },
    };
}
