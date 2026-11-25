import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    avisarDeNovo, avisoDeCopia, copiarLink, linkMudou, mensagemDaApi, mensagemDeFalha, minutosDeEspera, qrCodeDoLink,
    CAMPO, campoInvalido, corpoDoPedido, destinoAlterado, textoDaExpiracao,
} from '../src/frontend/static/logic.js';
import { definirIdioma, IDIOMA_DO_HTML, texto, TRADUCOES } from '../src/frontend/static/messages.js';

const MENSAGEM_PADRAO = texto('MENSAGEM_PADRAO');
const MENSAGEM_CONEXAO = texto('MENSAGEM_CONEXAO');
const AVISO_COPIADO = texto('AVISO_COPIADO');
const AVISO_FALHA_COPIA = texto('AVISO_FALHA_COPIA');
const ALT_QRCODE = texto('ALT_QRCODE');

test('usa a mensagem de erro da API quando ela vem no corpo', () => {
    assert.equal(mensagemDaApi({ error: 'Corpo muito grande.' }, 413), 'Corpo muito grande.');
});

test('usa a mensagem traduzida para URL inválida (400), e não a da API em português', () => {
    assert.equal(mensagemDaApi({ error: 'URL inválida.' }, 400), texto('MENSAGEM_URL_INVALIDA'));
    definirIdioma('es');
    try {
        assert.equal(mensagemDaApi({ error: 'URL inválida.' }, 400), TRADUCOES.es.MENSAGEM_URL_INVALIDA);
    } finally {
        definirIdioma(IDIOMA_DO_HTML);
    }
});

test('usa a mensagem traduzida de limite excedido (429), sem marcar o campo como inválido', () => {
    assert.equal(mensagemDaApi({ error: 'Limite de requisições excedido.' }, 429), texto('MENSAGEM_LIMITE_EXCEDIDO'));
    assert.equal(campoInvalido(429, undefined), undefined);
    definirIdioma('en');
    try {
        assert.equal(mensagemDaApi({}, 429), TRADUCOES.en.MENSAGEM_LIMITE_EXCEDIDO);
    } finally {
        definirIdioma(IDIOMA_DO_HTML);
    }
});

test('mostra os minutos de espera do Retry-After na mensagem de limite excedido', () => {
    assert.equal(mensagemDaApi({}, 429, '3600'), texto('MENSAGEM_LIMITE_EXCEDIDO_MINUTOS').replace('{minutos}', '60'));
    assert.match(mensagemDaApi({}, 429, '61'), /\b2\b/);
});

test('converte o Retry-After em minutos arredondados para cima, ou undefined se inválido', () => {
    assert.equal(minutosDeEspera('1'), 1);
    assert.equal(minutosDeEspera('60'), 1);
    assert.equal(minutosDeEspera('61'), 2);
    assert.equal(minutosDeEspera(' 120 '), 2);
    for (const invalido of [null, '', 'abc', '-5', '1.5', 'Wed, 21 Oct 2026 07:28:00 GMT']) {
        assert.equal(minutosDeEspera(invalido), undefined, String(invalido));
        assert.equal(mensagemDaApi({}, 429, invalido), texto('MENSAGEM_LIMITE_EXCEDIDO'));
    }
});

test('usa a mensagem padrão quando a resposta não traz um erro em texto', () => {
    for (const dados of [{}, null, 'html', { error: 42 }]) {
        assert.equal(mensagemDaApi(dados, 500), MENSAGEM_PADRAO);
    }
});

test('mostra falha de conexão quando o fetch lança TypeError', () => {
    assert.equal(mensagemDeFalha(new TypeError('Failed to fetch')), MENSAGEM_CONEXAO);
});

test('mostra a mensagem do erro da API, ou a padrão se o erro não for Error', () => {
    assert.equal(mensagemDeFalha(new Error('URL inválida.')), 'URL inválida.');
    assert.equal(mensagemDeFalha('qualquer coisa'), MENSAGEM_PADRAO);
});

test('marca o campo de URL como inválido só para o status 400 sem código de apelido', () => {
    assert.equal(campoInvalido(400, undefined), CAMPO.URL);
    assert.equal(campoInvalido(400, 'OWN_DOMAIN'), CAMPO.URL);
    for (const status of [413, 500, 502]) {
        assert.equal(campoInvalido(status, undefined), undefined);
    }
});

test('marca o campo de apelido, não o de URL, para apelido inválido ou em uso', () => {
    assert.equal(campoInvalido(400, 'INVALID_ALIAS'), CAMPO.APELIDO);
    assert.equal(campoInvalido(409, 'ALIAS_TAKEN'), CAMPO.APELIDO);
    assert.equal(campoInvalido(409, undefined), CAMPO.APELIDO);
});

test('usa as mensagens traduzidas de apelido inválido (400) e em uso (409)', () => {
    assert.equal(mensagemDaApi({ code: 'INVALID_ALIAS' }, 400), texto('MENSAGEM_APELIDO_INVALIDO'));
    assert.equal(mensagemDaApi({ code: 'ALIAS_TAKEN' }, 409), texto('MENSAGEM_APELIDO_EM_USO'));
    assert.equal(mensagemDaApi({}, 409), texto('MENSAGEM_APELIDO_EM_USO'));
    assert.equal(mensagemDaApi({ error: 'x', code: 'ALIAS_UNAVAILABLE' }, 503), texto('MENSAGEM_APELIDOS_INDISPONIVEIS'));
    assert.equal(mensagemDaApi({ error: 'Falhou.' }, 503), 'Falhou.');
    assert.equal(campoInvalido(503, 'ALIAS_UNAVAILABLE'), CAMPO.APELIDO);
});

test('só envia o apelido quando preenchido', () => {
    assert.deepEqual(corpoDoPedido('https://a.com', ''), { url: 'https://a.com' });
    assert.deepEqual(corpoDoPedido('https://a.com', 'promo'), { url: 'https://a.com', alias: 'promo' });
});

test('só envia a validade quando escolhida', () => {
    assert.deepEqual(corpoDoPedido('https://a.com', '', ''), { url: 'https://a.com' });
    assert.deepEqual(corpoDoPedido('https://a.com', '', '7d'), { url: 'https://a.com', expiresIn: '7d' });
    assert.deepEqual(corpoDoPedido('https://a.com', 'promo', '1h'), { url: 'https://a.com', alias: 'promo', expiresIn: '1h' });
});

test('só envia removeTracking quando a opção está marcada', () => {
    assert.deepEqual(corpoDoPedido('https://a.com', '', '', false), { url: 'https://a.com' });
    assert.deepEqual(corpoDoPedido('https://a.com', '', '', true), { url: 'https://a.com', removeTracking: true });
});

test('removeTracking inválido marca a opção e usa a mensagem traduzida', () => {
    assert.equal(campoInvalido(400, 'INVALID_REMOVE_TRACKING'), CAMPO.RASTREAMENTO);
    assert.equal(mensagemDaApi({ error: 'x', code: 'INVALID_REMOVE_TRACKING' }, 400), texto('MENSAGEM_RASTREAMENTO_INVALIDO'));
});

test('o destino só conta como alterado quando a URL gravada difere da digitada normalizada', () => {
    assert.equal(destinoAlterado('https://a.com/?utm_source=x&id=1', 'https://a.com/?id=1'), true);
    assert.equal(destinoAlterado('https://a.com', 'https://a.com/'), false);
    assert.equal(destinoAlterado('https://a.com/?id=1', 'https://a.com/?id=1'), false);
});

test('validade inválida marca o campo de validade e usa a mensagem traduzida', () => {
    assert.equal(campoInvalido(400, 'INVALID_EXPIRATION'), CAMPO.VALIDADE);
    assert.equal(mensagemDaApi({ error: 'x', code: 'INVALID_EXPIRATION' }, 400), texto('MENSAGEM_VALIDADE_INVALIDA'));
});

test('mostra a data de expiração formatada no idioma pedido, ou nada se o link não expira', () => {
    const expiresAt = '2026-12-02T12:00:00.000Z';
    const formato = (idioma: string) => new Intl.DateTimeFormat(idioma, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' });

    assert.equal(textoDaExpiracao(null, 'pt-BR'), '');
    assert.equal(textoDaExpiracao(expiresAt, 'pt-BR', 'UTC'), `${texto('ROTULO_EXPIRA_EM')} ${formato('pt-BR').format(new Date(expiresAt))}`);
    assert.match(textoDaExpiracao(expiresAt, 'pt-BR', 'UTC'), /dezembro/);
    assert.match(textoDaExpiracao(expiresAt, 'en', 'UTC'), /December/);
});

test('detecta quando o link mudou durante a cópia', () => {
    assert.equal(linkMudou('https://encurta.do/a', 'https://encurta.do/a'), false);
    assert.equal(linkMudou('https://encurta.do/a', 'https://encurta.do/b'), true);
});

test('escolhe o aviso de cópia conforme o resultado', () => {
    assert.equal(avisoDeCopia(true), AVISO_COPIADO);
    assert.equal(avisoDeCopia(false), AVISO_FALHA_COPIA);
});

/** Dependências falsas do aviso; o atraso só roda quando o teste chama `rodarAtraso`. */
function criarAviso() {
    const avisos: string[] = [];
    let acaoAtrasada = () => {};
    const deps = {
        avisar: (mensagem: string) => { avisos.push(mensagem); },
        aposAtraso: (acao: () => void) => { acaoAtrasada = acao; },
    };

    return { deps, avisos, rodarAtraso: () => acaoAtrasada() };
}

test('avisar de novo limpa o aviso e só escreve a mensagem depois do atraso', () => {
    const aviso = criarAviso();
    avisarDeNovo(aviso.deps, 'Olá');
    assert.deepEqual(aviso.avisos, ['']);

    aviso.rodarAtraso();
    assert.deepEqual(aviso.avisos, ['', 'Olá']);
});

test('avisar de novo não escreve a mensagem se ela deixou de valer durante o atraso', () => {
    const aviso = criarAviso();
    avisarDeNovo(aviso.deps, 'Olá', () => false);
    aviso.rodarAtraso();
    assert.deepEqual(aviso.avisos, ['']);
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
