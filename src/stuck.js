// What to say about a stay that looks stuck, and what a person typed to end one.
//
// The platform lists the stays and prices an ended one (its src/stuckStays.js,
// 0043); nothing here decides either. A time the person types is the garage's
// own clock, turned into an instant here only to send it.

import { instantOf, moneyText, wallAt } from './rates.js';

/** The longest reason the platform keeps (its REASON_MAX). */
export const REASON_MAX = 500;
/** The garage's hours, as the platform bounds them (its STUCK_MIN_HOURS and STUCK_MAX_HOURS). */
export const HOURS_MIN = 1;
export const HOURS_MAX = 90 * 24;

/**
 * The car, as the entry read it, in parts for <Stored>: the whole plate, or
 * the characters the lane was sure of and "part of the plate", or words for
 * a car whose plate nobody read (a ticket, or nothing).
 */
export function plateParts(t, stay) {
  if (stay.plate && stay.plate_whole) return { stored: [stay.plate], words: null };
  if (stay.plate) return { stored: [stay.plate], words: t('stuck.platePart') };
  return { stored: [], words: t(stay.ticket ? 'stuck.ticket' : 'stuck.unread') };
}

/** Why the stay is listed: not seen on the latest walk, or older than the garage's hours. */
export function whyListed(t, stay, hours) {
  if (stay.why === 'not_seen_on_walk') return t('stuck.whyWalk');
  return hours === 1 ? t('stuck.whyOldOne') : t('stuck.whyOld', { hours });
}

/** The number of hours as typed, when it is one the platform takes; else null. */
export function hoursTyped(typed) {
  const value = String(typed ?? '').trim();
  if (!/^\d{1,4}$/.test(value)) return null;
  const n = Number(value);
  return n >= HOURS_MIN && n <= HOURS_MAX ? n : null;
}

/** A reason as the platform takes it: words on one line, at most REASON_MAX characters. Else the problem's kind. */
export function reasonProblem(typed) {
  const reason = String(typed ?? '');
  if (reason.trim() === '' || reason.length > REASON_MAX) return 'reasonRequired';
  // Control characters and line breaks: the platform refuses them (reason_invalid).
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(reason)) return 'reasonOneLine';
  return null;
}

/** The garage's clock now, for the time a person says the car left. */
export const leftNow = (garage, now = Date.now()) => wallAt(now, garage.timezone);

/**
 * When the car left, as typed on the garage's clock: `{ at }`, an instant to
 * send, or `{ problem }` -- a time the clocks skip, one before the stay came
 * in, or one still to come.
 */
export function leftAtTyped(wall, stay, garage, now = Date.now()) {
  const at = instantOf(wall, garage.timezone);
  if (at === null) return { problem: 'leftTimeOdd' };
  // The person types minutes; the stay came in at a second within its minute.
  if (at < Math.floor(Date.parse(stay.entered_at) / 60000) * 60000) return { problem: 'leftBeforeEntry' };
  if (at > now) return { problem: 'leftInFuture' };
  return { at: new Date(Math.max(at, Date.parse(stay.entered_at))).toISOString() };
}

/**
 * What became of a stay a person ended, in one sentence: what it owes -- to
 * be collected the garage's own way, never charged here -- or that it owes
 * nothing. A stay that paid at an exit before it was ended (platform 0045)
 * names each figure the platform gave: its price, what was paid, and what it
 * still owes -- the platform's own figure, never worked out here.
 */
export function endedWords(t, outcome, result, language) {
  const money = (minor, currency = result.currency) => moneyText(minor, currency, language);
  const paid = result.paid ? money(result.paid.amountMinor, result.paid.currency) : null;
  const plusPaid = (words) => (paid ? `${words} ${t('stuck.paidAtExit', { paid })}` : words);
  if (outcome === 'abandoned') return plusPaid(t('stuck.doneAbandoned'));
  if (result.covered) return plusPaid(t('stuck.doneCovered'));
  if (!result.priced || result.owedMinor === null) return plusPaid(t('stuck.doneNotPriced'));
  if (paid && result.priceMinor !== null) {
    const figures = { price: money(result.priceMinor), paid, amount: money(result.owedMinor) };
    return t(result.owedMinor === 0 ? 'stuck.donePaidOwesNothing' : 'stuck.donePaidOwes', figures);
  }
  if (result.owedMinor === 0) return plusPaid(t('stuck.doneOwesNothing'));
  return plusPaid(t('stuck.doneOwes', { amount: money(result.owedMinor) }));
}

/**
 * Said beside what a stay owes when the platform priced it without asking
 * about a pass (`pass_unasked`, platform 0043): the garage has no exit lane
 * to ask at. Null otherwise, and for a stay written off, which owes nothing.
 */
export function passWords(t, outcome, result) {
  return outcome === 'ended' && result.passUnasked === true ? t('stuck.passUnasked') : null;
}
