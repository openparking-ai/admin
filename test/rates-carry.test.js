// U7i fix 1: a change saved today carries into rates scheduled to start later
// (the owner's answer "a", 2026-10-12). The page's model, measured; the prices
// are the engine's, recorded in test/platform-shapes.json, and
// scripts/check-rates.js walks the page in a browser.
//
//   item 5  a save is built on the rates as they will be when it starts: in
//           force then, or -- with none in force by then -- the first later;
//   item 6  each later version that kept the changed part (the regular rates,
//           or the special rates) as it was gets the new part; one that set
//           its own keeps it, and is named; a chain carries version by version;
//           a save starting exactly when a later version does replaces it;
//   item 8  the plans as they will be after the save: the stored ones less
//           those replaced, plus the saved one and each rebuilt version.
//
// And the platform recorded each later version replaced, by whom, once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baseAt, carryForward, plansAfter, sectionOf, withSection } from '../src/rates.js';
import { startOfDay } from '../src/taxes.js';
import { carrySaves } from './rates-forms.js';

const shapes = JSON.parse(readFileSync(new URL('./platform-shapes.json', import.meta.url), 'utf8'));
const c = carrySaves({ startOfDay, inForceFrom: '2026-01-05T00:00:00-05:00' });
const graceOf = (p) => p.rules.find((r) => r.type === 'grace')?.minutes;
const hourOf = (p) => p.rules.find((r) => r.type === 'increment');
const earlyOf = (p) => p.rules.find((r) => r.type === 'time_window')?.effect.price_minor;

test('item 5: a save is built on the rates in force when it starts -- a later version once it has started -- or the first later one', () => {
  assert.equal(baseAt([c.now, c.early], c.grace.effective_from), c.now, 'Mar 10: the rates in force');
  assert.equal(baseAt([c.now, c.early], c.early.effective_from), c.early, 'Mar 14: the later version, from its own start');
  assert.equal(baseAt([c.now, c.early], '2030-03-20T00:00:00-04:00'), c.early);
  // Nothing in force yet: the first later version, never the last saved.
  assert.equal(baseAt([c.early, c.own], '2026-10-12T12:00:00Z'), c.early);
  assert.equal(baseAt([], '2026-10-12T12:00:00Z'), null);
});

test('item 6: grace changed before a later version that kept the regular rates -- it starts with the new grace, its specials its own', () => {
  const out = carryForward([c.now, c.early], c.grace, 'regular');
  assert.equal(out.replaces, null);
  assert.deepEqual(out.own, []);
  assert.equal(out.carried.length, 1);
  const [{ from, plan }] = out.carried;
  assert.equal(from, c.early);
  assert.equal(plan.effective_from, c.early.effective_from, 'it starts when it did');
  assert.equal(graceOf(plan), 20);
  assert.equal(sectionOf(plan, 'regular'), sectionOf(c.grace, 'regular'), "its regular rates are today's, whole");
  assert.equal(sectionOf(plan, 'specials'), sectionOf(c.early, 'specials'), 'its special rates as they were, byte for byte');
  assert.notEqual(plan.plan_version, c.early.plan_version, 'a new version, by name');
  // CONTROL: the same save with nothing later carries nothing.
  assert.deepEqual(carryForward([c.now], c.grace, 'regular').carried, []);
});

test('item 6: a later version that set its own regular rates keeps them, and is named; the one before it still takes the change', () => {
  const plans = [c.now, c.grace, c.graceCarry.carried[0], c.own];
  const out = carryForward(plans, c.next, 'regular');
  assert.deepEqual(out.carried.map((x) => x.from.plan_version), ['u7ifix-grace-1']);
  assert.deepEqual(out.own.map((p) => p.plan_version), ['u7ifix-own']);
  assert.equal(hourOf(out.carried[0].plan).repeat_period_minor, 500);
  // The one that set its own: nothing of it rebuilt.
  assert.equal(hourOf(c.own).first_period_minor, 900);
  assert.equal(hourOf(c.own).repeat_period_minor, 400);
  // CONTROL: a change that changes nothing names no version as left out.
  const same = { ...c.next, rules: c.grace.rules };
  assert.deepEqual(carryForward(plans, same, 'regular'), { replaces: null, carried: [], own: [] });
});

test('item 6: a chain carries version by version -- each later one compared with the one before it as stored', () => {
  // Mar 14 kept Mar 10's regular rates; Mar 24 kept Mar 14's: both take the grace.
  const later = { ...withSection(c.early, c.early, 'regular'), plan_version: 'mar-24', effective_from: '2030-03-24T00:00:00-04:00' };
  const out = carryForward([c.now, c.early, later], c.grace, 'regular');
  assert.deepEqual(out.carried.map((x) => [x.from.plan_version, graceOf(x.plan)]), [['u7ifix-early', 20], ['mar-24', 20]]);
  // A version after one that set its own inherits that one's, untouched.
  const afterOwn = { ...c.own, plan_version: 'mar-28', effective_from: '2030-03-28T00:00:00-04:00' };
  const out2 = carryForward([c.now, c.grace, c.graceCarry.carried[0], c.own, afterOwn], c.next, 'regular');
  assert.deepEqual(out2.carried.map((x) => x.from.plan_version), ['u7ifix-grace-1']);
  assert.deepEqual(out2.own.map((p) => p.plan_version), ['u7ifix-own']);
});

test('item 6: a special a later version brings, changed with it -- the save replaces that version, and the next one, which kept the specials, takes it', () => {
  const plans = [c.now, c.grace, c.next, c.nextCarry.carried[0], c.own];
  const out = carryForward(plans, c.special, 'specials');
  assert.equal(out.replaces, c.nextCarry.carried[0], 'replaced: the version starting exactly when the save does');
  assert.deepEqual(out.carried.map((x) => x.from.plan_version), ['u7ifix-own']);
  assert.equal(earlyOf(out.carried[0].plan), 1200);
  assert.equal(hourOf(out.carried[0].plan).first_period_minor, 900, 'its own regular rates kept');
  assert.deepEqual(out.own, []);
});

test('item 6: nothing in force yet -- the first later version is what the save is built on, and it takes the change', () => {
  const later = [c.early, c.own];
  const saved = { ...withSection(c.early, c.grace, 'regular'), plan_version: 'now', effective_from: '2026-10-12T12:00:00Z' };
  const out = carryForward(later, saved, 'regular');
  assert.deepEqual(out.carried.map((x) => x.from.plan_version), ['u7ifix-early']);
  assert.equal(graceOf(out.carried[0].plan), 20);
});

test('the platform keeps a plan with its keys reordered: a part compares by what it says, not by the order of its keys', () => {
  const reordered = JSON.parse(JSON.stringify(c.early, Object.keys(c.early).sort()));
  reordered.rules = c.early.rules.map((r) => Object.fromEntries(Object.entries(r).reverse()));
  assert.equal(sectionOf(reordered, 'regular'), sectionOf(c.early, 'regular'));
  assert.equal(sectionOf(reordered, 'specials'), sectionOf(c.early, 'specials'));
  // So a later version stored as the platform keeps it is carried, not left out.
  assert.equal(carryForward([c.now, reordered], c.grace, 'regular').carried.length, 1);
});

test('item 8: the plans as they will be -- those replaced out, the saved one and each rebuilt version in', () => {
  const plans = [c.now, c.grace, c.next, c.nextCarry.carried[0], c.own];
  const out = carryForward(plans, c.special, 'specials');
  assert.deepEqual(plansAfter(plans, c.special, out).map((p) => p.plan_version), ['u7ifix-now', 'u7ifix-grace', 'u7ifix-next', 'u7ifix-special', 'u7ifix-special-1']);
});

test('recorded: each later version replaced is marked, by an owner, with one line naming what replaced it', () => {
  const read = shapes.rates_answers.find((a) => a.what === 'U7i fix 1 the rates replaced, and who replaced them');
  assert.ok(read, 'not recorded');
  const replaced = read.structure.filter((r) => r.replaced);
  assert.deepEqual(replaced.map((r) => r.plan_version).sort(), ['u7ifix-early', 'u7ifix-grace-1', 'u7ifix-next-1', 'u7ifix-own'].sort());
  for (const r of replaced) {
    assert.equal(r.by, 'owner', r.plan_version);
    assert.equal(r.lines.length, 1, r.plan_version);
    assert.equal(r.lines[0].who, 'owner');
  }
  assert.deepEqual(Object.fromEntries(replaced.map((r) => [r.plan_version, r.lines[0].replaced_by])), {
    'u7ifix-early': 'u7ifix-grace-1',
    'u7ifix-grace-1': 'u7ifix-next-1',
    'u7ifix-next-1': 'u7ifix-special',
    'u7ifix-own': 'u7ifix-special-1',
  });
  // CONTROL: the ones that price are not marked.
  assert.ok(read.structure.filter((r) => !r.replaced).every((r) => r.by === null && r.lines.length === 0));
  assert.ok(read.structure.every((r) => r.keys.includes('withdrawn_at') && r.keys.includes('withdrawn_by')));
});
