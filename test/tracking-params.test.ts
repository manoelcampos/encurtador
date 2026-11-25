import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvalidUrlError, UrlErrorCode } from '../src/backend/invalid-url-error.ts';
import {
    isTrackingParam, removeTrackingParams, TRACKING_PARAM_NAMES, TRACKING_PARAM_PREFIXES, validateRemoveTracking,
} from '../src/backend/tracking-params.ts';

const clean = (url: string) => removeTrackingParams(new URL(url)).href;

test('remove utm_* e mantém os outros parâmetros (exemplo da issue)', () => {
    assert.equal(clean('https://a.com/?utm_source=x&id=1'), 'https://a.com/?id=1');
});

test('não diferencia maiúsculas no nome do parâmetro', () => {
    assert.equal(clean('https://a.com/?UTM_Source=x&FBCLID=y&id=1'), 'https://a.com/?id=1');
});

test('não deixa ? sobrando quando só havia rastreamento', () => {
    assert.equal(clean('https://a.com/p?utm_source=x&gclid=y'), 'https://a.com/p');
});

test('mantém o fragmento', () => {
    assert.equal(clean('https://a.com/?utm_medium=x&id=1#secao'), 'https://a.com/?id=1#secao');
    assert.equal(clean('https://a.com/?fbclid=x#secao'), 'https://a.com/#secao');
});

test('remove parâmetros repetidos e mantém a ordem e as repetições dos outros', () => {
    assert.equal(clean('https://a.com/?b=2&utm_source=x&a=1&utm_source=y&b=3'), 'https://a.com/?b=2&a=1&b=3');
});

test('não muda a codificação dos parâmetros mantidos', () => {
    assert.equal(clean('https://a.com/?a=1%202&utm_source=x&b=x+y'), 'https://a.com/?a=1%202&b=x+y');
});

test('reconhece o nome codificado e não quebra com codificação inválida', () => {
    assert.equal(clean('https://a.com/?utm%5Fsource=x&id=1'), 'https://a.com/?id=1');
    assert.equal(clean('https://a.com/?a=%E0%A4%A&utm_source=x'), 'https://a.com/?a=%E0%A4%A');
});

test('URL sem rastreamento fica igual', () => {
    for (const url of ['https://a.com/', 'https://a.com/?', 'https://a.com/?a=1&&b=2', 'https://a.com/?utm=1&source=2#x']) {
        assert.equal(clean(url), new URL(url).href, url);
    }
});

test('não altera a URL recebida', () => {
    const url = new URL('https://a.com/?utm_source=x');
    removeTrackingParams(url);
    assert.equal(url.href, 'https://a.com/?utm_source=x');
});

test('a lista tem todos os nomes conhecidos em minúsculas', () => {
    for (const name of [...TRACKING_PARAM_NAMES, ...TRACKING_PARAM_PREFIXES]) {
        assert.equal(name, name.toLowerCase());
    }

    for (const name of ['utm_campaign', 'fbclid', 'gclid', 'msclkid', 'mc_eid', '_hsenc', 'li_fat_id']) {
        assert.ok(isTrackingParam(name), name);
    }

    for (const name of ['id', 'q', 'page', 'utm', 'ref']) {
        assert.equal(isTrackingParam(name), false, name);
    }
});

test('removeTracking ausente ou null é false; só aceita boolean', () => {
    assert.equal(validateRemoveTracking(undefined), false);
    assert.equal(validateRemoveTracking(null), false);
    assert.equal(validateRemoveTracking(true), true);
    assert.equal(validateRemoveTracking(false), false);
    for (const input of ['true', 1, 0, {}, []]) {
        assert.throws(() => validateRemoveTracking(input),
            (error: unknown) => error instanceof InvalidUrlError && error.code === UrlErrorCode.INVALID_REMOVE_TRACKING, String(input));
    }
});
