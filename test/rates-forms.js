// The Rates page's rates, as the owner types them (U7i, the page approved on
// 2026-10-13), built into plans with the page's own functions. Used by the
// recording (test/platform-shapes.js), the stand-in's check that it answers
// as the platform does, the form's tests (test/rates.test.js,
// test/rates-two-saves.test.js) and the browser check (scripts/check-rates.js).
//
// Nothing is scheduled: every plan starts when it is saved, so a plan here is
// built for a start given at the time (`start`). The stays priced are on fixed
// days in 2031, after any start, in the garage's time (America/New_York).

import { blankForm, blankRate, blankSpecial, buildPlan, orderedWindows, specialsPlan } from '../src/rates.js';

export const ZONE = 'America/New_York';
export const RECORDED_GARAGE = { name: 'Recorded rates garage', timezone: ZONE, currency: 'USD' };
const GARAGE = { timezone: ZONE, currency: 'USD' };

const rate = (firstMinutes, firstPrice, nextMinutes, nextPrice) => ({ ...blankRate(), firstMinutes, firstPrice, nextMinutes, nextPrice });
const special = (preset, fields) => ({ ...blankSpecial(preset), ...fields });

/** The approved page's starting regular rates: $8 the first hour, $4 each hour after, at most $30 a calendar day, 10 minutes free. */
export const REGULAR_FORM = {
  ...blankForm(),
  time: rate('60', '8', '60', '4'),
  dayMax: { on: true, price: '30', kind: 'calendar_day' },
  grace: { on: true, minutes: '10' },
};

/** Its special: the early bird, Monday to Friday, in 6:00 to 9:00 AM, out by 6:00 PM the same day, $12. */
export const EARLY_BIRD = special('weekdays', { name: 'Early bird', enterFrom: '06:00', enterBy: '09:00', leaveBy: '18:00', nextDay: false, charge: 'flat', flat: '12' });

/** The brief's max check: $40 the first hour, $10 each 15 minutes, at most $100 a calendar day. */
export const MAX_FORM = { ...blankForm(), time: rate('60', '40', '15', '10'), dayMax: { on: true, price: '100', kind: 'calendar_day' } };

/** A weekend special at its own hourly rate, and a percent off: one of each other kind of price. */
export const WEEKEND_RATE = special('weekends', { name: 'Weekend', enterFrom: '00:00', enterBy: '23:59', leaveBy: '23:59', nextDay: true, charge: 'rate', rate: rate('60', '5', '60', '2') });
export const MEMBERS = special('everyDay', { name: 'Members', enterFrom: '00:00', enterBy: '23:59', leaveBy: '23:59', nextDay: true, charge: 'adjust', adjust: { direction: 'discount', kind: 'percent', value: '10', rounding: 'down' } });

/**
 * Stays on fixed days, each `{ entry, exit, fee }`: what the approved page's
 * own arithmetic charges on the starting rates with the early bird (checked
 * against the engine when recorded, and by the browser check on the
 * platform's stand-in, which asks the engine).
 */
/**
 * The rule the Price Lab writes when the owner switches the fill rule on (his word, 10-14 17:19):
 * above 80% full the time charge is 20% more, specials raised, the VIP extra not.
 */
export const FILL_RULE = Object.freeze({
  id: 'lab-fill', type: 'fill_level', stage: 'ADJUST', space_classes: ['standard'],
  threshold_bp: 8000, percent_bp: 2000, rounding: 'up', raises_specials: 'yes', raises_vip_extra: 'no',
});

export const STAYS = {
  // Saturday 2031-03-15: grace, an ordinary stay, the max per day.
  grace: { entry: '2031-03-15T10:00', exit: '2031-03-15T10:05', fee: 0 },
  plain: { entry: '2031-03-15T10:00', exit: '2031-03-15T13:00', fee: 1600 },
  dayMax: { entry: '2031-03-15T10:00', exit: '2031-03-15T22:00', fee: 3000 },
  // Wednesday 2031-03-12: the early bird, and the early bird beaten by the hour.
  early: { entry: '2031-03-12T07:00', exit: '2031-03-12T17:00', fee: 1200 },
  earlyBeaten: { entry: '2031-03-12T07:00', exit: '2031-03-12T07:50', fee: 800 },
  // The max check: Saturday 10:00 to Sunday 18:30, 32 hours 30 minutes, two calendar days at $100.
  maxDays: { entry: '2031-03-15T10:00', exit: '2031-03-16T18:30', fee: 20000, byHour: 130000 },
};
export const STAY_LIST = Object.values(STAYS).filter((s) => s !== STAYS.maxDays).map(({ entry, exit }) => ({ entry, exit }));

const build = (form, start, name) => buildPlan(form, { garage: GARAGE, spaceClass: 'standard', start, name });

/**
 * Every plan the recording sends, each starting at `start` (the moment it is
 * built), named so the stand-in and the platform are asked the same:
 *
 *   regular   the starting regular rates, saved first;
 *   early     the early bird added to them (the page's specialsPlan);
 *   change    the early bird at $15 instead;
 *   max       the max check's rates;
 *   gap       rates whose time-based rate stops at a day, with nothing after (findings);
 *   other     the starting rates with the weekend rate and Members added.
 */
export function recordedPlans(start = new Date().toISOString()) {
  const regular = build(REGULAR_FORM, start, 'recorded-regular');
  const opts = (name) => ({ garage: GARAGE, spaceClass: 'standard', start, name });
  const early = specialsPlan(regular, { kind: 'add', special: EARLY_BIRD }, opts('recorded-early'));
  const change = specialsPlan(early, { kind: 'change', index: 0, special: { ...EARLY_BIRD, flat: '15' } }, opts('recorded-change'));
  const max = build(MAX_FORM, start, 'recorded-max');
  const gap = build(REGULAR_FORM, start, 'recorded-gap');
  gap.rules = gap.rules.filter((r) => r.type !== 'daily_max').map((r) => (r.type === 'increment' ? { ...r, max_duration_minutes: 1440 } : r));
  const other = specialsPlan(specialsPlan(early, { kind: 'add', special: WEEKEND_RATE }, opts('x')), { kind: 'add', special: MEMBERS }, opts('recorded-other'));
  const maxStay = { entry: STAYS.maxDays.entry, exit: STAYS.maxDays.exit };
  return { garage: RECORDED_GARAGE, regular, early, change, max, gap, other, maxStay, windows: orderedWindows(other).map((r) => r.id) };
}
