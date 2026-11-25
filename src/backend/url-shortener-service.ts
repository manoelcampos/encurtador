import { type ClickRepository, type DailyClicks, NO_CLICK_REPOSITORY } from '../data/click-repository.ts';
import type { UrlRepository } from '../data/url-repository.ts';
import { type CodeGenerator, generateRandomCode } from './code-generator.ts';
import { InvalidUrlError, UrlErrorCode } from './invalid-url-error.ts';
import { NO_THREAT_CHECKER, type UrlThreatChecker } from './url-threat-checker.ts';
import { normalizedHostname, validateDestination, validateUrl } from './url-validator.ts';

const MAX_CODE_ATTEMPTS = 5;
/** Quantos dias (UTC, contando hoje) aparecem em `clicksByDay` das estatísticas. O total é de todo o período. */
export const STATS_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_LENGTH = 'YYYY-MM-DD'.length;

/** Data (YYYY-MM-DD) em UTC do instante informado. */
const utcDate = (instant: Date) => instant.toISOString().slice(0, DATE_LENGTH);

export interface UrlShortenerOptions {
    generateCode?: CodeGenerator;
    threatChecker?: UrlThreatChecker;
    /** Onde os cliques são contados. Sem ele, nenhum clique é registrado. */
    clicks?: ClickRepository;
    /** Relógio usado para registrar os cliques; injetável para testar datas. */
    now?: () => Date;
}

export interface ClickStats {
    code: string;
    totalClicks: number;
    clicksByDay: DailyClicks[];
}

/** Regras de negócio do encurtador. */
export class UrlShortenerService {
    readonly #repository: UrlRepository;
    readonly #clicks: ClickRepository;
    readonly #ownHostname: string;
    readonly #generateCode: CodeGenerator;
    readonly #threatChecker: UrlThreatChecker;
    readonly #now: () => Date;

    /** `baseUrl` é a URL pública do encurtador, usada para recusar links para ele mesmo. */
    constructor(repository: UrlRepository, baseUrl: string, options: UrlShortenerOptions = {}) {
        this.#repository = repository;
        this.#ownHostname = normalizedHostname(baseUrl);
        this.#generateCode = options.generateCode ?? generateRandomCode;
        this.#threatChecker = options.threatChecker ?? NO_THREAT_CHECKER;
        this.#clicks = options.clicks ?? NO_CLICK_REPOSITORY;
        this.#now = options.now ?? (() => new Date());
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

    /** Resolve o código para redirecionar e registra o clique. Falha ao registrar não impede o redirecionamento. */
    async visit(code: string): Promise<string | undefined> {
        const url = await this.resolve(code);
        if (url) {
            await this.#recordClick(code);
        }

        return url;
    }

    async #recordClick(code: string) {
        try {
            await this.#clicks.addClick(code, utcDate(this.#now()));
        } catch (error) {
            console.error(`Não foi possível registrar o clique em ${code}:`, error);
        }
    }

    /** Estatísticas de cliques do código, ou undefined se ele não existir. */
    async stats(code: string): Promise<ClickStats | undefined> {
        if (!await this.resolve(code)) {
            return undefined;
        }

        const since = utcDate(new Date(this.#now().getTime() - (STATS_DAYS - 1) * MS_PER_DAY));
        return {
            code,
            totalClicks: await this.#clicks.countClicks(code),
            clicksByDay: await this.#clicks.countClicksByDay(code, since),
        };
    }

    /** Retorna a URL normalizada ou lança InvalidUrlError. A consulta externa fica por último. */
    async #validate(input: unknown): Promise<string> {
        const url = validateUrl(input);
        validateDestination(url, this.#ownHostname);
        if (await this.#threatChecker.isMalicious(url)) {
            throw new InvalidUrlError('Esta URL pode ser perigosa e não pode ser encurtada. Aviso fornecido pelo Google.', UrlErrorCode.MALICIOUS_URL);
        }

        return url;
    }
}
