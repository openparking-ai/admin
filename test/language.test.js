import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstLanguage, readLanguage, saveLanguage, translate, LANGUAGE_KEY } from '../src/i18n/index.js';

test('first visit: Spanish if the browser asks for Spanish first, otherwise English', () => {
  assert.equal(firstLanguage(['es-US', 'en-US']), 'es');
  assert.equal(firstLanguage(['es']), 'es');
  assert.equal(firstLanguage(['en-US', 'es-US']), 'en');
  assert.equal(firstLanguage(['fr-FR']), 'en');
  assert.equal(firstLanguage([]), 'en');
  assert.equal(firstLanguage(undefined), 'en');
  assert.equal(firstLanguage(['estonian-not-a-tag']), 'en');
});

test('the choice survives a reload and beats the browser', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  saveLanguage(storage, 'es');
  assert.equal(data.get(LANGUAGE_KEY), 'es');
  assert.equal(readLanguage(storage, ['en-US']), 'es');
  saveLanguage(storage, 'en');
  assert.equal(readLanguage(storage, ['es-MX']), 'en');
});

test('a missing word is an error, not a blank', () => {
  assert.throws(() => translate('en', 'no.such.key'), /no words/);
  assert.equal(translate('en', 'quickFind.nothing', { typed: 'x' }), 'Nothing matches “x”.');
});
