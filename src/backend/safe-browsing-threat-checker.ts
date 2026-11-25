import type { UrlThreatChecker } from './url-threat-checker.ts';

export const SAFE_BROWSING_URL = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
export const SAFE_BROWSING_TIMEOUT_MS = 2000;
const CLIENT = { clientId: 'encurtador', clientVersion: '0.1.0' };
const THREAT_TYPES = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'];

/**
 * Consulta a Lookup API v4 do Google Safe Browsing (`threatMatches:find`).
 * Em erro ou timeout, deixa a URL passar e registra no log (fail-open),
 * para que uma falha do Google não impeça o encurtador de funcionar.
 */
export class SafeBrowsingThreatChecker implements UrlThreatChecker {
    readonly #apiKey: string;
    readonly #fetch: typeof fetch;
    readonly #timeoutMs: number;

    constructor(apiKey: string, fetchFn: typeof fetch = fetch, timeoutMs = SAFE_BROWSING_TIMEOUT_MS) {
        this.#apiKey = apiKey;
        this.#fetch = fetchFn;
        this.#timeoutMs = timeoutMs;
    }

    async isMalicious(url: string): Promise<boolean> {
        try {
            const res = await this.#lookup(url);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const body = await res.json() as { matches?: unknown[] };
            return (body.matches?.length ?? 0) > 0;
        } catch (error) {
            console.warn('Safe Browsing indisponível; URL aceita sem verificação:', error instanceof Error ? error.message : error);
            return false;
        }
    }

    #lookup(url: string): Promise<Response> {
        return this.#fetch(SAFE_BROWSING_URL, {
            method: 'POST',
            // A chave vai no header, e não na URL, para não aparecer em logs.
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.#apiKey },
            body: JSON.stringify(lookupBody(url)),
            signal: AbortSignal.timeout(this.#timeoutMs),
        });
    }
}

function lookupBody(url: string) {
    return {
        client: CLIENT,
        threatInfo: {
            threatTypes: THREAT_TYPES,
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url }],
        },
    };
}
