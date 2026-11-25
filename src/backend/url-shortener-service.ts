import { type ClickRepository, type DailyClicks, NO_CLICK_REPOSITORY } from '../data/click-repository.ts';
import type { UrlRepository } from '../data/url-repository.ts';
import { ALIAS_PATTERN, aliasTakenError, aliasUnavailableError, validateAlias } from './alias-validator.ts';
import { type CodeGenerator, generateRandomCode } from './code-generator.ts';
import { expirationDate, isExpired } from './expiration.ts';
import { InvalidUrlError, UrlErrorCode } from './invalid-url-error.ts';
import { generateManageToken, hashManageToken, manageTokenMatches } from './manage-token.ts';
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
    /** Relógio usado nos cliques e no prazo de validade; injetável para testar datas. */
    now?: () => Date;
}

/** Link criado: o código e a data de expiração (ISO 8601 em UTC), ou null se não expira. */
export interface ShortenedLink {
    code: string;
    expiresAt: string | null;
}

/** Link recém-criado, com o token de gestão, que só é devolvido aqui (o banco guarda só o hash). */
export interface CreatedLink extends ShortenedLink {
    manageToken: string;
}

/** Link encontrado: o código como está gravado, a URL original e a data de expiração. */
export interface StoredLink extends ShortenedLink {
    url: string;
}

/** Dados gravados de um link novo, menos o código. */
interface NewLink {
    url: string;
    expiresAt: string | null;
    manageTokenHash: string;
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
     * Valida a URL, grava com o apelido (se informado) ou com um código novo e retorna o código e a expiração.
     * O apelido é gravado em minúsculas; se já existir, lança InvalidUrlError com ALIAS_TAKEN.
     * `expiresInInput` é uma das EXPIRATION_OPTIONS (ou ausente, sem prazo); outro valor lança INVALID_EXPIRATION.
     */
    async shorten(input: unknown, aliasInput?: unknown, expiresInInput?: unknown): Promise<CreatedLink> {
        const alias = validateAlias(aliasInput);
        const expiresAt = expirationDate(expiresInInput, this.#now());
        const url = await this.#validate(input);
        const manageToken = generateManageToken();
        const link: NewLink = { url, expiresAt, manageTokenHash: hashManageToken(manageToken) };
        const code = alias === undefined ? await this.#addGenerated(link) : await this.#addAlias(alias, link);
        return { code, expiresAt, manageToken };
    }

    async #addGenerated(link: NewLink): Promise<string> {
        for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
            const code = this.#generateCode();
            if (await this.#add(code, link)) {
                return code;
            }
        }

        throw new Error(`Não foi possível gerar um código único após ${MAX_CODE_ATTEMPTS} tentativas.`);
    }

    /** O `add` falha se o código já existir, então não há corrida entre checar e gravar. */
    async #addAlias(alias: string, link: NewLink): Promise<string> {
        if (!this.#repository.uniqueIgnoringCase) {
            throw aliasUnavailableError();
        }

        if (!await this.#add(alias, link)) {
            throw aliasTakenError();
        }

        return alias;
    }

    #add(code: string, { url, expiresAt, manageTokenHash }: NewLink) {
        return this.#repository.add(code, url, expiresAt, manageTokenHash);
    }

    /**
     * Apaga o link (e os cliques dele) se o token de gestão confere. Funciona mesmo depois do prazo de validade.
     * O código (ou apelido) fica livre para ser usado de novo. Retorna false se o código não existir.
     * Sem token, lança MANAGE_TOKEN_REQUIRED; token errado ou link antigo (sem token) lança INVALID_MANAGE_TOKEN.
     */
    async delete(requestedCode: string, manageToken: string | undefined): Promise<boolean> {
        if (!manageToken) {
            throw new InvalidUrlError('Informe o token de gestão do link.', UrlErrorCode.MANAGE_TOKEN_REQUIRED);
        }

        const code = (await this.find(requestedCode))?.code;
        if (!code) {
            return false;
        }

        const storedHash = await this.#repository.findManageTokenHash(code);
        if (!storedHash || !manageTokenMatches(manageToken, storedHash)) {
            throw new InvalidUrlError('Token de gestão inválido para este link.', UrlErrorCode.INVALID_MANAGE_TOKEN);
        }

        return this.#repository.delete(code);
    }

    /** URL do código para redirecionar, sem contar clique. Lança LINK_EXPIRED se o link expirou. */
    async resolve(code: string): Promise<string | undefined> {
        return (await this.findActive(code))?.url;
    }

    /** Como o `find`, mas lança InvalidUrlError com LINK_EXPIRED se o link passou do prazo de validade. */
    async findActive(code: string): Promise<StoredLink | undefined> {
        const link = await this.find(code);
        if (link && isExpired(link.expiresAt, this.#now())) {
            throw new InvalidUrlError('Este link expirou.', UrlErrorCode.LINK_EXPIRED);
        }

        return link;
    }

    /**
     * Link do código, com o código como está gravado. Busca o código exato (os gerados diferenciam maiúsculas) e, se não achar e ele tiver formato de apelido
     * depois de passar para minúsculas, busca em minúsculas, pois os apelidos são gravados assim.
     */
    async find(code: string): Promise<StoredLink | undefined> {
        const stored = await this.#repository.find(code);
        if (stored) {
            return { code, ...stored };
        }

        const lower = code.toLowerCase();
        const aliasStored = lower !== code && ALIAS_PATTERN.test(lower) ? await this.#repository.find(lower) : undefined;
        return aliasStored ? { code: lower, ...aliasStored } : undefined;
    }

    /**
     * Resolve o código para redirecionar e registra o clique. Falha ao registrar não impede o redirecionamento.
     * Link expirado lança LINK_EXPIRED e não conta clique.
     */
    async visit(code: string): Promise<string | undefined> {
        const link = await this.findActive(code);
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
