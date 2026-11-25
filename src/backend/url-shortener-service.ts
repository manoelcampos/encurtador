import type { UrlRepository } from '../data/url-repository.ts';
import { type CodeGenerator, generateRandomCode } from './code-generator.ts';
import { validateUrl } from './url-validator.ts';

const MAX_CODE_ATTEMPTS = 5;

/** Regras de negócio do encurtador. */
export class UrlShortenerService {
    readonly #repository: UrlRepository;
    readonly #generateCode: CodeGenerator;

    constructor(repository: UrlRepository, generateCode: CodeGenerator = generateRandomCode) {
        this.#repository = repository;
        this.#generateCode = generateCode;
    }

    /** Valida a URL, grava com um código novo e retorna o código. */
    async shorten(input: unknown): Promise<string> {
        const url = validateUrl(input);

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
}
