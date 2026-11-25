import assert from 'node:assert/strict';
import { test } from 'node:test';
import { languagesFromHeader } from '../src/backend/accept-language.ts';
import { PREVIEW_SUFFIX } from '../src/backend/api-paths.ts';
import { escapeHtml, limitedPreviewPageHtml, previewLanguage, previewPageHtml } from '../src/frontend/preview-page.ts';
import { IDIOMA_PADRAO, IDIOMAS, TRADUCOES } from '../src/frontend/static/messages.js';

const HOME = '/';

test('escapa a URL e o domínio em todo lugar da página', () => {
    const url = `https://example.com/"><script>alert('x')</script>&a=1`;
    const html = previewPageHtml(url, 'pt-BR', HOME);

    assert.doesNotMatch(html, /<script/);
    assert.doesNotMatch(html, /alert\('x'\)/);
    assert.match(html, new RegExp(`href="${escapeHtml(url).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.equal(escapeHtml(`"<'&>`), '&quot;&lt;&#39;&amp;&gt;');
});

test('o domínio de destino aparece em destaque e o link Continuar não passa o referrer', () => {
    const html = previewPageHtml('https://sub.example.org/caminho', 'en', HOME);
    assert.match(html, /<p id="dominio">sub\.example\.org<\/p>/);
    assert.match(html, /<a class="botao" href="https:\/\/sub\.example\.org\/caminho" rel="noopener noreferrer">Continue<\/a>/);
});

test('página de link com limite não mostra o destino e Continuar leva ao link curto', () => {
    const html = limitedPreviewPageHtml('/AbC234xYz', 'es', HOME);
    assert.doesNotMatch(html, /id="dominio"|id="url"/);
    assert.ok(html.includes(TRADUCOES.es.TEXTO_PREVIA_LIMITADA));
    assert.match(html, /<a class="botao" href="\/AbC234xYz" rel="noopener noreferrer">Continuar<\/a>/);
});

test('URL que não é http/https não vira link', () => {
    const html = previewPageHtml('javascript:alert(1)', 'en', HOME);
    assert.match(html, /<a class="botao" href="#"/);
});

test('idioma desconhecido usa o padrão', () => {
    assert.match(previewPageHtml('https://example.com/', 'xx', HOME), new RegExp(TRADUCOES[IDIOMA_PADRAO].BOTAO_CONTINUAR));
});

test('lê o Accept-Language em ordem de preferência, sem * nem q=0', () => {
    assert.deepEqual(languagesFromHeader('es;q=0.5, en, fr;q=0, *;q=0.1, pt-BR;q=0.9'), ['en', 'pt-BR', 'es']);
    assert.deepEqual(languagesFromHeader(undefined), []);
    assert.deepEqual(languagesFromHeader(''), []);
});

test('ignora itens do Accept-Language com q inválido', () => {
    assert.deepEqual(languagesFromHeader('es;q=abc, pt'), ['pt']);
    assert.deepEqual(languagesFromHeader('es;q=2, fr;q=-1, de;q=0.1234, en;q=0.5'), ['en']);
    assert.deepEqual(languagesFromHeader('en;q=0.5, es;q=1.000'), ['es', 'en']);
});

test('escolhe o idioma da página pelo Accept-Language', () => {
    assert.equal(previewLanguage(languagesFromHeader('pt-PT,pt;q=0.9')), 'pt-BR');
    assert.equal(previewLanguage(languagesFromHeader('de, es;q=0.5')), 'es');
    assert.equal(previewLanguage(languagesFromHeader('de')), IDIOMA_PADRAO);
});

test('a dica de pré-visualização cita o sufixo da rota em todos os idiomas', () => {
    for (const idioma of IDIOMAS) {
        assert.ok(TRADUCOES[idioma].DICA_PREVIA.includes(PREVIEW_SUFFIX), idioma);
    }
});
