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
import { PLATFORM_QUIET_MINUTES } from './files-fixtures.js';

const garage = { timezone: 'America/New_York' };
const NOW = new Date('2026-03-10T20:00:00Z'); // 4:00 PM in New York
const MINUTE = 60 * 1000;
const ago = (ms) => new Date(NOW - ms).toISOString();
const computer = (name, { seen = null, cancelled = null } = {}) => ({ id: name, name, last_seen_at: seen, revoked_at: cancelled });

for (const language of ['en', 'es']) {
  const t = (key, values) => translate(language, key, values);
  const words = DICTIONARIES[language];
  const at = (iso) => garageTime(iso, garage.timezone, language, NOW);
  // The platform's setting, as its lanes read gives it (PLATFORM_QUIET_MINUTES).
  const lane = (devices) => laneWords(t, { devices }, garage, language, NOW, PLATFORM_QUIET_MINUTES);

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

// ── U6 check 6: every state of Taxes and fees and Getting paid, worded true ──
// Each state the platform can return has its own sentence, and each sentence
// says what is true of its state and of no other: the garage has not said,
// no list is in force yet, it charges no tax, or it charges these; no
// account, one that can take cards, one that cannot yet; each fact of the
// account in each state Stripe can report, and whether it was checked.
import { stateWords } from '../src/taxes.js';
import { accountFacts, accountWords, driversAnswer, takesCards } from '../src/payments.js';

const U6_TRUE = {
  'taxes.none': [/hasn't said|has not said/i, /no lo ha indicado/i],
  'taxes.notYet': [/no list is in force yet/i, /todavía no hay una lista vigente/i],
  'taxes.noTax': [/charges no tax/i, /no cobra impuestos/i],
  'taxes.linesOne': [/one tax or fee is added/i, /se suma un impuesto o cargo/i],
  'taxes.linesMany': [/taxes and fees are added/i, /se suman \{count\} impuestos/i],
  'paid.noAccount': [/has no payment account/i, /no tiene una cuenta de pagos/i],
  'paid.canTake': [/^This garage can take cards/i, /^Este garaje puede cobrar con tarjeta/i],
  'paid.cannotYet': [/can't take cards yet|cannot take cards yet/i, /todavía no puede cobrar/i],
  'paid.passOnly': [/pass holders only.*takes no cards/i, /solo recibe a quienes tienen pase.*no cobra con tarjeta/i],
  'readers.passOnly': [/pass holders only.*no card readers/i, /solo recibe a quienes tienen pase.*no tiene lectores/i],
  'problem.cardsNotSetUp': [/card payments aren't set up/i, /pagos con tarjeta todavía no están activados/i],
  'paid.card.active': [/^On$/, /^Activados$/],
  'paid.card.inactive': [/^Off$/, /^Desactivados$/],
  'paid.card.pending': [/waiting/i, /espera/i],
  'paid.card.unrequested': [/not asked/i, /no solicitados/i],
  'paid.notCheckedYet': [/not checked/i, /sin revisar/i],
  'paid.charges.yes': [/^Allowed$/, /^Permitidos$/],
  'paid.charges.no': [/not allowed yet/i, /todavía no permitidos/i],
  'paid.details.yes': [/all given/i, /completos/i],
  'paid.details.no': [/not finished/i, /sin terminar/i],
};

test('U6 each state sentence says what is true of its state, and of no other, in both languages', () => {
  const wrong = [];
  for (const [key, [en, es]] of Object.entries(U6_TRUE)) {
    for (const [language, re] of [['en', en], ['es', es]]) {
      const said = DICTIONARIES[language][key];
      if (!re.test(said)) wrong.push(`${language} ${key}: "${said}" does not say it`);
      for (const [other, pair] of Object.entries(U6_TRUE)) {
        if (other !== key && other.split('.').slice(0, 2).join('.') !== key.split('.').slice(0, 2).join('.') && pair[language === 'en' ? 0 : 1].test(said) && !/^paid\.(card|charges|details)\./.test(other)) {
          wrong.push(`${language} ${key}: "${said}" says what ${other} says`);
        }
      }
    }
  }
  assert.deepEqual(wrong, []);
});

const TAX_NOW = new Date('2026-06-01T12:00:00Z');
const taxList = (effective_from, rules = []) => ({ effective_from, rule_count: rules.length, rules });
const lineOf = (id) => ({ id, label: id, percent_bp: 100, rounding: 'up', sequence: 1 });
const account = (over = {}) => ({
  garage_id: 'g', account_id: 'acct_x', card_payments: 'active', card_payments_read_at: '2026-05-01T14:00:00Z',
  charges_enabled: true, charges_enabled_read_at: '2026-05-01T14:00:00Z', details_submitted: true, details_submitted_read_at: '2026-05-01T14:00:00Z', ...over,
});

for (const language of ['en', 'es']) {
  const t = (key, values) => translate(language, key, values);
  const words = DICTIONARIES[language];
  const g = { timezone: 'America/New_York' };

  test(`${language}: U6 every state of a garage's taxes: not said, none yet in force, no tax, one line, several, a list that starts later`, () => {
    assert.equal(stateWords(t, [], g, language, TAX_NOW), words['taxes.none']);
    if (language === 'en') assert.equal(words['taxes.none'], "This garage hasn't said yet.");
    const later = stateWords(t, [taxList('2026-09-01T04:00:00.000000Z', [lineOf('a')])], g, language, TAX_NOW);
    assert.ok(later.startsWith(words['taxes.notYet'].split('{time}')[0]) && later !== words['taxes.none'] && later !== words['taxes.noTax'], later);
    assert.equal(stateWords(t, [taxList('2026-01-01T05:00:00.000000Z')], g, language, TAX_NOW), words['taxes.noTax']);
    if (language === 'en') assert.equal(words['taxes.noTax'], 'This garage charges no tax.');
    assert.equal(stateWords(t, [taxList('2026-01-01T05:00:00.000000Z', [lineOf('a')])], g, language, TAX_NOW), words['taxes.linesOne']);
    assert.equal(stateWords(t, [taxList('2026-01-01T05:00:00.000000Z', [lineOf('a'), lineOf('b')])], g, language, TAX_NOW), t('taxes.linesMany', { count: 2 }));
    // A list starting later never stands for the one in force now.
    assert.equal(stateWords(t, [taxList('2026-01-01T05:00:00.000000Z'), taxList('2026-09-01T04:00:00.000000Z', [lineOf('a')])], g, language, TAX_NOW), words['taxes.noTax']);
  });

  test(`${language}: U6 every state of a payment account: none, can take cards, and each way it cannot yet`, () => {
    assert.equal(accountWords(t, null), words['paid.noAccount']);
    assert.equal(accountWords(t, account()), words['paid.canTake']);
    for (const over of [{ card_payments: 'inactive' }, { card_payments: 'pending' }, { card_payments: 'unrequested' }, { charges_enabled: false }, { card_payments: null, charges_enabled: null }, { card_payments: 'active', charges_enabled: false }]) {
      assert.equal(accountWords(t, account(over)), words['paid.cannotYet'], JSON.stringify(over));
      assert.equal(takesCards(account(over)), false, JSON.stringify(over));
    }
  });

  test(`${language}: U6 each fact of the account in each state, and when it was checked`, () => {
    const fact = (over, key) => accountFacts(t, account(over), g, language).find((f) => f.key === key);
    for (const state of ['active', 'pending', 'inactive', 'unrequested']) assert.equal(fact({ card_payments: state }, 'paid.cards').value, words[`paid.card.${state}`]);
    assert.equal(fact({ card_payments: 'restricted_soon' }, 'paid.cards').value, words['paid.card.other']);
    assert.equal(fact({ card_payments: null, card_payments_read_at: null }, 'paid.cards').value, words['paid.notCheckedYet']);
    assert.equal(fact({ card_payments: null, card_payments_read_at: null }, 'paid.cards').checked, words['paid.notChecked']);
    assert.equal(fact({ charges_enabled: true }, 'paid.charges').value, words['paid.charges.yes']);
    assert.equal(fact({ charges_enabled: false }, 'paid.charges').value, words['paid.charges.no']);
    assert.equal(fact({ details_submitted: false }, 'paid.details').value, words['paid.details.no']);
    assert.equal(fact({ details_submitted: true }, 'paid.details').value, words['paid.details.yes']);
    // Checked at 10:00 am in New York, never in this computer's zone.
    assert.equal(fact({}, 'paid.cards').checked, t('paid.checkedAt', { time: new Intl.DateTimeFormat(language === 'es' ? 'es-US' : 'en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-05-01T14:00:00Z')) }));
  });
}

test('U6 who the pages are for: any driver, pass holders only, or not answered yet', () => {
  assert.equal(driversAnswer(true), 'any');
  assert.equal(driversAnswer(false), 'passOnly');
  assert.equal(driversAnswer(null), 'unanswered');
  assert.equal(driversAnswer(undefined), 'unanswered');
});
