// U7g / U7i: the Rates page's rates, measured against what the platform
// stored and what the rate engine charged when test/platform-shapes.json was
// recorded (the engine at the platform's pin). Nothing here prices a stay.
//
//   the document   the approved page's rates build exactly the documents the
//                  platform stored and priced (recorded, but for when each starts);
//   the prices     the engine charged each stay what test/rates-forms.js says
//                  the approved page charges;
//   the words      each plan in the approved page's sentences; a priced stay's
//                  lines and its special-rate words as the approved page says
//                  them, from the engine's own lines -- one "Max per day" line
//                  when a max applies, and what it would have been by the hour;
//   findings       every finding the engine can return has its own sentence,
//                  in both languages, never the engine's words;
//   the table      the approved page's example stays, each after the moment
//                  the table is made, nothing scheduled.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DICTIONARIES } from '../src/i18n/index.js';
import { FINDING_CODES, caseWords, changes, findingKey, findingWords, instantOf, lineWords, planSentences, specialWords, tableStays, wallAt } from '../src/rates.js';
import { STAYS, STAY_LIST, ZONE, recordedPlans } from './rates-forms.js';
import { priceTableFile } from '../src/files/model.js';

const recorded = JSON.parse(readFileSync(new URL('./platform-shapes.json', import.meta.url), 'utf8')).rates_answers;
const answer = (what) => recorded.find((a) => a.what === what);
const t = (language) => (key, values = {}) => {
  const text = DICTIONARIES[language][key];
  assert.ok(typeof text === 'string', `${language}: no words for ${key}`);
  return text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? `{${k}}`));
};
const en = t('en');
const es = t('es');
const plans = recordedPlans('2026-10-13T08:00:00.000Z');
const ENGINE_WORDS = /GAP_|CONFLICT_|FAULT_|cheapest|QUALIFY|ACCUMULATE|increment|time_window|max_duration|plan_version|daily_max|weekly_max/;
const when = (plan) => ({ ...plan, effective_from: 'when saved' });

test('the document: the approved rates build exactly the documents the platform stored, but for when each starts', () => {
  const stored = answer('rates').structure.plans.map((p) => p.plan);
  assert.deepEqual(stored, [when(plans.regular), when(plans.early)]);
  assert.deepEqual(answer('rates saved, the early bird added').structure.plan, when(plans.early));
  // Every plan the page writes charges a started period in full, and says nothing else of it.
  for (const p of [plans.regular, plans.early, plans.change, plans.max, plans.other]) {
    for (const r of p.rules.filter((x) => x.type === 'increment' || x.effect?.kind === 'rate')) assert.equal((r.effect ?? r).rounding, 'ceil');
  }
});

test('the prices: the engine charged each stay what the approved page charges', () => {
  const fees = (what) => answer(what).structure.stays.map((s) => s.fee_minor);
  const want = Object.values(STAYS).filter((s) => s !== STAYS.maxDays);
  assert.deepEqual(fees('the early bird tried'), want.map((s) => s.fee));
  assert.deepEqual(fees('a stay tried, on the rates saved'), want.map((s) => s.fee));
  // Before the early bird, the early bird's stay is the hour's, capped.
  assert.deepEqual(fees('the regular rates tried'), [0, 1600, 3000, 3000, 800]);
  assert.deepEqual(fees('the max per day tried'), [STAYS.maxDays.fee]);
});

test('the words: each plan in the approved page\'s sentences', () => {
  const said = planSentences(en, plans.early, 'en').map((s) => [s.name, s.text].filter(Boolean).join(' — '));
  assert.deepEqual(said, [
    'First hour $8.00, then $4.00 each hour.',
    'Max $30.00 per day (a calendar day, midnight to midnight).',
    'Free if the car leaves within 10 minutes.',
    'Early bird — Monday to Friday, come in from 6:00 AM to 9:00 AM and leave by 6:00 PM the same day: $12.00 for the stay.',
  ]);
  const other = planSentences(en, plans.other, 'en').map((s) => s.text);
  assert.ok(other.includes('Saturday and Sunday, come in from 12:00 AM to 11:59 PM and leave by 11:59 PM the next day: first hour $5.00, then $2.00 each hour.'), other.join(' | '));
  assert.ok(other.includes('Every day, come in from 12:00 AM to 11:59 PM and leave by 11:59 PM the next day: 10% off the price.'), other.join(' | '));
  for (const s of [...planSentences(en, plans.other, 'en'), ...planSentences(es, plans.other, 'es')]) assert.ok(!ENGINE_WORDS.test(s.text), s.text);
  assert.ok(!planSentences(en, plans.max, 'en').some((s) => /period that has started/.test(s.text)), 'no sentence about a period that has started');
});

test('the words: a stay\'s lines and its special rate, as the approved page says them, from the engine\'s lines', () => {
  const [graceStay, plain, capped, early, beaten] = answer('a stay tried, on the rates saved').structure.stays;
  const lines = (stay, plan = plans.early) => lineWords(en, stay, plan, {}, 'USD', 'en');
  const words = (stay, plan = plans.early) => specialWords(en, stay, plan, 'en');
  assert.deepEqual(lines(graceStay).lines.map((l) => [l.words, l.minor]), [['Free: left within the 10-minute grace period', 0]]);
  assert.equal(words(graceStay), 'None: free within the grace period.');
  assert.deepEqual(lines(plain).lines.map((l) => [l.words, l.minor]), [['First hour', 800], ['2 more hours at $4.00', 800]]);
  assert.equal(words(plain), 'None. Early bird: not for a Saturday.');
  assert.deepEqual(lines(capped).lines.map((l) => [l.words, l.minor]), [['Max per day', 3000]]);
  assert.equal(lines(capped).byHour, 5200);
  assert.equal(words(capped), 'None. Early bird: not for a Saturday. The max per day was charged.');
  assert.deepEqual(lines(early).lines.map((l) => [l.words, l.minor]), [['Special rate: Early bird, one price for the stay', 1200]]);
  assert.equal(words(early), 'Early bird applied. By the time-based rate this stay would be $30.00.');
  assert.equal(words(beaten), 'None. Early bird would be $12.00; the time-based rate is cheaper.');
  // The brief's max check: one line for the max, and what it would be by the hour.
  const [long] = answer('the max per day tried').structure.stays;
  const m = lines(long, plans.max);
  assert.deepEqual(m.lines.map((l) => [l.words, l.amount]), [['Max per day, 2 days at $100.00', '$200.00']]);
  assert.equal(en('rates.line.byHour', { amount: '$1,300.00' }), 'By the hour it would be $1,300.00.');
  assert.equal(m.byHour, STAYS.maxDays.byHour);
  // Below the max: the periods, "126 more 15-minute periods at $10.00" said as the page says them.
  const below = { ...long, minutes: 1950, rate_lines: long.rate_lines.filter((l) => l.code !== 'daily_max.applied') };
  assert.deepEqual(lines(below, plans.max).lines.map((l) => l.words), ['First hour', '126 more 15-minute periods at $10.00']);
});

test('the words: the other kinds of special -- its own hourly rate, and a percent off', () => {
  const stays = answer('the other kinds of special tried').structure.stays;
  const sat = stays[1];
  const l = lineWords(en, sat, plans.other, {}, 'USD', 'en').lines.map((x) => [x.words, x.minor]);
  assert.deepEqual(l, [['Weekend: first hour', 500], ['Weekend: 2 more hours at $2.00', 400], ['Members: 10% off', -90]]);
  assert.equal(specialWords(en, sat, plans.other, 'en'), 'Weekend applied. By the time-based rate this stay would be $14.40. Early bird: not for a Saturday. Members applied.');
});

test('findings: every code the engine can return has its own sentence, in both languages, and never the engine words', () => {
  for (const language of ['en', 'es']) {
    const tt = t(language);
    const seen = new Set();
    for (const code of FINDING_CODES) {
      const key = findingKey(code);
      assert.ok(DICTIONARIES[language][key], `${language}: no sentence for ${code}`);
      seen.add(DICTIONARIES[language][key]);
    }
    assert.equal(seen.size, FINDING_CODES.length, `${language}: two findings share a sentence`);
    const gap = answer('rates saved, with a gap').body.details.findings;
    for (const f of gap) {
      const said = findingWords(tt, f, plans.gap, ZONE, language);
      assert.ok(!ENGINE_WORDS.test(said) && said.startsWith(tt(findingKey(f.code))) && !said.includes(f.text), `the engine's own sentence reached the screen: ${said}`);
    }
  }
});

test('the table: the approved page\'s stays, each after the moment it is made', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const rows = tableStays(plans.early, ZONE, now);
  const keys = rows.map((r) => r.why.key);
  assert.deepEqual(keys, [
    'graceInside', 'graceOver', 'firstPeriod', 'nextPeriod', 'length', 'length', 'length', 'length', 'length', 'dayMax', 'dayAndHour', 'twoDays', 'week',
    'specialFrom', 'specialBy', 'specialTooEarly', 'specialTooLate', 'specialLeftLate',
  ]);
  assert.ok(rows.every((r) => instantOf(r.entry, ZONE) >= now), 'a stay before the table was made');
  // The regular stays from 10:00 on the next Saturday; the early bird's on the next weekday.
  assert.equal(rows[0].entry, '2026-10-17T10:00');
  assert.equal(rows.find((r) => r.why.key === 'specialFrom').entry, '2026-10-14T06:00');
  assert.equal(caseWords(en, rows.at(-1)), 'Early bird: leaves one minute late');
  // A weekly max adds eight days.
  const week = { ...plans.max, rules: [...plans.max.rules, { id: 'most-a-week', type: 'weekly_max', stage: 'CAP', space_classes: ['standard'], max_minor: 30000, week_boundary: 'rolling_7d', week_starts_on: null }] };
  assert.deepEqual(tableStays(week, ZONE, now).map((r) => r.why.key).slice(-2), ['weekMax', 'eightDays']);
  assert.equal(wallAt(now, ZONE), '2026-10-13T08:00');
});

test('what changes: each changed value, old then new; a special added or removed', () => {
  const c = changes(en, plans.regular, plans.early, 'en');
  assert.deepEqual(c.map((x) => [x.name ?? en(x.key), x.was, x.is]), [['Early bird', 'none', 'added']]);
  const r = changes(en, plans.early, plans.change, 'en');
  assert.equal(r.length, 1);
  assert.ok(r[0].was.endsWith('$12.00 for the stay.') && r[0].is.endsWith('$15.00 for the stay.'));
  const g = changes(en, plans.early, plans.max, 'en');
  assert.deepEqual(g.slice(0, 3).map((x) => [en(x.key), x.was, x.is]), [
    ['First period', '60 min, $8.00', '60 min, $40.00'],
    ['Each period after', '60 min, $4.00', '15 min, $10.00'],
    ['Max per day', '$30.00, calendar day', '$100.00, calendar day'],
  ]);
});

test('the price table file says what the page says, row for row', () => {
  const stays = answer('a stay tried, on the rates saved').structure.stays;
  const rows = STAY_LIST.map((s, i) => ({ ...s, why: { key: 'added' }, answer: stays[i] }));
  const file = priceTableFile({ t: en, language: 'en', garage: { name: 'G', timezone: ZONE, currency: 'USD' }, data: { plan: plans.early, rows }, readAt: new Date() });
  assert.deepEqual(file.rows.map((r) => r[5].text), ['$0.00', '$16.00', '$30.00', '$12.00', '$8.00']);
  assert.equal(file.rows[3][6].text, 'Early bird applied. By the time-based rate this stay would be $30.00.');
  assert.equal(file.rows[0][7].text, 'Your own stay');
});
