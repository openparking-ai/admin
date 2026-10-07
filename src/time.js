// Times, always in the GARAGE'S time zone, never the browser's.
//
// A garage in Miami looked at from a laptop in Madrid still closed at 11 pm
// Miami time. Every time on these screens goes through `garageTime`, which
// is given the garage's own zone by the platform.


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
 *   { state: 'working', minutes }  heard from within `quietMinutes`, the platform's
 *                                  setting as its lanes read gave it (never a copy here)
 *   { state: 'quiet', since }      not heard from since `since`
 *   { state: 'never' }             never heard from at all
 */
export function heardFrom(lastSeen, now, quietMinutes) {
  if (!lastSeen) return { state: 'never' };
  const minutes = Math.max(0, Math.floor((now - new Date(lastSeen)) / 60000));
  return minutes < quietMinutes ? { state: 'working', minutes } : { state: 'quiet', since: lastSeen };
}

/**
 * A time zone as people say it: "Eastern Time", "hora del este" -- never
 * "America/New_York". Null when the browser has no name for it.
 */
export function zoneSaid(timeZone, language, at = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat(language === 'es' ? 'es-US' : 'en-US', { timeZone, timeZoneName: 'longGeneric' }).formatToParts(new Date(at));
    const said = parts.find((p) => p.type === 'timeZoneName')?.value;
    return said && said !== timeZone ? said : null;
  } catch {
    return null;
  }
}

/**
 * A moment the owner wrote in the garage's own time, `YYYY-MM-DDTHH:MM` --
 * as the platform keeps a board message's start and end -- said as a date
 * and time ("Jan 1, 2030, 8:00 AM"). It is already the garage's time, so no
 * zone is applied to it. Null for anything else.
 */
export function localSaid(value, language) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value ?? ''));
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  return parts(new Date(Date.UTC(y, mo - 1, d, h, mi)), 'UTC', language, { dateStyle: 'medium', timeStyle: 'short' });
}
