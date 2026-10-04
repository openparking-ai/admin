// What the screens say about a lane and about the cars inside is true in
// every state the platform can return: no lane computer ever, one whose
// access was cancelled, several, never heard from, not heard from lately,
// working; no car inside, some, some the lane could not confirm. And each
// description that speaks of those states speaks of all of them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICTIONARIES, translate } from '../src/i18n/index.js';
import { laneWords } from '../src/lanes.js';
import { insideWords } from '../src/inside.js';
import { garageTime } from '../src/time.js';

const garage = { timezone: 'America/New_York' };
const NOW = new Date('2026-03-10T20:00:00Z'); // 4:00 PM in New York
const MINUTE = 60 * 1000;
const ago = (ms) => new Date(NOW - ms).toISOString();
const computer = (name, { seen = null, cancelled = null } = {}) => ({ id: name, name, last_seen_at: seen, revoked_at: cancelled });

for (const language of ['en', 'es']) {
  const t = (key, values) => translate(language, key, values);
  const words = DICTIONARIES[language];
  const at = (iso) => garageTime(iso, garage.timezone, language, NOW);
  const lane = (devices) => laneWords(t, { devices }, garage, language, NOW);

  test(`${language}: "no lane computer yet" only for a lane that never had one`, () => {
    assert.deepEqual(lane([]), { state: 'none', text: words['lane.noComputer'] });
    assert.deepEqual(lane(undefined), { state: 'none', text: words['lane.noComputer'] });
  });

  test(`${language}: a lane whose only computer had its access cancelled says so, and when`, () => {
    const said = lane([computer('old', { seen: ago(90 * MINUTE), cancelled: '2026-03-10T19:09:00Z' })]);
    assert.notEqual(said.text, words['lane.noComputer'], 'it says the lane never had a computer');
    assert.equal(said.state, 'cancelled');
    assert.equal(said.text, t('lane.cancelledOne', { time: at('2026-03-10T19:09:00Z') }));
  });

  test(`${language}: several computers, all cancelled: the time of the last cancelled`, () => {
    const said = lane([
      computer('first', { cancelled: '2026-03-01T13:00:00Z' }),
      computer('second', { seen: ago(30 * MINUTE), cancelled: '2026-03-10T19:09:00Z' }),
      computer('third', { cancelled: '2026-03-05T13:00:00Z' }),
    ]);
    assert.equal(said.state, 'cancelled');
    assert.equal(said.text, t('lane.cancelledMany', { time: at('2026-03-10T19:09:00Z') }));
  });

  test(`${language}: a cancelled computer beside a working one: the working one is what the lane says`, () => {
    assert.equal(lane([computer('old', { cancelled: ago(MINUTE) }), computer('new', { seen: ago(MINUTE + 5000) })]).text, words['lane.workingOne']);
    assert.equal(lane([computer('old', { cancelled: ago(MINUTE) }), computer('new')]).text, words['lane.never']);
  });

  test(`${language}: never heard from, not heard from lately, working, and several working`, () => {
    assert.equal(lane([computer('a')]).state, 'never');
    const silent = lane([computer('a', { seen: '2026-03-10T15:40:00Z' })]);
    assert.equal(silent.text, t('lane.quiet', { time: at('2026-03-10T15:40:00Z') }));
    assert.equal(lane([computer('a', { seen: ago(10 * 1000) })]).text, words['lane.workingNow']);
    // Several still working: the one heard from most recently.
    assert.equal(lane([computer('a', { seen: '2026-03-10T15:40:00Z' }), computer('b', { seen: ago(3 * MINUTE) })]).text, t('lane.workingMany', { minutes: 3 }));
  });

  test(`${language}: the cars-inside figure never says "no cars" when some were let in unconfirmed`, () => {
    assert.deepEqual(insideWords(t, { inside_count: 0, unconfirmable_count: 0 }), { figure: words['inside.countNone'], more: null });
    const unconfirmedOnly = insideWords(t, { inside_count: 0, unconfirmable_count: 1 });
    assert.notEqual(unconfirmedOnly.figure, words['inside.countNone'], 'it says no cars are inside, beside one let in');
    assert.deepEqual(unconfirmedOnly, { figure: words['inside.countNoneConfirmed'], more: words['inside.unconfirmedOne'] });
    assert.deepEqual(insideWords(t, { inside_count: 1, unconfirmable_count: 3 }), {
      figure: words['inside.countOne'],
      more: t('inside.unconfirmedMany', { count: 3 }),
    });
    assert.deepEqual(insideWords(t, { inside_count: 2, unconfirmable_count: 0 }), { figure: t('inside.countMany', { count: 2 }), more: null });
  });
}

// Each description, and the states the screen shows under it that it must
// speak to, as the platform returns them (read from platform source; the
// receipt lists every field). A description that names only one state of
// several is the defect this round fixes.
const SPEAKS_OF = [
  // lanesForGarage returns every lane_devices row, cancelled ones included.
  ['lanes.computers.about', 'several computers', /\b(every|each)\b/i, /\b(cada|todas)\b/i],
  ['lanes.computers.about', 'a cancelled computer', /cancel/i, /cancel/i],
  // Home: a lane with no working computer, whether it never had one or its access was cancelled.
  ['home.lanes.about', 'no working computer', /\bwhy not\b/i, /\bpor qué no\b/i],
  // The section shows the unconfirmed line beside the figure.
  ['home.inside.about', 'cars not confirmed', /not confirmed|could not confirm/i, /no confirmad|no pudo confirmar/i],
  // The column shows "No" as well as "Yes".
  ['inside.confirmed.about', 'No', /\bNo\b/, /\bNo\b/],
];
// An unconfirmed stay is a car let in, not one seen driving in: these
// columns are shown for both, so they may not say it came in. (No \b around
// "entró": in JavaScript \b is ASCII only, and never matches after the ó.)
const NOT_FOR_UNCONFIRMED = [
  ['inside.letIn.about', /came in/i, /entró/i],
  ['inside.lane.about', /came in/i, /entró/i],
];

test('each description speaks of every state its field can show, in both languages', () => {
  // Every gap named, not only the first.
  const gaps = [];
  for (const [key, state, en, es] of SPEAKS_OF) {
    if (!en.test(DICTIONARIES.en[key])) gaps.push(`en ${key} says nothing of: ${state}`);
    if (!es.test(DICTIONARIES.es[key])) gaps.push(`es ${key} says nothing of: ${state}`);
  }
  for (const [key, en, es] of NOT_FOR_UNCONFIRMED) {
    if (en.test(DICTIONARIES.en[key])) gaps.push(`en ${key} says the car came in, which an unconfirmed stay does not know`);
    if (es.test(DICTIONARIES.es[key])) gaps.push(`es ${key} says the car came in, which an unconfirmed stay does not know`);
  }
  assert.deepEqual(gaps, []);
});
