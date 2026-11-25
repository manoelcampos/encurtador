import { SqliteUrlRepository } from '../data/sqlite-url-repository.ts';
import { createApiServer } from './http-server.ts';
import { rateLimitsFromEnv } from './rate-limit-config.ts';
import { SafeBrowsingThreatChecker } from './safe-browsing-threat-checker.ts';
import { UrlShortenerService } from './url-shortener-service.ts';
import { NO_THREAT_CHECKER } from './url-threat-checker.ts';

const DEFAULT_PORT = 3000;
const DEFAULT_DB_PATH = 'encurtador.db';

const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;
const port = Number(process.env.PORT ?? DEFAULT_PORT);
// A barra final garante que o código seja anexado ao caminho da BASE_URL, e não o substitua.
const baseUrl = (process.env.BASE_URL ?? `http://localhost:${port}`).replace(/\/?$/, '/');

const limits = rateLimitsFromEnv(process.env);
const safeBrowsingKey = process.env.SAFE_BROWSING_API_KEY;
const threatChecker = safeBrowsingKey ? new SafeBrowsingThreatChecker(safeBrowsingKey) : NO_THREAT_CHECKER;
const service = new UrlShortenerService(new SqliteUrlRepository(dbPath), baseUrl, { threatChecker });
createApiServer(service, baseUrl, limits).listen(port, () => {
    console.log(`API do encurtador ouvindo em ${baseUrl}`);
});
