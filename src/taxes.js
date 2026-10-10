// A garage's taxes, in words, and the list the owner states.
//
// The platform keeps every list of taxes the garage has stated (GET and POST
// /garages/:id/tax-sets): when each starts, and its lines, each a name, a
// percent in hundredths (`percent_bp`: 18.5% is 1850) and how it rounds. A
// list is never changed: a new one takes over from when it starts, and the
// old ones stay on record. A list with no lines is the garage saying it
// charges no tax; no list at all is the garage not having said.
//
// Every time here is the GARAGE'S: "from the start of" a day is the first
// moment of that day that exists in the garage's own zone, whatever zone the
// computer showing the page is in. Percents only: there is no flat amount.

import { garageDateTime } from './time.js';

export const ROUNDINGS = ['up', 'down', 'nearest'];

const LOCALES = { en: 'en-US', es: 'es-US' };

/** A percent in hundredths as people write it: 1850 is "18.5%", 700 is "7%". */
export function percentText(bp, language) {
  return `${(Number(bp) / 100).toLocaleString(LOCALES[language] ?? LOCALES.en, { maximumFractionDigits: 2 })}%`;
}

/**
 * What the owner typed as a percent, in hundredths: "18.5" is 1850, "7,25" is
 * 725. Up to three whole digits and two decimals, with a point or a comma,
 * and more than zero. `{ bp }`, or `{ problem }`: 'empty', 'shape' or 'zero'.
 */
export function parsePercent(typed) {
  const text = String(typed ?? '').trim().replace(/\s*%$/, '');
  if (text === '') return { problem: 'empty' };
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text);
  if (!m) return { problem: 'shape' };
  const bp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return bp > 0 ? { bp } : { problem: 'zero' };
}

/** The instant a list starts, in milliseconds. */
const startOf = (list) => Date.parse(list.effective_from);

/**
 * The lists as the page shows them, at `now`: the one in force (the latest
 * that has started), the ones that start later (soonest first) and the ones
 * before it (newest first). Each earlier list says until when it was in
 * force: the start of the one after it.
 */
export function arrange(lists, now = new Date()) {
  const sorted = [...(lists ?? [])].sort((a, b) => startOf(a) - startOf(b));
  const at = now.getTime();
  const started = sorted.filter((l) => startOf(l) <= at);
  const current = started.at(-1) ?? null;
  const later = sorted.filter((l) => startOf(l) > at);
  const earlier = started.slice(0, -1).map((l) => ({ ...l, until: sorted[sorted.indexOf(l) + 1].effective_from })).reverse();
  return { current, later, earlier };
}

/**
 * Where the garage stands, at `now`, as the screen says it:
 *   none     no list at all: the garage has not said
 *   notYet   lists, but none started: the first starts later
 *   noTax    the list in force has no lines: it charges no tax
 *   lines    the list in force has lines
 */
export function taxState(lists, now = new Date()) {
  if (!lists?.length) return 'none';
  const { current } = arrange(lists, now);
  if (!current) return 'notYet';
  return current.rules.length ? 'lines' : 'noTax';
}

/** The sentence for where the garage stands, at `now`. */
export function stateWords(t, lists, garage, language, now = new Date()) {
  const state = taxState(lists, now);
  if (state === 'none') return t('taxes.none');
  if (state === 'notYet') return t('taxes.notYet', { time: garageDateTime(arrange(lists, now).later[0].effective_from, garage.timezone, language) });
  if (state === 'noTax') return t('taxes.noTax');
  const n = arrange(lists, now).current.rules.length;
  return n === 1 ? t('taxes.linesOne') : t('taxes.linesMany', { count: n });
}

/** A list's lines in the order the garage stated them. */
export const linesOf = (list) => [...(list?.rules ?? [])].sort((a, b) => a.sequence - b.sequence);

/** The garage's clock at `ms`: { year, month, day, hour, minute, second }, and its offset from UTC in minutes. */
function clockAt(ms, timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return { date: `${p.year}-${p.month}-${p.day}`, offset: Math.round((wall - Math.floor(ms / 1000) * 1000) / 60000) };
}

/** An instant written as the garage's clock and its offset: "2026-11-01T00:00:00-04:00". */
export function garageInstant(ms, timeZone) {
  const { offset } = clockAt(ms, timeZone);
  const local = new Date(ms + offset * 60000).toISOString().slice(0, 19);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

const QUARTER = 15 * 60 * 1000;

/**
 * The first moment of the day `day` (YYYY-MM-DD) that exists in `timeZone`,
 * as the garage's instant. Usually midnight; where the clocks go forward at
 * midnight, the first moment after the jump. Worked out from the garage's
 * zone only: the computer's own zone is never asked. Null for a day that is
 * not a real date.
 */
export function startOfDay(day, timeZone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ''));
  if (!m) return null;
  const [y, mo, d] = m.slice(1).map(Number);
  const noon = Date.UTC(y, mo - 1, d, 12);
  if (new Date(noon).getUTCDate() !== d || new Date(noon).getUTCMonth() !== mo - 1) return null;
  // Every zone's clock is a whole number of quarter hours from UTC, and moves
  // on a quarter hour: walk the quarters around the day's UTC midnight to the
  // first one the garage's clock calls this day.
  const midnight = Date.UTC(y, mo - 1, d);
  for (let at = midnight - 15 * 3600 * 1000; at <= midnight + 15 * 3600 * 1000; at += QUARTER) {
    if (clockAt(at, timeZone).date === day) return garageInstant(at, timeZone);
  }
  return null;
}

/**
 * The list the owner states, as the platform takes it: when it starts, and
 * its lines in the order shown, each with an id the page makes (unique in the
 * list), a name, a percent in hundredths, how it rounds and its place. No
 * tax is a list with no lines.
 */
export function listToState({ noTax, lines, start }) {
  return {
    effective_from: start,
    rules: noTax
      ? []
      : lines.map((line, i) => ({
          id: `tax-${i + 1}`,
          label: line.name.trim(),
          percent_bp: line.bp,
          rounding: line.rounding,
          sequence: i + 1,
        })),
  };
}
