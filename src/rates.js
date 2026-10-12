// A garage's rates, in words, and the plan the owner's Rates form builds.
//
// The platform keeps every rate plan the garage has stored (GET and POST
// /garages/:id/rate-plans), each whole, as the rate engine reads it: when it
// starts, a time-based rate, at most per day or per week, a free grace
// period and the special rates. A plan is never changed: a new one takes over
// from when it starts, and the old ones stay on record. The engine decides
// every price; nothing here prices a stay. This file only puts a plan into
// plain sentences, builds a plan from the form, and builds the example stays
// the platform's "try" prices for the owner to check before saving.
//
// Every time here is the GARAGE'S. No engine word reaches the screen: the
// sentences and the finding words are in the dictionaries.

import { garageInstant, startOfDay } from './taxes.js';

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
  evenings: DAYS,
  mornings: DAYS,
  everyDay: DAYS,
  dates: null,
};
export const PRESET_KEYS = Object.keys(PRESETS);

/** How a started period is charged: the engine's own choices (it has one today). */
export const PERIOD_ROUNDINGS = ['ceil'];
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
  const text = String(typed ?? '').trim().replace(/^[^\d]*/, '');
  if (text === '') return { problem: 'empty' };
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

/** A period as a sentence says "each ...": 60 is "hour", 30 is "30 minutes". */
const periodWords = (t, minutes) => (minutes === 60 ? t('rates.len.anHour') : minutes === 1440 ? t('rates.len.aDay') : lengthWords(t, minutes));

/** A day of the week in the language: 'mon' is "Monday", "lunes". */
export function dayName(day, language) {
  // 2024-01-01 was a Monday.
  const at = Date.UTC(2024, 0, 1 + DAYS.indexOf(day), 12);
  return new Intl.DateTimeFormat(locale(language), { weekday: 'long', timeZone: 'UTC' }).format(at);
}

const listWords = (items, language) => new Intl.ListFormat(language === 'es' ? 'es' : 'en', { style: 'long', type: 'conjunction' }).format(items);

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

/** The days a special covers, in words: every day, the weekdays, or each day named. */
export function daysWords(t, appliesOn, language) {
  if (appliesOn?.kind === 'dates') return t('rates.on.dates', { dates: listWords((appliesOn.dates ?? []).map((d) => dateWords(d, language)), language) });
  const days = DAYS.filter((d) => (appliesOn?.days ?? []).includes(d));
  if (days.length === 7) return t('rates.on.everyDay');
  if (days.join() === PRESETS.weekdays.join()) return t('rates.on.weekdays');
  if (days.join() === PRESETS.weekends.join()) return t('rates.on.weekends');
  return t('rates.on.days', { days: listWords(days.map((d) => dayName(d, language)), language) });
}

/** A time-based rate in words: "First hour $8.00, then $4.00 each hour." */
export function timeRateWords(t, rate, currency, language) {
  const money = (minor) => moneyText(minor, currency, language);
  if (rate.first_period_minutes === rate.repeat_period_minutes && rate.first_period_minor === rate.repeat_period_minor) {
    return t('rates.time.flat', { price: money(rate.first_period_minor), period: periodWords(t, rate.first_period_minutes) });
  }
  return t('rates.time.firstThen', {
    first: rate.first_period_minutes === 60 ? t('rates.len.firstHour') : t('rates.len.firstOf', { length: lengthWords(t, rate.first_period_minutes) }),
    price: money(rate.first_period_minor),
    next: money(rate.repeat_period_minor),
    period: periodWords(t, rate.repeat_period_minutes),
  });
}

/** What a special charges, in words. */
function chargeWords(t, effect, currency, language) {
  const money = (minor) => moneyText(minor, currency, language);
  if (effect.kind === 'flat') return t('rates.charge.flat', { price: money(effect.price_minor) });
  if (effect.kind === 'rate') return timeRateWords(t, effect, currency, language);
  if (effect.kind === 'adjust') {
    const amount = effect.amount.kind === 'percent' ? percentWords(effect.amount.percent_bp, language) : money(effect.amount.minor);
    return t(`rates.charge.${effect.direction === 'increase' ? 'increase' : 'discount'}`, { amount }) + ' ' + t(`rates.charge.cent.${effect.rounding === 'up' ? 'up' : 'down'}`);
  }
  return t('rates.charge.other');
}

/** A percent in hundredths as people write it: 1250 is "12.5%". */
export const percentWords = (bp, language) => `${(Number(bp) / 100).toLocaleString(locale(language), { maximumFractionDigits: 2 })}%`;

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

/**
 * A plan in plain sentences, one per thing it charges, in the order an owner
 * reads them: the time-based rate, the most a day or a week, grace, then each
 * special. `{ key, text, name? }`: a special's name is kept apart from the
 * words, so the screen can keep a typed name apart.
 */
export function planSentences(t, plan, language) {
  const out = [];
  const currency = plan.currency;
  const money = (minor) => moneyText(minor, currency, language);
  const rules = plan.rules ?? [];
  for (const rule of rules.filter((r) => r.type === 'increment')) {
    out.push({ key: rule.id, text: timeRateWords(t, rule, currency, language) });
    out.push({ key: `${rule.id}-started`, text: t('rates.time.started') });
  }
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
  for (const rule of rules.filter((r) => r.type === 'grace')) {
    out.push({ key: rule.id, text: t('rates.grace.words', { length: lengthWords(t, rule.minutes) }) });
  }
  const specials = rules.filter((r) => r.type === 'time_window');
  specials.forEach((rule, i) => {
    out.push({
      key: rule.id,
      name: specialName(t, rule, i),
      text: `${daysWords(t, rule.applies_on, language)}, ${windowWords(t, rule, language)}: ${chargeWords(t, rule.effect, currency, language)}`,
    });
  });
  const changes = specials.filter((r) => r.stage === 'ADJUST');
  if (changes.length > 1) out.push({ key: 'adjust-order', text: t('rates.adjust.order') });
  if (rules.some((r) => !KNOWN_TYPES.includes(r.type))) out.push({ key: 'other', text: t('rates.other') });
  if (!rules.length) out.push({ key: 'nothing', text: t('rates.nothing') });
  return out;
}

const KNOWN_TYPES = ['increment', 'daily_max', 'weekly_max', 'grace', 'time_window'];

// --- the list ----------------------------------------------------------------

const startOf = (plan) => Date.parse(plan.effective_from);

/**
 * The plans as the page shows them, at `now`: the one in force (the latest
 * that has started), the ones that start later (soonest first) and the ones
 * before it (newest first), each earlier one with until when it was in force.
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
export const blankRate = () => ({ firstMinutes: '', firstPrice: '', nextMinutes: '', nextPrice: '', rounding: '' });

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
    starts: 'now',
    day: '',
  };
}

const rateFrom = (rule, currency) => ({
  firstMinutes: String(rule.first_period_minutes),
  firstPrice: typedMoney(rule.first_period_minor, currency),
  nextMinutes: String(rule.repeat_period_minutes),
  nextPrice: typedMoney(rule.repeat_period_minor, currency),
  rounding: rule.rounding ?? '',
});

/** Which choice a stated set of days reads as, for the drop-down. */
function presetOf(appliesOn) {
  if (appliesOn.kind === 'dates') return 'dates';
  const days = DAYS.filter((d) => appliesOn.days.includes(d)).join();
  if (days === PRESETS.weekdays.join()) return 'weekdays';
  if (days === PRESETS.weekends.join()) return 'weekends';
  if (days === DAYS.join()) return 'everyDay';
  return 'everyDay';
}

/**
 * The form, as a copy of the plan in force: what it can say, filled in. The
 * start is always chosen again ("Now" until the owner picks a day).
 */
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
  // Specials in the order the plan applies them: its stated order for the
  // discounts and increases, else as written.
  const windows = rules.filter((r) => r.type === 'time_window');
  const order = plan.adjust_order ?? [];
  windows.sort((a, b) => (order.includes(a.id) && order.includes(b.id) ? order.indexOf(a.id) - order.indexOf(b.id) : 0));
  form.specials = windows.map((r) => {
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
  });
  return form;
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
  if (!PERIOD_ROUNDINGS.includes(rate.rounding)) out[`${prefix}.rounding`] = 'rates.need.rounding';
  return out;
}

/**
 * Everything the form still needs, as `{ field: problemKey }`. Empty when the
 * form can be built into a plan. The engine still has the last word: a plan
 * it finds a gap in is refused, and every finding is shown in plain words.
 */
/** The first day a plan may start "from the start of": tomorrow in the garage's time ("Now" covers today). */
export const firstStartDay = (garage, now = Date.now()) => addDays(wallAt(now, garage.timezone).slice(0, 10), 1);

export function formProblems(form, garage, now = Date.now()) {
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
  form.specials.forEach((s, i) => {
    const at = `special.${i}`;
    if (!s.name.trim()) out[`${at}.name`] = 'rates.need.name';
    if (!PRESET_KEYS.includes(s.preset)) out[`${at}.preset`] = 'rates.need.preset';
    if (s.preset === 'dates') {
      if (!s.dates.length || s.dates.some((d) => !DATE.test(d))) out[`${at}.dates`] = 'rates.need.dates';
      else if (new Set(s.dates).size !== s.dates.length) out[`${at}.dates`] = 'rates.need.datesTwice';
    } else if (!s.days.length) out[`${at}.days`] = 'rates.need.days';
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
        if (p.problem) out[`${at}.amount`] = `rates.need.amount.${p.problem}`;
      }
      if (!ADJUST_ROUNDINGS.includes(s.adjust.rounding)) out[`${at}.cent`] = 'rates.need.cent';
    }
  });
  if (form.starts === 'day' && !startOfDay(form.day, garage.timezone)) out.day = 'rates.need.day';
  // A start of today or earlier would price cars already parked; the platform refuses it too.
  else if (form.starts === 'day' && form.day < firstStartDay(garage, now)) out.day = 'rates.need.dayAfterToday';
  return out;
}

const rateDoc = (rate, currency) => ({
  first_period_minutes: parseMinutes(rate.firstMinutes).minutes,
  first_period_minor: parseMoney(rate.firstPrice, currency, { zeroOk: true }).minor,
  repeat_period_minutes: parseMinutes(rate.nextMinutes).minutes,
  repeat_period_minor: parseMoney(rate.nextPrice, currency, { zeroOk: true }).minor,
  rounding: rate.rounding,
  max_duration_minutes: null,
});

/** A plan name the page makes, unique: the moment it was made, in the garage's time, and a few letters. */
export function planName(now = Date.now(), timeZone = 'UTC', random = Math.random) {
  const stamp = garageInstant(now, timeZone).slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  return `rates-${stamp}-${Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0')}`;
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
    const id = `special-${10 + i}`;
    let effect;
    if (s.charge === 'flat') effect = { kind: 'flat', price_minor: parseMoney(s.flat, currency, { zeroOk: true }).minor };
    else if (s.charge === 'rate') effect = { kind: 'rate', ...rateDoc(s.rate, currency) };
    else {
      effect = {
        kind: 'adjust',
        direction: s.adjust.direction,
        amount: s.adjust.kind === 'percent' ? { kind: 'percent', percent_bp: parsePercent(s.adjust.value).bp } : { kind: 'fixed', minor: parseMoney(s.adjust.value, currency).minor },
        rounding: s.adjust.rounding,
      };
      adjustIds.push(id);
    }
    rules.push({
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
    });
  });
  return {
    plan_version: name,
    effective_from: start,
    timezone: garage.timezone,
    currency,
    space_classes: classes,
    resolution: { QUALIFY: { mode: 'cheapest_wins' }, ACCUMULATE: { mode: 'cheapest_wins' } },
    // Discounts and increases apply in the order listed: the form says so, and the owner can reorder.
    adjust_order: adjustIds.length ? adjustIds : null,
    rules,
    decisions: [],
  };
}

/** When the form's plan starts: now, or the first moment of the chosen day, in the garage's time. */
export const formStart = (form, garage, now = Date.now()) => (form.starts === 'day' ? startOfDay(form.day, garage.timezone) : garageInstant(now, garage.timezone));

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

/** The lengths every price table holds (Amendment 1, B), in minutes. */
export const TABLE_LENGTHS = [10, 30, 60, 61, 120, 180, 300, 480, 720, 1440, 1500, 2880, 10080];
export const TABLE_MAX = 100;

/**
 * The example stays a price table prices, built from the plan the form says,
 * every one on or after it starts. Each `{ entry, exit, why }`: `why` says what
 * the stay is there to test, as `{ key, name? }` for the words.
 *
 *   the lengths above, in from 10:00 on the first ordinary day it is in force;
 *   the grace edge: one minute inside, one minute over;
 *   for each special: just inside and just outside its "come in" times, its
 *   "leave by", on one of its days, on a day it does not cover, and on each
 *   typed date;
 *   the moment the day's or the week's most takes over, and just before.
 *
 * Each stay starts at a moment the garage's clock really shows. At most 100.
 */
export function tableStays(plan, timeZone) {
  const startMs = Date.parse(plan.effective_from);
  const startWall = wallAt(startMs, timeZone);
  const firstDay = startWall.slice(11) === '00:00' ? startWall.slice(0, 10) : addDays(startWall.slice(0, 10), 1);
  const out = [];
  const seen = new Set();
  const add = (entry, exit, why) => {
    if (out.length >= TABLE_MAX) return;
    // A moment the clocks skip is no moment a car came in: left out.
    const entryMs = instantOf(entry, timeZone);
    if (entryMs === null || entryMs < startMs) return;
    if (typeof exit === 'number') exit = wallAt(entryMs + exit * 60000, timeZone);
    const exitMs = instantOf(exit, timeZone);
    if (exitMs === null || exitMs < entryMs) return;
    // The same stay is in once -- once for each special it is there to test.
    const k = `${entry}|${exit}|${why.name ?? ''}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ entry, exit, why });
  };
  const rules = plan.rules ?? [];
  const windows = rules.filter((r) => r.type === 'time_window');
  const time = rules.find((r) => r.type === 'increment');
  // An ordinary day: one no special covers by its days, when there is one.
  const covers = (r, day) => (r.applies_on.kind === 'dates' ? r.applies_on.dates.includes(day) : r.applies_on.days.includes(weekdayOf(day)));
  let ordinary = firstDay;
  for (let i = 0; i < 7; i += 1) {
    const day = addDays(firstDay, i);
    if (!windows.some((r) => covers(r, day))) {
      ordinary = day;
      break;
    }
  }
  const at10 = `${ordinary}T10:00`;
  // The grace edge first, so a length that falls on it is named for it.
  const grace = rules.find((r) => r.type === 'grace');
  if (grace) {
    add(at10, grace.minutes, { key: 'graceInside' });
    add(at10, grace.minutes + 1, { key: 'graceOver' });
  }
  for (const minutes of TABLE_LENGTHS) add(at10, minutes, { key: 'length' });

  windows.forEach((r) => {
    const name = r.label;
    const days = [];
    if (r.applies_on.kind === 'dates') {
      // Each typed date; one before the plan starts is left out by `add`.
      days.push(...r.applies_on.dates);
    } else {
      for (let n = 0; n < 7 && days.length < 1; n += 1) if (covers(r, addDays(firstDay, n))) days.push(addDays(firstDay, n));
    }
    const leaveDay = (day) => (r.day_span === 'next_day' ? addDays(day, 1) : day);
    for (const day of days) {
      const from = `${day}T${r.enter_from}`;
      const by = `${day}T${r.enter_by}`;
      const leave = `${leaveDay(day)}T${r.exit_by}`;
      add(from, leave, { key: 'specialFrom', name });
      add(by, leave, { key: 'specialBy', name });
      if (r.enter_from !== '00:00') add(`${day}T${clockPlus(r.enter_from, -1)}`, leave, { key: 'specialTooEarly', name });
      if (r.enter_by !== '23:59') add(`${day}T${clockPlus(r.enter_by, 1)}`, leave, { key: 'specialTooLate', name });
      add(from, wallPlus(leave, 1, timeZone), { key: 'specialLeftLate', name });
      // A short stay inside its times: where the time-based rate can cost less
      // than the special, and the driver pays the less (the engine compares them).
      if (time && instantOf(wallPlus(from, time.first_period_minutes, timeZone), timeZone) <= instantOf(leave, timeZone)) {
        add(from, time.first_period_minutes, { key: 'specialShort', name });
      }
    }
    if (r.applies_on.kind === 'days_of_week' && r.applies_on.days.length < 7) {
      for (let n = 0; n < 7; n += 1) {
        const day = addDays(firstDay, n);
        if (!covers(r, day)) {
          add(`${day}T${r.enter_from}`, `${leaveDay(day)}T${r.exit_by}`, { key: 'specialOtherDay', name });
          break;
        }
      }
    }
  });

  // When the most a day or a week takes over, and the minute before, counted
  // the way the engine counts (rate-engine rules/daily_max.py, weekly_max.py):
  // a day's most is the most times the days the stay touches -- local dates
  // from midnight in the garage's time, or started 24 hours from entry -- and a
  // week's is the most times the weeks it touches -- calendar weeks from the
  // plan's start day, or started 7 days. Either applies only once the charge is
  // MORE than that. A calendar day or week is tried from its own midnight, so
  // the first day or week is a whole one. The row's words are then the
  // engine's own: `caseWords` reads what the breakdown says of each stay.
  const day = rules.find((r) => r.type === 'daily_max');
  const week = rules.find((r) => r.type === 'weekly_max');
  if (time && (day || week)) {
    const longest = Math.min(time.max_duration_minutes ?? Infinity, 6 * 10080);
    const charge = (m) => time.first_period_minor + (m <= time.first_period_minutes ? 0 : Math.ceil((m - time.first_period_minutes) / time.repeat_period_minutes) * time.repeat_period_minor);
    // The charge only rises as a new period starts: those minutes are where a most can first be passed.
    const steps = [1];
    for (let m = time.first_period_minutes + 1; m <= longest && steps.length < 20000; m += time.repeat_period_minutes) steps.push(m);
    const datesTouched = (entryMs, m) => Math.round((Date.parse(`${wallAt(entryMs + m * 60000, timeZone).slice(0, 10)}T12:00:00Z`) - Date.parse(`${wallAt(entryMs, timeZone).slice(0, 10)}T12:00:00Z`)) / 86400000) + 1;
    const daysOf = (entryMs, m) => (day.day_boundary === 'calendar_day' ? datesTouched(entryMs, m) : Math.max(1, Math.ceil(m / 1440)));
    const weekStart = (wallDay) => addDays(wallDay, -((DAYS.indexOf(weekdayOf(wallDay)) - DAYS.indexOf(week.week_starts_on) + 7) % 7));
    const weeksOf = (entryMs, m) => {
      if (week.week_boundary !== 'calendar_week') return Math.max(1, Math.ceil(m / 10080));
      const from = weekStart(wallAt(entryMs, timeZone).slice(0, 10));
      const to = weekStart(wallAt(entryMs + m * 60000, timeZone).slice(0, 10));
      return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 604800000) + 1;
    };
    const afterDay = (entryMs, m) => (day ? Math.min(charge(m), day.max_minor * daysOf(entryMs, m)) : charge(m));
    // The first minute at which `passed` holds, from candidates in order; and the one before.
    const firstPassed = (entryWall, candidates, passed, keys) => {
      const entryMs = instantOf(entryWall, timeZone);
      if (entryMs === null) return;
      const m = candidates.find((c) => c >= 1 && c <= longest && passed(entryMs, c));
      if (m === undefined) return;
      add(entryWall, m, { key: keys[0] });
      if (m > 1) add(entryWall, m - 1, { key: keys[1] });
    };
    if (day) {
      const entry = day.day_boundary === 'calendar_day' ? `${ordinary}T00:00` : at10;
      firstPassed(entry, steps, (e, m) => charge(m) > day.max_minor * daysOf(e, m), ['dayMaxTakes', 'dayMaxBefore']);
    }
    if (week) {
      let weekDay = firstDay;
      if (week.week_boundary === 'calendar_week') while (weekdayOf(weekDay) !== week.week_starts_on) weekDay = addDays(weekDay, 1);
      const entry = week.week_boundary === 'calendar_week' ? `${weekDay}T00:00` : at10;
      // Where the day's most rises too: each new day the stay touches.
      const entryMs = instantOf(entry, timeZone);
      const dayEdges = [];
      if (day && entryMs !== null) {
        for (let k = 1; k * 1440 <= longest + 1440; k += 1) {
          if (day.day_boundary === 'calendar_day') {
            const midnight = instantOf(`${addDays(entry.slice(0, 10), k)}T00:00`, timeZone);
            if (midnight !== null) dayEdges.push(Math.round((midnight - entryMs) / 60000));
          } else dayEdges.push(k * 1440 + 1);
        }
      }
      const candidates = [...new Set([...steps, ...dayEdges])].sort((x, y) => x - y);
      firstPassed(entry, candidates, (e, m) => afterDay(e, m) > week.max_minor * weeksOf(e, m), ['weekMaxTakes', 'weekMaxBefore']);
    }
  }
  return out;
}

// --- what a stay paid, in words ---------------------------------------------

/**
 * A priced stay's lines, each in plain words with its amount: the time-based
 * rate, a special, the most a day or a week, grace, a discount or increase,
 * and each tax. Lines that move no money and say nothing an owner needs --
 * the stay's own description, a special that lost to a cheaper one -- are
 * left out here; the table says which special applied and why.
 */
export function lineWords(t, stay, plan, taxNames, currency, language) {
  const rules = plan?.rules ?? [];
  const nameOf = (id) => {
    const i = rules.filter((r) => r.type === 'time_window').findIndex((r) => r.id === id);
    const rule = rules.find((r) => r.id === id);
    return rule && i >= 0 ? specialName(t, rule, i) : null;
  };
  const out = [];
  const money = (minor) => moneyText(minor, currency, language);
  for (const line of stay.rate_lines ?? []) {
    let words = null;
    if (line.code === 'increment.first_period') words = t('rates.line.first');
    else if (line.code === 'increment.repeat_periods') words = t('rates.line.more');
    else if (line.code === 'daily_max.applied') words = t('rates.line.dayMax');
    else if (line.code === 'weekly_max.applied') words = t('rates.line.weekMax');
    else if (line.code === 'grace.applied') words = t('rates.line.grace');
    else if (line.code === 'time_window.applied') words = t('rates.line.special', { name: nameOf(line.rule_id) ?? t('rates.line.aSpecial') });
    else if (line.delta_minor !== 0) words = t('rates.line.other');
    if (words) out.push({ words, amount: money(line.delta_minor), minor: line.delta_minor });
  }
  for (const line of stay.tax_lines ?? []) {
    out.push({ words: taxNames?.[line.rule_id] ?? t('rates.line.tax'), amount: money(line.delta_minor), minor: line.delta_minor, tax: true });
  }
  return out;
}

/**
 * Which special priced a stay, or none and why, from the stay's lines and the
 * plan: `{ key, name? , values? }` for the words. The engine decided; this only
 * says it: a special that applied, that fit but cost more than another, that
 * grace made free, or that did not fit -- and which of its conditions the
 * stay missed (the day, too early, too late, left too late).
 */
export function specialWords(t, stay, plan, language) {
  const rules = plan?.rules ?? [];
  const windows = rules.filter((r) => r.type === 'time_window');
  const name = (rule) => specialName(t, rule, windows.indexOf(rule));
  const lines = stay.rate_lines ?? [];
  const graced = lines.some((l) => l.code === 'grace.applied');
  if (graced) return t('rates.why.grace');
  const applied = lines.filter((l) => l.code === 'time_window.applied').map((l) => windows.find((r) => r.id === l.rule_id)).filter(Boolean);
  const bases = applied.filter((r) => r.stage === 'QUALIFY');
  const changes = applied.filter((r) => r.stage === 'ADJUST');
  const parts = [];
  // Whether the special or the time-based rate was charged, and what the other
  // would have been: the engine compares them and charges the less.
  const compared = lines.find((l) => l.code === 'special_used' || l.code === 'time_based_used');
  const money = (minor) => moneyText(minor, plan?.currency, language);
  const charged = stay.subtotal_minor ?? lines.reduce((sum, l) => sum + l.delta_minor, 0);
  if (bases.length && compared?.code === 'special_used') {
    parts.push(
      Number.isInteger(compared.compared_minor)
        ? t('rates.why.appliedTimeMore', { name: name(bases[0]), time: money(compared.compared_minor) })
        : t('rates.why.appliedOnly', { name: name(bases[0]) }),
    );
  } else if (bases.length) parts.push(t('rates.why.applied', { name: name(bases[0]) }));
  for (const r of changes) parts.push(t('rates.why.applied', { name: name(r) }));
  if (parts.length) return parts.join(' ');
  if (!windows.length) return t('rates.why.noSpecials');
  // None applied: why, for each special of the plan.
  const entry = stay.entry;
  const exit = stay.exit;
  const reasons = windows.map((r) => {
    if (compared?.code === 'time_based_used' && compared.rule_id === r.id) {
      return t('rates.why.timeLess', { name: name(r), special: money(compared.compared_minor), time: money(charged) });
    }
    const resolved = lines.find((l) => l.code === 'resolved' && l.rule_id === r.id);
    if (resolved) return t('rates.why.cheaper', { name: name(r) });
    // Fit, and lost to a cheaper special the time-based rate then also beat.
    if (compared?.code === 'time_based_used' && r.stage === 'QUALIFY' && missed(r, entry, exit) === 'notFit') return t('rates.why.cheaper', { name: name(r) });
    return t(`rates.why.${missed(r, entry, exit)}`, { name: name(r), day: entry ? dayName(weekdayOf(entry.slice(0, 10)), language) : '' });
  });
  return `${t('rates.why.none')} ${reasons.join(' ')}`;
}

/**
 * What a price-table row is there to test, in words -- and for the rows about
 * the most a day or a week, only what the engine's breakdown of that stay says:
 * "takes over" when its most applied and the row a minute before did not,
 * "just before" the other way round, and otherwise what this stay alone shows.
 * `answerOf(key)` is the priced answer of the row with that case, if any.
 */
const CAP_ROWS = {
  dayMaxTakes: ['daily_max', 'day', 'takes'],
  dayMaxBefore: ['daily_max', 'day', 'before'],
  weekMaxTakes: ['weekly_max', 'week', 'takes'],
  weekMaxBefore: ['weekly_max', 'week', 'before'],
};
export function caseKey(row, answer, answerOf) {
  const cap = CAP_ROWS[row.why.key];
  if (!cap) return row.why.key;
  const [code, unit] = cap;
  const said = (a) => {
    const lines = a && !a.refused ? (a.rate_lines ?? []) : [];
    if (lines.some((l) => l.code === `${code}.applied`)) return 'applied';
    if (lines.some((l) => l.code === `${code}.not_reached`)) return 'not';
    return null;
  };
  const own = said(answer);
  const turns = said(answerOf(`${unit}MaxTakes`)) === 'applied' && said(answerOf(`${unit}MaxBefore`)) === 'not';
  if (own === 'applied') return turns && cap[2] === 'takes' ? `${unit}MaxTakes` : `${unit}MaxApplies`;
  if (own === 'not') return turns && cap[2] === 'before' ? `${unit}MaxBefore` : `${unit}MaxNotReached`;
  return 'length';
}

/** The words of `caseKey`. */
export const caseWords = (t, row, answer, answerOf) => t(`rates.test.${caseKey(row, answer, answerOf)}`, { name: row.why.name ?? '' });

/** The first condition of a special a stay missed, as the engine checks them: the day, the time in, the leaving. */
function missed(rule, entry, exit) {
  if (!entry || !exit) return 'notFit';
  const day = entry.slice(0, 10);
  const onDay = rule.applies_on.kind === 'dates' ? rule.applies_on.dates.includes(day) : rule.applies_on.days.includes(weekdayOf(day));
  if (!onDay) return 'otherDay';
  const at = entry.slice(11);
  if (at < rule.enter_from) return 'tooEarly';
  if (at > rule.enter_by) return 'tooLate';
  const lastDay = rule.day_span === 'next_day' ? addDays(day, 1) : day;
  if (exit > `${lastDay}T${rule.exit_by}`) return 'leftLate';
  return 'notFit';
}

// --- the engine's findings, in words -----------------------------------------

/** Every finding the engine can return (rate-engine findings.py), each with its own sentence. */
export const FINDING_CODES = [
  'GAP_UNDECLARED_SPACE_CLASS',
  'GAP_NO_ACCUMULATE_RULE',
  'GAP_STAY_EXCEEDS_MAX_DURATION',
  'GAP_NO_PLAN_IN_FORCE_AT_ENTRY',
  'GAP_NO_TAX_SET_IN_FORCE',
  'CONFLICT_AMBIGUOUS_PLAN_SELECTION',
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
  const about = named.length ? t('rates.finding.about', { names: listWords(named, language) }) : '';
  let car = '';
  const probe = finding.probe;
  if (probe?.entry_at && probe?.exit_at) {
    const entry = wallAt(Date.parse(probe.entry_at), timeZone);
    const minutes = Math.round((Date.parse(probe.exit_at) - Date.parse(probe.entry_at)) / 60000);
    car = t('rates.finding.car', { day: dayName(weekdayOf(entry.slice(0, 10)), language), time: clockWords(entry.slice(11), language), length: lengthWords(t, minutes) });
  }
  return [t(findingKey(finding.code)), about, car].filter(Boolean).join(' ');
}

const RULE_NAMES = { increment: 1, daily_max: 1, weekly_max: 1, grace: 1 };
