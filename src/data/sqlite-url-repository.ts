import { DatabaseSync } from 'node:sqlite';
import type { UrlRepository } from './url-repository.ts';

const CREATE_TABLE = `
    CREATE TABLE IF NOT EXISTS urls (
        code       TEXT PRIMARY KEY,
        url        TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`;

/** Repositório de URLs gravado em SQLite. Use ':memory:' como caminho para um banco temporário. */
export class SqliteUrlRepository implements UrlRepository {
    readonly #db: DatabaseSync;

    constructor(path: string) {
        this.#db = new DatabaseSync(path);
        this.#db.exec(CREATE_TABLE);
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

    close(): void {
        this.#db.close();
    }
}
