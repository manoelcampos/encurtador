import { DatabaseSync } from 'node:sqlite';
import type { ClickRepository, DailyClicks } from './click-repository.ts';
import type { UrlRepository } from './url-repository.ts';

const CREATE_URLS_TABLE = `
    CREATE TABLE IF NOT EXISTS urls (
        code       TEXT PRIMARY KEY,
        url        TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`;

// Um contador por código e dia mantém /stats barato mesmo com muitos cliques e guarda menos dados (LGPD).
// IF NOT EXISTS também cria a tabela em bancos de versões anteriores, que não a tinham.
const CREATE_CLICKS_DAILY_TABLE = `
    CREATE TABLE IF NOT EXISTS clicks_daily (
        code   TEXT NOT NULL REFERENCES urls (code),
        date   TEXT NOT NULL,
        clicks INTEGER NOT NULL,
        PRIMARY KEY (code, date)
    )`;

/**
 * Repositório de URLs e de cliques gravado em SQLite. Use ':memory:' como caminho para um banco temporário.
 * As duas interfaces ficam na mesma classe porque dividem a conexão e a chave estrangeira entre as tabelas.
 */
export class SqliteUrlRepository implements UrlRepository, ClickRepository {
    readonly #db: DatabaseSync;

    constructor(path: string) {
        this.#db = new DatabaseSync(path);
        // WAL deixa leituras rodarem durante gravações e, com NORMAL, cada clique não espera um fsync.
        // Bancos em memória ignoram o WAL.
        this.#db.exec('PRAGMA journal_mode = WAL');
        this.#db.exec('PRAGMA synchronous = NORMAL');
        this.#db.exec('PRAGMA foreign_keys = ON');
        this.#db.exec(CREATE_URLS_TABLE);
        this.#db.exec(CREATE_CLICKS_DAILY_TABLE);
    }

    async add(code: string, url: string): Promise<boolean> {
        // DO NOTHING em vez de checar antes evita condição de corrida entre a checagem e a gravação.
        const result = this.#db
            .prepare('INSERT INTO urls (code, url) VALUES (?, ?) ON CONFLICT (code) DO NOTHING')
            .run(code, url);
        return result.changes === 1;
    }

    async find(code: string): Promise<string | undefined> {
        const row = this.#db.prepare('SELECT url FROM urls WHERE code = ?').get(code);
        return row?.url as string | undefined;
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
