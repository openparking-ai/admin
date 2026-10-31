// The cars a person let out (platform 0048), in words: a day's list and one
// car's whole story, as the platform kept them. The owner's words of
// 2026-10-30: "record it as exceptions and add as much information as we can.
// what happened, who did what, gate agent sent messages times, who received".
//
// Nothing here works anything out that the platform did not say: what was
// owed and paid are the platform's figures, every time is the platform's,
// shown on the garage's clock, and every text the platform kept -- a reason,
// who pressed it, an address the gate agent paged, a lane's name -- is
// stored text, kept apart from the words around it and never read as markup.
// A code is never shown: each known one has its words, and any other is said
// as what kind of thing it is.

import { endOnce } from './i18n/index.js';
import { moneyText } from './rates.js';

const LOCALES = { en: 'en-US', es: 'es-US' };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Whether `day` is a calendar day written YYYY-MM-DD. */
export function isDay(day) {
  if (typeof day !== 'string' || !DAY.test(day)) return false;
  const at = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day;
}

/** The day `n` days after `day` (before, for a negative `n`): calendar days, no clock. */
export const dayOn = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** A calendar day as a person says it: "Friday, October 30, 2026". It is already the garage's day: no zone. */
export const daySaid = (day, language) =>
  new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${day}T00:00:00Z`));

/** The garage's calendar day of an instant, YYYY-MM-DD. */
export const garageDayOf = (value, timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));

/**
 * A moment on the garage's clock, to the second: "10:41:07 PM", with the date
 * before it ("Oct 29, 10:41:07 PM") when it is not on `day`, the garage's day
 * the story is told on.
 */
export function clockSaid(value, timeZone, language, day = null) {
  const at = new Date(value);
  const sameDay = day !== null && garageDayOf(at, timeZone) === day;
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, {
    timeZone,
    ...(sameDay ? {} : { month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(at);
}

/** An amount in the record's currency. The platform's own figure, never one worked out here. */
export const money = (minor, currency, language) => moneyText(minor, String(currency ?? 'USD').toUpperCase(), language);

/** The day's list, newest first (the platform answers oldest first). */
export const newestFirst = (list) =>
  [...list].sort((a, b) => Date.parse(b.let_out_at) - Date.parse(a.let_out_at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

/**
 * `key`'s words as pieces, each `{name}` filled: a plain value as words, a
 * `{ stored }` value kept apart as stored text, a `{ email }` value as an
 * address, a `{ pieces }` value as another sentence's pieces. Pieces are
 * drawn as text, never as markup (src/ExceptionsPage.jsx).
 */
export function sentence(t, key, values = {}) {
  const out = [];
  for (const part of t(key).split(/(\{\w+\})/)) {
    const m = /^\{(\w+)\}$/.exec(part);
    const value = m && Object.hasOwn(values, m[1]) ? values[m[1]] : undefined;
    if (value === undefined) {
      if (part) out.push({ words: part });
    } else if (value !== null && typeof value === 'object') {
      // Another sentence's pieces, in place; an address; or stored text.
      if (Array.isArray(value.pieces)) out.push(...value.pieces.map((p) => ({ ...p })));
      else out.push(value.email !== undefined ? { email: String(value.email) } : { stored: String(value.stored) });
    } else {
      out.push({ words: String(value) });
    }
  }
  // Words beside words are one run, with one full stop where a value already ended in one.
  return out.reduce((all, p) => {
    const last = all.at(-1);
    if (p.words !== undefined && last?.words !== undefined) last.words = endOnce(last.words + p.words);
    else all.push(p.words !== undefined ? { words: endOnce(p.words) } : p);
    return all;
  }, []);
}

/** The pieces as one line of text: what a check reads. */
export const piecesText = (pieces) => pieces.map((p) => p.words ?? p.stored ?? p.email).join('');

/** A known word for `value`, or the words for "another" of its kind: a code is never shown. */
const known = (t, prefix, value, list, other) => (list.includes(value) ? t(`${prefix}.${value}`) : t(other));

// ── Who let the car out ──

/**
 * Who pressed it, as the platform names them: an owner by email, the
 * account's key by its name, the lane's equipment by its name (a person at
 * the lane opened through it); anything else as the platform wrote it.
 */
export function whoPieces(t, by) {
  const text = String(by ?? '');
  let m = /^owner:(.+)$/.exec(text);
  if (m) return [{ email: m[1] }];
  m = /^key:(.*)$/.exec(text);
  if (m) return m[1] ? sentence(t, 'exceptions.by.key', { name: { stored: m[1] } }) : sentence(t, 'exceptions.by.keyUnnamed');
  m = /^lane_device:\S+(?: \((.*)\))?$/.exec(text);
  if (m) return m[1] ? sentence(t, 'exceptions.by.lane', { name: { stored: m[1] } }) : sentence(t, 'exceptions.by.laneUnnamed');
  return text ? [{ stored: text }] : sentence(t, 'exceptions.by.nobody');
}

export const KINDS = ['let_out_unpaid', 'barrier_opened'];
export const AUTHORITIES = ['display_code_confirmed', 'human_open_now', 'human_open_and_flag'];

/** What kind of let-out it was, with what it owed. */
export function kindPieces(t, x, language) {
  if (x.kind === 'barrier_opened') return sentence(t, 'exceptions.kind.barrier_opened');
  if (x.kind === 'let_out_unpaid') return sentence(t, 'exceptions.kind.let_out_unpaid', { amount: money(x.owed_minor, x.currency, language) });
  return sentence(t, 'exceptions.kind.other');
}

/** Where it was let out from: a screen (the owner or a key), or a person at the lane, on what authority. */
export function sourcePieces(t, x) {
  if (x.source === 'lane') {
    return AUTHORITIES.includes(x.authority) ? sentence(t, `exceptions.authority.${x.authority}`) : sentence(t, 'exceptions.source.lane');
  }
  return sentence(t, x.source === 'attendant' ? 'exceptions.source.attendant' : 'exceptions.source.other');
}

// ── The gate agent's records ──

export const GATE_SOURCES = { messages: 'record_id', calls: 'call_id' };
export const COPY_STATES = ['copied', 'not_configured', 'not_reachable', 'refused'];

/**
 * Each record the gate agent gave, once: a record is copied at the let-out
 * and again once its window passed, so the newest revision of each is kept,
 * in time order.
 */
export function gateRecords(copies, source) {
  const id = GATE_SOURCES[source];
  const time = (r) => Date.parse(source === 'messages' ? r.at : r.started_at);
  const byId = new Map();
  for (const copy of copies ?? []) {
    if (copy.state !== 'copied') continue;
    for (const r of copy.records ?? []) {
      const was = byId.get(r[id]);
      if (!was || Number(r.revision) >= Number(was.revision)) byId.set(r[id], r);
    }
  }
  return [...byId.values()].sort((a, b) => time(a) - time(b));
}

/**
 * Where a source stands: `copied` once any copy was made; otherwise the
 * newest copy's state (not set up, not reached, refused); `none` before any
 * was asked.
 */
export function sourceState(copies) {
  if (!copies?.length) return 'none';
  if (copies.some((c) => c.state === 'copied')) return 'copied';
  const last = copies.at(-1).state;
  return COPY_STATES.includes(last) ? last : 'refused';
}

/** Where the gate agent's copies stand, as the day's list says it in short (#90). */
export const GATE_COPY = ['complete', 'pending', 'not_reachable', 'not_configured'];

/**
 * The gate agent in one line, for the day's list, from the platform's own
 * summary of each record (#90's `gate_agent`): how many messages (and of them
 * not delivered) and calls (and of them answered) its latest copy holds, then
 * where the copy stands -- copied whole, still being copied, not reached, not
 * set up -- or that the retention purge blanked it. Its figures, never
 * counted here.
 */
export function gateLine(t, summary, language) {
  if (!summary || typeof summary !== 'object') return { state: 'unknown', text: t('exceptions.gate.notAsked') };
  if (summary.purged) return { state: 'purged', text: t('exceptions.gate.purged') };
  const n = (x) => Number(x ?? 0).toLocaleString(LOCALES[language] ?? LOCALES.en);
  const state = GATE_COPY.includes(summary.copy) ? summary.copy : 'pending';
  const words = [];
  if (summary.messages > 0 || summary.calls > 0) {
    let messages = t(`exceptions.gate.messages${summary.messages === 1 ? 'One' : 'Many'}`, { n: n(summary.messages) });
    if (summary.failed_deliveries > 0) messages = t('exceptions.gate.messagesFailed', { messages, n: n(summary.failed_deliveries) });
    let calls = t(`exceptions.gate.calls${summary.calls === 1 ? 'One' : 'Many'}`, { n: n(summary.calls) });
    if (summary.calls_answered > 0) calls = t('exceptions.gate.callsAnswered', { calls, n: n(summary.calls_answered) });
    words.push(t('exceptions.gate.counts', { messages, calls }));
  }
  words.push(t(`exceptions.gate.copy.${state}`));
  return { state, text: words.join(' ') };
}

/** What each copy of a source holds, for the story's foot: when it was made and what it holds, or why there is none. */
export function copyPieces(t, copy, source, { timeZone, language, day }) {
  const when = clockSaid(copy.copied_at, timeZone, language, day);
  if (copy.state === 'copied') {
    const count = (copy.records ?? []).length;
    return sentence(t, `exceptions.copy.${copy.complete ? 'whole' : 'soFar'}`, { time: when, n: count.toLocaleString(LOCALES[language] ?? LOCALES.en) });
  }
  return sentence(t, `exceptions.copy.${COPY_STATES.includes(copy.state) ? copy.state : 'refused'}`, { time: when });
}

// ── The story ──

/** A lane by its name, from the garage's lanes as read; a lane not there is said so. */
const laneName = (t, lanes, id) => {
  const lane = (lanes ?? []).find((l) => l.id === id);
  return lane ? { stored: lane.name } : t('exceptions.laneUnknown');
};

const PAYMENT_CHANNELS = ['lane_reader', 'phone_reader'];
/** A payment's failure as the platform kept the latest: a card declined, or another failure. Stripe's codes are never shown. */
const failurePieces = (t, failure) => (String(failure).startsWith('card_declined') ? sentence(t, 'exceptions.payment.declined') : sentence(t, 'exceptions.payment.failed'));

/** The lane's events this page has words for: the lane's own kinds and the platform's at an exit. */
export const LANE_KINDS = [
  'armed', 'arming_incomplete', 'arming_rejected', 'arming_suppressed', 'arming_suppression_ended', 'assisted_identity', 'decision',
  'entry_backed_out', 'entry_confirmed', 'entry_held', 'entry_pending', 'entry_unadmitted', 'entry_unconfirmable', 'exit_backed_in',
  'exit_confirmed', 'exit_held', 'exit_pending', 'exit_unconfirmable', 'fallback_needs_human', 'frames_captured', 'vehicle_identified', 'vended',
  'exit_unmatched', 'exit_driver_word', 'exit_let_out_by_person', 'exit_superseded', 'exit_stay_reentered', 'exit_payment_started', 'exit_paid',
  'exit_payment_canceled', 'exit_covered', 'close_unpriced', 'exit_reader_refused', 'qr_presented', 'lane_reader_bound', 'lane_reader_unbound',
];
/** What stopped the reader taking a payment, as the platform names it. */
export const READER_REFUSALS = ['reader_offline', 'reader_busy', 'no_reader_bound'];
/** Lane events about this car's own payment and let-out: the payments and the let-out already say them. */
const SAID_ELSEWHERE = ['exit_payment_started', 'exit_paid', 'exit_payment_canceled', 'exit_let_out_by_person'];

/** What the gate agent reported, by its code; any other said as a fault at what it watches. */
export const MESSAGE_CODES = [
  'reader_unreachable', 'lane_unreachable', 'lane_refused_us', 'lane_gone_quiet', 'identity_service_unreachable', 'platform_unreachable',
  'platform_refused_us', 'capture_unreachable', 'camera_unreachable', 'camera_feed_frozen', 'agent_unreachable', 'sink_delivery_failed',
  'record_store_unwritable', 'human_unreachable', 'relay_unreachable', 'display_unavailable', 'lane_unavailable',
];
export const TARGET_KINDS = ['lane', 'identity_service', 'platform', 'capture', 'agent', 'monitor'];
export const TRANSITIONS = ['raised', 'still_active', 'recovered', 'no_longer_measured'];
export const DELIVERY_STATES = ['pending', 'delivered', 'retrying', 'failed', 'interrupted', 'superseded'];
export const SINK_KINDS = ['email', 'webhook', 'log'];

/** What a message was about: its code's words, or what kind of thing it watches; and which one, as the gate agent named it. */
function messageWhat(t, r) {
  const what = MESSAGE_CODES.includes(r.code)
    ? t(`exceptions.message.code.${r.code}`)
    : t(`exceptions.message.at.${TARGET_KINDS.includes(r.target_kind) ? r.target_kind : 'other'}`);
  return r.subject ? sentence(t, 'exceptions.message.whatOf', { what, subject: { stored: r.subject } }) : [{ words: what }];
}

/**
 * Who was sent a message and what became of it, address by address: an
 * address refused by name is "refused"; the others share their delivery's
 * state. A delivery to nobody (the gate agent's own log) is one line.
 */
export function deliveryLines(t, r, { timeZone, language, day }) {
  const at = (v) => clockSaid(v, timeZone, language, day);
  const lines = [];
  for (const d of r.deliveries ?? []) {
    const attempts = d.attempts ?? [];
    const refused = new Set(attempts.flatMap((a) => a.refused_recipients ?? []));
    const via = t(`exceptions.sink.${SINK_KINDS.includes(d.kind) ? d.kind : 'other'}`);
    const state = DELIVERY_STATES.includes(d.state) ? d.state : 'other';
    const result = sentence(t, `exceptions.delivery.${state}`, {
      time: d.delivered_at ? at(d.delivered_at) : d.next_attempt_at ? at(d.next_attempt_at) : '',
    });
    const tries = attempts.length === 1 ? t('exceptions.delivery.triesOne') : t('exceptions.delivery.triesMany', { n: attempts.length.toLocaleString(LOCALES[language] ?? LOCALES.en) });
    // Why a try failed, as the gate agent kept it: its words, as stored text.
    const why = attempts.filter((a) => a.result === 'failed' && a.reason).map((a) => sentence(t, 'exceptions.delivery.why', { time: at(a.at), reason: { stored: a.reason } }));
    if (!(d.recipients ?? []).length) {
      const said = d.kind === 'log' ? sentence(t, 'exceptions.delivery.logOnly') : sentence(t, 'exceptions.delivery.nobody');
      // The gate agent's own log, or a way with nobody on it: said whole, with no address.
      lines.push({ to: null, state: 'nobody', pieces: said, tries, why: [], read: null });
      continue;
    }
    const read = d.acknowledgement === 'acknowledged'
      ? sentence(t, 'exceptions.delivery.read', { who: { stored: d.acknowledged_by ?? '' }, time: d.acknowledged_at ? at(d.acknowledged_at) : '' })
      : sentence(t, 'exceptions.delivery.notKnownRead');
    for (const address of d.recipients) {
      const to = d.kind === 'email' ? { email: address } : { stored: address };
      const mine = refused.has(address) ? { state: 'refused', said: sentence(t, 'exceptions.delivery.refusedAddress') } : { state, said: result };
      lines.push({ to: address, state: mine.state, pieces: sentence(t, 'exceptions.delivery.line', { via, to, result: { pieces: mine.said } }), tries, why, read });
    }
  }
  return lines;
}

export const CALL_CASES = [
  'malfunction_active', 'lane_closed', 'identification_unavailable', 'plate_not_read', 'plate_unclear', 'vehicle_not_recognised', 'rules_unavailable',
  'entry_refused', 'vehicle_not_detected', 'entry_not_confirmed', 'stale_decision', 'unrecognised_reason', 'lane_unavailable', 'standalone', 'nothing_to_do',
];
export const AUTHORISATIONS = ['open_now', 'open_and_flag', 'do_not_open', 'hold', 'transfer', 'call_back'];
export const CALL_OUTCOMES = [
  'authorisation_received', 'human_unreachable', 'nothing_usable', 'operator_hung_up', 'ticket_confirmed', 'told_ticket_on_screen', 'nothing_to_do',
  'case_not_spoken', 'user_agent_lost', 'driver_hung_up', 'interrupted_by_restart',
];
/** What the call did at the lane, from its events: the barrier asked for, refused, opened or not. */
const CALL_ACTS = ['vend_commanded', 'vend_refused', 'relay_pulsed', 'relay_pulse_failed'];

/** One call, step by step: who called, what the driver was told, who was rung, who answered, what they pressed, how it ended. */
export function callLines(t, c, { timeZone, language, day }) {
  const at = (v) => clockSaid(v, timeZone, language, day);
  const lines = [];
  if (c.caller_stated_identity && c.caller_stated_identity !== c.intercom) lines.push(sentence(t, 'exceptions.call.claimed', { who: { stored: c.caller_stated_identity } }));
  if (c.disposition !== 'answered') return lines;
  if (c.case) lines.push(sentence(t, 'exceptions.call.told', { what: known(t, 'exceptions.call.case', c.case, CALL_CASES, 'exceptions.call.case.other'), time: c.case_spoken_at ? at(c.case_spoken_at) : '–' }));
  if (c.person_called) lines.push(sentence(t, 'exceptions.call.rang', { who: { stored: c.person_called }, time: c.rang_person_at ? at(c.rang_person_at) : '–' }));
  if (c.person_answered_at) lines.push(sentence(t, 'exceptions.call.answered', { who: { stored: c.person_answered_as ?? '' }, time: at(c.person_answered_at) }));
  else if (c.person_called) lines.push(sentence(t, 'exceptions.call.notAnswered'));
  if (c.authorisation) {
    lines.push(sentence(t, 'exceptions.call.pressed', { what: known(t, 'exceptions.call.authorisation', c.authorisation, AUTHORISATIONS, 'exceptions.call.authorisation.other'), time: c.authorisation_at ? at(c.authorisation_at) : '–' }));
    if (c.keyed_last2) lines.push(sentence(t, 'exceptions.call.keyed', { digits: { stored: c.keyed_last2 } }));
  }
  for (const e of c.events ?? []) if (CALL_ACTS.includes(e.kind)) lines.push(sentence(t, `exceptions.call.act.${e.kind}`, { time: at(e.at) }));
  if (c.outcome && c.outcome !== c.disposition) lines.push([{ words: known(t, 'exceptions.call.outcome', c.outcome, CALL_OUTCOMES, 'exceptions.call.outcome.other') }]);
  if (c.ended_at) lines.push(sentence(t, 'exceptions.call.ended', { time: at(c.ended_at) }));
  return lines;
}

/**
 * One car's whole story, oldest first: it came in, reached the exit lane,
 * every payment and what became of it, what the lane reported, every message
 * and call of the gate agent, and the let-out -- each `{ at, type, title,
 * lines, deliveries }`, words as pieces. `lanes` are the garage's, for
 * their names.
 */
export function storyOf(t, x, { lanes, timeZone, language }) {
  const day = garageDayOf(x.let_out_at, timeZone);
  const at = (v) => clockSaid(v, timeZone, language, day);
  const amount = (minor, currency = x.currency) => money(minor, currency, language);
  const items = [];
  const add = (when, type, title, lines = [], extra = {}) => {
    if (when && !Number.isNaN(Date.parse(when))) items.push({ at: when, type, title, lines, ...extra });
  };
  const story = x.story ?? {};
  const stay = story.stay;
  if (stay?.entry_at) {
    const lines = [sentence(t, `exceptions.story.identified.${['plate', 'ticket', 'unread'].includes(stay.identified_by) ? stay.identified_by : 'other'}`)];
    if (stay.tailgater) lines.push(sentence(t, 'exceptions.story.tailgater'));
    add(stay.entry_at, 'came-in', sentence(t, 'exceptions.story.cameIn', { lane: laneName(t, lanes, stay.entry_lane_id) }), lines);
  }
  const exitCase = story.case;
  if (exitCase) {
    const fee = exitCase.fee;
    const lines = [];
    if (fee?.refused) lines.push(sentence(t, 'exceptions.story.notPriced'));
    else if (fee) {
      if (fee.outcome === 'covered') lines.push(sentence(t, 'exceptions.story.covered'));
      if (Number.isInteger(fee.stay_fee_minor)) lines.push(sentence(t, 'exceptions.story.stayFee', { amount: amount(fee.stay_fee_minor, fee.currency) }));
      if (fee.credit_minor > 0) lines.push(sentence(t, 'exceptions.story.credit', { amount: amount(fee.credit_minor, fee.currency) }));
      if (Number.isInteger(fee.due_minor)) lines.push(sentence(t, 'exceptions.story.due', { amount: amount(fee.due_minor, fee.currency) }));
    }
    const needs = exitCase.settled_before?.needs;
    if (['payment', 'driver_word', 'person'].includes(needs)) lines.push(sentence(t, `exceptions.story.needs.${needs}`));
    // Earlier payments Stripe could not be asked about for refunds when it was priced: credited as last read.
    const unread = fee?.refunds_unread ?? exitCase.refunds_unread;
    if (Array.isArray(unread) && unread.length) {
      lines.push(unread.length === 1 ? sentence(t, 'exceptions.story.refundsUnreadOne') : sentence(t, 'exceptions.story.refundsUnreadMany', { n: unread.length.toLocaleString(LOCALES[language] ?? LOCALES.en) }));
    }
    add(x.case_opened_at ?? exitCase.exit_at, 'case', sentence(t, 'exceptions.story.reachedExit', { lane: laneName(t, lanes, x.lane_id) }), lines);
  }
  // Each payment once, as it last stood: after the let-out when the platform appended that.
  const after = x.payment_after_let_out;
  for (const p of story.payments ?? []) {
    const now = after && after.id === p.id ? after : p;
    const via = PAYMENT_CHANNELS.includes(p.channel) ? p.channel : 'other';
    const lines = [];
    if (p.last_failure) lines.push(failurePieces(t, p.last_failure));
    if (p.status === 'open' && !(now.succeeded_at || now.canceled_at)) lines.push(sentence(t, 'exceptions.payment.open'));
    // What Stripe says was refunded of it, as last read (#89): never counted as paid.
    if (Number(now.refunded_minor) > 0) lines.push(sentence(t, 'exceptions.payment.refunded', { amount: amount(now.refunded_minor, now.currency) }));
    add(p.created_at, 'payment', sentence(t, `exceptions.payment.started.${via}`, { amount: amount(p.amount_minor, p.currency) }), lines);
    if (now.succeeded_at) add(now.succeeded_at, 'payment', sentence(t, 'exceptions.payment.paid', { amount: amount(now.amount_minor, now.currency) }));
    if (now.canceled_at) add(now.canceled_at, 'payment', sentence(t, now === after ? 'exceptions.payment.canceledByLetOut' : 'exceptions.payment.canceled', { amount: amount(now.amount_minor, now.currency) }));
  }
  if (after && !(story.payments ?? []).some((p) => p.id === after.id)) {
    if (Number(after.refunded_minor) > 0) add(after.canceled_at ?? after.succeeded_at ?? x.let_out_at, 'payment', sentence(t, 'exceptions.payment.refunded', { amount: amount(after.refunded_minor, after.currency) }));
    if (after.canceled_at) add(after.canceled_at, 'payment', sentence(t, 'exceptions.payment.canceledByLetOut', { amount: amount(after.amount_minor, after.currency) }));
    if (after.succeeded_at) add(after.succeeded_at, 'payment', sentence(t, 'exceptions.payment.paid', { amount: amount(after.amount_minor, after.currency) }));
  }
  // What the lane reported, before the let-out and after it, to the window's end.
  for (const e of [...(story.lane_events ?? []), ...(x.lane_events_after ?? [])]) {
    const mine = !e.detail?.exit_id || e.detail.exit_id === x.exit_id;
    if (mine && SAID_ELSEWHERE.includes(e.kind)) continue;
    const lines = [];
    if (e.kind === 'exit_reader_refused') lines.push(sentence(t, `exceptions.reader.${READER_REFUSALS.includes(e.detail?.code) ? e.detail.code : 'other'}`));
    if (!mine) lines.push(sentence(t, 'exceptions.lane.anotherCar'));
    add(e.at, 'lane', sentence(t, `exceptions.lane.${LANE_KINDS.includes(e.kind) ? e.kind : 'other'}`), lines);
  }
  const copies = x.gate_agent ?? {};
  for (const r of gateRecords(copies.messages, 'messages')) {
    const transition = TRANSITIONS.includes(r.transition) ? r.transition : r.transition === null ? 'startup' : 'other';
    const lines = [];
    if (r.lane_id === null) lines.push(sentence(t, 'exceptions.message.site'));
    if (!r.paged) lines.push(sentence(t, 'exceptions.message.nobodyPaged'));
    add(r.at, 'message', sentence(t, `exceptions.message.${transition}`, { what: { pieces: messageWhat(t, r) } }), lines, { deliveries: deliveryLines(t, r, { timeZone, language, day }), record: r.record_id });
  }
  for (const c of gateRecords(copies.calls, 'calls')) {
    const from = c.intercom ? { stored: c.intercom } : t('exceptions.call.unknownDoor');
    const title = c.disposition === 'answered'
      ? sentence(t, 'exceptions.call.title', { from })
      : sentence(t, `exceptions.call.refused.${c.disposition === 'refused_busy' ? 'busy' : 'undeclared'}`);
    add(c.started_at, 'call', title, callLines(t, c, { timeZone, language, day }), { record: c.call_id });
  }
  const letOutLines = [sentence(t, 'exceptions.letOut.who', { who: { pieces: whoPieces(t, x.by) } }), sourcePieces(t, x)];
  letOutLines.push(x.reason ? sentence(t, 'exceptions.letOut.reason', { reason: { stored: x.reason } }) : sentence(t, 'exceptions.letOut.noReason'));
  if (x.paid_minor > 0) letOutLines.push(sentence(t, 'exceptions.letOut.paid', { amount: amount(x.paid_minor) }));
  add(x.let_out_at, 'let-out', kindPieces(t, x, language), letOutLines);
  // Oldest first; two at the same moment in the order they were added.
  return items
    .map((item, i) => [item, i])
    .sort(([a, i], [b, j]) => Date.parse(a.at) - Date.parse(b.at) || i - j)
    .map(([item]) => ({ ...item, time: at(item.at) }));
}

export const PICTURE_KINDS = ['entry', 'exit', 'lane'];

/**
 * The record's pictures (#90), each kind in its own group, oldest first:
 * those with the stay's entry, those with its exit -- this visit's case, or
 * an earlier visit of the same stay -- and any other the exit lane kept in
 * the record's window. Each with when it was taken, on the garage's clock,
 * and what it shows, in words; the image is the platform's, by its id.
 */
export function picturesOf(t, x, { lanes, timeZone, language }) {
  const day = garageDayOf(x.let_out_at, timeZone);
  const listed = x.pictures ?? {};
  return PICTURE_KINDS.map((kind) => ({
    kind,
    pictures: [...(Array.isArray(listed[kind]) ? listed[kind] : [])]
      .sort((a, b) => Date.parse(a.taken_at) - Date.parse(b.taken_at))
      .map((p) => {
        const time = clockSaid(p.taken_at, timeZone, language, day);
        let caption;
        if (kind === 'exit') caption = sentence(t, p.exit_id && p.exit_id !== x.exit_id ? 'exceptions.picture.exitEarlier' : 'exceptions.picture.exit', { time });
        else if (kind === 'lane') caption = sentence(t, 'exceptions.picture.lane', { time, lane: laneName(t, lanes, p.lane_id) });
        else caption = sentence(t, 'exceptions.picture.entry', { time });
        return { id: p.id, at: p.taken_at, time, caption, alt: piecesText(caption) };
      }),
  }));
}
