import { DatabaseSync } from 'node:sqlite';
import type { ClickRepository, DailyClicks } from './click-repository.ts';
import type { StoredUrl, UrlRepository } from './url-repository.ts';

const CREATE_URLS_TABLE = `
    CREATE TABLE IF NOT EXISTS urls (
        code       TEXT PRIMARY KEY,
        url        TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`;

// Sem dois códigos iguais ignorando maiúsculas: um apelido não pode imitar um código gerado (ou o inverso)
// para quem digita o link com outra caixa. Como é índice único, o add falha em conflito de forma atômica.
const CREATE_CODE_NOCASE_INDEX = 'CREATE UNIQUE INDEX IF NOT EXISTS urls_code_nocase ON urls (code COLLATE NOCASE)';

// Um contador por código e dia mantém /stats barato mesmo com muitos cliques e guarda menos dados (LGPD).
// IF NOT EXISTS também cria a tabela em bancos de versões anteriores, que não a tinham.
const CREATE_CLICKS_DAILY_TABLE = `
    CREATE TABLE IF NOT EXISTS clicks_daily (
        code   TEXT NOT NULL REFERENCES urls (code),
        date   TEXT NOT NULL,
        clicks INTEGER NOT NULL,
        PRIMARY KEY (code, date)
    )`;

// Bancos de versões anteriores não têm estas colunas; elas são adicionadas ao abrir (migração idempotente).
const EXPIRES_AT_COLUMN = 'expires_at';
// Só o hash do token de gestão: quem lê o banco não consegue apagar links. Links antigos ficam com NULL.
const MANAGE_TOKEN_HASH_COLUMN = 'manage_token_hash';
// Acessos que ainda restam ao link com limite (maxClicks); NULL é sem limite (inclusive links antigos).
const REMAINING_CLICKS_COLUMN = 'remaining_clicks';
const ADDED_COLUMNS = {
    [EXPIRES_AT_COLUMN]: 'TEXT NULL',
    [MANAGE_TOKEN_HASH_COLUMN]: 'TEXT NULL',
    [REMAINING_CLICKS_COLUMN]: 'INTEGER NULL',
};

/**
 * Repositório de URLs e de cliques gravado em SQLite. Use ':memory:' como caminho para um banco temporário.
 * As duas interfaces ficam na mesma classe porque dividem a conexão e a chave estrangeira entre as tabelas.
 */
export class SqliteUrlRepository implements UrlRepository, ClickRepository {
    readonly #db: DatabaseSync;
    readonly uniqueIgnoringCase: boolean;

    constructor(path: string) {
        this.#db = new DatabaseSync(path);
        // WAL deixa leituras rodarem durante gravações e, com NORMAL, cada clique não espera um fsync.
        // Bancos em memória ignoram o WAL.
        this.#db.exec('PRAGMA journal_mode = WAL');
        this.#db.exec('PRAGMA synchronous = NORMAL');
        this.#db.exec('PRAGMA foreign_keys = ON');
        this.#db.exec(CREATE_URLS_TABLE);
        this.#addMissingColumns();
        this.#db.exec(CREATE_CLICKS_DAILY_TABLE);
        this.uniqueIgnoringCase = this.#createCodeNocaseIndex();
    }

    /** Bancos antigos podem ter códigos que só diferem em maiúsculas; aí o índice não é criado e a API inicia mesmo assim. */
    #createCodeNocaseIndex(): boolean {
        try {
            this.#db.exec(CREATE_CODE_NOCASE_INDEX);
            return true;
        } catch (error) {
            console.warn('Há códigos que só diferem em maiúsculas; novos apelidos ficam desativados:', error);
            return false;
        }
    }

    /** Bancos novos e antigos ganham as colunas aqui, para a definição delas ficar num lugar só. */
    #addMissingColumns() {
        const existing = new Set(this.#db.prepare('PRAGMA table_info(urls)').all().map(column => column.name));
        for (const [name, definition] of Object.entries(ADDED_COLUMNS)) {
            if (!existing.has(name)) {
                this.#db.exec(`ALTER TABLE urls ADD COLUMN ${name} ${definition}`);
            }
        }
    }

    async add(
        code: string, url: string, expiresAt: string | null = null, manageTokenHash: string | null = null, maxClicks: number | null = null,
    ): Promise<boolean> {
        // DO NOTHING em vez de checar antes evita condição de corrida entre a checagem e a gravação.
        // Sem alvo, vale para a chave primária e para o índice que ignora maiúsculas.
        const result = this.#db
            .prepare(`
                INSERT INTO urls (code, url, ${EXPIRES_AT_COLUMN}, ${MANAGE_TOKEN_HASH_COLUMN}, ${REMAINING_CLICKS_COLUMN})
                VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
            .run(code, url, expiresAt, manageTokenHash, maxClicks);
        return result.changes === 1;
    }

    /** Um único UPDATE condicional: checar e gastar juntos impede que acessos simultâneos passem do limite. */
    async consumeClick(code: string): Promise<boolean> {
        const { changes } = this.#db
            .prepare(`UPDATE urls SET ${REMAINING_CLICKS_COLUMN} = ${REMAINING_CLICKS_COLUMN} - 1 WHERE code = ? AND ${REMAINING_CLICKS_COLUMN} > 0`)
            .run(code);
        return changes === 1;
    }

    async findManageTokenHash(code: string): Promise<string | null | undefined> {
        const row = this.#db.prepare(`SELECT ${MANAGE_TOKEN_HASH_COLUMN} AS hash FROM urls WHERE code = ?`).get(code);
        return row && (row.hash === null ? null : String(row.hash));
    }

    /** Apaga os cliques antes do link, por causa da chave estrangeira (que não tem ON DELETE CASCADE em bancos existentes). */
    async delete(code: string): Promise<boolean> {
        this.#db.exec('BEGIN');
        try {
            this.#db.prepare('DELETE FROM clicks_daily WHERE code = ?').run(code);
            const { changes } = this.#db.prepare('DELETE FROM urls WHERE code = ?').run(code);
            this.#db.exec('COMMIT');
            return changes === 1;
        } catch (error) {
            this.#db.exec('ROLLBACK');
            throw error;
        }
    }

    async find(code: string): Promise<StoredUrl | undefined> {
        const row = this.#db
            .prepare(`SELECT url, ${EXPIRES_AT_COLUMN} AS expiresAt, ${REMAINING_CLICKS_COLUMN} AS remainingClicks FROM urls WHERE code = ?`)
            .get(code);
        return row && {
            url: String(row.url),
            expiresAt: row.expiresAt === null ? null : String(row.expiresAt),
            remainingClicks: row.remainingClicks === null ? null : Number(row.remainingClicks),
        };
    }

    async addClick(code: string, date: string): Promise<void> {
        this.#db.prepare(`
            INSERT INTO clicks_daily (code, date, clicks) VALUES (?, ?, 1)
            ON CONFLICT (code, date) DO UPDATE SET clicks = clicks + 1`).run(code, date);
    }

    async countClicks(code: string): Promise<number> {
        const row = this.#db.prepare('SELECT COALESCE(SUM(clicks), 0) AS total FROM clicks_daily WHERE code = ?').get(code);
        return Number(row?.total);
    }

    async countClicksByDay(code: string, since: string): Promise<DailyClicks[]> {
        const rows = this.#db
            .prepare('SELECT date, clicks FROM clicks_daily WHERE code = ? AND date >= ? ORDER BY date')
            .all(code, since);
        return rows.map(row => ({ date: String(row.date), clicks: Number(row.clicks) }));
    }

    close(): void {
        this.#db.close();
    }
}
