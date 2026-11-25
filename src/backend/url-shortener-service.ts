import { type ClickRepository, type DailyClicks, NO_CLICK_REPOSITORY } from '../data/click-repository.ts';
import type { UrlRepository } from '../data/url-repository.ts';
import { ALIAS_PATTERN, aliasTakenError, aliasUnavailableError, validateAlias } from './alias-validator.ts';
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

/** Link encontrado: o código como está gravado e a URL original. */
export interface StoredLink {
    code: string;
    url: string;
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

    /**
     * Valida a URL, grava com o apelido (se informado) ou com um código novo e retorna o código.
     * O apelido é gravado em minúsculas; se já existir, lança InvalidUrlError com ALIAS_TAKEN.
     */
    async shorten(input: unknown, aliasInput?: unknown): Promise<string> {
        const alias = validateAlias(aliasInput);
        const url = await this.#validate(input);
        if (alias !== undefined) {
            return this.#addAlias(alias, url);
        }

        for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
            const code = this.#generateCode();
            if (await this.#repository.add(code, url)) {
                return code;
            }
        }

        throw new Error(`Não foi possível gerar um código único após ${MAX_CODE_ATTEMPTS} tentativas.`);
    }

    /** O `add` falha se o código já existir, então não há corrida entre checar e gravar. */
    async #addAlias(alias: string, url: string): Promise<string> {
        if (!this.#repository.uniqueIgnoringCase) {
            throw aliasUnavailableError();
        }

        if (!await this.#repository.add(alias, url)) {
            throw aliasTakenError();
        }

        return alias;
    }

    async resolve(code: string): Promise<string | undefined> {
        return (await this.find(code))?.url;
    }

    /**
     * Link do código, com o código como está gravado. Busca o código exato (os gerados diferenciam maiúsculas) e, se não achar e ele tiver formato de apelido
     * depois de passar para minúsculas, busca em minúsculas, pois os apelidos são gravados assim.
     */
    async find(code: string): Promise<StoredLink | undefined> {
        const url = await this.#repository.find(code);
        if (url) {
            return { code, url };
        }

        const lower = code.toLowerCase();
        const aliasUrl = lower !== code && ALIAS_PATTERN.test(lower) ? await this.#repository.find(lower) : undefined;
        return aliasUrl ? { code: lower, url: aliasUrl } : undefined;
    }

    /** Resolve o código para redirecionar e registra o clique. Falha ao registrar não impede o redirecionamento. */
    async visit(code: string): Promise<string | undefined> {
        const link = await this.find(code);
        if (link) {
            await this.#recordClick(link.code);
        }

        return link?.url;
    }

    async #recordClick(code: string) {
        try {
            await this.#clicks.addClick(code, utcDate(this.#now()));
        } catch (error) {
            console.error(`Não foi possível registrar o clique em ${code}:`, error);
        }
    }

    /** Estatísticas de cliques do código, ou undefined se ele não existir. */
    async stats(requestedCode: string): Promise<ClickStats | undefined> {
        const code = (await this.find(requestedCode))?.code;
        if (!code) {
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
