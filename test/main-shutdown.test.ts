import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { type AddressInfo, connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

const MAIN = new URL('../src/backend/main.ts', import.meta.url).pathname;
const READY_MESSAGE = 'ouvindo em';
// Evita que um processo que não termina trave o npm test e o CI.
const TEST_OPTIONS = { timeout: 10_000 };
const SHUTDOWN_WAIT_MS = 300;

/** Porta livre, para a API e o teste saberem onde conectar. */
async function freePort(): Promise<number> {
    const server = createServer().listen(0);
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    server.close();
    return port;
}

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

/** Sobe a API num banco temporário, executa o teste e garante que o processo e os arquivos não fiquem para trás. */
async function withApi(run: (child: ChildProcess, port: number, dbPath: string) => Promise<void>) {
    const dir = await mkdtemp(join(tmpdir(), 'encurtador-'));
    const dbPath = join(dir, 'encurtador.db');
    const port = await freePort();
    const child = spawn(process.execPath, [MAIN], { env: { ...process.env, PORT: String(port), DB_PATH: dbPath } });
    try {
        await waitUntilReady(child);
        await run(child, port, dbPath);
    } finally {
        if (child.exitCode === null) {
            child.kill('SIGKILL');
        }

        await rm(dir, { recursive: true, force: true });
    }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    test(`${signal} encerra a API com código 0 e grava o WAL no banco`, TEST_OPTIONS, () => withApi(async (child, _port, dbPath) => {
        assert.ok(existsSync(`${dbPath}-wal`), 'o WAL deveria existir com a API no ar');

        child.kill(signal);
        const [code] = await once(child, 'exit');
        assert.equal(code, 0);
        // O SQLite apaga o WAL ao fechar a última conexão, depois de gravá-lo no arquivo principal.
        assert.equal(existsSync(`${dbPath}-wal`), false);
    }));
}

test('o segundo sinal força a saída se uma conexão segura o encerramento', TEST_OPTIONS, () => withApi(async (child, port) => {
    // Requisição incompleta: a conexão fica ativa e o server.close espera por ela.
    const socket = connect(port);
    await once(socket, 'connect');
    socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n');

    try {
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        await sleep(SHUTDOWN_WAIT_MS);
        assert.equal(child.exitCode, null, 'o primeiro sinal deveria esperar a conexão ativa');

        child.kill('SIGTERM');
        const [code] = await exited;
        assert.equal(code, 1);
    } finally {
        socket.destroy();
    }
}));
