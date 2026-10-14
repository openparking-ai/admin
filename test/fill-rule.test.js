// The fill rule on the Rates page (rate-engine schema 6, platform 0034): rates
// that charge more when the garage is at least so full.
//
//   the words      the rule in his words, "Above 80% full: time charge +20%",
//                  beside the rates, in both languages; the VIP extra too;
//   the order      a special saved on rates with a fill rule keeps the fill
//                  rule in the stated order, last -- the engine requires the
//                  order to name every ADJUST rule -- and the rates load clean
//                  in the engine at the pin;
//   the table      stays are priced as below the threshold (the garage at 0),
//                  and the page says so;
//   the lines      a stay the engine raised gets its own line, in words.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DICTIONARIES } from '../src/i18n/index.js';
import { blankSpecial, fillNote, hasFillRule, lineWords, planSentences, specialsPlan, stayToTry } from '../src/rates.js';
import { startEngine } from '../scripts/engine-at-pin.js';
import { recordedPlans } from './rates-forms.js';

const t = (language) => (key, values = {}) => {
  const text = DICTIONARIES[language][key];
  assert.ok(typeof text === 'string', `${language}: no words for ${key}`);
  return text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? `{${k}}`));
};
const en = t('en');
const es = t('es');
const docs = recordedPlans('2026-10-13T08:00:00.000Z');
const garage = { id: 'g', name: 'Recorded rates garage', timezone: docs.regular.timezone, currency: 'USD' };
const opts = (name) => ({ garage, spaceClass: 'standard', start: '2026-10-13T08:00:00.000Z', name });
const FILL = {
  id: 'lab-fill', type: 'fill_level', stage: 'ADJUST', space_classes: ['standard'],
  threshold_bp: 8000, percent_bp: 2000, rounding: 'up', raises_specials: 'yes', raises_vip_extra: 'no',
};
const withFill = (plan) => ({ ...plan, rules: [...plan.rules, FILL], adjust_order: plan.adjust_order ? [...plan.adjust_order, FILL.id] : null });

let engine;
before(async () => {
  engine = await startEngine();
});
after(async () => {
  await engine?.stop();
});
const validate = async (plan) => {
  const res = await fetch(`${engine.url}/v1/validate-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan }) });
  return { status: res.status, body: await res.json() };
};

test('the words: the fill rule in his words beside the rates, in both languages, and never "a part these screens can\'t show"', () => {
  const plan = withFill(docs.regular);
  const said = planSentences(en, plan, 'en');
  assert.ok(said.some((s) => s.text === 'Above 80% full: time charge +20%'), JSON.stringify(said));
  assert.ok(!said.some((s) => s.key === 'other'));
  assert.ok(planSentences(es, plan, 'es').some((s) => s.text === 'Por encima del 80% de ocupación: cargo por tiempo +20%'));
  // CONTROL: rates without one say nothing of it.
  assert.ok(!planSentences(en, docs.regular, 'en').some((s) => /full/.test(s.text)));
});

test('the words: the VIP extra as a flat amount and as a percent, with what is not charged yet', () => {
  const flat = { ...docs.regular, rules: [...docs.regular.rules, { id: 'lab-vip-extra', type: 'space_surcharge', stage: 'SURCHARGE', space_classes: ['vip'], surcharge_minor: 500 }] };
  const percent = { ...docs.regular, rules: [...docs.regular.rules, { id: 'lab-vip-extra', type: 'space_surcharge', stage: 'SURCHARGE', space_classes: ['vip'], amount: { kind: 'percent', percent_bp: 1000 }, rounding: 'up' }] };
  assert.match(planSentences(en, flat, 'en').find((s) => s.key === 'lab-vip-extra').text, /^VIP and nested spots: \$5\.00 more for each stay\. Not charged differently until/);
  assert.match(planSentences(en, percent, 'en').find((s) => s.key === 'lab-vip-extra').text, /^VIP and nested spots: 10% more on the time charge\./);
});

test('the order: a special added, changed or removed on rates with a fill rule keeps it, last, and the rates load clean', async () => {
  const base = withFill(docs.other);
  const start = await validate(base);
  assert.deepEqual([start.status, start.body.findings], [200, []], 'the starting rates load, with nothing found');
  const windows = base.rules.filter((r) => r.type === 'time_window');
  const added = specialsPlan(base, { kind: 'add', special: { ...windowsToSpecial(windows) } }, opts('added'));
  const removed = specialsPlan(base, { kind: 'remove', index: 0 }, opts('removed'));
  for (const [what, plan] of [['added', added], ['removed', removed]]) {
    const adjust = plan.rules.filter((r) => r.stage === 'ADJUST').map((r) => r.id);
    assert.deepEqual([...plan.adjust_order].sort(), [...adjust].sort(), `${what}: the order names every ADJUST rule`);
    assert.equal(plan.adjust_order.at(-1), FILL.id, `${what}: the fill rule last, on what is left`);
    const checked = await validate(plan);
    assert.deepEqual([checked.status, checked.body.findings], [200, []], `${what}: ${JSON.stringify(checked.body).slice(0, 300)}`);
    assert.ok(hasFillRule(plan), `${what}: the fill rule is still there`);
  }
  // The control: the order as it was before this round (the specials only) is refused by the engine.
  const old = { ...added, adjust_order: added.adjust_order.filter((id) => id !== FILL.id) };
  assert.equal((await validate(old)).status, 400);
});

/** A special the form would add: 10% off, every day, in by 07:00 to 10:00, out by 18:00. */
function windowsToSpecial() {
  return {
    ...blankSpecial('everyDay'), name: 'Morning', enterFrom: '07:00', enterBy: '10:00', leaveBy: '18:00', nextDay: false,
    charge: 'adjust', adjust: { direction: 'discount', kind: 'percent', value: '10', rounding: 'down' },
  };
}

test('the table: rates with a fill rule price each stay as below it, and the page says so; others are asked as they were', () => {
  const plan = withFill(docs.regular);
  assert.deepEqual(stayToTry(plan, { entry: '2030-01-05T10:00', exit: '2030-01-05T12:00' }), { entry: '2030-01-05T10:00', exit: '2030-01-05T12:00', occupancy_at_entry_bp: 0 });
  assert.deepEqual(stayToTry(docs.regular, { entry: '2030-01-05T10:00', exit: '2030-01-05T12:00' }), { entry: '2030-01-05T10:00', exit: '2030-01-05T12:00' });
  assert.equal(fillNote(en, plan, 'en'), 'The prices here are for a car that came in when the garage was below 80% full. At 80% full or more, the time charge is 20% more.');
  assert.equal(fillNote(en, docs.regular, 'en'), null);
});

test('the lines: a stay the engine raised has its own line in words, the amount the engine added', async () => {
  const plan = withFill(docs.regular);
  const res = await fetch(`${engine.url}/v1/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plans: [plan], currency: 'USD', space_class: 'standard', entry_at: '2030-01-05T15:00:00Z', exit_at: '2030-01-05T17:00:00Z', occupancy_at_entry_bp: 8000 }),
  });
  const quote = await res.json();
  assert.equal(res.status, 200, JSON.stringify(quote));
  const added = quote.breakdown.find((l) => l.code === 'fill_level.applied');
  assert.ok(added && added.delta_minor > 0);
  const { lines } = lineWords(en, { rate_lines: quote.breakdown, tax_lines: [], minutes: 120 }, plan, {}, 'USD', 'en');
  const line = lines.find((l) => l.words === 'Garage 80% full or more: time charge +20%');
  assert.ok(line, JSON.stringify(lines));
  assert.equal(line.minor, added.delta_minor);
  assert.equal(lines.reduce((a, l) => a + l.minor, 0), quote.fee_minor, 'the lines add up to the fee');
});
