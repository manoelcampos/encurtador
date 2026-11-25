import { DatabaseSync } from 'node:sqlite';
import type { ClickRepository, DailyClicks } from './click-repository.ts';
import type { UrlRepository } from './url-repository.ts';

const CREATE_URLS_TABLE = `
    CREATE TABLE IF NOT EXISTS urls (
        code       TEXT PRIMARY KEY,
        url        TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`;

// IF NOT EXISTS também cria a tabela em bancos de versões anteriores, que não a tinham.
const CREATE_CLICKS_TABLE = `
    CREATE TABLE IF NOT EXISTS clicks (
        code       TEXT NOT NULL REFERENCES urls (code),
        clicked_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS clicks_code_clicked_at ON clicks (code, clicked_at)`;

// clicked_at é gravado com toISOString(), então os 10 primeiros caracteres são a data em UTC.
const DATE_LENGTH = 'YYYY-MM-DD'.length;

/**
 * Repositório de URLs e de cliques gravado em SQLite. Use ':memory:' como caminho para um banco temporário.
 * As duas interfaces ficam na mesma classe porque dividem a conexão e a chave estrangeira entre as tabelas.
 */
export class SqliteUrlRepository implements UrlRepository, ClickRepository {
    readonly #db: DatabaseSync;

    constructor(path: string) {
        this.#db = new DatabaseSync(path);
        this.#db.exec('PRAGMA foreign_keys = ON');
        this.#db.exec(CREATE_URLS_TABLE);
        this.#db.exec(CREATE_CLICKS_TABLE);
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

    async addClick(code: string, clickedAt: Date): Promise<void> {
        this.#db.prepare('INSERT INTO clicks (code, clicked_at) VALUES (?, ?)').run(code, clickedAt.toISOString());
    }

    async countClicks(code: string): Promise<number> {
        const row = this.#db.prepare('SELECT COUNT(*) AS total FROM clicks WHERE code = ?').get(code);
        return Number(row?.total);
    }

    async countClicksByDay(code: string, since: string): Promise<DailyClicks[]> {
        const rows = this.#db.prepare(`
            SELECT substr(clicked_at, 1, ${DATE_LENGTH}) AS date, COUNT(*) AS clicks
            FROM clicks
            WHERE code = ? AND clicked_at >= ?
            GROUP BY date
            ORDER BY date`).all(code, since);
        return rows.map(row => ({ date: String(row.date), clicks: Number(row.clicks) }));
    }

    close(): void {
        this.#db.close();
    }
}
