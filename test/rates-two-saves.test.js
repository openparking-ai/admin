// U7i: the Rates page from the owner's walk (2026-10-12) -- the form's model,
// measured. Nothing here prices a stay; the prices are the engine's, recorded
// in test/platform-shapes.json, and scripts/check-rates.js reads them in a browser.
//
//   item 6 / check 4  two saves: the regular rates saved keep every special
//                     byte for byte, and a special saved keeps the regular
//                     rates byte for byte; and the platform recorded one
//                     change-log line for each save, naming it by its id;
//   item 10 / check 8 no field starts with a value: a form left empty is the
//                     rates in force, rule for rule; a field typed replaces
//                     only its own value; a part ticked on that was off needs
//                     its fields; a new special needs every field;
//   what the form does not show (a longest stay, another rule's fields) is
//   kept by a save of the part it is in.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blankSpecial, formFromPlan, mergeRegular, mergeSpecial, regularPlan, regularProblems, sameRates, specialProblems, specialsPlan, typedRegular, typedSpecial, specialForm, orderedWindows } from '../src/rates.js';
import { ZONE, recordedPlans } from './rates-forms.js';

const shapes = JSON.parse(readFileSync(new URL('./platform-shapes.json', import.meta.url), 'utf8'));
const garage = { id: 'g', name: 'Recorded rates garage', timezone: ZONE, currency: 'USD' };
const opts = (_day, name) => ({ garage, spaceClass: 'standard', start: '2026-10-13T08:00:00.000Z', name });
const docs = recordedPlans('2026-10-13T08:00:00.000Z');
const buildPlanOf = (_form, name) => ({ ...docs.other, plan_version: name });
const windows = (p) => JSON.stringify({ rules: p.rules.filter((r) => r.type === 'time_window'), order: p.adjust_order });
const regular = (p) => JSON.stringify(p.rules.filter((r) => r.type !== 'time_window'));

test('check 4: a special saved keeps the regular rates byte for byte; a regular save keeps the specials byte for byte', () => {
  assert.equal(regular(docs.early), regular(docs.regular), 'the early bird added changed the regular rates');
  assert.equal(regular(docs.other), regular(docs.early), 'the weekend added changed the regular rates');
  const e = formFromPlan(docs.other, 'USD');
  const grace = regularPlan(docs.other, { ...typedRegular(e), grace: { on: true, minutes: '15' } }, e, opts('', 'grace'));
  assert.equal(windows(grace), windows(docs.other), 'the grace change changed the specials');
  assert.equal(grace.rules.find((r) => r.type === 'grace').minutes, 15);
  // And on rates with a percent off among the specials: a regular change keeps the order too.
  const walk = buildPlanOf(null, 'walk');
  const now = formFromPlan(walk, 'USD');
  const changed = regularPlan(walk, { ...typedRegular(now), time: { ...typedRegular(now).time, firstPrice: '3.00' } }, now, opts('2030-06-03', 'walk-2'));
  assert.equal(windows(changed), windows(walk));
  assert.equal(changed.rules.find((r) => r.type === 'increment').first_period_minor, 300);
});

test('check 4: the specials, one by one -- a change keeps its id and place, a removal drops it from the order', () => {
  const walk = buildPlanOf(null, 'walk');
  const list = orderedWindows(walk);
  const members = list.findIndex((r) => r.label === 'Members');
  const typed = { ...typedSpecial(specialForm(list[members], 'USD')), adjust: { direction: '', kind: '', value: '15', rounding: '' } };
  const changed = specialsPlan(walk, { kind: 'change', index: members, special: mergeSpecial(typed, specialForm(list[members], 'USD')) }, opts('2030-06-03', 'c'));
  const after = orderedWindows(changed);
  assert.equal(after[members].id, list[members].id);
  assert.equal(after[members].effect.amount.percent_bp, 1500);
  assert.deepEqual(after.filter((_, i) => i !== members), list.filter((_, i) => i !== members), 'another special changed');
  assert.equal(regular(changed), regular(walk));
  const removed = specialsPlan(walk, { kind: 'remove', index: members }, opts('2030-06-03', 'r'));
  assert.equal(removed.adjust_order, null, 'the one discount removed, no order is left');
  assert.ok(!orderedWindows(removed).some((r) => r.label === 'Members') && orderedWindows(removed).length === list.length - 1);
  const added = specialsPlan(walk, { kind: 'add', special: { ...mergeSpecial({ ...blankSpecial('weekends'), name: 'Late', enterFrom: '20:00', enterBy: '23:00', leaveBy: '06:00', nextDay: true, charge: 'flat', flat: '7' }) } }, opts('2030-06-03', 'a'));
  const ids = added.rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'two rules share an id');
  assert.equal(orderedWindows(added).at(-1).label, 'Late');
});

test('check 8: every field left empty is the rates in force, rule for rule (the page says "Nothing to save.")', () => {
  const r = formFromPlan(docs.regular, 'USD');
  const nothing = regularPlan(docs.regular, typedRegular(r), r, opts('', 'nothing'));
  assert.equal(JSON.stringify(nothing.rules), JSON.stringify(docs.regular.rules));
  assert.ok(sameRates(nothing, docs.regular));
  for (const plan of [docs.early, buildPlanOf(null, 'walk')]) {
    const now = formFromPlan(plan, 'USD');
    assert.ok(sameRates(regularPlan(plan, typedRegular(now), now, opts('2030-06-03', 'again')), plan));
    // A special "changed" with nothing typed is the same special.
    const list = orderedWindows(plan);
    list.forEach((rule, i) => {
      const was = specialForm(rule, 'USD');
      assert.ok(sameRates(specialsPlan(plan, { kind: 'change', index: i, special: mergeSpecial(typedSpecial(was), was) }, opts('2030-06-03', 'again')), plan), `${rule.label}: changed by nothing typed`);
    });
  }
});

test('check 8: nothing prefilled -- the form starts empty, each tick as it is now; a typed field replaces only its own value', () => {
  const now = formFromPlan(docs.other, 'USD');
  const typed = typedRegular(now);
  for (const v of [...Object.values(typed.time), typed.dayMax.price, typed.dayMax.kind, typed.grace.minutes]) assert.equal(v, '');
  assert.deepEqual([typed.dayMax.on, typed.weekMax.on, typed.grace.on], [true, false, true]);
  const merged = mergeRegular({ ...typed, time: { ...typed.time, nextPrice: '5.00' } }, now);
  assert.deepEqual(merged.time, { ...now.time, nextPrice: '5.00' });
  // The most per week ticked on, where it was off: its fields are needed, there is nothing to keep.
  const week = regularProblems(mergeRegular({ ...typed, weekMax: { ...typed.weekMax, on: true } }, now), garage);
  assert.deepEqual(Object.keys(week).sort(), ['weekMax.kind', 'weekMax.price']);
  // With no rates at all, every field of the time-based rate is needed.
  const none = formFromPlan(null, 'USD');
  assert.deepEqual(Object.keys(regularProblems(mergeRegular(typedRegular(none), none), garage)).sort(), ['time.firstMinutes', 'time.firstPrice', 'time.nextMinutes', 'time.nextPrice']);
  // A new special: every field needed -- its days only once a choice is picked, as the
  // day ticks are drawn only then (U7i fix 1, F3: a link to a field not on the page).
  const fresh = Object.keys(specialProblems(mergeSpecial(typedSpecial(null), null), 'special', garage)).sort();
  assert.deepEqual(fresh, ['special.charge', 'special.enterBy', 'special.enterFrom', 'special.leaveBy', 'special.name', 'special.nextDay', 'special.preset']);
  // CONTROL: a choice picked and every day unticked, the days are needed.
  const picked = Object.keys(specialProblems(mergeSpecial({ ...typedSpecial(null), preset: 'weekdays', days: [] }, null), 'special', garage));
  assert.ok(picked.includes('special.days') && !picked.includes('special.preset'), picked.join());
});

test('what the form does not show is kept: a longest stay on the time-based rate, through a change to its price', () => {
  const plan = buildPlanOf(null, 'long');
  plan.rules = plan.rules.map((r) => (r.type === 'increment' ? { ...r, max_duration_minutes: 1440, id: 'hourly' } : r));
  const now = formFromPlan(plan, 'USD');
  const untouched = regularPlan(plan, typedRegular(now), now, opts('2030-06-03', 'x'));
  assert.equal(JSON.stringify(untouched.rules), JSON.stringify(plan.rules), 'left alone, a part is its own rule, byte for byte');
  const changed = regularPlan(plan, { ...typedRegular(now), time: { ...typedRegular(now).time, firstPrice: '9.00' } }, now, opts('2030-06-03', 'y'));
  const time = changed.rules.find((r) => r.type === 'increment');
  assert.deepEqual([time.id, time.max_duration_minutes, time.first_period_minor], ['hourly', 1440, 900]);
});

test('item 11: the platform wrote one change-log line for each save, naming its rates by their id, by the owner, confirmed', () => {
  const lines = shapes.rates_answers.find((a) => a.what === 'who saved each set of rates').structure;
  assert.deepEqual(lines.map((l) => l.plan_version), ['recorded-regular', 'recorded-early']);
  for (const l of lines) {
    assert.equal(l.id, 'string');
    assert.equal(l.lines, 1, `${l.plan_version}: ${l.lines} lines`);
    assert.deepEqual(l.who, [{ kind: 'owner', name: 'string' }]);
    assert.deepEqual(l.confirmed, [true]);
    assert.deepEqual(l.subject_name, [true]);
  }
});

test('two discounts apply in the order listed: the 10% first, then the $2.00, as the owner put them', () => {
  const two = specialsPlan(docs.other, { kind: 'add', special: mergeSpecial({ ...blankSpecial('everyDay'), name: 'Two off', enterFrom: '00:00', enterBy: '23:59', leaveBy: '23:59', nextDay: true, charge: 'adjust', adjust: { direction: 'discount', kind: 'fixed', value: '2', rounding: '' } }) }, opts('', 'two'));
  const listed = orderedWindows(two).filter((r) => r.stage === 'ADJUST').map((r) => r.label);
  assert.deepEqual(listed, ['Members', 'Two off']);
  assert.deepEqual(two.adjust_order, orderedWindows(two).filter((r) => r.stage === 'ADJUST').map((r) => r.id));
  assert.deepEqual(two.adjust_order.map((id) => two.rules.find((r) => r.id === id).label), ['Members', 'Two off']);
});
