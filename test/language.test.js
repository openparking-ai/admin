import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as i18n from '../src/i18n/index.js';

const { readLanguage, saveLanguage, translate, LANGUAGE_KEY } = i18n;

const memory = (entries = {}) => {
  const data = new Map(Object.entries(entries));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

test('nothing saved: English, whatever the browser asks for', () => {
  // The browser's languages are not an input any more; passing them changes nothing.
  for (const browser of [['es-US', 'en-US'], ['es'], ['fr-FR'], [], undefined]) {
    assert.equal(readLanguage(memory(), browser), 'en', JSON.stringify(browser));
    assert.equal(readLanguage(null, browser), 'en');
  }
  assert.equal('firstLanguage' in i18n, false, 'the browser-language rule is back');
});

test('storage that cannot be read, or holds something else: English', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(readLanguage(broken), 'en');
  assert.equal(readLanguage(memory({ [LANGUAGE_KEY]: 'fr' })), 'en');
  assert.equal(readLanguage(memory({ [LANGUAGE_KEY]: 'ES' })), 'en');
  saveLanguage(broken, 'es'); // no throw
});

test('the language last used on this computer comes back', () => {
  const storage = memory();
  saveLanguage(storage, 'es');
  assert.equal(storage.data.get(LANGUAGE_KEY), 'es');
  assert.equal(readLanguage(storage), 'es');
  saveLanguage(storage, 'en');
  assert.equal(readLanguage(storage), 'en');
});

test('a missing word is an error, not a blank', () => {
  assert.throws(() => translate('en', 'no.such.key'), /no words/);
  assert.equal(translate('en', 'quickFind.nothing', { typed: 'x' }), 'Nothing matches “x”.');
});
