// Stuck stays (platform 0043): what the page says about a listed stay, what
// it sends to end one, and how the platform's refusals become words.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, problemKey } from '../src/api.js';
import { DICTIONARIES, translate } from '../src/i18n/index.js';
import { moneyText } from '../src/rates.js';
import { endedWords, hoursTyped, leftAtTyped, passWords, plateParts, reasonProblem, whyListed } from '../src/stuck.js';

const T = (language) => (key, values) => translate(language, key, values);
const garage = { id: 'a1000000-0000-4000-8000-000000000001', timezone: 'America/New_York', currency: 'USD' };
const stay = { id: 'c1000000-0000-4000-8000-000000000001', entered_at: '2026-03-08T14:05:30.000Z' };
const NOW = Date.parse('2026-03-10T20:00:00Z');

function fakeFetch(answer) {
  const asked = [];
  const fn = async (url, init) => {
    asked.push({ url, init });
    const a = typeof answer === 'function' ? answer(url, init) : answer;
    return { status: a.status, ok: a.status >= 200 && a.status < 300, text: async () => JSON.stringify(a.body) };
  };
  return { fn, asked };
}
async function problemOf(promise) {
  try {
    await promise;
  } catch (p) {
    return p;
  }
  assert.fail('no problem was thrown');
}

test('the car as read: the whole plate, the part the lane was sure of, a ticket, or no plate at all', () => {
  for (const language of ['en', 'es']) {
    const t = T(language);
    assert.deepEqual(plateParts(t, { plate: 'ABC1234', plate_whole: true }), { stored: ['ABC1234'], words: null });
    assert.deepEqual(plateParts(t, { plate: 'AB?12', plate_whole: false }), { stored: ['AB?12'], words: t('stuck.platePart') });
    assert.deepEqual(plateParts(t, { plate: null, plate_whole: false, ticket: true }), { stored: [], words: t('stuck.ticket') });
    assert.deepEqual(plateParts(t, { plate: null, plate_whole: false, ticket: false, unread: true }), { stored: [], words: t('stuck.unread') });
  }
});

test('why a stay is listed: missed on the last walk, or older than the garage\'s own hours', () => {
  const t = T('en');
  assert.equal(whyListed(t, { why: 'not_seen_on_walk' }, 24), t('stuck.whyWalk'));
  assert.equal(whyListed(t, { why: 'old' }, 24), 'Inside more than 24 hours.');
  assert.equal(whyListed(t, { why: 'old' }, 1), t('stuck.whyOldOne'));
});

test('the garage\'s hours as typed: a whole number from 1 to 2160, or nothing is sent', () => {
  assert.equal(hoursTyped(' 48 '), 48);
  assert.equal(hoursTyped('1'), 1);
  assert.equal(hoursTyped('2160'), 2160);
  for (const typed of ['', '0', '2161', '1.5', '-3', 'twelve', '1e3']) assert.equal(hoursTyped(typed), null, typed);
});

test('a reason is required, on one line, at most what the platform keeps; anything else typed is kept as it is', () => {
  assert.equal(reasonProblem(''), 'reasonRequired');
  assert.equal(reasonProblem('   '), 'reasonRequired');
  assert.equal(reasonProblem('x'.repeat(501)), 'reasonRequired');
  assert.equal(reasonProblem('two\nlines'), 'reasonOneLine');
  assert.equal(reasonProblem('tab\there'), 'reasonOneLine');
  assert.equal(reasonProblem('<b>Backed out</b> & left'), null);
});

test('when the car left, typed on the garage\'s clock: sent as that instant; never before it came in, never still to come', () => {
  // 9:00 PM in New York on March 9 is 02:00 UTC on March 10 (EDT starts March 8, 2026).
  assert.deepEqual(leftAtTyped('2026-03-09T22:00', stay, garage, NOW), { at: '2026-03-10T02:00:00.000Z' });
  // The minute it came in: sent as the moment it came in, not before it.
  assert.deepEqual(leftAtTyped('2026-03-08T10:05', stay, garage, NOW), { at: stay.entered_at });
  assert.deepEqual(leftAtTyped('2026-03-08T10:04', stay, garage, NOW), { problem: 'leftBeforeEntry' });
  assert.deepEqual(leftAtTyped('2026-03-10T16:01', stay, garage, NOW), { problem: 'leftInFuture' });
  assert.deepEqual(leftAtTyped('2026-03-08T02:30', stay, garage, NOW), { problem: 'leftTimeOdd' }, 'a time the clocks skip');
  assert.deepEqual(leftAtTyped('', stay, garage, NOW), { problem: 'leftTimeOdd' });
});

test('what became of the stay: what it owes in money, or that it owes nothing -- never that a card was charged', () => {
  for (const language of ['en', 'es']) {
    const t = T(language);
    const owes = endedWords(t, 'ended', { owedMinor: 7500, currency: 'USD', covered: false, priced: true }, language);
    assert.match(owes, /75[.,]00/);
    assert.equal(owes, t('stuck.doneOwes', { amount: moneyText(7500, 'USD', language) }));
    assert.equal(endedWords(t, 'ended', { owedMinor: 0, currency: 'USD', covered: true, priced: true }, language), t('stuck.doneCovered'));
    assert.equal(endedWords(t, 'ended', { owedMinor: 0, currency: 'USD', covered: false, priced: true }, language), t('stuck.doneOwesNothing'));
    assert.equal(endedWords(t, 'ended', { owedMinor: null, currency: 'USD', covered: false, priced: false }, language), t('stuck.doneNotPriced'));
    assert.equal(endedWords(t, 'abandoned', { owedMinor: null, currency: 'USD', covered: false, priced: false }, language), t('stuck.doneAbandoned'));
  }
});

test('ending a stay sends the outcome, the reason and, for a car that left, its time -- never a time for one written off', async () => {
  const answer = { status: 200, body: { stay: { id: stay.id, entered_at: stay.entered_at, exit_at: '2026-03-10T02:00:00.000Z', ended: { owed: { outcome: 'transient', fee_minor: 3000, refused: false, pass_unasked: false } }, owed_minor: 3000, pass_unasked: false, currency: 'USD' } } };
  const { fn, asked } = fakeFetch(answer);
  const client = createClient({ fetch: fn });
  const result = await client.endStay(garage.id, stay.id, { outcome: 'ended', reason: 'Backed out', leftAt: '2026-03-10T02:00:00.000Z' });
  assert.deepEqual(result, { owedMinor: 3000, currency: 'USD', covered: false, priced: true, priceMinor: 3000, paid: null, passUnasked: false });
  assert.equal(asked[0].url, `/api/v1/garages/${garage.id}/stays/${stay.id}/end`);
  assert.equal(asked[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(asked[0].init.body), { outcome: 'ended', reason: 'Backed out', left_at: '2026-03-10T02:00:00.000Z' });
  await client.endStay(garage.id, stay.id, { outcome: 'abandoned', reason: 'Misread', leftAt: '2026-03-10T02:00:00.000Z' });
  assert.deepEqual(JSON.parse(asked[1].init.body), { outcome: 'abandoned', reason: 'Misread' });
  await client.setStuckAfterHours(garage.id, 48);
  assert.equal(asked[2].init.method, 'PATCH');
  assert.deepEqual(JSON.parse(asked[2].init.body), { stuck_after_hours: 48 });
});

// Platform 0045: a stay that paid at an exit before a person ended it. The platform answers what it
// still owes (owed_minor: the price less what was paid, never below 0); the page shows that figure as
// given, beside the price and what was paid, each named -- it works out none of them.
test('a stay that paid at an exit: what it still owes is the platform\'s figure, shown beside its price and what was paid', async () => {
  const paidAnswer = (owed, fee, paidMinor) => ({ status: 200, body: { stay: { id: stay.id, entered_at: stay.entered_at, exit_at: '2026-03-10T02:00:00.000Z', ended: { owed: { outcome: 'transient', fee_minor: fee, refused: false, pass_unasked: false }, exit_cases: ['e1000000-0000-4000-8000-000000000001'], paid: { exit_id: 'e1000000-0000-4000-8000-000000000001', amount_minor: paidMinor, currency: 'usd' } }, owed_minor: owed, pass_unasked: false, currency: 'USD' } } });
  const rest = await createClient({ fetch: fakeFetch(paidAnswer(1000, 3000, 2000)).fn }).endStay(garage.id, stay.id, { outcome: 'ended', reason: 'x' });
  assert.deepEqual(rest, { owedMinor: 1000, currency: 'USD', covered: false, priced: true, priceMinor: 3000, paid: { amountMinor: 2000, currency: 'USD' }, passUnasked: false });
  for (const language of ['en', 'es']) {
    const t = T(language);
    const m = (minor) => moneyText(minor, 'USD', language);
    assert.equal(endedWords(t, 'ended', rest, language), t('stuck.donePaidOwes', { price: m(3000), paid: m(2000), amount: m(1000) }));
    // The amount shown is the one the platform answered, whatever the price and payment would make it.
    const odd = { ...rest, owedMinor: 1234 };
    assert.match(endedWords(t, 'ended', odd, language), /12[.,]34/);
    // Paid more than the price: the platform says 0, and the page says it owes nothing.
    const over = await createClient({ fetch: fakeFetch(paidAnswer(0, 3000, 3500)).fn }).endStay(garage.id, stay.id, { outcome: 'ended', reason: 'x' });
    assert.equal(endedWords(t, 'ended', over, language), t('stuck.donePaidOwesNothing', { price: m(3000), paid: m(3500) }));
    // Not priced, but paid: no amount owed, and what was paid still said.
    const unpriced = { owedMinor: null, currency: 'USD', covered: false, priced: false, priceMinor: null, paid: { amountMinor: 500, currency: 'USD' }, passUnasked: false };
    assert.equal(endedWords(t, 'ended', unpriced, language), `${t('stuck.doneNotPriced')} ${t('stuck.paidAtExit', { paid: m(500) })}`);
    // Written off after it paid at an exit: it owes nothing, and what was paid is still said.
    assert.equal(endedWords(t, 'abandoned', { ...unpriced, paid: { amountMinor: 500, currency: 'USD' } }, language), `${t('stuck.doneAbandoned')} ${t('stuck.paidAtExit', { paid: m(500) })}`);
  }
});

// Platform 0043: a garage with no exit lane has nowhere to ask about a pass; the platform says so on
// the end's answer (pass_unasked), and the page says it beside what the stay owes.
test('a pass not asked because the garage has no exit lane: said beside what is owed; never for a stay written off', async () => {
  const unasked = { status: 200, body: { stay: { id: stay.id, entered_at: stay.entered_at, exit_at: '2026-03-10T02:00:00.000Z', ended: { owed: { outcome: 'transient', fee_minor: 3000, refused: false, pass_unasked: true } }, owed_minor: 3000, pass_unasked: true, currency: 'USD' } } };
  const result = await createClient({ fetch: fakeFetch(unasked).fn }).endStay(garage.id, stay.id, { outcome: 'ended', reason: 'x' });
  assert.equal(result.passUnasked, true);
  const writtenOff = { status: 200, body: { stay: { id: stay.id, entered_at: stay.entered_at, exit_at: '2026-03-10T02:00:00.000Z', ended: {}, owed_minor: null, pass_unasked: null, currency: 'USD' } } };
  const off = await createClient({ fetch: fakeFetch(writtenOff).fn }).endStay(garage.id, stay.id, { outcome: 'abandoned', reason: 'x' });
  assert.equal(off.passUnasked, false);
  for (const language of ['en', 'es']) {
    const t = T(language);
    assert.equal(passWords(t, 'ended', result), t('stuck.passUnasked'));
    assert.notEqual(t('stuck.passUnasked'), 'stuck.passUnasked');
    assert.equal(passWords(t, 'ended', { ...result, passUnasked: false }), null);
    assert.equal(passWords(t, 'abandoned', { ...result, passUnasked: true }), null);
  }
});

test('the list reads the garage\'s hours with it; an answer without them is not shown', async () => {
  const ok = createClient({ fetch: fakeFetch({ status: 200, body: { older_than_hours: 24, stuck_after_hours: 24, stays: [] } }).fn });
  assert.deepEqual(await ok.stuckStays(garage.id), { stuckAfterHours: 24, stays: [] });
  const odd = createClient({ fetch: fakeFetch({ status: 200, body: { stays: [] } }).fn });
  assert.equal((await problemOf(odd.stuckStays(garage.id))).kind, 'unexpected');
});

test('each refusal of ending a stay, or of the hours, has words of its own, in both languages', async () => {
  const cases = [
    [400, { error: 'stuck_after_hours must be a whole number of hours from 1 to 2160 when given', code: 'stuck_after_hours_invalid' }, 'stuckHoursRefused'],
    [404, { error: 'stay not found', code: 'stay_not_found' }, 'stayGone'],
    [409, { error: 'this stay is not open: it has already been closed or ended', code: 'stay_not_open' }, 'stayNotOpen'],
    [400, { error: 'reason is required: why the stay is ended, at most 500 characters; no plate -- the reason goes to the change log', code: 'reason_required' }, 'reasonRequired'],
    [400, { error: 'reason must be words on one line: no line breaks or control characters', code: 'reason_invalid' }, 'reasonOneLine'],
    [400, { error: 'left_at is before the stay came in', code: 'left_at_before_entry' }, 'leftBeforeEntry'],
    [409, { error: 'left_at is 3600s ahead', code: 'clock_skew' }, 'leftInFuture'],
    // Platform 0045: an exit lane's case open on the stay, its payment at Stripe (src/app.js, word for word).
    [409, { error: 'a card is being authorised at an exit for this stay: ask again in a few seconds', code: 'payment_in_progress' }, 'stayPaymentInProgress'],
    [409, { error: 'a car reached an exit or started paying on this stay just now: ask again', code: 'stay_payment_moving' }, 'stayPaymentMoving'],
    [503, { error: "this stay's exit payment could not be settled with Stripe now; nothing was changed, ask again", code: 'payment_unsettled' }, 'stayPaymentUnsettled'],
    [409, { error: "Stripe took an amount other than this case's fee: a person decides", code: 'payment_amount_mismatch' }, 'stayPaymentMismatch'],
  ];
  const seen = new Set();
  for (const [status, body, kind] of cases) {
    const client = createClient({ fetch: fakeFetch({ status, body }).fn });
    const problem = await problemOf(client.endStay(garage.id, stay.id, { outcome: 'ended', reason: 'x' }));
    assert.equal(problem.kind, kind, body.code);
    for (const language of ['en', 'es']) {
      const words = translate(language, problemKey(problem));
      assert.notEqual(words, translate(language, 'problem.unexpected'), `${language} ${body.code}`);
      assert.doesNotMatch(words, /[a-z]+_[a-z_]+|\b[1-5]\d\d\b/, `${language} ${body.code}: "${words}"`);
      seen.add(`${language}:${words}`);
    }
  }
  assert.equal(seen.size, cases.length * 2, 'two refusals share their words');
});

test('the refusal a car at an exit lane once got is gone: a person\'s end closes that lane\'s case (platform 0045)', async () => {
  const client = createClient({ fetch: fakeFetch({ status: 409, body: { error: 'a car is at an exit lane on this stay: let it out there instead', code: 'stay_at_an_exit' } }).fn });
  assert.equal((await problemOf(client.endStay(garage.id, stay.id, { outcome: 'ended', reason: 'x' }))).kind, 'unexpected');
  for (const language of ['en', 'es']) {
    assert.equal(Object.hasOwn(DICTIONARIES[language], 'problem.stayAtExit'), false, `${language}: no words left for it`);
    assert.equal(Object.hasOwn(DICTIONARIES[language], 'changes.refusal.stay_at_an_exit'), false, `${language}: nor in the change log`);
  }
});

test('the payment answers are this route\'s own: another route meeting the same code is not told a stay\'s words', async () => {
  const body = { error: 'a card is being authorised for this exit: ask again in a few seconds', code: 'payment_in_progress' };
  const client = createClient({ fetch: fakeFetch({ status: 409, body }).fn });
  assert.equal((await problemOf(client.setStuckAfterHours(garage.id, 48))).kind, 'unexpected');
});

test('the reason field says, in both languages, that the reason goes to the change log: no plate, no personal details', () => {
  for (const language of ['en', 'es']) {
    const words = translate(language, 'stuck.reasonPrivate');
    assert.notEqual(words, 'stuck.reasonPrivate');
    assert.match(words, language === 'en' ? /change log/ : /registro de cambios/);
    assert.match(words, language === 'en' ? /plate/ : /placa/);
    assert.match(words, language === 'en' ? /personal details/ : /datos personales/);
  }
});
