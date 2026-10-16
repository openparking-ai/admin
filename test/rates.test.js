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
import { DICTIONARIES, translate } from '../src/i18n/index.js';
import { FINDING_CODES, LONGEST_STAY_DAYS, arrange, caseWords, changes, currencyDigits, findingKey, findingWords, instantOf, lineWords, moneyText, parseMoney, planSentences, platformNow, saveStart, specialWords, tableStays, tooLongToPrice, typedMoney, wallAt } from '../src/rates.js';
import { taxNamesAt } from '../src/taxes.js';
import { createClient } from '../src/api.js';
import { MINOR_UNIT_DIGITS } from '../src/currencyDigits.js';
import { CURRENCY_CODES } from '../src/garages.js';
import { STAYS, STAY_LIST, ZONE, recordedPlans } from './rates-forms.js';
import { priceTableFile, ratesFile } from '../src/files/model.js';

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

test('money in the units the engine reads: a price in pesos or dinars typed, stored and shown with the engine\'s digits (OP-NODE-006)', () => {
  // The browser's own data says no digits after the point for both; the engine says 2 for COP and 3 for IQD.
  assert.equal(parseMoney('50.00', 'COP').minor, 5000);
  assert.equal(parseMoney('5000', 'COP').minor, 500000);
  assert.equal(typedMoney(5000, 'COP'), '50.00');
  assert.equal(moneyText(5000, 'COP', 'en'), 'COP\u00a050.00');
  assert.equal(parseMoney('1.500', 'IQD').minor, 1500);
  assert.equal(typedMoney(1500, 'IQD'), '1.500');
  assert.equal(moneyText(1500, 'IQD', 'es'), 'IQD\u00a01.500');
  assert.deepEqual(['USD', 'JPY', 'KWD', 'CLF'].map(currencyDigits), [2, 0, 3, 4]);
  // Every currency a garage can be added with, by the engine's table (scripts/check-currency-digits.js holds the table to the engine at its pin).
  const off = CURRENCY_CODES.filter((code) => currencyDigits(code) !== MINOR_UNIT_DIGITS[code]);
  assert.deepEqual(off, [], `written with other digits than the engine reads: ${off.join(', ')}`);
});

/** The early bird's rates, and the same with 20 free minutes saved by another owner whose computer runs ahead: dated `ahead` ms after `now`. */
function savedAhead(now, ahead) {
  const before = { ...plans.early, plan_version: 'before', effective_from: new Date(now - 3600_000).toISOString() };
  const later = { ...plans.early, plan_version: 'ahead', effective_from: new Date(now + ahead).toISOString(), rules: plans.early.rules.map((r) => (r.type === 'grace' ? { ...r, minutes: 20 } : r)) };
  return { before, later };
}

test('OP-NODE-012: the rates in force are the newest stored, even dated a moment ahead of this computer -- the ones shown and the ones a save is built on', () => {
  const now = Date.parse('2026-10-16T15:00:00Z');
  const { before, later } = savedAhead(now, 45_000);
  // This computer's clock (`now`) is not asked: the newest rates are the ones in force.
  const { current, earlier } = arrange([later, before], new Date(now));
  assert.equal(current?.plan_version, 'ahead', 'the newest rates hidden as "later"');
  assert.deepEqual(earlier.map((p) => [p.plan_version, p.until]), [['before', later.effective_from]]);
  // A save starts after the rates it is built on, never before them: they would take over from it.
  assert.equal(saveStart(later, now), new Date(Date.parse(later.effective_from) + 1).toISOString());
  assert.equal(saveStart(before, now), new Date(now).toISOString());
  assert.equal(saveStart(null, now), new Date(now).toISOString());
});

test('OP-NODE-015: the Rates file with rates dated ahead of the viewer\'s clock, in English and Spanish: made, the newest the current ones', () => {
  const readAt = new Date('2026-10-16T15:00:00Z');
  const { before, later } = savedAhead(readAt.getTime(), 30_000);
  for (const language of ['en', 'es']) {
    const tt = (key, values) => translate(language, key, values);
    const file = ratesFile({ t: tt, language, garage: { name: 'G', timezone: ZONE, currency: 'USD' }, data: { plans: [before, later] }, readAt });
    const states = [...new Set(file.rows.map((r) => r[1].text))];
    assert.deepEqual(states, [tt('rates.state.current'), tt('rates.state.earlier')], `${language}: ${states.join(', ')}`);
    assert.ok(file.rows[0][2].text.length > 0 && file.rows.some((r) => r[1].text === tt('rates.state.current') && /20/.test(r[2].text)), `${language}: the newest rates are not the current ones`);
  }
});

test('OP-NODE-013: a tax line is named from the list the stay was taxed by -- the one in force when it left -- though every list numbers its lines alike', () => {
  const lists = [
    { effective_from: '2032-01-01T05:00:00.000Z', rules: [{ id: 'tax-1', label: 'State parking tax', percent_bp: 800 }] },
    { effective_from: '2026-01-01T05:00:00.000Z', rules: [{ id: 'tax-1', label: 'City parking tax', percent_bp: 600 }] },
  ];
  assert.deepEqual(taxNamesAt(lists, Date.parse('2031-03-15T17:00:00Z')), { 'tax-1': 'City parking tax' });
  assert.deepEqual(taxNamesAt(lists, Date.parse('2032-03-15T17:00:00Z')), { 'tax-1': 'State parking tax' });
  assert.deepEqual(taxNamesAt(lists, Date.parse('2025-03-15T17:00:00Z')), {}, 'a stay before any list: no name');
  const stay = { rate_lines: [], tax_lines: [{ rule_id: 'tax-1', delta_minor: 96 }] };
  assert.deepEqual(lineWords(en, stay, plans.early, taxNamesAt(lists, Date.parse('2031-03-15T17:00:00Z')), 'USD', 'en').lines.map((l) => l.words), ['City parking tax']);
});

test('OP-NODE-014: new rates are dated by the platform\'s clock, from its answer\'s Date and the time since, never by this computer\'s', async () => {
  // This computer two minutes slow: the platform said 15:00:00 when this computer said 14:58:00.
  const clock = { date: Date.parse('2026-10-16T15:00:00Z'), local: Date.parse('2026-10-16T14:58:00Z') };
  assert.equal(platformNow(clock, Date.parse('2026-10-16T14:58:30Z')), Date.parse('2026-10-16T15:00:30Z'));
  assert.equal(platformNow(null, 1234), 1234, 'no answer\'s Date: this computer\'s clock');
  // The rates read carries the platform's clock: its Date, and this computer's when it came.
  const body = JSON.stringify({ rate_plans: [], space_class: 'standard' });
  const headers = { get: (name) => (name.toLowerCase() === 'date' ? 'Fri, 16 Oct 2026 15:00:00 GMT' : null) };
  const client = createClient({ fetch: async () => ({ status: 200, ok: true, headers, text: async () => body }) });
  const before = Date.now();
  const read = await client.ratePlans('g');
  assert.equal(read.clock.date, Date.parse('2026-10-16T15:00:00Z'));
  assert.ok(read.clock.local >= before && read.clock.local <= Date.now());
  const undated = await createClient({ fetch: async () => ({ status: 200, ok: true, text: async () => body }) }).ratePlans('g');
  assert.equal(undated.clock, null);
  // The two refusals name this computer's clock, and offer no date to choose.
  for (const language of ['en', 'es']) {
    for (const key of ['problem.planStartPast', 'problem.planStartLater']) {
      const words = translate(language, key);
      assert.match(words, language === 'en' ? /this computer's clock/ : /reloj de esta computadora/, `${language} ${key}: ${words}`);
      assert.doesNotMatch(words, /later date|fecha posterior|Choose Now|Elija Ahora/, `${language} ${key}: ${words}`);
    }
  }
});

test('the rules of rate setup, in both languages: the cheapest price wins, and no price past the longest stay, its days from the one number', () => {
  assert.equal(LONGEST_STAY_DAYS, 90, 'the longest stay the engine prices: 90 days (decided 2026-10-16)');
  // The words as decided (2026-10-16), and in Spanish.
  assert.equal(translate('en', 'rates.rule.cheapest'), 'When more than one price applies, the car always pays the cheapest.');
  assert.equal(translate('en', 'rates.rule.longest', { days: LONGEST_STAY_DAYS }), "Stays longer than 90 days can't be priced automatically; they need an operator.");
  assert.equal(translate('es', 'rates.rule.cheapest'), 'Cuando se aplica más de un precio, el auto siempre paga el más barato.');
  assert.equal(translate('es', 'rates.rule.longest', { days: LONGEST_STAY_DAYS }), 'Las estadías de más de 90 días no tienen precio automático; necesitan un operador.');
  // The days come from LONGEST_STAY_DAYS alone: neither language writes a number of its own.
  for (const language of ['en', 'es']) {
    const words = DICTIONARIES[language]['rates.rule.longest'];
    assert.ok(words.includes('{days}') && !/\d/.test(words), `${language}: rates.rule.longest fills in {days} and has no number of its own: ${words}`);
  }
});

test('the longest stay: 90 days is priced, a minute more is not, in real time as the engine counts it', () => {
  // April to the end of June 2031, New York: no change of the clocks.
  assert.equal(tooLongToPrice('2031-04-01T10:00', '2031-06-30T10:00', ZONE), false, 'exactly 90 days: priced');
  assert.equal(tooLongToPrice('2031-04-01T10:00', '2031-06-30T10:01', ZONE), true, '90 days and a minute: not priced');
  // Across a change of the clocks the garage's clock shows an hour more or less; the stay's length is real time.
  // The clocks go forward on 9 March 2031: 90 days and 30 minutes on the clock is 89 days 23 h 30 min.
  assert.equal(tooLongToPrice('2031-03-01T10:00', '2031-05-30T10:30', ZONE), false, 'spring: 89 days 23 h 30 min in real time');
  // They go back on 2 November 2031: 89 days 23 h 30 min on the clock is 90 days and 30 minutes.
  assert.equal(tooLongToPrice('2031-09-01T10:00', '2031-11-30T09:30', ZONE), true, 'autumn: 90 days 30 min in real time');
});
