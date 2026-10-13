// Extra pages from the host: the file read, each path held to this origin, the names shown
// as text, a message acted on only from this origin and in the expected shape. Each refusal
// is planted here and must be caught.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameAddress, frameMessage, ownPath, readEntry, readExtraPages, readStatus, statusAddress, loadExtraPages, MAX_HEIGHT } from '../src/extras.js';

const entry = () => ({
  id: 'example-extra',
  prefixes: ['/example-extra/', '/api/example-extra/'],
  page: '/example-extra/#/first',
  title: { en: 'An example page', es: 'Una página de ejemplo' },
  purpose: { en: 'What the example shows.', es: 'Lo que muestra el ejemplo.' },
  setup: { status: '/api/example-extra/garages/{garage}/status' },
  section: { page: 'inside' },
});

test('a path is this origin\'s, or it is refused: another host, a scheme, a backslash, an encoded form, outside the prefix', () => {
  assert.equal(ownPath('/example-extra/'), true);
  assert.equal(ownPath('/example-extra/#/first'), true);
  for (const bad of ['//evil.example/x', 'https://evil.example/x', 'javascript:alert(1)', '/x\\evil', '%2F%2Fevil.example', '/%5Cevil', '/x/../y', '', 'relative', '/with\nnewline', '/a:b://c', '/%2e%2e/x']) {
    assert.equal(ownPath(bad), false, bad);
  }
  for (const [field, bad] of [['page', '//evil.example/example-extra/'], ['page', 'https://evil.example/'], ['page', '/example-extra\\x'], ['page', '/example-extra%2F%2F'], ['page', '/elsewhere/'], ['page', '%2Fexample-extra%2F']]) {
    const e = entry();
    e[field] = bad;
    assert.equal(readEntry(e), null, `${field} ${bad}`);
  }
  const outsidePrefix = entry();
  outsidePrefix.setup.status = '/api/other/status';
  assert.equal(readEntry(outsidePrefix), null);
  const badPrefix = entry();
  badPrefix.prefixes = ['//evil.example/'];
  assert.equal(readEntry(badPrefix), null);
  const noSlash = entry();
  noSlash.prefixes = ['/example-extra'];
  assert.equal(readEntry(noSlash), null);
});

test('an entry is read whole, and nothing of a malformed one; a malformed file gives none', () => {
  const read = readEntry(entry());
  assert.deepEqual(read.title, { en: 'An example page', es: 'Una página de ejemplo' });
  assert.equal(read.setup.status, '/api/example-extra/garages/{garage}/status');
  assert.equal(read.section.page, 'inside');
  for (const change of [
    (e) => { e.id = 'Bad Id'; }, (e) => { e.id = ''; }, (e) => { delete e.title; }, (e) => { e.title = { en: 'x' }; }, (e) => { e.purpose = { en: 'x', es: '' }; },
    (e) => { e.section = { page: 'settings' }; }, (e) => { delete e.setup; delete e.section; }, (e) => { e.title = { en: 'x'.repeat(201), es: 'y' }; },
    (e) => { e.prefixes = []; }, (e) => { e.prefixes = ['/a/', '/b/', '/c/', '/d/', '/e/']; },
  ]) {
    const e = entry();
    change(e);
    assert.equal(readEntry(e), null);
  }
  assert.equal(readExtraPages({ pages: [entry()] }).length, 1);
  for (const bad of [null, 7, 'text', [], {}, { pages: {} }, { pages: Array.from({ length: 21 }, entry) }]) {
    assert.deepEqual(readExtraPages(bad), [], JSON.stringify(bad)?.slice(0, 40));
  }
  // An entry that is not as expected is left out, and nothing of it is drawn; an id given twice counts once.
  const elsewhere = entry();
  elsewhere.id = 'elsewhere';
  elsewhere.page = '//evil.example/x';
  assert.deepEqual(readExtraPages({ pages: [entry(), 7, elsewhere, entry()] }).map((e) => e.id), ['example-extra']);
  // The names are text, whatever they hold: kept as given, never read as markup here.
  const planted = entry();
  planted.title = { en: '<script>alert(1)</script>', es: '<b>x</b>' };
  assert.equal(readEntry(planted).title.en, '<script>alert(1)</script>');
});

test('the file absent, not JSON or refused by the server gives none, and never throws', async () => {
  assert.deepEqual(await loadExtraPages(async () => ({ ok: false, json: async () => ({}) })), []);
  assert.deepEqual(await loadExtraPages(async () => ({ ok: true, json: async () => { throw new Error('not json'); } })), []);
  assert.deepEqual(await loadExtraPages(async () => { throw new Error('no network'); }), []);
  assert.equal((await loadExtraPages(async () => ({ ok: true, json: async () => ({ pages: [entry()] }) }))).length, 1);
});

test('the frame\'s address names the page, the garage, the language and the look; the status path names the garage', () => {
  const e = readEntry(entry());
  assert.equal(frameAddress(e, { garageId: 'g1', language: 'es', look: 'night' }), '/example-extra/?framed=example-extra&garage=g1&language=es&look=night#/first');
  assert.equal(statusAddress(e, 'g/1'), '/api/example-extra/garages/g%2F1/status');
});

test('a message is acted on from this origin only, in the expected shape only: another origin, another shape, a height of a million are refused', () => {
  const own = 'https://admin.example';
  const ids = ['example-extra'];
  assert.deepEqual(frameMessage({ origin: own, data: { type: 'extra-page', id: 'example-extra', height: 412.4 } }, { origin: own, ids }), { id: 'example-extra', height: 413 });
  assert.deepEqual(frameMessage({ origin: own, data: { type: 'extra-page', id: 'example-extra', changed: true } }, { origin: own, ids }), { id: 'example-extra', changed: true });
  assert.equal(frameMessage({ origin: 'https://elsewhere.example', data: { type: 'extra-page', id: 'example-extra', height: 400 } }, { origin: own, ids }), null);
  assert.equal(frameMessage({ origin: own, data: { type: 'extra-page', id: 'example-extra', height: 1_000_000 } }, { origin: own, ids }), null);
  assert.equal(frameMessage({ origin: own, data: { type: 'extra-page', id: 'example-extra', height: MAX_HEIGHT + 1 } }, { origin: own, ids }), null);
  assert.equal(frameMessage({ origin: own, data: { type: 'extra-page', id: 'example-extra', height: '400' } }, { origin: own, ids }), null);
  assert.equal(frameMessage({ origin: own, data: { type: 'extra-page', id: 'unknown', height: 400 } }, { origin: own, ids }), null);
  assert.equal(frameMessage({ origin: own, data: { type: 'other', id: 'example-extra', height: 400 } }, { origin: own, ids }), null);
  assert.equal(frameMessage({ origin: own, data: { type: 'extra-page', id: 'example-extra' } }, { origin: own, ids }), null);
  assert.equal(frameMessage({ origin: own, data: { type: 'extra-page', id: 'example-extra', changed: 'yes' } }, { origin: own, ids }), null);
  assert.equal(frameMessage({ origin: own, data: 'extra-page' }, { origin: own, ids }), null);
  assert.equal(frameMessage(null, { origin: own, ids }), null);
});

test('a step\'s status is read as done or not with one line of facts in the language, or not at all', () => {
  assert.deepEqual(readStatus({ done: true, facts: { en: '2 levels', es: '2 niveles' } }, 'es'), { done: true, facts: '2 niveles' });
  assert.deepEqual(readStatus({ done: false, facts: { en: 'nothing yet' } }, 'es'), { done: false, facts: 'nothing yet' });
  assert.deepEqual(readStatus({ done: false }, 'en'), { done: false, facts: null });
  assert.equal(readStatus({ done: 'yes' }, 'en'), null);
  assert.equal(readStatus(null, 'en'), null);
});
