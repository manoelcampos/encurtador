import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avisoDeCopia, copiarLink, linkMudou, mensagemDaApi, mensagemDeFalha, qrCodeDoLink, urlInvalida } from '../src/frontend/static/logic.js';
import { ALT_QRCODE, AVISO_COPIADO, AVISO_FALHA_COPIA, MENSAGEM_CONEXAO, MENSAGEM_PADRAO } from '../src/frontend/static/messages.js';

test('usa a mensagem de erro da API quando ela vem no corpo', () => {
    assert.equal(mensagemDaApi({ error: 'URL inválida.' }), 'URL inválida.');
});

test('usa a mensagem padrão quando a resposta não traz um erro em texto', () => {
    for (const dados of [{}, null, 'html', { error: 42 }]) {
        assert.equal(mensagemDaApi(dados), MENSAGEM_PADRAO);
    }
});

test('mostra falha de conexão quando o fetch lança TypeError', () => {
    assert.equal(mensagemDeFalha(new TypeError('Failed to fetch')), MENSAGEM_CONEXAO);
});

test('mostra a mensagem do erro da API, ou a padrão se o erro não for Error', () => {
    assert.equal(mensagemDeFalha(new Error('URL inválida.')), 'URL inválida.');
    assert.equal(mensagemDeFalha('qualquer coisa'), MENSAGEM_PADRAO);
});

test('marca o campo como inválido só para o status 400', () => {
    assert.equal(urlInvalida(400), true);
    for (const status of [413, 500, 502]) {
        assert.equal(urlInvalida(status), false);
    }
});

test('detecta quando o link mudou durante a cópia', () => {
    assert.equal(linkMudou('https://encurta.do/a', 'https://encurta.do/a'), false);
    assert.equal(linkMudou('https://encurta.do/a', 'https://encurta.do/b'), true);
});

test('escolhe o aviso de cópia conforme o resultado', () => {
    assert.equal(avisoDeCopia(true), AVISO_COPIADO);
    assert.equal(avisoDeCopia(false), AVISO_FALHA_COPIA);
});

const LINK = 'https://encurta.do/a';
const OUTRO_LINK = 'https://encurta.do/b';

/** Dependências falsas da cópia; o atraso só roda quando o teste chama `rodarAtraso`. */
function criarCopia(copiou: boolean, linkDepoisDaCopia = LINK) {
    let link = LINK;
    let acaoAtrasada = () => {};
    const avisos: string[] = [];
    const estado = { selecionou: false };
    const deps = {
        copiar: async () => {
            link = linkDepoisDaCopia;
            return copiou;
        },
        linkAtual: () => link,
        avisar: (mensagem: string) => { avisos.push(mensagem); },
        selecionar: () => { estado.selecionou = true; },
        aposAtraso: (acao: () => void) => { acaoAtrasada = acao; },
    };

    return { deps, avisos, estado, trocarLink: (novo: string) => { link = novo; }, rodarAtraso: () => acaoAtrasada() };
}

test('cópia com sucesso limpa e depois avisa "Copiado!", sem selecionar o link', async () => {
    const copia = criarCopia(true);
    await copiarLink(copia.deps);
    assert.deepEqual(copia.avisos, ['']);

    copia.rodarAtraso();
    assert.deepEqual(copia.avisos, ['', AVISO_COPIADO]);
    assert.equal(copia.estado.selecionou, false);
});

test('falha na cópia avisa a falha e seleciona o link', async () => {
    const copia = criarCopia(false);
    await copiarLink(copia.deps);
    copia.rodarAtraso();
    assert.deepEqual(copia.avisos, ['', AVISO_FALHA_COPIA]);
    assert.equal(copia.estado.selecionou, true);
});

test('não faz nada se o link mudou durante a cópia', async () => {
    const copia = criarCopia(false, OUTRO_LINK);
    await copiarLink(copia.deps);
    copia.rodarAtraso();
    assert.deepEqual(copia.avisos, []);
    assert.equal(copia.estado.selecionou, false);
});

test('não avisa se o link mudou durante o atraso do aviso', async () => {
    const copia = criarCopia(true);
    await copiarLink(copia.deps);
    copia.trocarLink(OUTRO_LINK);
    copia.rodarAtraso();
    assert.deepEqual(copia.avisos, ['']);
});

test('monta o endereço, o nome do arquivo e o texto alternativo do QR Code', () => {
    assert.deepEqual(qrCodeDoLink('/api/urls/{code}/qrcode', { code: 'AbC234xYz', shortUrl: 'https://encurta.do/AbC234xYz' }), {
        src: '/api/urls/AbC234xYz/qrcode',
        nomeArquivo: 'qrcode-AbC234xYz.svg',
        alt: `${ALT_QRCODE} https://encurta.do/AbC234xYz`,
    });
});
