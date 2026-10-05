import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICTIONARIES, translate } from '../src/i18n/index.js';
import { ACTIONS, FIELDS, STORED, changedFields, whatPieces, whoPieces, whyWords } from '../src/changes.js';

// U4 fix round, findings 3-6: every line of the change log, of every kind the
// platform writes, said in words that are true and that a garage owner reads:
//   4  no value is shown as the code the platform keeps -- a time zone as
//      people say it, every setting's choices in words, in both languages;
//   5  a refused attempt says what was TRIED, never that it was done, and its
//      reason is true in whichever log it is read;
//   3  every line names who: never a blank;
//   6  no sentence ends twice ("a.m..").

const GARAGE = { id: 'g', name: 'Harbor Garage', timezone: 'America/New_York' };
const T = (language) => (key, values) => translate(language, key, values);

/**
 * One line of every action the platform writes, with the fields and values
 * its routes put in before and after (platform src/app.js, src/lanes.js,
 * src/stripeAccount.js, src/terminal.js, src/signIn.js).
 */
const lane = { kind: 'lane', id: 'l', name: 'North gate' };
const LINES = [
  ['garage.create', null, { name: 'Harbor Garage', timezone: 'America/New_York', currency: 'USD', default_action: 'allow', space_class: 'standard', transient_available: null }],
  ['garage.update', { default_action: 'allow', transient_available: null }, { default_action: 'deny', transient_available: true }],
  ['garage.update', { transient_available: true }, { transient_available: false }],
  ['garage.open', { open: false }, { open: true }],
  ['garage.pass_links', { garage_pass: null, monthly_billing: null }, { garage_pass: { tenant_id: 't', garage_id: 'g' }, monthly_billing: null }],
  ['garage.validations_link', { validations: null }, { validations: { tenant_id: 't', garage_id: 'g' } }],
  ['payment_account.create', { account: false }, { account: true }],
  ['payment_account.read', { card_payments: null, charges_enabled: null, details_submitted: null }, { card_payments: 'active', charges_enabled: true, details_submitted: true }],
  ['payment_account.read', { card_payments: 'pending', charges_enabled: false, details_submitted: false }, { card_payments: 'inactive', charges_enabled: false, details_submitted: true }],
  ['payment_account.reader_place', null, { place_name: 'Harbor Garage' }],
  ['lane.card_reader_connect', null, { lane: 'North gate', label: 'Exit reader' }],
  ['lane.card_reader_disconnect', { label: 'Exit reader' }, null],
  ['lane.add', null, { name: 'North gate', direction: 'entry' }],
  ['lane.rename', { name: 'Old' }, { name: 'North gate' }],
  ['lane.remove', { name: 'North gate', direction: 'exit' }, null],
  ['lane.close', { state: 'open' }, { state: 'closed', reason: 'full', message: 'Garage full', last_open_overridden: true }],
  ['lane.close_again', { state: 'closed', reason: 'full', message: 'Garage full' }, { state: 'closed', reason: 'everyone', message: 'Closed tonight' }],
  ['lane.reopen', { state: 'closed', reason: 'everyone', message: 'Closed tonight' }, { state: 'open' }],
  ['computer.connect', null, { name: 'East pi', lane: 'North gate' }],
  ['computer.cancel', { access: 'connected', lane: 'North gate' }, { access: 'cancelled', lane: 'North gate' }],
  ['rate_plan.add', null, { plan_version: 'Spring rates', effective_from: '2026-03-01T05:00:00Z' }],
  ['tax_set.add', null, { effective_from: '2026-01-01T05:00:00Z', taxes: [{ label: 'City parking tax', percent_bp: 1850 }] }],
  ['tax_set.add', null, { effective_from: '2026-01-01T05:00:00Z', taxes: [] }],
  ['key.cancel', { access: 'active' }, { access: 'cancelled' }],
  ['language.change', { language: 'en' }, { language: 'es' }],
];
const done = (action, before, after) => ({ outcome: 'done', action, before, after, who: { kind: 'owner', name: 'owner@example.com' }, subject: lane, refusal: null });

/** Every raw value a line holds that is not someone's typed text: none may be shown as it is. */
function rawValues(line) {
  const out = [];
  for (const side of [line.before ?? {}, line.after ?? {}]) {
    for (const [field, value] of Object.entries(side)) {
      if (typeof value === 'string' && !STORED.has(field) && !(field === 'space_class' && value !== 'standard')) out.push(value);
    }
  }
  return out;
}

test('4 NO RAW VALUES: every field of every change kind, both languages, said in words -- never "America/New_York", "allow" or "USD"', () => {
  assert.deepEqual(LINES.map(([a]) => a).filter((a) => !ACTIONS.includes(a)), [], 'an action here the screens have no words for');
  const fieldsSeen = new Set(LINES.flatMap(([, b, a]) => [...Object.keys(b ?? {}), ...Object.keys(a ?? {})]));
  assert.deepEqual(FIELDS.filter((f) => !fieldsSeen.has(f)), [], 'a field the screens have words for that no line here holds');
  for (const language of ['en', 'es']) {
    const t = T(language);
    const known = new Set(Object.values(DICTIONARIES[language]));
    for (const [action, before, after] of LINES) {
      const line = done(action, before, after);
      const fields = changedFields(t, line, GARAGE, language);
      for (const f of fields) {
        assert.ok(known.has(f.field), `${language} ${action}: the field "${f.field}" is not from the dictionaries`);
        for (const side of [f.before, f.after]) {
          if (side.stored !== undefined) continue;
          const said = side.words;
          for (const raw of rawValues(line)) assert.notEqual(said, raw, `${language} ${action} ${f.field}: shown as its code "${raw}"`);
          assert.doesNotMatch(said, /\/|^[a-z]+(_[a-z]+)+$|^[A-Z]{3}$/, `${language} ${action} ${f.field}: "${said}" is a code`);
        }
      }
      const zone = fields.find((f) => f.field === t('changes.field.timezone'));
      if (zone) assert.equal(zone.after.words, language === 'es' ? 'hora oriental' : 'Eastern Time', `${language}: the zone as people say it`);
    }
  }
});

test('4 a value the platform may add later is "another value", never its code', () => {
  for (const language of ['en', 'es']) {
    const t = T(language);
    const [f] = changedFields(t, done('payment_account.read', { card_payments: 'restricted_soon' }, { card_payments: 'active' }), GARAGE, language);
    assert.equal(f.before.words, t('changes.value.another'));
    const [z] = changedFields(t, done('garage.create', null, { timezone: 'Not/AZone' }), GARAGE, language);
    assert.equal(z.after.words, t('changes.value.anotherZone'));
  }
});

test('5 EVERY LINE IS TRUE: a refused attempt says what was tried, never that it was done; its reason is true in whichever log it is read', () => {
  for (const language of ['en', 'es']) {
    const t = T(language);
    for (const action of [...ACTIONS, 'unknown.write']) {
      const refused = { outcome: 'refused', action, who: { kind: 'owner', name: 'owner@example.com' }, subject: lane, refusal: 'bad_request' };
      const tried = whatPieces(t, refused)[0].words;
      const didIt = whatPieces(t, { ...refused, outcome: 'done' })[0].words;
      // The old rates route is always refused: its words already say it was tried.
      if (action !== 'rates.retired') assert.notEqual(tried, didIt, `${language} ${action}: a refused attempt reads like the change was made ("${tried}")`);
      assert.ok(tried.startsWith(language === 'es' ? 'Intentó' : 'Tried'), `${language} ${action}: "${tried}"`);
    }
    assert.notEqual(whatPieces(t, { outcome: 'refused', action: 'unknown.write', subject: lane, who: { kind: 'owner', name: 'x' } })[0].words, t('changes.action.other'), 'never "Made a change"');
    // Another account aimed at THIS owner's garage: it is the owner's, not theirs -- never "not there".
    for (const refusal of ['not_found', 'garage_not_found', 'lane_not_found', 'computer_not_found', 'key_not_found']) {
      const theirs = whyWords(t, { outcome: 'refused', refusal, who: { kind: 'outside', name: null } });
      assert.equal(theirs.toLowerCase(), t('changes.refusal.notTheirs').toLowerCase(), `${language} ${refusal}, in the aimed-at garage's log`);
      const mine = whyWords(t, { outcome: 'refused', refusal, who: { kind: 'owner', name: 'x' } });
      assert.equal(mine.toLowerCase(), t(`changes.refusal.${refusal}`).toLowerCase(), `${language} ${refusal}, in the asker's own log`);
    }
  }
});

test('3 EVERY LINE NAMES WHO: an owner, a key, another account, nobody -- never blank, named or unnamed', () => {
  for (const language of ['en', 'es']) {
    const t = T(language);
    for (const who of [
      { kind: 'owner', name: 'owner@example.com' }, { kind: 'owner', name: null },
      { kind: 'key', name: 'Front desk key' }, { kind: 'key', name: null }, { kind: 'key', name: '' },
      { kind: 'outside', name: null }, { kind: 'nobody', name: null },
    ]) {
      const said = whoPieces(t, { who }).map((p) => p.words ?? p.stored).join('').trim();
      assert.ok(said.length > 0, `${language} ${who.kind} ${JSON.stringify(who.name)}: blank`);
      assert.notEqual(said, t('changes.who.key').replace('{name}', '').trim(), `${language}: "${said}" names no key`);
      if (who.name) assert.ok(said.includes(who.name), `${language}: ${who.kind} named`);
      // Each kind is said as itself: a key with no name is still a key, never "someone not signed in".
      const want = { owner: who.name || t('changes.who.ownerUnnamed'), key: who.name ? null : t('changes.who.keyUnnamed'), outside: t('changes.who.outside'), nobody: t('changes.who.nobody') }[who.kind];
      if (want !== null) assert.equal(said, want, `${language} ${who.kind} ${JSON.stringify(who.name)}: "${said}" names no key`);
    }
  }
});

test('6 NO SENTENCE ENDS TWICE: every entry filled with a value that already ends in a full stop ends once, in both languages', () => {
  for (const language of ['en', 'es']) {
    for (const [key, text] of Object.entries(DICTIONARIES[language])) {
      const names = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      if (!names.length) continue;
      const filled = translate(language, key, Object.fromEntries(names.map((n) => [n, '6:41 a.m.'])));
      assert.doesNotMatch(filled, /(?<!\.)\.\.(?!\.)/, `${language} ${key}: "${filled}"`);
    }
  }
});
