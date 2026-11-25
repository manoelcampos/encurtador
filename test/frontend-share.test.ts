import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMPARTILHAR_EMAIL, COMPARTILHAR_WHATSAPP, TITULO_COMPARTILHAMENTO } from '../src/frontend/static/messages.js';
import { compartilhar, linksDeCompartilhamento, REDES, RESULTADO } from '../src/frontend/static/share.js';

const LINK = 'https://encurta.do/a?b=1&c=2';
const LINK_CODIFICADO = encodeURIComponent(LINK);

test('monta um link de compartilhamento para cada rede, com a URL codificada', () => {
    const links = linksDeCompartilhamento(LINK);
    assert.equal(links.length, REDES.length);
    for (const { href } of links) {
        assert.ok(href.includes(LINK_CODIFICADO), href);
    }

    assert.deepEqual(links[0], { rotulo: COMPARTILHAR_WHATSAPP, href: `https://wa.me/?text=${LINK_CODIFICADO}`, externo: true });
});

test('o link de e-mail leva o título e não abre em nova aba', () => {
    const email = linksDeCompartilhamento(LINK).find(link => link.rotulo === COMPARTILHAR_EMAIL);
    assert.deepEqual(email, {
        rotulo: COMPARTILHAR_EMAIL,
        href: `mailto:?subject=${encodeURIComponent(TITULO_COMPARTILHAMENTO)}&body=${LINK_CODIFICADO}`,
        externo: false,
    });
});

test('usa as opções alternativas quando não há Web Share API', async () => {
    assert.equal(await compartilhar(LINK, undefined), RESULTADO.ALTERNATIVO);
});

test('usa o menu nativo com a URL e o título', async () => {
    const chamadas: ShareData[] = [];
    const resultado = await compartilhar(LINK, async dados => { chamadas.push(dados); });
    assert.equal(resultado, RESULTADO.NATIVO);
    assert.deepEqual(chamadas, [{ url: LINK, title: TITULO_COMPARTILHAMENTO }]);
});

test('não pede alternativas quando o usuário cancela o menu nativo', async () => {
    const cancelar = async () => { throw new DOMException('cancelado', 'AbortError'); };
    assert.equal(await compartilhar(LINK, cancelar), RESULTADO.CANCELADO);
});

test('usa as opções alternativas quando o menu nativo falha', async () => {
    const falhar = async () => { throw new DOMException('negado', 'NotAllowedError'); };
    assert.equal(await compartilhar(LINK, falhar), RESULTADO.ALTERNATIVO);
});
