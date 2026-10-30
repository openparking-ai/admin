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
import { NotShownHere, RatesChangedMeanwhile, blankSpecial, changes, formFromPlan, formShows, pricedClasses, mergeRegular, mergeSpecial, regularPlan, regularProblems, sameRates, specialProblems, specialsPlan, typedRegular, typedSpecial, specialForm, orderedWindows } from '../src/rates.js';
import { DICTIONARIES } from '../src/i18n/index.js';
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
  // Each tick untouched until pressed (OP-NODE-008), and as it is now in the rates it makes.
  assert.deepEqual([typed.dayMax.on, typed.weekMax.on, typed.grace.on], [null, null, null]);
  const ticks = mergeRegular(typed, now);
  assert.deepEqual([ticks.dayMax.on, ticks.weekMax.on, ticks.grace.on], [true, false, true]);
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

test('rates that price a VIP kind beside the garage\'s own: a save from either section leaves no kind with nothing to price it', () => {
  const both = ['standard', 'vip'];
  const vip = { ...docs.other, plan_version: 'with-vip', space_classes: both,
    rules: [...docs.other.rules.map((r) => ({ ...r, space_classes: both })), { id: 'lab-vip-extra', type: 'space_surcharge', stage: 'SURCHARGE', space_classes: ['vip'], surcharge_minor: 500 }] };
  assert.deepEqual(pricedClasses(vip, 'standard'), both);
  assert.deepEqual(pricedClasses(docs.other, 'standard'), ['standard']);
  const now = formFromPlan(vip, 'USD');
  // The time-based rate changed, and a max per week ticked on that was off.
  const typed = { ...typedRegular(now), time: { ...typedRegular(now).time, firstPrice: '9.00' }, weekMax: { on: true, price: '90.00', kind: 'rolling_7d', startsOn: '' } };
  const changed = regularPlan(vip, typed, now, opts('', 'vip-2'));
  for (const r of changed.rules.filter((x) => x.type !== 'space_surcharge')) assert.deepEqual(r.space_classes, both, `${r.id} prices only one kind`);
  assert.deepEqual(changed.rules.find((r) => r.type === 'space_surcharge'), vip.rules.at(-1));
  assert.deepEqual(changed.space_classes, both);
  // A special added prices both kinds; one changed keeps its own.
  const s = blankSpecial('weekends');
  Object.assign(s, { name: 'Late', enterFrom: '20:00', enterBy: '23:00', leaveBy: '06:00', nextDay: true, charge: 'flat', flat: '7.00' });
  const added = specialsPlan(vip, { kind: 'add', special: mergeSpecial(s) }, { garage, spaceClass: 'standard', start: '2026-10-13T08:00:00.000Z', name: 'vip-3' });
  for (const r of added.rules.filter((x) => x.type !== 'space_surcharge')) assert.deepEqual(r.space_classes, both, `${r.id} prices only one kind`);
  // Rates with the garage's kind alone are written exactly as before.
  const plain = regularPlan(docs.other, { ...typedRegular(formFromPlan(docs.other, 'USD')), weekMax: { on: true, price: '90.00', kind: 'rolling_7d', startsOn: '' } }, formFromPlan(docs.other, 'USD'), opts('', 'plain'));
  for (const r of plain.rules) assert.deepEqual(r.space_classes, ['standard']);
});

const en = (key, values = {}) => DICTIONARIES.en[key].replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? `{${k}}`));

test('OP-NODE-007: a special\'s amount changed from a percent to an amount needs its own number -- 10% off never becomes $10.00 off', () => {
  const walk = buildPlanOf(null, 'walk');
  const list = orderedWindows(walk);
  const members = list.findIndex((r) => r.label === 'Members');
  const was = specialForm(list[members], 'USD');
  assert.deepEqual([was.adjust.kind, was.adjust.value], ['percent', '10']);
  const toFixed = mergeSpecial({ ...typedSpecial(was), adjust: { direction: '', kind: 'fixed', value: '', rounding: '' } }, was);
  assert.equal(toFixed.adjust.value, '', 'the percent\'s number was carried over as an amount');
  assert.equal(specialProblems(toFixed, 'special', garage)['special.amount'], 'rates.need.price.empty');
  // The amount typed: that amount off.
  const two = mergeSpecial({ ...typedSpecial(was), adjust: { direction: '', kind: 'fixed', value: '2', rounding: '' } }, was);
  const saved = specialsPlan(walk, { kind: 'change', index: members, special: two }, opts('', 'two-off'));
  assert.deepEqual(orderedWindows(saved)[members].effect.amount, { kind: 'fixed', minor: 200 });
  // And back: an amount changed to a percent needs its percent.
  const wasFixed = specialForm(orderedWindows(saved)[members], 'USD');
  const toPercent = mergeSpecial({ ...typedSpecial(wasFixed), adjust: { direction: '', kind: 'percent', value: '', rounding: '' } }, wasFixed);
  assert.equal(specialProblems(toPercent, 'special', garage)['special.amount'], 'rates.need.percent.empty');
  // CONTROL: the kind left as it is, the number and its cents in force are kept.
  const same = mergeSpecial({ ...typedSpecial(was), adjust: { direction: 'increase', kind: '', value: '', rounding: '' } }, was);
  assert.deepEqual([same.adjust.kind, same.adjust.value, same.adjust.rounding], ['percent', '10', 'down']);
});

test('OP-NODE-008: two owners -- a tick or a special\'s days left untouched are the rates read when saving, so one owner\'s save never undoes another\'s', () => {
  // Owner A starts on rates with no max per day and types only a new first price.
  const noMax = { ...docs.early, plan_version: 'no-max', rules: docs.early.rules.filter((r) => r.type !== 'daily_max') };
  const typedA = typedRegular(formFromPlan(noMax, 'USD'));
  typedA.time = { ...typedA.time, firstPrice: '9.00' };
  // Meanwhile owner B saves a max per day of $20.00. A's save is built on the rates read again: B's.
  const b = { ...noMax, plan_version: 'b', rules: [...noMax.rules.slice(0, 1), { id: 'b-max', type: 'daily_max', stage: 'CAP', space_classes: ['standard'], max_minor: 2000, day_boundary: 'calendar_day' }, ...noMax.rules.slice(1)] };
  const savedA = regularPlan(b, typedA, formFromPlan(b, 'USD'), opts('', 'a'));
  assert.deepEqual(savedA.rules.find((r) => r.type === 'daily_max'), b.rules[1], 'A\'s save dropped B\'s max per day');
  assert.equal(savedA.rules.find((r) => r.type === 'increment').first_period_minor, 900);
  // CONTROL: a tick A pressed is A's: the max per day ticked off is off.
  const off = regularPlan(b, { ...typedA, dayMax: { ...typedA.dayMax, on: false } }, formFromPlan(b, 'USD'), opts('', 'a-off'));
  assert.ok(!off.rules.some((r) => r.type === 'daily_max'));

  // A changes the early bird's price only; meanwhile B puts it on Saturdays too.
  const list = orderedWindows(docs.early);
  const at = list.findIndex((r) => r.label === 'Early bird');
  const typedS = { ...typedSpecial(specialForm(list[at], 'USD')), flat: '15' };
  const six = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const b2 = { ...docs.early, plan_version: 'b2', rules: docs.early.rules.map((r) => (r.id === list[at].id ? { ...r, applies_on: { kind: 'days_of_week', days: six } } : r)) };
  const savedS = specialsPlan(b2, { kind: 'change', index: at, special: mergeSpecial(typedS, specialForm(orderedWindows(b2)[at], 'USD')) }, opts('', 's'));
  assert.deepEqual(orderedWindows(savedS)[at].applies_on.days, six, 'A\'s save took B\'s Saturday off the early bird');
  assert.equal(orderedWindows(savedS)[at].effect.price_minor, 1500);
  // CONTROL: days A ticked are A's.
  const mine = specialsPlan(b2, { kind: 'change', index: at, special: mergeSpecial({ ...typedS, days: ['mon'] }, specialForm(orderedWindows(b2)[at], 'USD')) }, opts('', 's2'));
  assert.deepEqual(orderedWindows(mine)[at].applies_on.days, ['mon']);
});

/** Rates written elsewhere: "Two off" listed before the early bird and the weekend, "Members" after them, Members applied first. */
function writtenElsewhere() {
  const byLabel = (label) => docs.other.rules.find((r) => r.label === label);
  const members = byLabel('Members');
  const twoOff = { ...members, id: 'two-off', label: 'Two off', effect: { kind: 'adjust', direction: 'discount', amount: { kind: 'fixed', minor: 200 }, rounding: 'down' } };
  return { ...docs.other, plan_version: 'written', rules: [...docs.other.rules.filter((r) => r.type !== 'time_window'), twoOff, byLabel('Early bird'), byLabel('Weekend'), members], adjust_order: [members.id, 'two-off'] };
}

test('OP-NODE-009: a special changed on rates with a one-price special between two discounts keeps the order the discounts apply in', () => {
  const written = writtenElsewhere();
  const list = orderedWindows(written);
  assert.deepEqual(list.filter((r) => r.stage === 'ADJUST').map((r) => r.label), ['Members', 'Two off'], 'the discounts listed out of the order they apply in');
  const at = list.findIndex((r) => r.label === 'Early bird');
  const typed = { ...typedSpecial(specialForm(list[at], 'USD')), flat: '15' };
  const changed = specialsPlan(written, { kind: 'change', index: at, special: mergeSpecial(typed, specialForm(list[at], 'USD')) }, opts('', 'c'));
  assert.deepEqual(changed.adjust_order, written.adjust_order, 'the order the discounts apply in was reversed');
  assert.ok(!changes((k, v) => en(k, v), written, changed, 'en').some((c) => c.key === 'rates.change.order'), 'an order change shown where there is none');
});

test('OP-NODE-009: a change in the order the discounts apply in is shown under "What changes", old then new', () => {
  const written = writtenElsewhere();
  const reordered = { ...written, plan_version: 'reordered', adjust_order: [...written.adjust_order].reverse() };
  const row = changes((k, v) => en(k, v), written, reordered, 'en').find((c) => c.key === 'rates.change.order');
  assert.deepEqual(row && [en(row.key), row.was, row.is], ['Order discounts and extra charges apply in', 'Members, Two off', 'Two off, Members']);
});

test('OP-NODE-010: a special to change or remove that the rates no longer hold is refused as "the rates changed", never a crash and never another special removed', () => {
  const walk = buildPlanOf(null, 'walk');
  const special = mergeSpecial({ ...blankSpecial('weekends'), name: 'Late', enterFrom: '20:00', enterBy: '23:00', leaveBy: '06:00', nextDay: true, charge: 'flat', flat: '7' });
  assert.throws(() => specialsPlan(walk, { kind: 'change', index: -1, special }, opts('', 'x')), RatesChangedMeanwhile);
  assert.throws(() => specialsPlan(walk, { kind: 'remove', index: -1 }, opts('', 'x')), RatesChangedMeanwhile);
  assert.throws(() => specialsPlan(walk, { kind: 'remove', index: orderedWindows(walk).length }, opts('', 'x')), RatesChangedMeanwhile);
  // CONTROL: one that is there is removed, and only it.
  assert.equal(orderedWindows(specialsPlan(walk, { kind: 'remove', index: 0 }, opts('', 'x'))).length, orderedWindows(walk).length - 1);
});

test('OP-NODE-011: a special with settings the form cannot show -- any span, a longest stay -- is not changed here, so nothing is rewritten unseen', () => {
  const weekend = docs.other.rules.find((r) => r.label === 'Weekend');
  const anySpan = { ...weekend, day_span: 'any_span' };
  const longest = { ...weekend, effect: { ...weekend.effect, max_duration_minutes: 2880 } };
  assert.deepEqual([formShows(weekend), formShows(anySpan), formShows(longest), formShows({ ...weekend, effect: { ...weekend.effect, rounding: 'floor' } })], [true, false, false, false]);
  for (const rule of [anySpan, longest]) {
    const plan = { ...docs.other, plan_version: 'elsewhere', rules: docs.other.rules.map((r) => (r.id === weekend.id ? rule : r)) };
    const at = orderedWindows(plan).findIndex((r) => r.id === weekend.id);
    const renamed = mergeSpecial({ ...typedSpecial(specialForm(rule, 'USD')), name: 'Weekend rate' }, specialForm(rule, 'USD'));
    assert.throws(() => specialsPlan(plan, { kind: 'change', index: at, special: renamed }, opts('', 'x')), NotShownHere, `${rule.day_span}: rewritten by a rename`);
    // It can still be removed.
    assert.ok(!orderedWindows(specialsPlan(plan, { kind: 'remove', index: at }, opts('', 'x'))).some((r) => r.id === weekend.id));
  }
});
