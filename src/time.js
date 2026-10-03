// Times, always in the GARAGE'S time zone, never the browser's.
//
// A garage in Miami looked at from a laptop in Madrid still closed at 11 pm
// Miami time. Every time on these screens goes through `garageTime`, which
// is given the garage's own zone by the platform.

import { LANE_QUIET_MINUTES } from './settings.js';

const LOCALES = { en: 'en-US', es: 'es-US' };

function parts(date, timeZone, language, options) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, { timeZone, ...options }).format(date);
}

/** The calendar day of `date` in `timeZone`, as YYYY-MM-DD, for comparing days. */
const dayIn = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

/**
 * A time as a person would say it in the garage: "3:40 PM" today, or
 * "Sep 29, 3:40 PM" on another day.
 */
export function garageTime(value, timeZone, language, now = new Date()) {
  const date = new Date(value);
  const today = dayIn(date, timeZone) === dayIn(now, timeZone);
  return parts(date, timeZone, language, {
    ...(today ? {} : { month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** A full date and time in the garage's zone, for a printed page. */
export function garageDateTime(value, timeZone, language) {
  return parts(new Date(value), timeZone, language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * How a lane's computer is doing, from when it was last heard from.
 *   { state: 'working', minutes }  heard from within LANE_QUIET_MINUTES
 *   { state: 'quiet', since }      not heard from since `since`
 *   { state: 'never' }             never heard from at all
 */
export function heardFrom(lastSeen, now = new Date()) {
  if (!lastSeen) return { state: 'never' };
  const minutes = Math.max(0, Math.floor((now - new Date(lastSeen)) / 60000));
  return minutes < LANE_QUIET_MINUTES ? { state: 'working', minutes } : { state: 'quiet', since: lastSeen };
}
