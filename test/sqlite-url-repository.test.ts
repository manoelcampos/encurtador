import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { SqliteUrlRepository } from '../src/data/sqlite-url-repository.ts';

// Esquema da versão anterior, sem a tabela de cliques.
const OLD_SCHEMA = `
    CREATE TABLE urls (
        code       TEXT PRIMARY KEY,
        url        TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`;

/** Cria um banco com o esquema antigo e uma URL gravada. */
function createOldDatabase(path: string) {
    const old = new DatabaseSync(path);
    old.exec(OLD_SCHEMA);
    old.prepare('INSERT INTO urls (code, url) VALUES (?, ?)').run('antigo', 'https://example.com/');
    old.close();
}

test('abre banco da versão anterior, sem a tabela de cliques, e passa a contar', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'encurtador-'));
    const path = join(dir, 'antigo.db');
    createOldDatabase(path);

    const repository = new SqliteUrlRepository(path);
    try {
        assert.equal(await repository.find('antigo'), 'https://example.com/');
        assert.equal(await repository.countClicks('antigo'), 0);

        await repository.addClick('antigo', '2026-11-25');
        await repository.addClick('antigo', '2026-11-25');
        assert.equal(await repository.countClicks('antigo'), 2);
        assert.deepEqual(await repository.countClicksByDay('antigo', '2026-11-25'), [{ date: '2026-11-25', clicks: 2 }]);
    } finally {
        repository.close();
        await rm(dir, { recursive: true, force: true });
    }
});

test('recusa código igual a outro ignorando maiúsculas', async () => {
    const repository = new SqliteUrlRepository(':memory:');
    assert.equal(repository.uniqueIgnoringCase, true);
    assert.equal(await repository.add('AbC', 'https://um.com/'), true);
    assert.equal(await repository.add('abc', 'https://dois.com/'), false);
    assert.equal(await repository.find('AbC'), 'https://um.com/');
});

test('banco antigo com códigos que só diferem em maiúsculas abre sem quebrar e avisa no log', async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'encurtador-'));
    const path = join(dir, 'duplicado.db');
    createOldDatabase(path);
    const old = new DatabaseSync(path);
    old.prepare('INSERT INTO urls (code, url) VALUES (?, ?)').run('ANTIGO', 'https://outro.example/');
    old.close();
    const warn = t.mock.method(console, 'warn', () => {});

    const repository = new SqliteUrlRepository(path);
    try {
        assert.equal(repository.uniqueIgnoringCase, false);
        assert.equal(warn.mock.callCount(), 1);
        assert.equal(await repository.find('antigo'), 'https://example.com/');
        assert.equal(await repository.find('ANTIGO'), 'https://outro.example/');
    } finally {
        repository.close();
        await rm(dir, { recursive: true, force: true });
    }
});

test('recusa clique em código inexistente (chave estrangeira)', async () => {
    const repository = new SqliteUrlRepository(':memory:');
    await assert.rejects(repository.addClick('naoexiste', '2026-11-25'));
});
