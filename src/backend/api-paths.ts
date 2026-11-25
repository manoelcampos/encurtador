export const SHORTEN_PATH = '/api/urls';
export const OPENAPI_PATH = '/api/openapi.json';
export const DOCS_PATH = '/api/docs';
/** Marcador do código curto nas rotas, no formato do OpenAPI. */
export const CODE_PARAM = '{code}';
/** Um link curto; `DELETE` nesta rota apaga o link com o token de gestão. */
export const LINK_PATH = `${SHORTEN_PATH}/${CODE_PARAM}`;
export const QRCODE_PATH = `${LINK_PATH}/qrcode`;
export const STATS_PATH = `${LINK_PATH}/stats`;
/** Sufixo que, depois do código (ex.: `/AbC234xYz+`), mostra o destino em vez de redirecionar. Não cabe no CODE_PATTERN. */
export const PREVIEW_SUFFIX = '+';
