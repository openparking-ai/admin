import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICTIONARIES } from '../src/i18n/index.js';
import { SAMPLE_KEYS, reasonsFor } from '../src/lanes.js';
import { screenLines, undrawable } from '../src/screen.js';
import { SCREEN_CHARACTERS } from './stub-platform.js';

// U4c, rule 7 and rule 9, on the owner's side: what a lane's screen can show,
// said before anything is sent; the samples all pass it; a way out is closed
// to everyone only. The characters are the platform's (src/screen-characters.json
// there, which it checks against the screen's font); the stand-in serves the
// same string, and test/stub-matches-platform.test.js holds the stand-in to
// the platform.

test('every sample message, in both languages, is one the screen can show', () => {
  for (const [language, words] of Object.entries(DICTIONARIES)) {
    for (const key of Object.values(SAMPLE_KEYS).flat()) {
      assert.deepEqual(undrawable(words[key], SCREEN_CHARACTERS), [], `${language}: ${key} "${words[key]}"`);
      assert.ok(words[key].length <= 160, `${language}: ${key} is longer than a message can be`);
    }
  }
  assert.equal(DICTIONARIES.en['lanes.sample.full1'], 'Garage is full. Monthly parkers only.');
  assert.equal(DICTIONARIES.es['lanes.sample.full1'], 'Estacionamiento lleno. Solo mensuales.');
});

test('a character the screen cannot show is named, each once, in the order typed; lower case and the Spanish letters are shown', () => {
  assert.deepEqual(undrawable('Closed — sorry, € 5 (cash) — €', SCREEN_CHARACTERS), ['—', '€', '(', ')']);
  assert.deepEqual(undrawable('Straße', SCREEN_CHARACTERS), ['ß'], 'one letter that is two in capitals');
  assert.deepEqual(undrawable('Lleno 🚗', SCREEN_CHARACTERS), ['🚗']);
  assert.deepEqual(undrawable('¿Lleno? Sí, señor. Ñandú.', SCREEN_CHARACTERS), ['¿']);
  assert.deepEqual(undrawable("garage full: monthly/pass only - sorry! it's 5+", SCREEN_CHARACTERS), []);
});

test('the preview is the screen\'s: capitals, wrapped by words, nothing cut off', () => {
  const text = 'Event tonight: the north entrance is for monthly parkers and pass holders only, everyone else please use the south entrance';
  const lines = screenLines(text, 24);
  assert.ok(lines.every((l) => l.length <= 24), JSON.stringify(lines));
  assert.equal(lines.join(' '), text.toUpperCase());
  // A word longer than a line goes on whole, a piece at a time.
  const long = screenLines('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 end', 24);
  assert.deepEqual(long, ['ABCDEFGHIJKLMNOPQRSTUVWX', 'YZ0123456789 END']);
  assert.ok(long.every((l) => l.length <= 24));
});

test('a way out is closed to everyone only; a way in, for either reason', () => {
  assert.deepEqual(reasonsFor({ direction: 'exit' }), ['everyone']);
  assert.deepEqual(reasonsFor({ direction: 'entry' }), ['full', 'everyone']);
});
