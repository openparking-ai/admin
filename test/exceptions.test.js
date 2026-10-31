// The cars a person let out (platform 0048): what the Exceptions page says
// about a day and about one car, from the platform's own records -- the
// stand-in's stories are the recording's (test/exceptions-fixtures.js). Every
// time on the garage's clock; every text the platform kept as stored text;
// the gate agent's messages address by address, its calls step by step; a
// gate agent not set up, or not reached, said so; no code on screen; and the
// two reads only ever asked for, never anything that takes money.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DICTIONARIES, translate } from '../src/i18n/index.js';
import { createClient, letOutPicturePath, problemKey } from '../src/api.js';
import {
  AUTHORISATIONS, AUTHORITIES, CALL_CASES, CALL_OUTCOMES, COPY_STATES, DELIVERY_STATES, KINDS, LANE_KINDS, MESSAGE_CODES, READER_REFUSALS,
  PICTURE_KINDS, SINK_KINDS, TARGET_KINDS, TRANSITIONS, clockSaid, copyPieces, dayOn, daySaid, gateLine, gateRecords, isDay, kindPieces,
  newestFirst, piecesText, picturesOf, sourceState, storyOf, whoPieces,
} from '../src/exceptions.js';
import { moneyText } from '../src/rates.js';
import { exceptionStories } from './exceptions-fixtures.js';
import { owners } from './stub-platform.js';

const A = owners().a;
const HARBOR = A.garages[0];
const ZONE = HARBOR.timezone;
const [ENTRY, EXIT] = A.lanes[HARBOR.id];
const LANES = A.lanes[HARBOR.id];
// The first let out at 4:00 PM in New York on 10 March 2026; the others 20, 40 and 50 minutes later.
const AT = Date.parse('2026-03-10T20:00:00Z');
const MINUTE = 60_000;
const stories = (at = [AT, AT + 20 * MINUTE, AT + 40 * MINUTE, AT + 50 * MINUTE]) =>
  exceptionStories({ garageId: HARBOR.id, exitLaneId: EXIT.id, entryLaneId: ENTRY.id, device: EXIT.devices[0], owner: A.email, at });
const [OWING, OPENED, UNREACHED, BLANKED] = stories();
const text = (pieces) => piecesText(pieces);
const recorded = JSON.parse(readFileSync(new URL('./platform-shapes.json', import.meta.url), 'utf8'));

test('a day: a calendar day, the days around it, said in words; nothing else is a day', () => {
  assert.equal(dayOn('2026-03-01', -1), '2026-02-28');
  assert.equal(dayOn('2026-12-31', 1), '2027-01-01');
  // Across the clock change: calendar days, no hours.
  assert.equal(dayOn('2026-03-08', 1), '2026-03-09');
  for (const bad of ['2026-02-30', '2026-2-03', 'yesterday', '', null, '2026-03-10T00:00']) assert.equal(isDay(bad), false, String(bad));
  assert.equal(isDay('2024-02-29'), true);
  assert.equal(daySaid('2026-03-10', 'en'), 'Tuesday, March 10, 2026');
  assert.equal(daySaid('2026-03-10', 'es'), 'martes, 10 de marzo de 2026');
});

test("every time on the garage's clock, to the second, with the date when it is not the day's", () => {
  // 3:59:59 PM in New York; the computer's own zone decides nothing.
  assert.equal(clockSaid('2026-03-10T19:59:59Z', ZONE, 'en', '2026-03-10'), '3:59:59 PM');
  assert.equal(clockSaid('2026-03-10T03:00:00Z', ZONE, 'en', '2026-03-10'), 'Mar 9, 11:00:00 PM');
  assert.equal(clockSaid('2026-03-10T19:59:59Z', 'America/Los_Angeles', 'en', '2026-03-10'), '12:59:59 PM');
});

test('the day\'s list, newest first, whatever order it came in', () => {
  const summaries = stories().map(({ id, let_out_at }) => ({ id, let_out_at }));
  assert.deepEqual(newestFirst(summaries).map((x) => x.id), [BLANKED.id, UNREACHED.id, OPENED.id, OWING.id]);
  assert.deepEqual(newestFirst([...summaries].reverse()).map((x) => x.id), [BLANKED.id, UNREACHED.id, OPENED.id, OWING.id]);
});

for (const language of ['en', 'es']) {
  const t = (key, values) => translate(language, key, values);
  const at = (v) => clockSaid(v, ZONE, language, '2026-03-10');
  const usd = (minor) => moneyText(minor, 'USD', language);
  const story = (x) => storyOf(t, x, { lanes: LANES, timeZone: ZONE, language });
  const step = (items, type, sentence) => items.find((i) => i.type === type && text(i.title).includes(sentence));

  test(`${language}: who let it out -- the owner by email, the key by its name, a person at the lane -- and as stored text`, () => {
    assert.deepEqual(whoPieces(t, OWING.by), [{ email: A.email }]);
    assert.equal(text(whoPieces(t, UNREACHED.by)), t('exceptions.by.key', { name: 'desk' }));
    assert.ok(whoPieces(t, UNREACHED.by).some((p) => p.stored === 'desk'), 'the key\'s name kept apart, as stored text');
    assert.equal(text(whoPieces(t, OPENED.by)), t('exceptions.by.lane', { name: EXIT.devices[0].name }));
    assert.ok(!text(whoPieces(t, OPENED.by)).includes(EXIT.devices[0].id), "the lane equipment's id is never shown");
    assert.deepEqual(whoPieces(t, 'someone:<b>x</b>'), [{ stored: 'someone:<b>x</b>' }], 'anything else, as the platform wrote it, as stored text');
  });

  test(`${language}: the list's gate agent column, from the platform's own summary: counts, not delivered, answered, and where the copy stands`, () => {
    // The day's list as platform #90 answered it (test/platform-shapes.json), oldest first.
    const [owing, opened, unreached, blanked] = recorded.exceptions_answers.find((a) => a.what === 'exceptions, today').structure.order.map((o) => o[4]);
    const messages = t('exceptions.gate.messagesFailed', { messages: t('exceptions.gate.messagesMany', { n: '4' }), n: '1' });
    const calls = t('exceptions.gate.callsAnswered', { calls: t('exceptions.gate.callsMany', { n: '3' }), n: '1' });
    assert.deepEqual(gateLine(t, owing, language), { state: 'complete', text: `${t('exceptions.gate.counts', { messages, calls })} ${t('exceptions.gate.copy.complete')}` });
    assert.deepEqual(gateLine(t, opened, language), { state: 'not_configured', text: t('exceptions.gate.copy.not_configured') });
    assert.deepEqual(gateLine(t, unreached, language), { state: 'not_reachable', text: t('exceptions.gate.copy.not_reachable') });
    assert.deepEqual(gateLine(t, blanked, language), { state: 'purged', text: t('exceptions.gate.purged') });
    // Copied part-way, nothing failed or answered: the counts alone, and that more may come.
    const pending = { ...owing, failed_deliveries: 0, calls_answered: 0, messages: 1, calls: 0, copy: 'pending', copies: { messages: 'pending', calls: 'pending' } };
    assert.equal(gateLine(t, pending, language).text, `${t('exceptions.gate.counts', { messages: t('exceptions.gate.messagesOne', { n: '1' }), calls: t('exceptions.gate.callsMany', { n: '0' }) })} ${t('exceptions.gate.copy.pending')}`);
    assert.equal(gateLine(t, undefined, language).state, 'unknown');
    // The story's own copies: each record once, though copied twice.
    assert.equal(gateRecords(OWING.gate_agent.messages, 'messages').length, 4);
    assert.equal(gateRecords(OWING.gate_agent.calls, 'calls').length, 3);
    assert.equal(sourceState(UNREACHED.gate_agent.calls), 'refused');
    assert.equal(sourceState(UNREACHED.gate_agent.messages), 'not_reachable');
  });

  test(`${language}: the record's pictures, each kind apart, oldest first, with when and where, by the record's own ids`, () => {
    const groups = picturesOf(t, OWING, { lanes: LANES, timeZone: ZONE, language });
    assert.deepEqual(groups.map((g) => [g.kind, g.pictures.map((p) => p.id)]), PICTURE_KINDS.map((kind) => [kind, OWING.pictures[kind].map((p) => p.id)]));
    const [entry, exit, lane] = groups.map((g) => g.pictures[0]);
    assert.equal(text(entry.caption), t('exceptions.picture.entry', { time: at(OWING.pictures.entry[0].taken_at) }));
    assert.equal(text(exit.caption), t('exceptions.picture.exit', { time: at(OWING.pictures.exit[0].taken_at) }));
    assert.equal(text(lane.caption), t('exceptions.picture.lane', { lane: EXIT.name, time: at(OWING.pictures.lane[0].taken_at) }));
    assert.equal(entry.alt, text(entry.caption));
    // An exit picture of an earlier visit of the same stay says so.
    const earlier = structuredClone(OWING);
    earlier.pictures.exit[0].exit_id = '00000000-0000-4000-8000-000000000009';
    assert.equal(text(picturesOf(t, earlier, { lanes: LANES, timeZone: ZONE, language })[1].pictures[0].caption), t('exceptions.picture.exitEarlier', { time: at(OWING.pictures.exit[0].taken_at) }));
    assert.deepEqual(picturesOf(t, OPENED, { lanes: LANES, timeZone: ZONE, language }).map((g) => g.pictures.length), [0, 0, 2]);
    assert.deepEqual(picturesOf(t, { ...OWING, pictures: undefined }, { lanes: LANES, timeZone: ZONE, language }).map((g) => g.pictures.length), [0, 0, 0]);
    assert.equal(letOutPicturePath(HARBOR.id, OWING.id, 'a/b'), `/api/v1/garages/${HARBOR.id}/exceptions/${OWING.id}/pictures/a%2Fb`);
  });

  test(`${language}: a refund at Stripe said on its payment, and refunds that could not be checked said on the case`, () => {
    const refunded = structuredClone(OWING);
    refunded.payment_after_let_out.refunded_minor = 200;
    refunded.story.case.fee.refunds_unread = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
    const items = storyOf(t, refunded, { lanes: LANES, timeZone: ZONE, language });
    assert.ok(items.some((i) => i.type === 'payment' && i.lines.some((l) => text(l) === t('exceptions.payment.refunded', { amount: usd(200) }))), 'what was refunded of the payment');
    assert.ok(items.find((i) => i.type === 'case').lines.some((l) => text(l) === t('exceptions.story.refundsUnreadMany', { n: '2' })), 'refunds not checked, said on the case');
    refunded.story.case.fee.refunds_unread = ['00000000-0000-4000-8000-000000000001'];
    assert.ok(storyOf(t, refunded, { lanes: LANES, timeZone: ZONE, language }).find((i) => i.type === 'case').lines.some((l) => text(l) === t('exceptions.story.refundsUnreadOne')));
    // As recorded, nothing refunded: nothing said.
    assert.ok(!story(OWING).some((i) => i.lines.some((l) => text(l).includes(usd(0)) && i.type === 'payment')));
  });

  test(`${language}: one car's story, in order: came in, the exit, the payment declined, the reader offline, the let-out, the payment canceled`, () => {
    const items = story(OWING);
    const times = items.map((i) => Date.parse(i.at));
    assert.deepEqual(times, [...times].sort((a, b) => a - b), 'oldest first');
    for (const item of items) assert.equal(item.time, at(item.at), `${item.type}: on the garage's clock`);
    assert.equal(text(items[0].title), t('exceptions.story.cameIn', { lane: ENTRY.name }), 'it came in at the entry lane, by its name');
    const exit = step(items, 'case', text([{ words: t('exceptions.story.reachedExit', { lane: EXIT.name }) }]));
    assert.ok(exit, 'it reached the exit lane, by its name');
    assert.deepEqual(exit.lines.map(text), [
      t('exceptions.story.stayFee', { amount: usd(500) }),
      t('exceptions.story.due', { amount: usd(500) }),
      t('exceptions.story.needs.payment'),
    ]);
    const payment = items.find((i) => i.type === 'payment');
    assert.deepEqual(payment.lines.map(text), [t('exceptions.payment.declined')], 'the card declined; Stripe\'s code never shown');
    assert.ok(items.some((i) => i.type === 'lane' && i.lines.some((l) => text(l) === t('exceptions.reader.reader_offline'))), 'the reader offline, in words');
    assert.ok(items.some((i) => i.type === 'lane' && text(i.title) === t('exceptions.lane.fallback_needs_human')), 'the lane asking for a person');
    const letOut = items.find((i) => i.type === 'let-out');
    assert.equal(text(letOut.title), text(kindPieces(t, OWING, language)));
    assert.equal(text(letOut.lines[0]), t('exceptions.letOut.who', { who: A.email }));
    assert.ok(letOut.lines.some((l) => l.some((p) => p.stored === OWING.reason)), 'the reason, as typed, as stored text');
    const canceled = items.filter((i) => i.type === 'payment').at(-1);
    assert.ok(Date.parse(canceled.at) >= Date.parse(letOut.at) && text(canceled.title).includes(usd(500)), 'the let-out canceled the payment, after it');
    // This car's own payment and let-out are said once, by the payments and the let-out; another car's are said as another car's.
    const others = items.filter((i) => i.type === 'lane' && i.lines.some((l) => text(l) === t('exceptions.lane.anotherCar')));
    // The other cars at this lane in its window: the second's payment and pay, the third's and fourth's let-outs.
    assert.equal(others.length, 4);
    assert.ok(!items.some((i) => i.type === 'lane' && text(i.title) === t('exceptions.lane.exit_payment_canceled')), "this car's payment canceled is not said twice");
  });

  test(`${language}: the gate agent's messages, address by address: a delivery on its second try, a failed delivery, an address refused, a pager retrying`, () => {
    const items = story(OWING).filter((i) => i.type === 'message');
    assert.equal(items.length, 4, 'every message once, the one after the let-out too');
    const [first, failed, site, cleared] = items;
    const lines = (item) => item.deliveries.map((d) => [d.to, d.state]);
    assert.deepEqual(lines(first), [[null, 'nobody'], ['night-desk@example.com', 'delivered'], ['paging.example.com', 'delivered']]);
    const email = first.deliveries[1];
    assert.equal(email.tries, t('exceptions.delivery.triesMany', { n: '2' }));
    assert.equal(email.why.length, 1, 'the try that failed, with why');
    assert.ok(email.why[0].some((p) => p.stored === 'email: Connection unexpectedly closed'), "why, as the gate agent kept it, as stored text");
    assert.ok(email.pieces.some((p) => p.email === 'night-desk@example.com'), 'the address as the platform gave it');
    assert.ok(text(email.pieces).includes(t('exceptions.delivery.delivered', { time: at(OWING.gate_agent.messages[1].records[0].deliveries[1].delivered_at) })), 'delivered, and when');
    // The failed one: nobody told by email, one address refused by name, the pager trying again.
    assert.deepEqual(lines(failed), [['night-desk@example.com', 'failed'], ['gate-duty@example.com', 'refused'], ['paging.example.com', 'retrying']]);
    assert.ok(text(failed.deliveries[0].pieces).endsWith(t('exceptions.delivery.failed')));
    assert.ok(text(failed.deliveries[1].pieces).endsWith(t('exceptions.delivery.refusedAddress')));
    assert.ok(text(failed.deliveries[2].pieces).startsWith(t('exceptions.sink.webhook')));
    assert.ok(failed.deliveries.every((d) => text(d.read) === t('exceptions.delivery.notKnownRead')), 'never said to be read when nothing told us');
    assert.equal(text(failed.title), t('exceptions.message.still_active', { what: t('exceptions.message.whatOf', { what: t('exceptions.message.code.reader_unreachable'), subject: 'reader-1' }) }));
    // About no lane, paged to nobody.
    assert.deepEqual(site.lines.map(text), [t('exceptions.message.site'), t('exceptions.message.nobodyPaged')]);
    assert.ok(Date.parse(cleared.at) > Date.parse(OWING.let_out_at) && text(cleared.title).startsWith(text([{ words: t('exceptions.message.recovered', { what: '' }) }]).slice(0, 10)), 'what it said after the let-out');
  });

  test(`${language}: the gate agent's calls: answered (who rang, who answered, what they pressed), not answered, refused busy`, () => {
    const [answered, unanswered, busy] = story(OWING).filter((i) => i.type === 'call');
    const call = gateRecords(OWING.gate_agent.calls, 'calls')[0];
    assert.equal(text(answered.title), t('exceptions.call.title', { from: call.intercom }));
    assert.deepEqual(answered.lines.map(text), [
      t('exceptions.call.told', { time: at(call.case_spoken_at), what: t('exceptions.call.case.malfunction_active') }),
      t('exceptions.call.rang', { time: at(call.rang_person_at), who: 'sip:duty@example.com' }),
      t('exceptions.call.answered', { time: at(call.person_answered_at), who: 'sip:duty@example.com' }),
      t('exceptions.call.pressed', { time: at(call.authorisation_at), what: t('exceptions.call.authorisation.open_now') }),
      t('exceptions.call.act.vend_refused', { time: at(call.events.find((e) => e.kind === 'vend_refused').at) }),
      t('exceptions.call.outcome.authorisation_received'),
      t('exceptions.call.ended', { time: at(call.ended_at) }),
    ]);
    assert.ok(answered.lines[1].some((p) => p.stored === 'sip:duty@example.com'), 'who was rung, as the platform gave it, as stored text');
    assert.ok(unanswered.lines.some((l) => text(l) === t('exceptions.call.notAnswered')));
    assert.ok(unanswered.lines.some((l) => text(l) === t('exceptions.call.outcome.human_unreachable')));
    assert.equal(text(busy.title), t('exceptions.call.refused.busy'));
    assert.deepEqual(busy.lines.map(text), [t('exceptions.call.claimed', { who: 'sip:entry-door@example.com' })]);
  });

  test(`${language}: a call-back number is said by its last two digits only, as the platform keeps it`, () => {
    const keyed = structuredClone(OWING);
    for (const copy of keyed.gate_agent.calls) for (const c of copy.records) Object.assign(c, { authorisation: 'call_back', keyed_last2: '00' });
    const [answered] = storyOf(t, keyed, { lanes: LANES, timeZone: ZONE, language }).filter((i) => i.type === 'call');
    assert.ok(answered.lines.some((l) => text(l) === t('exceptions.call.keyed', { digits: '00' })));
  });

  test(`${language}: a barrier opened at the lane, no gate agent set up: who, on what authority, no reason, nothing owed`, () => {
    const items = story(OPENED);
    const letOut = items.find((i) => i.type === 'let-out');
    assert.equal(text(letOut.title), t('exceptions.kind.barrier_opened'));
    assert.deepEqual(letOut.lines.map(text), [
      t('exceptions.letOut.who', { who: t('exceptions.by.lane', { name: EXIT.devices[0].name }) }),
      t('exceptions.authority.human_open_now'),
      t('exceptions.letOut.noReason'),
      t('exceptions.letOut.paid', { amount: usd(250) }),
    ]);
    assert.equal(items.filter((i) => i.type === 'message' || i.type === 'call').length, 0);
    for (const source of ['messages', 'calls']) {
      const [copy] = OPENED.gate_agent[source];
      assert.equal(text(copyPieces(t, copy, source, { timeZone: ZONE, language, day: '2026-03-10' })), t('exceptions.copy.not_configured', { time: at(copy.copied_at) }));
    }
  });

  test(`${language}: a gate agent not reached and one that refused: each copy says so, and when; the reason with markup stays text`, () => {
    const said = (source) => UNREACHED.gate_agent[source].map((copy) => text(copyPieces(t, copy, source, { timeZone: ZONE, language, day: '2026-03-10' })));
    assert.deepEqual(said('messages'), UNREACHED.gate_agent.messages.map((c) => t('exceptions.copy.not_reachable', { time: at(c.copied_at) })));
    assert.deepEqual(said('calls'), UNREACHED.gate_agent.calls.map((c) => t('exceptions.copy.refused', { time: at(c.copied_at) })));
    const letOut = story(UNREACHED).find((i) => i.type === 'let-out');
    assert.deepEqual(letOut.lines.find((l) => l.some((p) => p.stored !== undefined && p.stored.includes('<b>'))).filter((p) => p.stored), [{ stored: 'Barrier stuck open <b>again</b>' }]);
    // The owner's whole copy, once its window passed: said as the whole window.
    const whole = OWING.gate_agent.messages.at(-1);
    assert.equal(text(copyPieces(t, whole, 'messages', { timeZone: ZONE, language, day: '2026-03-10' })), t('exceptions.copy.whole', { time: at(whole.copied_at), n: '4' }));
  });

  test(`${language}: every code the platform or the gate agent can send has its words; none is shown as a code`, () => {
    const lists = {
      'exceptions.kind': KINDS, 'exceptions.authority': AUTHORITIES, 'exceptions.copy': COPY_STATES.filter((state) => state !== 'copied'), 'exceptions.lane': LANE_KINDS,
      'exceptions.reader': READER_REFUSALS, 'exceptions.message.code': MESSAGE_CODES, 'exceptions.message.at': TARGET_KINDS,
      'exceptions.message': TRANSITIONS, 'exceptions.delivery': DELIVERY_STATES, 'exceptions.sink': SINK_KINDS,
      'exceptions.call.case': CALL_CASES, 'exceptions.call.authorisation': AUTHORISATIONS, 'exceptions.call.outcome': CALL_OUTCOMES,
    };
    for (const [prefix, list] of Object.entries(lists)) {
      for (const code of list) {
        const words = DICTIONARIES[language][`${prefix}.${code}`];
        assert.ok(words, `${prefix}.${code}: no words in ${language}`);
        // A code written as a code (with its underscores) is never what a person reads.
        assert.ok(!code.includes('_') || !words.includes(code), `${prefix}.${code}: the code itself on screen`);
      }
    }
    // A code no list knows is said as another of its kind.
    const odd = structuredClone(OWING);
    odd.story.lane_events[0].kind = 'something_new';
    odd.story.payments[0].last_failure = 'processing_error';
    const items = storyOf(t, odd, { lanes: LANES, timeZone: ZONE, language });
    assert.ok(items.some((i) => text(i.title) === t('exceptions.lane.other')));
    assert.ok(items.some((i) => i.lines.some((l) => text(l) === t('exceptions.payment.failed'))));
    assert.ok(!JSON.stringify(items).includes('something_new') && !JSON.stringify(items).includes('processing_error'));
  });
}

// The client's two reads, against what the platform answers (recorded in test/platform-shapes.json).
function fakeFetch(answer) {
  const asked = [];
  const fn = async (url, init) => {
    asked.push({ url, method: init.method });
    const a = answer(url);
    return { status: a.status, ok: a.status >= 200 && a.status < 300, text: async () => JSON.stringify(a.body) };
  };
  return { fn, asked };
}
const recordedAnswer = (what) => recorded.exceptions_answers.find((a) => a.what === what);

test("the day's list: the garage's own day asked for by its date in the path, today when none; a day that is not one never sent", async () => {
  const day = { garage_id: HARBOR.id, day: '2026-03-10', from: 'x', to: 'y', count: 0, let_out_unpaid: 0, exceptions: [] };
  const { fn, asked } = fakeFetch(() => ({ status: 200, body: day }));
  const client = createClient({ fetch: fn });
  assert.deepEqual(await client.letOutDay(HARBOR.id), { day: '2026-03-10', count: 0, owing: 0, letOuts: [] });
  await client.letOutDay(HARBOR.id, '2026-03-09');
  // The day named in the path (#90): no query string.
  assert.deepEqual(asked.map((a) => [a.method, a.url]), [
    ['GET', `/api/v1/garages/${HARBOR.id}/exceptions`],
    ['GET', `/api/v1/garages/${HARBOR.id}/exceptions/day/2026-03-09`],
  ]);
  await assert.rejects(client.letOutDay(HARBOR.id, '9 March'), { kind: 'dayRefused' });
  assert.equal(asked.length, 2, 'nothing sent for a day that is not one');
});

test('the refusals the page can meet, as the platform gives them: each has words of its own in both languages', async () => {
  const cases = [
    ['exceptions, a day that is not on the calendar', (c) => c.letOutDay(HARBOR.id, '2026-02-30'), 'dayRefused'],
    ["one exception, not this garage's", (c) => c.letOutStory(HARBOR.id, '00000000-0000-4000-8000-000000000009'), 'letOutGone'],
    ['one exception, its address not one', (c) => c.letOutStory(HARBOR.id, 'not-one'), 'letOutGone'],
  ];
  for (const [what, call, kind] of cases) {
    const real = recordedAnswer(what);
    assert.ok(real, `recorded: ${what}`);
    const client = createClient({ fetch: fakeFetch(() => ({ status: real.status, body: real.body })).fn });
    await assert.rejects(call(client), (p) => p.kind === kind, what);
    for (const language of ['en', 'es']) assert.notEqual(translate(language, problemKey({ kind })), translate(language, 'problem.unexpected'), `${what} (${language})`);
  }
});

test('the page only reads: its two calls are GETs, and nothing in it asks for money', () => {
  const page = readFileSync(new URL('../src/ExceptionsPage.jsx', import.meta.url), 'utf8');
  const calls = [...page.matchAll(/client\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(calls)].sort(), ['lanes', 'letOutDay', 'letOutStory']);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML|innerHTML/, 'nothing the platform kept is drawn as markup');
  const api = readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
  const reads = api.slice(api.indexOf('letOutDay:'), api.indexOf('carsInside:'));
  assert.doesNotMatch(reads, /method:/, 'the two reads send no method but GET');
});
