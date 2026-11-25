import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avisoDeCopia, linkMudou, mensagemDaApi, mensagemDeFalha, urlInvalida } from '../src/frontend/static/logic.js';
import { AVISO_COPIADO, AVISO_FALHA_COPIA, MENSAGEM_CONEXAO, MENSAGEM_PADRAO } from '../src/frontend/static/messages.js';

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
