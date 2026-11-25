import { OPENAPI_PATH } from './api-paths.ts';

// shortcut: o Swagger UI vem de uma CDN; servir o pacote swagger-ui-dist localmente se a CDN não for aceitável.
const SWAGGER_UI_CDN = 'https://unpkg.com/swagger-ui-dist@5';

export const SWAGGER_UI_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Encurtador de URLs - API</title>
    <link rel="stylesheet" href="${SWAGGER_UI_CDN}/swagger-ui.css">
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_UI_CDN}/swagger-ui-bundle.js"></script>
    <script>SwaggerUIBundle({ url: '${OPENAPI_PATH}', dom_id: '#swagger-ui' });</script>
</body>
</html>`;
