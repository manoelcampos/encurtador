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
        assert.deepEqual(await repository.find('antigo'), { url: 'https://example.com/', expiresAt: null });
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
    assert.deepEqual(await repository.find('AbC'), { url: 'https://um.com/', expiresAt: null });
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
        assert.deepEqual(await repository.find('antigo'), { url: 'https://example.com/', expiresAt: null });
        assert.deepEqual(await repository.find('ANTIGO'), { url: 'https://outro.example/', expiresAt: null });
    } finally {
        repository.close();
        await rm(dir, { recursive: true, force: true });
    }
});

test('abre banco antigo sem a coluna expires_at, adiciona a coluna e grava o prazo; reabrir não falha', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'encurtador-'));
    const path = join(dir, 'sem-validade.db');
    createOldDatabase(path);
    const expiresAt = '2026-12-02T12:00:00.000Z';

    try {
        const repository = new SqliteUrlRepository(path);
        assert.deepEqual(await repository.find('antigo'), { url: 'https://example.com/', expiresAt: null });
        assert.equal(await repository.add('novo', 'https://novo.example/', expiresAt), true);
        repository.close();

        const reopened = new SqliteUrlRepository(path);
        assert.deepEqual(await reopened.find('novo'), { url: 'https://novo.example/', expiresAt });
        reopened.close();
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('recusa clique em código inexistente (chave estrangeira)', async () => {
    const repository = new SqliteUrlRepository(':memory:');
    await assert.rejects(repository.addClick('naoexiste', '2026-11-25'));
});

test('abre banco antigo sem a coluna manage_token_hash: links antigos ficam sem token e os novos gravam o hash', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'encurtador-'));
    const path = join(dir, 'sem-token.db');
    createOldDatabase(path);

    try {
        const repository = new SqliteUrlRepository(path);
        assert.equal(await repository.findManageTokenHash('antigo'), null);
        assert.equal(await repository.add('novo', 'https://novo.example/', null, 'hash'), true);
        repository.close();

        const reopened = new SqliteUrlRepository(path);
        assert.equal(await reopened.findManageTokenHash('novo'), 'hash');
        assert.equal(await reopened.findManageTokenHash('naoexiste'), undefined);
        reopened.close();
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('delete apaga o link e os cliques dele, e o código fica livre', async () => {
    const repository = new SqliteUrlRepository(':memory:');
    await repository.add('apagar', 'https://um.com/');
    await repository.add('manter', 'https://dois.com/');
    await repository.addClick('apagar', '2026-11-25');
    await repository.addClick('manter', '2026-11-25');

    assert.equal(await repository.delete('apagar'), true);
    assert.equal(await repository.find('apagar'), undefined);
    assert.equal(await repository.countClicks('apagar'), 0);
    assert.equal(await repository.countClicks('manter'), 1);
    assert.equal(await repository.delete('apagar'), false);
    assert.equal(await repository.add('apagar', 'https://tres.com/'), true);
});
