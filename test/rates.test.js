// U7g: the Rates form, measured against what the platform stored and what the
// rate engine charged when test/platform-shapes.json was recorded from them
// (the engine at the platform's pin). Nothing here prices a stay.
//
//   check 4   each of the six forms builds exactly the document the platform
//             stored, and the engine charged its stay what the form's own
//             sentences say;
//   check 5   every finding the engine can return has its own plain sentence,
//             in both languages, naming what it is about and the car the
//             engine tried -- never the engine's words;
//   check 11  the price table holds every case for each special of the four
//             forms that have specials, and every stay starts on or after
//             the rates do; a special on three typed dates has every case on
//             each date (fix 1, F5).
//
//   U7g fix 1:
//   F1  the price table's "most per day / per week" rows, on the gate's three
//       plans: each row the engine's breakdown says it is -- "takes over" where
//       the most applied and a minute earlier it did not -- and a row is never
//       called "takes over" when its breakdown says not reached;
//   E1  where the hour is less than the special, the engine charged the hour,
//       and the words say so with both amounts, in both languages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DICTIONARIES } from '../src/i18n/index.js';
import { FINDING_CODES, buildPlan, caseKey, findingKey, findingWords, instantOf, moneyText, planSentences, specialWords, tableStays } from '../src/rates.js';
import { startOfDay } from '../src/taxes.js';
import { FORMS, GATE_MAX_FORMS, TABLE_FORM, THREE_DATES_FORM, ZONE, recordedPlans } from './rates-forms.js';

const recorded = JSON.parse(readFileSync(new URL('./platform-shapes.json', import.meta.url), 'utf8')).rates_answers;
const answer = (what) => recorded.find((a) => a.what === what);
const t = (language) => (key, values = {}) => {
  const text = DICTIONARIES[language][key];
  assert.ok(typeof text === 'string', `${language}: no words for ${key}`);
  return text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? `{${k}}`));
};
const en = t('en');
const garage = { id: 'g', name: 'Recorded rates garage', timezone: ZONE, currency: 'USD' };
const build = (form, name) => buildPlan(form, { garage, spaceClass: 'standard', start: startOfDay(form.day, ZONE), name });

test('check 4: each form builds the document the platform stored, and the engine charged its stay what the form says', () => {
  const stored = answer('rates').structure.plans.map((p) => p.plan);
  for (const f of FORMS) {
    const plan = build(f.form, `recorded-${f.id}`);
    const kept = stored.find((p) => p.plan_version === `recorded-${f.id}`);
    assert.ok(kept, `form ${f.id} was not stored when recorded`);
    assert.deepEqual(plan, kept, `form ${f.id} (${f.what}) builds a different document from the one the platform stored`);
    const [stay] = answer(`a stay tried, form ${f.id}`).structure.stays;
    assert.equal(stay.refused, false, `form ${f.id}: refused`);
    assert.equal(stay.subtotal_minor, f.fee, `form ${f.id} (${f.what}): the engine charged ${stay.subtotal_minor}, the form says ${f.fee}`);
  }
});

test("check 4: the form's sentences say the prices the engine charged", () => {
  const said = (id) => planSentences(en, build(FORMS.find((f) => f.id === id).form, 'x'), 'en').map((s) => [s.name, s.text].filter(Boolean).join(' — ')).join(' | ');
  assert.match(said('a'), /First hour \$8\.00, then \$4\.00 each hour\..*At most \$30\.00 a day/);
  assert.match(said('b'), /Early bird — Monday to Friday, come in from 6:00 AM to 9:00 AM and leave by 6:00 PM the same day: \$15\.00 for the stay\./);
  assert.match(said('c'), /Weekend — Saturday and Sunday, .* leave by 12:00 PM the next day: \$20\.00 for the stay\./);
  assert.match(said('d'), /Game day — On Feb 2, 2030, .*: First hour \$5\.00, then \$2\.00 each hour\./);
  assert.match(said('e'), /Ten percent off — .*10% off the whole fee .*Two off — .*\$2\.00 off the whole fee .*Discounts and increases apply in the order listed\./);
  assert.match(said('f'), /Free if the car leaves within 10 minutes\./);
});

test('check 4: two discounts apply in the order listed: the 10% first, then the 2.00, as the owner put them', () => {
  const plan = build(FORMS.find((f) => f.id === 'e').form, 'x');
  const named = (id) => plan.rules.find((r) => r.id === id).label;
  assert.deepEqual(plan.adjust_order.map(named), ['Ten percent off', 'Two off']);
  // CONTROL: the other order is a different document, which the platform did not store.
  const form = FORMS.find((f) => f.id === 'e').form;
  const swapped = build({ ...form, specials: [...form.specials].reverse() }, 'x');
  assert.deepEqual(swapped.adjust_order.map((id) => swapped.rules.find((r) => r.id === id).label), ['Two off', 'Ten percent off']);
});

test('the document: the garage money and kind of space, the cheaper charge first, no decisions, ids unique, a name it made', () => {
  const plan = build(TABLE_FORM, 'rates-20300304-000000-ab12');
  assert.equal(plan.currency, 'USD');
  assert.deepEqual(plan.space_classes, ['standard']);
  assert.deepEqual(plan.resolution, { QUALIFY: { mode: 'cheapest_wins' }, ACCUMULATE: { mode: 'cheapest_wins' } });
  assert.deepEqual(plan.decisions, []);
  const ids = plan.rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const rule of plan.rules) assert.deepEqual(rule.space_classes, ['standard']);
});

test('check 5: every finding the engine can return has its own sentence, in both languages, and never the engine words', () => {
  for (const code of FINDING_CODES) {
    for (const language of ['en', 'es']) {
      const key = findingKey(code);
      assert.notEqual(key, 'rates.finding.other', `${code} has no sentence of its own`);
      assert.ok(DICTIONARIES[language][key], `${language}: ${code} unworded`);
    }
  }
  // The finding the platform gave for rates with a gap, as the owner reads it.
  const refusal = answer('rates saved, with a gap').body;
  assert.equal(refusal.code, 'plan_has_findings');
  const gap = recordedPlans({ buildPlan, startOfDay, tableStays }).gap;
  for (const f of refusal.details.findings) {
    for (const language of ['en', 'es']) {
      const words = findingWords(t(language), f, gap, ZONE, language);
      assert.ok(!words.includes(f.text), `${language}: the engine's own sentence reached the screen`);
      assert.ok(!/GAP_|CONFLICT_|FAULT_|_minutes|standard'/.test(words), `${language}: engine words on screen: ${words}`);
    }
    const said = findingWords(en, f, gap, ZONE, 'en');
    assert.match(said, /^Nothing says what a stay this long costs\. It is about: your time-based rate\. The car tried came in on a \w+day at \d{1,2}:\d{2} [AP]M and stayed 1 day 1 minute\.$/, said);
  }
});

test('check 11: the price table holds every case for each special of the four forms that have them', () => {
  for (const f of FORMS.filter((x) => x.form.specials.length)) {
    const plan = build(f.form, 'x');
    const stays = tableStays(plan, ZONE);
    const start = Date.parse(plan.effective_from);
    for (const s of stays) assert.ok(instantOf(s.entry, ZONE) >= start, `form ${f.id}: a stay before the rates start: ${s.entry}`);
    for (const rule of plan.rules.filter((r) => r.type === 'time_window')) {
      const has = (key) => stays.some((s) => s.why.key === key && s.why.name === rule.label);
      const cases = ['specialFrom', 'specialBy', 'specialLeftLate'];
      if (rule.enter_from !== '00:00') cases.push('specialTooEarly');
      if (rule.enter_by !== '23:59') cases.push('specialTooLate');
      if (rule.applies_on.kind === 'days_of_week' && rule.applies_on.days.length < 7) cases.push('specialOtherDay');
      for (const key of cases) assert.ok(has(key), `form ${f.id}, ${rule.label}: no "${key}" stay`);
      if (rule.applies_on.kind === 'dates') {
        for (const day of rule.applies_on.dates) assert.ok(stays.some((s) => s.entry.startsWith(day) && s.why.name === rule.label), `form ${f.id}: no stay on ${day}`);
      }
      // The leave-by edge itself: a stay leaving exactly at it, and one a minute after.
      const leave = (day) => `${day}T${rule.exit_by}`;
      const at = stays.filter((s) => s.why.name === rule.label && s.why.key === 'specialFrom');
      for (const s of at) {
        const day = rule.day_span === 'next_day' ? new Date(Date.parse(`${s.entry.slice(0, 10)}T12:00:00Z`) + 86400000).toISOString().slice(0, 10) : s.entry.slice(0, 10);
        assert.equal(s.exit, leave(day), `form ${f.id}: the come-in-from stay does not leave on the leave-by time`);
      }
    }
  }
  // And the lengths, grace and the most per day, on the forms that have them.
  const a = tableStays(build(FORMS.find((x) => x.id === 'a').form, 'x'), ZONE);
  assert.ok(a.some((s) => s.why.key === 'dayMaxTakes') && a.some((s) => s.why.key === 'dayMaxBefore'));
  for (const minutes of [10, 30, 60, 61, 120, 180, 300, 480, 720, 1440, 1500, 2880, 10080]) {
    assert.ok(a.some((s) => (instantOf(s.exit, ZONE) - instantOf(s.entry, ZONE)) / 60000 === minutes), `no stay of ${minutes} minutes`);
  }
  const fs = tableStays(build(FORMS.find((x) => x.id === 'f').form, 'x'), ZONE);
  assert.ok(fs.some((s) => s.why.key === 'graceInside') && fs.some((s) => s.why.key === 'graceOver'));
});

test('check 11: the table the browser check prices is the one recorded, so its prices are the engine\'s', () => {
  const plan = build(TABLE_FORM, 'recorded-table');
  const recordedStays = answer('the price table tried').structure.stays.map(({ entry, exit }) => ({ entry, exit }));
  assert.deepEqual(tableStays(plan, ZONE).map(({ entry, exit }) => ({ entry, exit })), recordedStays);
});

test('check 11 (fix 1, F5): a special on three typed dates has every case on each of them', () => {
  const plan = build(THREE_DATES_FORM, 'x');
  const stays = tableStays(plan, ZONE);
  const [rule] = plan.rules.filter((r) => r.type === 'time_window');
  assert.equal(rule.applies_on.dates.length, 3);
  for (const day of rule.applies_on.dates) {
    for (const key of ['specialFrom', 'specialBy', 'specialTooEarly', 'specialTooLate', 'specialLeftLate', 'specialShort']) {
      assert.ok(stays.some((x) => x.why.key === key && x.why.name === rule.label && x.entry.startsWith(day)), `${day}: no "${key}" stay`);
    }
  }
});

/** A recorded price table: its rows as the page builds them, each with what the platform answered. */
function tableOf(what, plan) {
  const answered = answer(what).structure.stays;
  const rows = tableStays(plan, ZONE);
  assert.deepEqual(rows.map(({ entry, exit }) => ({ entry, exit })), answered.map(({ entry, exit }) => ({ entry, exit })), `${what}: the table recorded is not the one the page builds`);
  return rows.map((row, i) => ({ ...row, answer: answered[i] }));
}
const answerIn = (rows) => (key) => rows.find((r) => r.why.key === key)?.answer;
const CAPS = ['dayMaxTakes', 'dayMaxBefore', 'weekMaxTakes', 'weekMaxBefore'];

test('F1: on the gate\'s three plans, each "most per day / week" row is what the engine says of that stay', () => {
  const recordedMaxes = recordedPlans({ buildPlan, startOfDay, tableStays }).maxes;
  for (const g of GATE_MAX_FORMS) {
    const plan = build(g.form, `recorded-${g.id}`);
    assert.deepEqual(plan, recordedMaxes.find((m) => m.id === g.id).plan);
    const rows = tableOf(`the price table tried, ${g.id}`, plan);
    const want = CAPS.filter((k) => (k.startsWith('week') ? plan.rules.some((r) => r.type === 'weekly_max') : true));
    for (const key of want) {
      const row = rows.find((r) => r.why.key === key);
      assert.ok(row, `${g.id}: no "${key}" row`);
      const lines = row.answer.rate_lines.map((l) => l.code);
      const code = key.startsWith('day') ? 'daily_max' : 'weekly_max';
      assert.ok(lines.includes(key.endsWith('Takes') ? `${code}.applied` : `${code}.not_reached`), `${g.id}: the "${key}" row (${row.entry} to ${row.exit}) is not where the engine says: ${lines.join(', ')}`);
      assert.equal(caseKey(row, row.answer, answerIn(rows)), key, `${g.id}: the "${key}" row is labelled otherwise`);
    }
  }
  // And the table form's own (recorded with the browser check's table).
  const table = tableOf('the price table tried', build(TABLE_FORM, 'recorded-table'));
  for (const key of ['dayMaxTakes', 'dayMaxBefore']) assert.equal(caseKey(table.find((r) => r.why.key === key), table.find((r) => r.why.key === key).answer, answerIn(table)), key);
});

test('F1: a row built as "takes over" whose breakdown says not reached is never called "takes over"', () => {
  const g = GATE_MAX_FORMS[0];
  const rows = tableOf(`the price table tried, ${g.id}`, build(g.form, `recorded-${g.id}`));
  const before = rows.find((r) => r.why.key === 'dayMaxBefore');
  assert.ok(before.answer.rate_lines.some((l) => l.code === 'daily_max.not_reached'));
  // The gate's finding, as a row: labelled "takes over", priced not reached.
  const mislabelled = { ...before, why: { key: 'dayMaxTakes' } };
  const said = caseKey(mislabelled, before.answer, () => undefined);
  assert.notEqual(said, 'dayMaxTakes', 'a row whose breakdown says not reached is called "takes over"');
  assert.equal(said, 'dayMaxNotReached');
  for (const language of ['en', 'es']) assert.ok(DICTIONARIES[language][`rates.test.${said}`], `${language}: ${said} unworded`);
});

test('E1: where the hour is less than the early bird, the hour was charged, and the words say so with both amounts', () => {
  const plan = build(TABLE_FORM, 'recorded-table');
  const rows = tableOf('the price table tried', plan);
  const short = rows.find((r) => r.why.key === 'specialShort' && r.why.name === 'Early bird');
  assert.ok(short, 'no short early-bird stay in the table');
  const line = short.answer.rate_lines.find((l) => l.code === 'time_based_used');
  assert.ok(line, `the engine did not compare: ${short.answer.rate_lines.map((l) => l.code).join(', ')}`);
  assert.equal(short.answer.subtotal_minor, 800);
  assert.equal(line.compared_minor, 1500);
  assert.equal(short.answer.special, null, 'the platform names a special that was not charged');
  for (const language of ['en', 'es']) {
    const words = specialWords(t(language), { ...short.answer, entry: short.entry, exit: short.exit }, plan, language);
    const want = t(language)('rates.why.timeLess', { name: 'Early bird', time: moneyText(800, 'USD', language), special: moneyText(1500, 'USD', language) });
    assert.ok(words.includes(want), `${language}: ${words}`);
  }
  // And where the early bird is less: it applied, and the words say what the hour would have been.
  const from = rows.find((r) => r.why.key === 'specialFrom' && r.why.name === 'Early bird');
  const used = from.answer.rate_lines.find((l) => l.code === 'special_used');
  assert.ok(used && Number.isInteger(used.compared_minor) && used.compared_minor > 1500, 'the early bird row does not say what the hour would be');
  assert.ok(specialWords(en, { ...from.answer, entry: from.entry, exit: from.exit }, plan, 'en').includes(en('rates.why.appliedTimeMore', { name: 'Early bird', time: moneyText(used.compared_minor, 'USD', 'en') })));
  // Try a stay on the rates saved: the same words.
  const [tried] = answer('a stay tried, less by the hour').structure.stays;
  assert.equal(tried.subtotal_minor, 800);
  assert.ok(tried.rate_lines.some((l) => l.code === 'time_based_used' && l.compared_minor === 1500));
});
