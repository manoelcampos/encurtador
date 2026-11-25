// Arquivos estáticos da interface web (JS em módulos ES, sem bundler).
export const STATIC_PATH = '/static/';

// Relativo a este módulo: em `npm start`, o tsc já emitiu os .js de static/ em dist/frontend/static/.
export const STATIC_DIR = new URL('./static/', import.meta.url);

/** Tipos de conteúdo dos arquivos estáticos que podem ser servidos, por extensão. */
export const STATIC_CONTENT_TYPES: Readonly<Record<string, string>> = {
    '.js': 'text/javascript; charset=utf-8',
};
