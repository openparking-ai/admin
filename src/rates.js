// A garage's rates, in words, and the plan the owner's Rates form builds.
//
// The platform keeps every rate plan the garage has stored (GET and POST
// /garages/:id/rate-plans), each whole, as the rate engine reads it: when it
// starts, a time-based rate, a max per day or per week, a free grace period
// and the special rates. A plan is never changed: a new one takes over from
// the moment it is confirmed (U7i: nothing is scheduled), and the old ones
// stay on record. The engine decides
// every price; nothing here prices a stay. This file only puts a plan into
// plain sentences, builds a plan from the form, and builds the example stays
// the platform's "try" prices for the owner to check before saving.
//
// Every time here is the GARAGE'S. No engine word reaches the screen: the
// sentences and the finding words are in the dictionaries.

import { garageInstant } from './taxes.js';

const LOCALES = { en: 'en-US', es: 'es-US' };
const locale = (language) => LOCALES[language] ?? LOCALES.en;

/** The days of the week, as a plan names them, Monday first. */
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * The special-rate choices, in his words (2026-09-07): each fills the days it
 * means, which the owner can then change. Holiday or event dates are typed.
 */
export const PRESETS = {
  weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  weekends: ['sat', 'sun'],
  everyDay: DAYS,
  evenings: DAYS,
  mornings: DAYS,
  dates: null,
};
export const PRESET_KEYS = Object.keys(PRESETS);

/** How a started period is charged: in full. Every plan the page writes says so (U7i: no choice is shown). */
export const PERIOD_ROUNDING = 'ceil';
/** At most per day: a calendar day, or any 24 hours. */
export const DAY_KINDS = ['calendar_day', 'rolling_24h'];
/** At most per week: a calendar week starting on a chosen day, or any 7 days. */
export const WEEK_KINDS = ['calendar_week', 'rolling_7d'];
/** What a special charges: one price, a different time-based rate, or a change to the whole fee. */
export const CHARGES = ['flat', 'rate', 'adjust'];
export const DIRECTIONS = ['discount', 'increase'];
export const AMOUNT_KINDS = ['percent', 'fixed'];
/** Which way a part of a cent goes, for a discount or an increase. */
export const ADJUST_ROUNDINGS = ['down', 'up'];

// --- money -------------------------------------------------------------------

/** How many digits after the point this currency has: 2 for dollars, 0 for yen. */
export function currencyDigits(currency) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

/** An amount in the currency's smallest unit as people write it: 800 is "$8.00". */
export function moneyText(minor, currency, language) {
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat(locale(language), { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    Number(minor) / 10 ** digits,
  );
}

/**
 * What the owner typed as an amount, in the currency's smallest unit: "8" and
 * "8.00" are 800 for dollars, "8,5" is 850. `{ minor }`, or `{ problem }`:
 * 'empty', 'shape' or 'zero' (zero is allowed only with `zeroOk`).
 */
export function parseMoney(typed, currency, { zeroOk = false } = {}) {
  const said = String(typed ?? '').trim();
  if (said === '') return { problem: 'empty' };
  const text = said.replace(/^[^\d]*/, '');
  if (text === '') return { problem: 'shape' };
  const digits = currencyDigits(currency);
  const shape = digits === 0 ? /^(\d{1,7})$/ : new RegExp(`^(\\d{1,7})(?:[.,](\\d{1,${digits}}))?$`);
  const m = shape.exec(text);
  if (!m) return { problem: 'shape' };
  const minor = Number(m[1]) * 10 ** digits + Number((m[2] ?? '').padEnd(digits, '0') || 0);
  if (minor === 0 && !zeroOk) return { problem: 'zero' };
  return { minor };
}

/** An amount as the owner would type it again: 800 is "8.00". */
export const typedMoney = (minor, currency) => (Number(minor) / 10 ** currencyDigits(currency)).toFixed(currencyDigits(currency));

/** A whole number of minutes, 1 to 99999, as typed. `{ minutes }` or `{ problem }`. */
export function parseMinutes(typed) {
  const text = String(typed ?? '').trim();
  if (text === '') return { problem: 'empty' };
  if (!/^\d{1,5}$/.test(text)) return { problem: 'shape' };
  const minutes = Number(text);
  return minutes > 0 ? { minutes } : { problem: 'zero' };
}

/** A percent as typed, in hundredths: "10" is 1000, "12.5" is 1250. `{ bp }` or `{ problem }`. */
export function parsePercent(typed) {
  const text = String(typed ?? '').trim().replace(/\s*%$/, '');
  if (text === '') return { problem: 'empty' };
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text);
  if (!m) return { problem: 'shape' };
  const bp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return bp > 0 ? { bp } : { problem: 'zero' };
}

/** A clock time as typed into a time field: "06:00". `{ at }` or `{ problem }`. */
export function parseClock(typed) {
  const text = String(typed ?? '').trim();
  if (text === '') return { problem: 'empty' };
  const m = /^(\d{2}):(\d{2})$/.exec(text);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { problem: 'shape' };
  return { at: text };
}

// --- words -------------------------------------------------------------------

/** A length of time in words: 60 is "1 hour", 90 is "1 hour 30 minutes", 1500 is "1 day 1 hour". */
export function lengthWords(t, minutes) {
  const m = Math.max(0, Math.round(Number(minutes)));
  if (m === 0) return t('rates.len.none');
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  const parts = [];
  if (days) parts.push(t(days === 1 ? 'rates.len.day' : 'rates.len.days', { count: days }));
  if (hours) parts.push(t(hours === 1 ? 'rates.len.hour' : 'rates.len.hours', { count: hours }));
  if (mins) parts.push(t(mins === 1 ? 'rates.len.minute' : 'rates.len.minutes', { count: mins }));
  return parts.join(' ');
}

/** A period as a sentence says "each ...": 60 is "hour", 120 is "2 hours", 30 is "30 minutes". */
const periodWords = (t, minutes) => (minutes === 60 ? t('rates.len.anHour') : minutes % 60 === 0 ? t('rates.len.hours', { count: minutes / 60 }) : t('rates.len.minutes', { count: minutes }));

/** A day of the week in the language: 'mon' is "Monday", "lunes". */
export function dayName(day, language) {
  // 2024-01-01 was a Monday.
  const at = Date.UTC(2024, 0, 1 + DAYS.indexOf(day), 12);
  return new Intl.DateTimeFormat(locale(language), { weekday: 'long', timeZone: 'UTC' }).format(at);
}

/** A day of the week, short: 'mon' is "Mon", "lun". */
export function dayShort(day, language) {
  const at = Date.UTC(2024, 0, 1 + DAYS.indexOf(day), 12);
  return new Intl.DateTimeFormat(locale(language), { weekday: 'short', timeZone: 'UTC' }).format(at);
}

/** A typed date in words: "2026-12-25" is "Dec 25, 2026". */
export function dateWords(day, language) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ''));
  if (!m) return String(day ?? '');
  return new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

/** A clock time in the language: "06:00" is "6:00 AM", "6:00 a. m.". */
export function clockWords(at, language) {
  const m = /^(\d{2}):(\d{2})/.exec(String(at ?? ''));
  if (!m) return String(at ?? '');
  return new Intl.DateTimeFormat(locale(language), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(Date.UTC(2024, 0, 1, Number(m[1]), Number(m[2])));
}

/** The days a special covers, in words: every day, Monday to Friday, or each day named. */
export function daysWords(t, appliesOn, language) {
  if (appliesOn?.kind === 'dates') return t('rates.on.dates', { dates: (appliesOn.dates ?? []).map((d) => dateWords(d, language)).join(', ') });
  const days = DAYS.filter((d) => (appliesOn?.days ?? []).includes(d));
  if (days.length === 7) return t('rates.on.everyDay');
  if (days.join() === PRESETS.weekdays.join()) return t('rates.on.weekdays');
  if (days.join() === PRESETS.weekends.join()) return t('rates.on.weekends');
  // Named Sunday first, as the approved page lists them.
  const order = ['sun', ...DAYS.slice(0, 6)];
  return order.filter((d) => days.includes(d)).map((d) => dayName(d, language)).join(', ');
}

/** A time-based rate in words: "First hour $8.00, then $4.00 each hour." */
export function timeRateWords(t, rate, currency, language) {
  const money = (minor) => moneyText(minor, currency, language);
  return t('rates.time.firstThen', {
    first: rate.first_period_minutes === 60 && rate.repeat_period_minutes === 60 ? t('rates.len.firstHour') : t('rates.len.firstOf', { length: periodWords(t, rate.first_period_minutes) }),
    price: money(rate.first_period_minor),
    next: money(rate.repeat_period_minor),
    period: periodWords(t, rate.repeat_period_minutes),
  });
}

/** A percent in hundredths as people write it: 1250 is "12.5%". */
export const percentWords = (bp, language) => `${(Number(bp) / 100).toLocaleString(locale(language), { maximumFractionDigits: 2 })}%`;

/** What a special charges, in words: "$12.00 for the stay", "first hour $5.00, then $2.00 each hour", "10% off the price". */
function chargeWords(t, effect, currency, language) {
  const money = (minor) => moneyText(minor, currency, language);
  if (effect.kind === 'flat') return t('rates.charge.flat', { price: money(effect.price_minor) });
  if (effect.kind === 'rate') {
    return t('rates.charge.rate', {
      first: periodWords(t, effect.first_period_minutes),
      price: money(effect.first_period_minor),
      next: money(effect.repeat_period_minor),
      period: periodWords(t, effect.repeat_period_minutes),
    });
  }
  if (effect.kind === 'adjust') {
    const amount = effect.amount.kind === 'percent' ? percentWords(effect.amount.percent_bp, language) : money(effect.amount.minor);
    return t(`rates.charge.${effect.direction === 'increase' ? 'increase' : 'discount'}`, { amount });
  }
  return t('rates.charge.other');
}

/** When a special's car must come in and leave by, in words. */
function windowWords(t, rule, language) {
  return t(rule.day_span === 'next_day' ? 'rates.window.nextDay' : 'rates.window.sameDay', {
    from: clockWords(rule.enter_from, language),
    by: clockWords(rule.enter_by, language),
    leave: clockWords(rule.exit_by, language),
  });
}

/** A special's name: the one the owner gave it, or its place in the list. */
export const specialName = (t, rule, i) => (rule.label && String(rule.label).trim() ? String(rule.label).trim() : t('rates.special.unnamed', { n: i + 1 }));

/** One special in one sentence, after its name: its days, its times and its price. */
export const specialSentence = (t, rule, currency, language) => `${daysWords(t, rule.applies_on, language)}, ${windowWords(t, rule, language)}: ${chargeWords(t, rule.effect, currency, language)}`;

/**
 * A plan's regular rates in plain sentences, one per thing it charges: the
 * time-based rate, the max per day and per week, grace. `{ key, text }`.
 */
export function regularSentences(t, plan, language) {
  const out = [];
  const currency = plan.currency;
  const money = (minor) => moneyText(minor, currency, language);
  const rules = plan.rules ?? [];
  for (const rule of rules.filter((r) => r.type === 'increment')) out.push({ key: rule.id, text: timeRateWords(t, rule, currency, language) });
  for (const rule of rules.filter((r) => r.type === 'daily_max')) {
    out.push({ key: rule.id, text: t(rule.day_boundary === 'rolling_24h' ? 'rates.dayMax.rolling' : 'rates.dayMax.calendar', { price: money(rule.max_minor) }) });
  }
  for (const rule of rules.filter((r) => r.type === 'weekly_max')) {
    out.push({
      key: rule.id,
      text:
        rule.week_boundary === 'rolling_7d'
          ? t('rates.weekMax.rolling', { price: money(rule.max_minor) })
          : t('rates.weekMax.calendar', { price: money(rule.max_minor), day: dayName(rule.week_starts_on, language) }),
    });
  }
  for (const rule of rules.filter((r) => r.type === 'grace')) out.push({ key: rule.id, text: t('rates.grace.words', { length: lengthWords(t, rule.minutes) }) });
  // When the garage is full (rate-engine schema 6): the rule's own words, as the Price Lab writes it.
  for (const rule of rules.filter((r) => r.type === FILL_TYPE)) out.push({ key: rule.id, text: fillWords(t, rule, language) });
  // The extra for VIP and nested spots: a flat amount per stay, or a percent of the time charge.
  for (const rule of rules.filter((r) => r.type === 'space_surcharge')) {
    const extra = rule.amount?.kind === 'percent' ? percentWords(rule.amount.percent_bp, language) : money(rule.surcharge_minor ?? 0);
    out.push({ key: rule.id, text: t(rule.amount?.kind === 'percent' ? 'rates.vip.percent' : 'rates.vip.flat', { extra }) });
  }
  return out;
}

/** The rule that raises the time charge when the garage is at least so full (rate-engine schema 6). */
export const FILL_TYPE = 'fill_level';

/** Whether a plan has a rule that raises the time charge when the garage is full. */
export const hasFillRule = (plan) => (plan?.rules ?? []).some((r) => r?.type === FILL_TYPE);

/** "Above 80% full: time charge +20%", in the owner's language. */
export const fillWords = (t, rule, language) =>
  t('rates.fill.words', { full: percentWords(rule.threshold_bp, language), more: percentWords(rule.percent_bp, language) });

/**
 * A stay as the price table and the calculator ask for it. Rates with a fill
 * rule price on how full the garage was when the car came in; these screens
 * price every stay as below it -- the garage at 0 -- and say so beside the
 * table ("rates.fill.table").
 */
export const stayToTry = (plan, stay) => (hasFillRule(plan) ? { ...stay, occupancy_at_entry_bp: 0 } : stay);

/** What the price table and the calculator say beside their prices, for rates with a fill rule; null without one. */
export function fillNote(t, plan, language) {
  const rule = (plan?.rules ?? []).find((r) => r?.type === FILL_TYPE);
  return rule ? t('rates.fill.table', { full: percentWords(rule.threshold_bp, language), more: percentWords(rule.percent_bp, language) }) : null;
}

/**
 * A plan in plain sentences, one per thing it charges, in the order an owner
 * reads them: the regular rates, then each special. `{ key, text, name? }`: a
 * special's name is kept apart from the words, so the screen can keep a typed
 * name apart.
 */
export function planSentences(t, plan, language) {
  const out = regularSentences(t, plan, language);
  const rules = plan.rules ?? [];
  orderedWindows(plan).forEach((rule, i) => out.push({ key: rule.id, name: specialName(t, rule, i), text: specialSentence(t, rule, plan.currency, language) }));
  if (rules.some((r) => !KNOWN_TYPES.includes(r.type))) out.push({ key: 'other', text: t('rates.other') });
  if (!rules.length) out.push({ key: 'nothing', text: t('rates.nothing') });
  return out;
}

const KNOWN_TYPES = ['increment', 'daily_max', 'weekly_max', 'grace', 'time_window', 'fill_level', 'space_surcharge'];

/**
 * The regular rates as the check page's "What changes" compares them, one
 * value per row, by the name of the row: two plans whose row differs changed
 * it. `{ rowKey: text }`.
 */
export function regularRows(t, plan, language) {
  const rules = plan?.rules ?? [];
  const money = (minor) => moneyText(minor, plan.currency, language);
  const time = rules.find((r) => r.type === 'increment');
  const day = rules.find((r) => r.type === 'daily_max');
  const week = rules.find((r) => r.type === 'weekly_max');
  const grace = rules.find((r) => r.type === 'grace');
  const off = t('rates.change.off');
  return {
    'rates.change.first': time ? t('rates.change.period', { minutes: time.first_period_minutes, price: money(time.first_period_minor) }) : off,
    'rates.change.next': time ? t('rates.change.period', { minutes: time.repeat_period_minutes, price: money(time.repeat_period_minor) }) : off,
    'rates.change.dayMax': day ? t(day.day_boundary === 'rolling_24h' ? 'rates.change.dayRolling' : 'rates.change.dayCalendar', { price: money(day.max_minor) }) : off,
    'rates.change.weekMax': week
      ? week.week_boundary === 'rolling_7d'
        ? t('rates.change.weekRolling', { price: money(week.max_minor) })
        : t('rates.change.weekCalendar', { price: money(week.max_minor), day: dayName(week.week_starts_on, language) })
      : off,
    'rates.change.grace': grace ? t('rates.change.graceMinutes', { minutes: grace.minutes }) : off,
  };
}

/**
 * What a save changes, row by row: `{ key, name?, was, is }` -- a regular
 * rate's old value and new; a special added ("none" to "added"), changed (its
 * old sentence to its new) or removed ("current" to "removed"). Specials are
 * matched by their id.
 */
export function changes(t, before, after, language) {
  const out = [];
  const a = regularRows(t, before, language);
  const b = regularRows(t, after, language);
  for (const k of Object.keys(b)) if (a[k] !== b[k]) out.push({ key: k, was: a[k], is: b[k] });
  const was = orderedWindows(before);
  const is = orderedWindows(after);
  is.forEach((rule, i) => {
    const old = was.find((r) => r.id === rule.id);
    const name = specialName(t, rule, i);
    if (!old) out.push({ key: rule.id, name, was: t('rates.change.none'), is: t('rates.change.added') });
    else {
      const oldText = specialSentence(t, old, before.currency, language);
      const newText = specialSentence(t, rule, after.currency, language);
      if (oldText !== newText || specialName(t, old, was.indexOf(old)) !== name) out.push({ key: rule.id, name, was: oldText, is: newText });
    }
  });
  was.forEach((rule, i) => {
    if (!is.some((r) => r.id === rule.id)) out.push({ key: rule.id, name: specialName(t, rule, i), was: t('rates.change.current'), is: t('rates.change.removed') });
  });
  return out;
}

// --- the list ----------------------------------------------------------------

const startOf = (plan) => Date.parse(plan.effective_from);

/**
 * The plans as the page shows them, at `now`: the one in force (the latest
 * that has started) and the ones before it (newest first), each earlier one
 * with until when it was in force. `later` is kept for a plan stored before
 * U7i that starts later; nothing the page saves does.
 */
export function arrange(plans, now = new Date()) {
  const sorted = [...(plans ?? [])].sort((a, b) => startOf(a) - startOf(b));
  const at = now.getTime();
  const started = sorted.filter((p) => startOf(p) <= at);
  const current = started.at(-1) ?? null;
  const later = sorted.filter((p) => startOf(p) > at);
  const earlier = started.slice(0, -1).map((p) => ({ ...p, until: sorted[sorted.indexOf(p) + 1].effective_from })).reverse();
  return { current, later, earlier };
}

// --- the form ----------------------------------------------------------------

let keys = 0;
const nextKey = () => (keys += 1);

/** A time-based rate as the form holds it: what was typed. */
export const blankRate = () => ({ firstMinutes: '', firstPrice: '', nextMinutes: '', nextPrice: '' });

/** A special as the form holds it, after its choice is picked. */
export function blankSpecial(preset = '') {
  return {
    key: nextKey(),
    name: '',
    preset,
    days: preset && PRESETS[preset] ? [...PRESETS[preset]] : [],
    dates: preset === 'dates' ? [''] : [],
    enterFrom: '',
    enterBy: '',
    leaveBy: '',
    nextDay: null,
    charge: '',
    flat: '',
    rate: blankRate(),
    adjust: { direction: '', kind: '', value: '', rounding: '' },
  };
}

/** An empty form: nothing chosen for the owner. */
export function blankForm() {
  return {
    time: blankRate(),
    dayMax: { on: false, price: '', kind: '' },
    weekMax: { on: false, price: '', kind: '', startsOn: '' },
    grace: { on: false, minutes: '' },
    specials: [],
  };
}

const rateFrom = (rule, currency) => ({
  firstMinutes: String(rule.first_period_minutes),
  firstPrice: typedMoney(rule.first_period_minor, currency),
  nextMinutes: String(rule.repeat_period_minutes),
  nextPrice: typedMoney(rule.repeat_period_minor, currency),
});

/** Which choice a stated set of days reads as, for the drop-down. */
function presetOf(appliesOn) {
  if (appliesOn.kind === 'dates') return 'dates';
  const days = DAYS.filter((d) => appliesOn.days.includes(d)).join();
  if (days === PRESETS.weekdays.join()) return 'weekdays';
  if (days === PRESETS.weekends.join()) return 'weekends';
  return 'everyDay';
}

/** The form, as a copy of the plan in force: what it can say, filled in. */
export function formFromPlan(plan, currency) {
  const form = blankForm();
  if (!plan) return form;
  const rules = plan.rules ?? [];
  const time = rules.find((r) => r.type === 'increment');
  if (time) form.time = rateFrom(time, currency);
  const day = rules.find((r) => r.type === 'daily_max');
  if (day) form.dayMax = { on: true, price: typedMoney(day.max_minor, currency), kind: day.day_boundary };
  const week = rules.find((r) => r.type === 'weekly_max');
  if (week) form.weekMax = { on: true, price: typedMoney(week.max_minor, currency), kind: week.week_boundary, startsOn: week.week_starts_on ?? '' };
  const grace = rules.find((r) => r.type === 'grace');
  if (grace) form.grace = { on: true, minutes: String(grace.minutes) };
  form.specials = orderedWindows(plan).map((r) => specialForm(r, currency));
  return form;
}

/**
 * A plan's specials in the order it applies them: its stated order for the
 * discounts and increases, else as written. The order the page lists them in.
 */
export function orderedWindows(plan) {
  const windows = (plan?.rules ?? []).filter((r) => r.type === 'time_window');
  const order = plan?.adjust_order ?? [];
  return windows.sort((a, b) => (order.includes(a.id) && order.includes(b.id) ? order.indexOf(a.id) - order.indexOf(b.id) : 0));
}

/** One special of a plan, as the form would hold it typed in full. */
export function specialForm(r, currency) {
  const s = blankSpecial(presetOf(r.applies_on));
  s.name = r.label ?? '';
  if (r.applies_on.kind === 'dates') s.dates = [...r.applies_on.dates];
  else s.days = DAYS.filter((d) => r.applies_on.days.includes(d));
  s.enterFrom = r.enter_from;
  s.enterBy = r.enter_by;
  s.leaveBy = r.exit_by;
  s.nextDay = r.day_span === 'next_day';
  s.charge = r.effect.kind;
  if (r.effect.kind === 'flat') s.flat = typedMoney(r.effect.price_minor, currency);
  if (r.effect.kind === 'rate') s.rate = rateFrom(r.effect, currency);
  if (r.effect.kind === 'adjust') {
    s.adjust = {
      direction: r.effect.direction,
      kind: r.effect.amount.kind,
      value: r.effect.amount.kind === 'percent' ? String(r.effect.amount.percent_bp / 100) : typedMoney(r.effect.amount.minor, currency),
      rounding: r.effect.rounding,
    };
  }
  return s;
}

// --- what the owner typed, over the rates in force (U7i) --------------------
//
// No field starts with a value (the owner's walk, 2026-10-12: "no field should look like
// prefilled"). The form holds only what the owner typed; the rates in force are
// shown under each field ("Now: $15.00"). A field left empty keeps the value in
// force, a typed one replaces it. A tick starts as it is now. With no rates in
// force there is nothing to keep, so every field is needed.

/** The regular part of the form, as the owner starts it: every field empty, each tick as it is now. */
export function typedRegular(now) {
  return {
    time: blankRate(),
    dayMax: { on: now.dayMax.on, price: '', kind: '' },
    weekMax: { on: now.weekMax.on, price: '', kind: '', startsOn: '' },
    grace: { on: now.grace.on, minutes: '' },
  };
}

const typedOr = (typed, now) => (String(typed ?? '').trim() !== '' ? typed : now);
const mergeRate = (typed, now) => Object.fromEntries(Object.keys(blankRate()).map((k) => [k, typedOr(typed[k], now[k])]));

/**
 * The regular rates as they will be: what was typed, and the value in force
 * where nothing was. `now` is `formFromPlan` of the rates in force. A part
 * ticked on that was off has no value in force, so its fields are needed.
 */
export function mergeRegular(typed, now) {
  const part = (name, fields) => {
    const on = typed[name].on;
    const was = now[name].on ? now[name] : Object.fromEntries(fields.map((f) => [f, '']));
    return { on, ...Object.fromEntries(fields.map((f) => [f, on ? typedOr(typed[name][f], was[f]) : ''])) };
  };
  return {
    time: mergeRate(typed.time, now.time),
    dayMax: part('dayMax', ['price', 'kind']),
    weekMax: part('weekMax', ['price', 'kind', 'startsOn']),
    grace: part('grace', ['minutes']),
    specials: now.specials,
  };
}

/** A special as the owner starts changing it: every field empty, its day ticks as they are now. A new one: all empty. */
export function typedSpecial(now = null) {
  const s = blankSpecial();
  if (now) s.days = [...now.days];
  return s;
}

/** A special as it will be: what was typed, and the one in force where nothing was (none for a new one). */
export function mergeSpecial(typed, now = null) {
  const was = now ?? blankSpecial();
  const preset = typedOr(typed.preset, was.preset);
  const typedDates = typed.dates.some((d) => String(d).trim() !== '');
  return {
    key: typed.key,
    name: typedOr(typed.name, was.name),
    preset,
    days: typed.days,
    dates: preset === 'dates' ? (typedDates || was.preset !== 'dates' ? typed.dates : was.dates) : [],
    enterFrom: typedOr(typed.enterFrom, was.enterFrom),
    enterBy: typedOr(typed.enterBy, was.enterBy),
    leaveBy: typedOr(typed.leaveBy, was.leaveBy),
    nextDay: typed.nextDay === true || typed.nextDay === false ? typed.nextDay : was.nextDay,
    charge: typedOr(typed.charge, was.charge),
    flat: typedOr(typed.flat, was.flat),
    rate: mergeRate(typed.rate, was.rate),
    // A percent's cents: rounded down unless the owner says otherwise (the approved page's default).
    adjust: { ...Object.fromEntries(['direction', 'kind', 'value', 'rounding'].map((k) => [k, typedOr(typed.adjust[k], was.adjust[k])])), rounding: typedOr(typed.adjust.rounding, was.adjust.rounding) || 'down' },
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What is wrong with a time-based rate, as `{ field: problemKey }`. */
function rateProblems(rate, currency, prefix) {
  const out = {};
  const check = (field, result, key) => {
    if (result.problem) out[`${prefix}.${field}`] = `${key}.${result.problem}`;
  };
  check('firstMinutes', parseMinutes(rate.firstMinutes), 'rates.need.minutes');
  check('firstPrice', parseMoney(rate.firstPrice, currency, { zeroOk: true }), 'rates.need.price');
  check('nextMinutes', parseMinutes(rate.nextMinutes), 'rates.need.minutes');
  check('nextPrice', parseMoney(rate.nextPrice, currency, { zeroOk: true }), 'rates.need.price');
  return out;
}

/**
 * Everything the form still needs, as `{ field: problemKey }`. Empty when the
 * form can be built into a plan. The engine still has the last word: a plan
 * it finds a gap in is refused, and every finding is shown in plain words.
 */
export function formProblems(form, garage) {
  const out = regularProblems(form, garage);
  form.specials.forEach((s, i) => Object.assign(out, specialProblems(s, `special.${i}`, garage)));
  return out;
}

/** What the regular rates still need: the time-based rate, and each part that is ticked on. */
export function regularProblems(form, garage) {
  const currency = garage.currency;
  const out = { ...rateProblems(form.time, currency, 'time') };
  if (form.dayMax.on) {
    const p = parseMoney(form.dayMax.price, currency);
    if (p.problem) out['dayMax.price'] = `rates.need.price.${p.problem}`;
    if (!DAY_KINDS.includes(form.dayMax.kind)) out['dayMax.kind'] = 'rates.need.dayKind';
  }
  if (form.weekMax.on) {
    const p = parseMoney(form.weekMax.price, currency);
    if (p.problem) out['weekMax.price'] = `rates.need.price.${p.problem}`;
    if (!WEEK_KINDS.includes(form.weekMax.kind)) out['weekMax.kind'] = 'rates.need.weekKind';
    if (form.weekMax.kind === 'calendar_week' && !DAYS.includes(form.weekMax.startsOn)) out['weekMax.startsOn'] = 'rates.need.weekStart';
  }
  if (form.grace.on) {
    const p = parseMinutes(form.grace.minutes);
    if (p.problem) out['grace.minutes'] = `rates.need.minutes.${p.problem}`;
  }
  return out;
}

/** What one special still needs, its fields named from `at` ("special"). `others`: the names already taken. */
export function specialProblems(s, at, garage, others = []) {
  const currency = garage.currency;
  const out = {};
  if (!s.name.trim()) out[`${at}.name`] = 'rates.need.name';
  else if (others.some((n) => n.trim().toLowerCase() === s.name.trim().toLowerCase())) out[`${at}.name`] = 'rates.need.nameTaken';
  if (!PRESET_KEYS.includes(s.preset)) out[`${at}.preset`] = 'rates.need.preset';
  if (s.preset === 'dates') {
    if (!s.dates.length || s.dates.some((d) => !DATE.test(d))) out[`${at}.dates`] = 'rates.need.dates';
    else if (new Set(s.dates).size !== s.dates.length) out[`${at}.dates`] = 'rates.need.datesTwice';
  } else if (PRESET_KEYS.includes(s.preset) && !s.days.length) out[`${at}.days`] = 'rates.need.days';
  for (const field of ['enterFrom', 'enterBy', 'leaveBy']) {
    const p = parseClock(s[field]);
    if (p.problem) out[`${at}.${field}`] = `rates.need.clock.${p.problem}`;
  }
  if (!out[`${at}.enterFrom`] && !out[`${at}.enterBy`] && s.enterFrom > s.enterBy) out[`${at}.enterBy`] = 'rates.need.byAfterFrom';
  if (s.nextDay !== true && s.nextDay !== false) out[`${at}.nextDay`] = 'rates.need.nextDay';
  if (s.nextDay === false && !out[`${at}.leaveBy`] && !out[`${at}.enterFrom`] && s.leaveBy < s.enterFrom) out[`${at}.leaveBy`] = 'rates.need.leaveAfterFrom';
  if (!CHARGES.includes(s.charge)) out[`${at}.charge`] = 'rates.need.charge';
  if (s.charge === 'flat') {
    const p = parseMoney(s.flat, currency, { zeroOk: true });
    if (p.problem) out[`${at}.flat`] = `rates.need.price.${p.problem}`;
  }
  if (s.charge === 'rate') Object.assign(out, rateProblems(s.rate, currency, `${at}.rate`));
  if (s.charge === 'adjust') {
    if (!DIRECTIONS.includes(s.adjust.direction)) out[`${at}.direction`] = 'rates.need.direction';
    if (!AMOUNT_KINDS.includes(s.adjust.kind)) out[`${at}.amountKind`] = 'rates.need.amountKind';
    else {
      const p = s.adjust.kind === 'percent' ? parsePercent(s.adjust.value) : parseMoney(s.adjust.value, currency);
      const kind = s.adjust.kind === 'percent' ? 'percent' : 'price';
      if (p.problem) out[`${at}.amount`] = `rates.need.${kind}.${p.problem}`;
      else if (s.adjust.kind === 'percent' && p.bp > 10000) out[`${at}.amount`] = 'rates.need.percent.shape';
    }
    if (s.adjust.kind === 'percent' && !ADJUST_ROUNDINGS.includes(s.adjust.rounding)) out[`${at}.cent`] = 'rates.need.cent';
  }
  return out;
}

const rateDoc = (rate, currency) => ({
  first_period_minutes: parseMinutes(rate.firstMinutes).minutes,
  first_period_minor: parseMoney(rate.firstPrice, currency, { zeroOk: true }).minor,
  repeat_period_minutes: parseMinutes(rate.nextMinutes).minutes,
  repeat_period_minor: parseMoney(rate.nextPrice, currency, { zeroOk: true }).minor,
  // A period that has started is charged in full: the one way these screens write (U7i).
  rounding: PERIOD_ROUNDING,
  max_duration_minutes: null,
});

/** A plan name the page makes, unique: the moment it was made, in the garage's time, and a few letters. */
export function planName(now = Date.now(), timeZone = 'UTC', random = Math.random) {
  const stamp = garageInstant(now, timeZone).slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  return `rates-${stamp}-${Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0')}`;
}

/** One special as the engine reads it: a time window with its days, its times and what it charges. */
export function specialRule(s, id, classes, currency) {
  let effect;
  if (s.charge === 'flat') effect = { kind: 'flat', price_minor: parseMoney(s.flat, currency, { zeroOk: true }).minor };
  else if (s.charge === 'rate') effect = { kind: 'rate', ...rateDoc(s.rate, currency) };
  else {
    effect = {
      kind: 'adjust',
      direction: s.adjust.direction,
      amount: s.adjust.kind === 'percent' ? { kind: 'percent', percent_bp: parsePercent(s.adjust.value).bp } : { kind: 'fixed', minor: parseMoney(s.adjust.value, currency).minor },
      // An amount leaves no part of a cent; a percent's goes the way the owner chose.
      rounding: s.adjust.kind === 'percent' ? s.adjust.rounding : 'down',
    };
  }
  return {
    id,
    type: 'time_window',
    stage: s.charge === 'adjust' ? 'ADJUST' : 'QUALIFY',
    space_classes: classes,
    label: s.name.trim(),
    applies_on: s.preset === 'dates' ? { kind: 'dates', dates: [...s.dates] } : { kind: 'days_of_week', days: DAYS.filter((d) => s.days.includes(d)) },
    enter_from: s.enterFrom,
    enter_by: s.enterBy,
    exit_by: s.leaveBy,
    day_span: s.nextDay ? 'next_day' : 'same_day',
    effect,
  };
}

/**
 * The plan document the form says, as the engine reads it: the garage's
 * money and its one kind of space, the cheaper charge first at both places a
 * choice is made, no decisions, and every id and the plan's name made here.
 * `start` is the instant it starts, the garage's own (taxes.js).
 */
export function buildPlan(form, { garage, spaceClass, start, name }) {
  const currency = garage.currency;
  const classes = [spaceClass];
  const rules = [{ id: 'time', type: 'increment', stage: 'ACCUMULATE', space_classes: classes, ...rateDoc(form.time, currency) }];
  if (form.dayMax.on) {
    rules.push({ id: 'most-a-day', type: 'daily_max', stage: 'CAP', space_classes: classes, max_minor: parseMoney(form.dayMax.price, currency).minor, day_boundary: form.dayMax.kind });
  }
  if (form.weekMax.on) {
    rules.push({
      id: 'most-a-week',
      type: 'weekly_max',
      stage: 'CAP',
      space_classes: classes,
      max_minor: parseMoney(form.weekMax.price, currency).minor,
      week_boundary: form.weekMax.kind,
      week_starts_on: form.weekMax.kind === 'calendar_week' ? form.weekMax.startsOn : null,
    });
  }
  if (form.grace.on) rules.push({ id: 'grace', type: 'grace', stage: 'QUALIFY', space_classes: classes, minutes: parseMinutes(form.grace.minutes).minutes });
  const adjustIds = [];
  form.specials.forEach((s, i) => {
    // Numbered from 10, so ids sort in the order listed ("special-10" < "special-11").
    const rule = specialRule(s, `special-${10 + i}`, classes, currency);
    if (rule.stage === 'ADJUST') adjustIds.push(rule.id);
    rules.push(rule);
  });
  return {
    plan_version: name,
    effective_from: start,
    timezone: garage.timezone,
    currency,
    space_classes: classes,
    resolution: { QUALIFY: { mode: 'cheapest_wins' }, ACCUMULATE: { mode: 'cheapest_wins' } },
    // Discounts and extra charges apply in the order listed.
    adjust_order: adjustIds.length ? adjustIds : null,
    rules,
    decisions: [],
  };
}

// --- two saves (U7i, item 6) -------------------------------------------------
//
// The regular rates and the special rates each have their own Save. Either
// makes new rates whole -- the engine prices a whole plan -- with the other
// section exactly as it is in force: copied from the rates in force, never
// rebuilt, so a save of one cannot change the other by a byte.

const REGULAR_TYPES = ['increment', 'daily_max', 'weekly_max', 'grace'];

const PART_OF = { increment: 'time', daily_max: 'dayMax', weekly_max: 'weekMax', grace: 'grace' };

/** Whether the owner left a part of the regular section as it is in force: its tick as it was, nothing typed. */
export function partUntouched(typed, now, part) {
  const t = typed[part];
  if (part !== 'time' && t.on !== now[part].on) return false;
  return Object.entries(t).every(([k, v]) => k === 'on' || String(v ?? '').trim() === '');
}

/** Whether the owner typed nothing in the regular section and left every tick as it is: "Nothing to save." */
export const regularUntouched = (typed, now) => ['time', 'dayMax', 'weekMax', 'grace'].every((part) => partUntouched(typed, now, part));

/**
 * The kinds of space the rates in force price: those of their time-based rate,
 * when it prices the garage's own kind (rates written elsewhere may price more
 * than one, a VIP kind beside it); else the garage's own kind. A part or a
 * special the page writes prices the same kinds, so no kind is left with
 * nothing to price it.
 */
export function pricedClasses(base, spaceClass) {
  const classes = (base?.rules ?? []).find((r) => r.type === 'increment')?.space_classes;
  return Array.isArray(classes) && classes.includes(spaceClass) ? [...classes] : [spaceClass];
}

/**
 * New rates from the regular section: the time-based rate, the max per day
 * and per week and grace as typed over the rates in force (`base`, whose form
 * is `now`), and every other rule of `base` as it is, the specials and their
 * order among them. A part the owner left alone is `base`'s own rule, byte for
 * byte; a part changed keeps what the form does not show (its id, a longest stay).
 */
export function regularPlan(base, typed, now, opts) {
  const built = buildPlan({ ...mergeRegular(typed, now), specials: [] }, opts);
  if (!base) return built;
  const builtOf = (type) => built.rules.find((r) => r.type === type);
  const rules = [];
  for (const rule of base.rules ?? []) {
    if (!REGULAR_TYPES.includes(rule.type)) rules.push(rule);
    else if (partUntouched(typed, now, PART_OF[rule.type])) rules.push(rule);
    else if (builtOf(rule.type)) {
      const extra = rule.type === 'increment' ? { max_duration_minutes: rule.max_duration_minutes ?? null } : {};
      rules.push({ ...rule, ...builtOf(rule.type), id: rule.id, space_classes: rule.space_classes, ...extra });
    }
  }
  // A part ticked on that was off: its new rule, where buildPlan puts it, pricing the kinds the rates in force price.
  const classes = pricedClasses(base, opts.spaceClass);
  for (const rule of built.rules) if (!(base.rules ?? []).some((r) => r.type === rule.type)) rules.splice(built.rules.indexOf(rule), 0, { ...rule, space_classes: classes });
  return { ...base, plan_version: built.plan_version, effective_from: built.effective_from, adjust_order: base.adjust_order ?? null, rules };
}

/** A special id not in the plan: one after the highest "special-N", from 10. */
function nextSpecialId(rules) {
  const ids = new Set(rules.map((r) => r.id));
  let n = Math.max(9, ...rules.map((r) => Number(/^special-(\d+)$/.exec(r.id)?.[1] ?? 0))) + 1;
  while (ids.has(`special-${n}`)) n += 1;
  return `special-${n}`;
}

/**
 * New rates from the special section: one special added, changed or removed
 * (`change.kind`), at `change.index` in the order the page lists them;
 * `change.special` is the merged special for an add or a change. Everything
 * else of `base` is as it is in force. The specials are written in the order
 * listed, and the discounts and extra charges apply in that order.
 */
export function specialsPlan(base, change, { garage, spaceClass, start, name }) {
  const rules = base.rules ?? [];
  const list = orderedWindows(base);
  const classes = pricedClasses(base, spaceClass);
  if (change.kind === 'add') list.push(specialRule(change.special, nextSpecialId(rules), classes, garage.currency));
  // A special changed keeps what the form does not show, its id and the kinds it prices.
  else if (change.kind === 'change') list[change.index] = { ...list[change.index], ...specialRule(change.special, list[change.index].id, list[change.index].space_classes, garage.currency) };
  else if (change.kind === 'remove') list.splice(change.index, 1);
  // The discounts and extra charges in the order listed, then a rule that
  // raises the time charge when the garage is full, on what is left: the
  // engine requires a stated order to name every one of them.
  const adjust = [...list.filter((r) => r.stage === 'ADJUST').map((r) => r.id), ...rules.filter((r) => r.type === FILL_TYPE).map((r) => r.id)];
  return {
    ...base,
    plan_version: name,
    effective_from: start,
    adjust_order: adjust.length ? adjust : null,
    rules: [...rules.filter((r) => r.type !== 'time_window'), ...list],
  };
}

/** Whether two plans charge the same: equal but for their names and starts. */
export function sameRates(a, b) {
  if (!a || !b) return false;
  const rest = (p) => JSON.stringify({ ...p, plan_version: null, effective_from: null });
  return rest(a) === rest(b);
}

/** The sign written before money in the owner's language: "$" for dollars. */
export function currencySign(currency, language) {
  try {
    return new Intl.NumberFormat(locale(language), { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

/**
 * When new rates start: the moment Confirm is pressed (U7i: nothing is
 * scheduled), to the millisecond -- two plans of a garage never share an
 * instant, and a save made a moment ago is not met at the same second.
 */
export const startNow = (_garage, now = Date.now()) => new Date(now).toISOString();

// --- the garage's clock ------------------------------------------------------

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** The garage's clock at instant `ms`, as 'YYYY-MM-DDTHH:MM'. */
export function wallAt(ms, timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** The instant of a wall-clock reading in `timeZone` (the earlier of two), or null for one the clocks skip. */
export function instantOf(wall, timeZone) {
  const m = WALL.exec(String(wall ?? ''));
  if (!m) return null;
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (new Date(asUtc).toISOString().slice(0, 16) !== wall) return null;
  const offsets = new Set([asUtc - 86400000, asUtc, asUtc + 86400000].map((probe) => Date.parse(`${wallAt(probe, timeZone)}:00Z`) - probe));
  const hits = [...offsets].map((o) => asUtc - o).filter((t) => wallAt(t, timeZone) === wall).sort((a, b) => a - b);
  return hits.length ? hits[0] : null;
}

/** A wall-clock reading plus `minutes`, as the garage's clock reads it after that long. */
export const wallPlus = (wall, minutes, timeZone) => wallAt(instantOf(wall, timeZone) + minutes * 60000, timeZone);

/** The day of the week of a 'YYYY-MM-DD'. */
const weekdayOf = (day) => DAYS[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7];
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const minutesOf = (clock) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
const clockPlus = (clock, minutes) => {
  const m = (minutesOf(clock) + minutes + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// --- the price table ---------------------------------------------------------

export const TABLE_MAX = 100;
/** The ordinary stays every price table holds, in hours (the approved page's). */
const ORDINARY_HOURS = [2, 3, 5, 8, 12];

/**
 * The example stays a price table prices (the approved page's), each `{
 * entry, exit, why }`, every one after `now`, so the new rates price it: `why`
 * says what the stay is there to check, as `{ key, name? }` for the words.
 *
 *   from 10:00 on the next Saturday: the grace edges (one minute inside, one
 *   over), the first period to the minute and one minute into the next, 2,
 *   3, 5, 8 and 12 hours, a day, a day and an hour, two days, a week, and
 *   eight days when a weekly max is on;
 *   for each special, on the next day it is for (from tomorrow): coming in
 *   when it opens and at the last minute, one minute too early, one minute
 *   too late, each leaving by its "leave by"; and leaving one minute late.
 *
 * Lengths are real minutes, so across a change of the clocks the garage's
 * clock shows an hour more or less (the engine counts the same way). A moment
 * the clocks skip is left out. At most 100.
 */
export function tableStays(plan, timeZone, now = Date.now()) {
  const today = wallAt(now, timeZone).slice(0, 10);
  const out = [];
  const add = (entry, exit, why) => {
    if (out.length >= TABLE_MAX) return;
    const entryMs = instantOf(entry, timeZone);
    if (entryMs === null || entryMs < now) return;
    if (typeof exit === 'number') exit = wallAt(entryMs + exit * 60000, timeZone);
    const exitMs = instantOf(exit, timeZone);
    if (exitMs === null || exitMs < entryMs) return;
    out.push({ entry, exit, why });
  };
  const rules = plan.rules ?? [];
  const time = rules.find((r) => r.type === 'increment');
  const day = rules.find((r) => r.type === 'daily_max');
  const week = rules.find((r) => r.type === 'weekly_max');
  const grace = rules.find((r) => r.type === 'grace');
  let saturday = addDays(today, 1);
  while (weekdayOf(saturday) !== 'sat') saturday = addDays(saturday, 1);
  const at10 = `${saturday}T10:00`;
  if (grace) {
    add(at10, grace.minutes, { key: 'graceInside' });
    add(at10, grace.minutes + 1, { key: 'graceOver' });
  }
  if (time) {
    add(at10, time.first_period_minutes, { key: 'firstPeriod' });
    add(at10, time.first_period_minutes + 1, { key: 'nextPeriod' });
  }
  for (const h of ORDINARY_HOURS) add(at10, h * 60, { key: 'length' });
  add(at10, 1440, { key: day ? 'dayMax' : 'day' });
  add(at10, 1500, { key: 'dayAndHour' });
  add(at10, 2880, { key: 'twoDays' });
  add(at10, 7 * 1440, { key: week ? 'weekMax' : 'week' });
  if (week) add(at10, 8 * 1440, { key: 'eightDays' });

  const covers = (r, d) => (r.applies_on.kind === 'dates' ? r.applies_on.dates.includes(d) : r.applies_on.days.includes(weekdayOf(d)));
  orderedWindows(plan).forEach((r) => {
    const name = r.label ?? '';
    let d = null;
    for (let n = 1; n <= 400 && d === null; n += 1) if (covers(r, addDays(today, n))) d = addDays(today, n);
    if (d === null) return;
    const leave = `${r.day_span === 'next_day' ? addDays(d, 1) : d}T${r.exit_by}`;
    add(`${d}T${r.enter_from}`, leave, { key: 'specialFrom', name, id: r.id });
    add(`${d}T${r.enter_by}`, leave, { key: 'specialBy', name, id: r.id });
    if (r.enter_from !== '00:00') add(`${d}T${clockPlus(r.enter_from, -1)}`, leave, { key: 'specialTooEarly', name, id: r.id });
    if (r.enter_by !== '23:59') add(`${d}T${clockPlus(r.enter_by, 1)}`, leave, { key: 'specialTooLate', name, id: r.id });
    if (instantOf(leave, timeZone) !== null) add(`${d}T${r.enter_from}`, wallPlus(leave, 1, timeZone), { key: 'specialLeftLate', name, id: r.id });
  });
  return out;
}

// --- what a stay paid, in words ---------------------------------------------

const CAPS = { 'daily_max.applied': 'day', 'weekly_max.applied': 'week' };

/** "3 more hours at $4.00", "126 more 15-minute periods at $10.00", from a repeat period's count. */
function morePeriods(t, count, minutes, price) {
  const unit = minutes === 60 ? (count === 1 ? 'hour' : 'hours') : minutes % 60 === 0 ? (count === 1 ? 'hourPeriod' : 'hourPeriods') : count === 1 ? 'minutePeriod' : 'minutePeriods';
  return t(`rates.line.more.${unit}`, { count, length: minutes % 60 === 0 ? minutes / 60 : minutes, price });
}

/** "First hour", "First 30 minutes". */
const firstPeriod = (t, minutes) => (minutes === 60 ? t('rates.line.firstHour') : t('rates.line.firstOf', { length: periodWords(t, minutes) }));

/**
 * A priced stay's lines, each in plain words with its amount, from the
 * engine's own lines (the approved page's words): the first period, the
 * periods after it ("3 more hours at $4.00"), a special, grace, a discount or
 * extra charge, and each tax. When a max per day or per week applies, the
 * lines it brings down are one line, "Max per day" (or "Max per day, 2 days at
 * $100.00"), with the amount charged; `byHour` is then what the lines before
 * it came to ("By the hour it would be ..."). `{ lines, byHour }`.
 */
export function lineWords(t, stay, plan, taxNames, currency, language) {
  const rules = plan?.rules ?? [];
  const windows = orderedWindows(plan);
  const ruleOf = (id) => rules.find((r) => r.id === id);
  const nameOf = (id) => {
    const rule = ruleOf(id);
    return rule ? specialName(t, rule, windows.indexOf(rule)) : t('rates.line.aSpecial');
  };
  const money = (minor) => moneyText(minor, currency, language);
  const rl = stay.rate_lines ?? [];
  const capAt = rl.map((l, i) => (CAPS[l.code] ? i : -1)).filter((i) => i >= 0);
  const lastCap = capAt.at(-1) ?? -1;
  const before = (i) => rl.slice(0, i).reduce((sum, l) => sum + l.delta_minor, 0);
  const out = [];
  const push = (words, minor, extra = {}) => out.push({ words, amount: money(minor), minor, ...extra });
  rl.forEach((line, i) => {
    // Brought down by a max: said once, on the last max's line.
    if (i < lastCap && line.delta_minor !== 0) return;
    const rule = ruleOf(line.rule_id);
    // A special at its own hourly rate prices with the engine's period lines, under the special's id.
    const own = rule?.type === 'time_window' ? rule.effect : rule;
    const named = (words) => (rule?.type === 'time_window' ? `${nameOf(rule.id)}: ${words.charAt(0).toLocaleLowerCase()}${words.slice(1)}` : words);
    if (line.code === 'grace.applied') push(t('rates.line.grace', { minutes: rule?.minutes ?? 0 }), line.delta_minor);
    else if (line.code === 'increment.first_period') push(named(firstPeriod(t, own?.first_period_minutes ?? 60)), line.delta_minor);
    else if (line.code === 'increment.repeat_periods') {
      const price = own?.repeat_period_minor ?? 0;
      const count = price > 0 ? line.delta_minor / price : Math.ceil(Math.max(0, stay.minutes - (own?.first_period_minutes ?? 0)) / (own?.repeat_period_minutes ?? 1));
      push(own && Number.isInteger(count) ? named(morePeriods(t, count, own.repeat_period_minutes, money(price))) : t('rates.line.other'), line.delta_minor);
    } else if (CAPS[line.code]) {
      if (i !== lastCap) return;
      const charged = before(i + 1);
      const max = rule?.max_minor ?? 0;
      const n = max > 0 ? charged / max : 1;
      const unit = CAPS[line.code];
      push(n === 1 || !Number.isInteger(n) ? t(`rates.line.${unit}Max`) : t(`rates.line.${unit}MaxMany`, { count: n, price: money(max) }), charged, { cap: unit });
    } else if (line.code === 'fill_level.applied' && rule) {
      push(t('rates.line.fill', { full: percentWords(rule.threshold_bp, language), more: percentWords(rule.percent_bp, language) }), line.delta_minor);
    } else if (line.code === 'fill_level.extra_raised' && rule) {
      push(t('rates.line.fillExtra', { more: percentWords(rule.percent_bp, language) }), line.delta_minor);
    } else if (line.code === 'time_window.applied' && rule?.stage === 'ADJUST') {
      const e = rule.effect;
      const amount = e.amount.kind === 'percent' ? percentWords(e.amount.percent_bp, language) : money(e.amount.minor);
      push(t(e.direction === 'increase' ? 'rates.line.extra' : 'rates.line.off', { name: nameOf(rule.id), amount }), line.delta_minor);
    } else if (line.code === 'time_window.applied') {
      const name = nameOf(line.rule_id);
      if (rule?.effect?.kind === 'flat') push(t('rates.line.specialFlat', { name }), line.delta_minor);
      // Its own hourly rate: said by the period lines that follow it.
      else if (line.delta_minor !== 0) push(t('rates.line.special', { name }), line.delta_minor);
    } else if (line.delta_minor !== 0) push(t('rates.line.other'), line.delta_minor);
  });
  for (const line of stay.tax_lines ?? []) push(taxNames?.[line.rule_id] ?? t('rates.line.tax'), line.delta_minor, { tax: true });
  return { lines: out, byHour: lastCap >= 0 ? before(capAt[0]) : null };
}

/**
 * Which special priced a stay, or none and why, in the approved page's words:
 * free within the grace period; a special that applied and what the
 * time-based rate would have been; one that fit but the time-based rate was
 * cheaper; the others that fit and cost more; each that did not fit and why
 * (the day, too early, too late, left too late); each discount or extra
 * charge that applied; and the max per day or per week, when it was charged.
 * The engine decided which way the stay was priced; the reasons a special did
 * not fit are its conditions read against the stay's own times.
 */
export function specialWords(t, stay, plan, language) {
  const lines = stay.rate_lines ?? [];
  if (lines.some((l) => l.code === 'grace.applied')) return t('rates.why.grace');
  const windows = orderedWindows(plan);
  const name = (rule) => specialName(t, rule, windows.indexOf(rule));
  const money = (minor) => moneyText(minor, plan?.currency, language);
  const fit = (rule) => missed(rule, stay.entry, stay.exit) === 'fit';
  const used = lines.find((l) => l.code === 'special_used');
  const timeUsed = lines.find((l) => l.code === 'time_based_used');
  const best = windows.find((r) => r.id === (used ?? timeUsed)?.rule_id) ?? null;
  const notFit = windows.filter((r) => !fit(r)).map((r) => t(`rates.why.${missed(r, stay.entry, stay.exit)}`, { name: name(r), day: dayName(weekdayOf(stay.entry.slice(0, 10)), language), date: dateWords(stay.entry.slice(0, 10), language) }));
  const parts = [];
  if (best) {
    if (used) parts.push(Number.isInteger(used.compared_minor) ? t('rates.why.appliedTimeMore', { name: name(best), time: money(used.compared_minor) }) : t('rates.why.appliedOnly', { name: name(best) }));
    else parts.push(t('rates.why.timeLess', { name: name(best), special: money(timeUsed.compared_minor) }));
    for (const r of windows) if (r !== best && r.stage === 'QUALIFY' && fit(r)) parts.push(t('rates.why.alsoFit', { name: name(r) }));
    parts.push(...notFit);
  } else parts.push(notFit.length ? `${t('rates.why.none')} ${notFit.join(' ')}` : t('rates.why.none'));
  for (const l of lines) {
    const rule = windows.find((r) => r.id === l.rule_id);
    if (l.code === 'time_window.applied' && rule?.stage === 'ADJUST') parts.push(t('rates.why.applied', { name: name(rule) }));
  }
  const cap = lines.filter((l) => CAPS[l.code]).at(-1);
  if (cap) parts.push(t(CAPS[cap.code] === 'day' ? 'rates.why.dayMax' : 'rates.why.weekMax'));
  return parts.join(' ');
}

/** What a price-table row is there to check, in words. */
export const caseKey = (row) => row.why.key;
export const caseWords = (t, row) => t(`rates.test.${row.why.key}`, { name: row.why.name ?? '' });

/**
 * The first condition of a special a stay missed, as the engine checks them --
 * the day, the time in, the leaving -- or 'fit'. Times are the garage's clock,
 * 'YYYY-MM-DDTHH:MM'; "come in by" and "leave by" are to the minute, inclusive.
 */
function missed(rule, entry, exit) {
  if (!entry || !exit) return 'notFit';
  const day = entry.slice(0, 10);
  const onDay = rule.applies_on.kind === 'dates' ? rule.applies_on.dates.includes(day) : rule.applies_on.days.includes(weekdayOf(day));
  if (!onDay) return rule.applies_on.kind === 'dates' ? 'otherDate' : 'otherDay';
  const at = entry.slice(11);
  if (at < rule.enter_from) return 'tooEarly';
  if (at > rule.enter_by) return 'tooLate';
  const lastDay = rule.day_span === 'next_day' ? addDays(day, 1) : day;
  if (exit.slice(0, 10) > lastDay) return rule.day_span === 'next_day' ? 'leftAfterNextDay' : 'leftLaterDay';
  if (exit > `${lastDay}T${rule.exit_by}`) return 'leftLate';
  return 'fit';
}

// --- the engine's findings, in words -----------------------------------------

/** Every finding the engine can return (rate-engine findings.py), each with its own sentence. */
export const FINDING_CODES = [
  'GAP_UNDECLARED_SPACE_CLASS',
  'GAP_NO_ACCUMULATE_RULE',
  'GAP_STAY_EXCEEDS_MAX_DURATION',
  'GAP_NO_PLAN_IN_FORCE_AT_ENTRY',
  'GAP_NO_TAX_SET_IN_FORCE',
  'GAP_NO_OCCUPANCY_AT_ENTRY',
  'CONFLICT_AMBIGUOUS_PLAN_SELECTION',
  'CONFLICT_OVERLAPPING_FILL_RULES',
  'CONFLICT_NEGATIVE_TOTAL',
  'CONFLICT_UNORDERED_ADJUSTMENTS',
  'FAULT_RULE_RETURNED_NOT_LINES',
];

/** The dictionary key of a finding's sentence; a code these screens do not know has the plainest. */
export const findingKey = (code) => `rates.finding.${FINDING_CODES.includes(code) ? code : 'other'}`;

/**
 * One finding in a plain sentence: what is wrong, which of the owner's
 * specials or rates it is about, and the car the engine tried -- when it came
 * in and how long it stayed, in the garage's time.
 */
export function findingWords(t, finding, plan, timeZone, language) {
  const rules = plan?.rules ?? [];
  const windows = rules.filter((r) => r.type === 'time_window');
  const named = (finding.rule_ids ?? [])
    .map((id) => {
      const rule = rules.find((r) => r.id === id);
      if (!rule) return null;
      if (rule.type === 'time_window') return specialName(t, rule, windows.indexOf(rule));
      return t(`rates.ruleName.${rule.type in RULE_NAMES ? rule.type : 'other'}`);
    })
    .filter(Boolean);
  const about = named.length ? t('rates.finding.about', { names: named.join(', ') }) : '';
  let car = '';
  const probe = finding.probe;
  if (probe?.entry_at && probe?.exit_at) {
    const entry = wallAt(Date.parse(probe.entry_at), timeZone);
    const minutes = Math.round((Date.parse(probe.exit_at) - Date.parse(probe.entry_at)) / 60000);
    car = t('rates.finding.car', { day: dayName(weekdayOf(entry.slice(0, 10)), language), time: clockWords(entry.slice(11), language), length: lengthWords(t, minutes) });
  }
  return [t(findingKey(finding.code)), about, car].filter(Boolean).join(' ');
}

const RULE_NAMES = { increment: 1, daily_max: 1, weekly_max: 1, grace: 1, fill_level: 1 };
