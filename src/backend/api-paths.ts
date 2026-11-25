export const SHORTEN_PATH = '/api/urls';
export const OPENAPI_PATH = '/api/openapi.json';
export const DOCS_PATH = '/api/docs';
/** Marcador do código curto nas rotas, no formato do OpenAPI. */
export const CODE_PARAM = '{code}';
export const QRCODE_PATH = `${SHORTEN_PATH}/${CODE_PARAM}/qrcode`;
export const STATS_PATH = `${SHORTEN_PATH}/${CODE_PARAM}/stats`;
