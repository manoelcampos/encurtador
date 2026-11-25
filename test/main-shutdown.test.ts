import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const MAIN = new URL('../src/backend/main.ts', import.meta.url).pathname;
const READY_MESSAGE = 'ouvindo em';

/** Espera a API escrever no log que está ouvindo. */
function waitUntilReady(child: ChildProcess): Promise<void> {
    return new Promise((resolve, reject) => {
        let output = '';
        child.stdout?.on('data', chunk => {
            output += chunk;
            if (output.includes(READY_MESSAGE)) {
                resolve();
            }
        });
        child.once('exit', code => reject(new Error(`A API terminou antes de iniciar (código ${code}).`)));
    });
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    test(`${signal} encerra a API com código 0 e grava o WAL no banco`, async () => {
        const dir = await mkdtemp(join(tmpdir(), 'encurtador-'));
        const dbPath = join(dir, 'encurtador.db');
        try {
            const child = spawn(process.execPath, [MAIN], { env: { ...process.env, PORT: '0', DB_PATH: dbPath } });
            await waitUntilReady(child);
            assert.ok(existsSync(`${dbPath}-wal`), 'o WAL deveria existir com a API no ar');

            child.kill(signal);
            const [code] = await once(child, 'exit');
            assert.equal(code, 0);
            // O SQLite apaga o WAL ao fechar a última conexão, depois de gravá-lo no arquivo principal.
            assert.equal(existsSync(`${dbPath}-wal`), false);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
}
