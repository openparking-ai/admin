import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAGES } from '../src/pages.js';
import { LANGUAGES, translate } from '../src/i18n/index.js';
import { buildIndex, search, FEATURES } from '../src/search.js';

// Check 4: every page is found by its own title, in both languages, as the
// first result. The walk is over PAGES, the list the side navigation is built
// from, so a page missing from Quick Find's index cannot hide.
for (const language of LANGUAGES) {
  const index = buildIndex(language);
  for (const page of PAGES) {
    const title = translate(language, `page.${page.id}.title`);
    test(`${language}: "${title}" finds the ${page.id} page first`, () => {
      const results = search(index, title);
      assert.ok(results.length > 0, `nothing found for "${title}"`);
      assert.equal(results[0].kind, 'page');
      assert.equal(results[0].id, page.id, `"${title}" found ${results[0].id} first`);
    });
  }
}

test('the index holds every page and every setting, in both languages', () => {
  for (const language of LANGUAGES) {
    const index = buildIndex(language);
    assert.deepEqual(index.filter((e) => e.kind === 'page').map((e) => e.id), PAGES.map((p) => p.id));
    assert.deepEqual(index.filter((e) => e.kind === 'feature').map((e) => e.id), FEATURES.map((f) => f.id));
  }
});

const first = (language, query) => search(buildIndex(language), query)[0];

test('the other words a person might type', () => {
  assert.equal(first('en', 'tax').id, 'taxes');
  assert.equal(first('es', 'impuestos').id, 'taxes');
  assert.equal(first('en', 'monthly rate').id, 'rates');
  assert.equal(first('es', 'tarifa mensual').id, 'rates');
  assert.equal(first('en', 'payout').id, 'paid');
  assert.equal(first('es', 'deposito').id, 'paid');
  assert.equal(first('en', 'dark').id, 'night');
  assert.equal(first('es', 'oscuro').id, 'night');
  assert.equal(first('en', 'spanish').id, 'es');
});

test('accents and capitals do not matter', () => {
  assert.equal(first('es', 'CAMARA').id, 'lanes');
  assert.equal(first('es', 'cámara').id, 'lanes');
  assert.equal(first('en', 'GARAGES').id, 'garages');
});

test('it searches in the language on screen', () => {
  assert.equal(search(buildIndex('en'), 'impuestos').length, 0);
  assert.equal(search(buildIndex('es'), 'surcharge').length, 0);
});

test('every word typed must match; nonsense finds nothing; empty lists all', () => {
  assert.equal(search(buildIndex('en'), 'card zebra').length, 0);
  assert.equal(search(buildIndex('en'), 'zzqx').length, 0);
  assert.equal(search(buildIndex('en'), '   ').length, PAGES.length + FEATURES.length);
});

test('only the start of a word counts', () => {
  const ids = search(buildIndex('en'), 'ra').map((e) => e.id);
  assert.ok(ids.includes('rates'));
  assert.ok(!ids.includes('garages'), 'gaRAges matched from the middle of a word');
});

test('U6 each page\'s settings are found, in both languages, and each is taken to its page', async () => {
  const { pageOf } = await import('../src/search.js');
  for (const [language, query, id, page] of [
    ['en', 'change taxes', 'changeTaxes', 'taxes'], ['es', 'cambiar impuestos', 'changeTaxes', 'taxes'],
    ['en', 'no tax', 'changeTaxes', 'taxes'], ['es', 'redondeo', 'changeTaxes', 'taxes'],
    ['en', 'set up getting paid', 'setUpPaid', 'paid'], ['es', 'configurar los cobros', 'setUpPaid', 'paid'],
    ['en', 'check again', 'setUpPaid', 'paid'], ['es', 'continuar en stripe', 'setUpPaid', 'paid'],
    ['en', 'connect a card reader', 'connectReader', 'readers'], ['es', 'conectar un lector', 'connectReader', 'readers'],
    ['en', 'reader code', 'connectReader', 'readers'], ['es', 'desconectar lector', 'connectReader', 'readers'],
  ]) {
    const found = search(buildIndex(language), query).find((e) => e.kind === 'feature');
    assert.equal(found?.id, id, `${language} "${query}"`);
    assert.equal(pageOf(found).id, page, `${language} "${query}" goes to ${page}`);
  }
});
