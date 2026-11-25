import type { UrlRepository } from '../data/url-repository.ts';
import { type CodeGenerator, generateRandomCode } from './code-generator.ts';
import { InvalidUrlError, UrlErrorCode } from './invalid-url-error.ts';
import { NO_THREAT_CHECKER, type UrlThreatChecker } from './url-threat-checker.ts';
import { normalizedHostname, validateDestination, validateUrl } from './url-validator.ts';

const MAX_CODE_ATTEMPTS = 5;

export interface UrlShortenerOptions {
    generateCode?: CodeGenerator;
    threatChecker?: UrlThreatChecker;
}

/** Regras de negócio do encurtador. */
export class UrlShortenerService {
    readonly #repository: UrlRepository;
    readonly #ownHostname: string;
    readonly #generateCode: CodeGenerator;
    readonly #threatChecker: UrlThreatChecker;

    /** `baseUrl` é a URL pública do encurtador, usada para recusar links para ele mesmo. */
    constructor(repository: UrlRepository, baseUrl: string, options: UrlShortenerOptions = {}) {
        this.#repository = repository;
        this.#ownHostname = normalizedHostname(baseUrl);
        this.#generateCode = options.generateCode ?? generateRandomCode;
        this.#threatChecker = options.threatChecker ?? NO_THREAT_CHECKER;
    }

    /** Valida a URL, grava com um código novo e retorna o código. */
    async shorten(input: unknown): Promise<string> {
        const url = await this.#validate(input);

        for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
            const code = this.#generateCode();
            if (await this.#repository.add(code, url)) {
                return code;
            }
        }

        throw new Error(`Não foi possível gerar um código único após ${MAX_CODE_ATTEMPTS} tentativas.`);
    }

    resolve(code: string): Promise<string | undefined> {
        return this.#repository.find(code);
    }

    /** Retorna a URL normalizada ou lança InvalidUrlError. A consulta externa fica por último. */
    async #validate(input: unknown): Promise<string> {
        const url = validateUrl(input);
        validateDestination(url, this.#ownHostname);
        if (await this.#threatChecker.isMalicious(url)) {
            throw new InvalidUrlError('A URL foi identificada como maliciosa (phishing ou malware).', UrlErrorCode.MALICIOUS_URL);
        }

        return url;
    }
}
