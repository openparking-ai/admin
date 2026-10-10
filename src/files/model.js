// What a downloaded file of a list holds, before it is an Excel or a PDF file.
//
// Both builders (excel.js, pdf.js) draw this and nothing else, so the two
// files of one list always say the same thing. Every word comes from the
// dictionaries through `t`; every time is in the GARAGE'S zone, never the
// browser's. Built from the answer of the read made when Download was
// clicked, and stamped with the time of that read.
//
// A file is:
//   { list, title, garage, lines, columns, rows, empty }
//   lines    the lines above the table: the garage, the list, when it was
//            downloaded, the time zone, and for Garage View its two counts
//   columns  [{ key, name, about, width }]: each column, and what it means
//   rows     one array of cells per row; a cell is { text } or, for a time,
//            { text, wall } where `wall` is the garage's clock at that time
//   empty    the sentence the screen shows when the list has no rows, or null

import { insideWords } from '../inside.js';
import { directionKey, openText } from '../lanes.js';
import { changeText, piecesText, timesWords, whatPieces, whoPieces, whyWords } from '../changes.js';
import { garageDateTime, garageTime, heardFrom } from '../time.js';
import { alertNames, canEmail, canText, languageWords } from '../alerts.js';

const LOCALES = { en: 'en-US', es: 'es-US' };
const locale = (language) => LOCALES[language] ?? LOCALES.en;
const NOTHING = '–';

/**
 * The columns of each list's file, by dictionary key; each has `<key>.about`
 * (scripts/check-descriptions.js holds them to it). `width` is each column's
 * share of a PDF page: wide enough for the longest of our own words and
 * headings that can stand in it, in both languages, so a line breaks only at
 * a space (scripts/check-pdf-words.js reads every one back whole).
 */
export const COLUMNS = {
  inside: [
    { key: 'inside.plate', width: 0.22 },
    { key: 'inside.ticket', width: 0.17 },
    { key: 'inside.letIn', width: 0.25 },
    { key: 'inside.lane', width: 0.2 },
    { key: 'inside.confirmed', width: 0.16 },
  ],
  lanes: [
    { key: 'lanes.lane', width: 0.14 },
    { key: 'lanes.direction', width: 0.08 },
    { key: 'file.computer', width: 0.15 },
    { key: 'file.state', width: 0.19 },
    { key: 'file.lastHeard', width: 0.14 },
    { key: 'lanes.reader', width: 0.1 },
    { key: 'lanes.open', width: 0.2 },
  ],
  changes: [
    { key: 'changes.when', width: 0.15 },
    { key: 'changes.who', width: 0.17 },
    { key: 'changes.what', width: 0.2 },
    { key: 'changes.before', width: 0.22 },
    { key: 'changes.after', width: 0.22 },
  ],
  alerts: [
    // Each at the least our longest word needs ("Confirmado", "estacionamiento"),
    // and the rest to the name, number and address the owner types.
    { key: 'alerts.person', width: 0.103 },
    { key: 'alerts.phone', width: 0.179 },
    { key: 'alerts.email', width: 0.221 },
    { key: 'alerts.language', width: 0.092 },
    { key: 'alerts.confirmed', width: 0.109 },
    { key: 'file.byText', width: 0.148 },
    { key: 'file.byEmail', width: 0.148 },
  ],
  refused: [
    { key: 'refused.when', width: 0.15 },
    { key: 'refused.who', width: 0.17 },
    { key: 'refused.what', width: 0.21 },
    { key: 'refused.why', width: 0.2 },
    { key: 'refused.times', width: 0.1 },
    { key: 'refused.last', width: 0.17 },
  ],
  // U6: the lane and the reader as typed, each time as "Mar 10, 2026, 3:41 PM", and "Sigue conectado".
  readers: [
    { key: 'readers.histLane', width: 0.26 },
    { key: 'readers.histReader', width: 0.26 },
    { key: 'readers.connected', width: 0.24 },
    { key: 'readers.ended', width: 0.24 },
  ],
};

/** The garage's clock at `value`: { year, month, day, hour, minute }. */
export function wallClock(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const n = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: n('year'), month: n('month'), day: n('day'), hour: n('hour'), minute: n('minute') };
}

/** The garage's time zone as people say it: "Eastern Time", "hora del este". Never "America/New_York". */
export function zoneName(timeZone, language, at) {
  const parts = new Intl.DateTimeFormat(locale(language), { timeZone, timeZoneName: 'longGeneric' }).formatToParts(new Date(at));
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
}

const time = (value, garage, language) => ({
  text: garageDateTime(value, garage.timezone, language),
  wall: wallClock(value, garage.timezone),
});

/** A list's title: its page's, or for the refused attempts, their own section's. */
const titleOf = (t, list) => (list === 'refused' ? t('refused.title') : t(`page.${list}.title`));

function head(t, list, garage, language, readAt) {
  return {
    title: titleOf(t, list),
    lines: [
      garage.name,
      titleOf(t, list),
      t('file.downloaded', { time: garageDateTime(readAt, garage.timezone, language) }),
      t('file.zone', { zone: zoneName(garage.timezone, language, readAt) }),
    ],
  };
}

const columnsOf = (t, list) => COLUMNS[list].map((c) => ({ ...c, name: t(c.key), about: t(`${c.key}.about`) }));

/** Garage View: the two counts, then one row per open stay, in the platform's order. */
export function insideFile({ t, language, garage, data, readAt }) {
  const { title, lines } = head(t, 'inside', garage, language, readAt);
  const { figure, more } = insideWords(t, data);
  const rows = data.sessions.map((s) => [
    { text: [s.plate, s.plate_region].filter(Boolean).join(' · ') || NOTHING },
    { text: s.ticket_ref || NOTHING },
    time(s.entry_at, garage, language),
    { text: s.entry_lane ?? NOTHING },
    { text: s.entry_confirmation === 'confirmed' ? t('yes') : t('no') },
  ]);
  return {
    list: 'inside',
    title,
    garage: garage.name,
    lines: [...lines, figure, ...(more ? [more] : [])],
    columns: columnsOf(t, 'inside'),
    rows,
    empty: rows.length === 0 ? t('inside.empty') : null,
  };
}

/**
 * How a lane computer was doing at the moment of the read, worded with a time,
 * never "a minute ago": that goes stale on paper.
 */
export function computerState(t, device, garage, language, readAt, quietMinutes) {
  const at = (value) => garageTime(value, garage.timezone, language, readAt);
  if (device.revoked_at) return t('device.off', { time: at(device.revoked_at) });
  const heard = heardFrom(device.last_seen_at, readAt, quietMinutes);
  if (heard.state === 'never') return t('lane.never');
  if (heard.state === 'quiet') return t('lane.quiet', { time: at(heard.since) });
  return t('file.working', { time: at(device.last_seen_at) });
}

/** Lanes and equipment: one row per lane computer; a lane with none gets one row saying so. */
export function lanesFile({ t, language, garage, data, readAt }) {
  const { title, lines } = head(t, 'lanes', garage, language, readAt);
  const rows = data.lanes.flatMap((lane) => {
    const start = [{ text: lane.name }, { text: t(directionKey(lane)) }];
    const reader = { text: lane.reader ? t('lanes.readerYes') : t('lanes.readerNo') };
    const open = { text: openText(t, lane, garage, language, readAt) };
    const devices = lane.devices ?? [];
    if (devices.length === 0) return [[...start, { text: t('lane.noComputer') }, { text: NOTHING }, { text: NOTHING }, reader, open]];
    return devices.map((d) => [
      ...start,
      { text: d.name },
      { text: computerState(t, d, garage, language, readAt, data.quietMinutes) },
      d.last_seen_at ? time(d.last_seen_at, garage, language) : { text: NOTHING },
      reader,
      open,
    ]);
  });
  return {
    list: 'lanes',
    title,
    garage: garage.name,
    lines,
    columns: columnsOf(t, 'lanes'),
    rows,
    empty: rows.length === 0 ? t('lanes.none') : null,
  };
}

/** The change log: one row per line, newest first, as many as the screen shows. */
export function changesFile({ t, language, garage, data, readAt }) {
  const { title, lines } = head(t, 'changes', garage, language, readAt);
  const rows = data.changes.map((line) => {
    const { before, after } = changeText(t, line, garage, language);
    return [
      time(line.at, garage, language),
      { text: piecesText(whoPieces(t, line)) || NOTHING },
      { text: piecesText(whatPieces(t, line)) },
      { text: before },
      { text: after },
    ];
  });
  return {
    list: 'changes',
    title,
    garage: garage.name,
    lines,
    columns: columnsOf(t, 'changes'),
    rows,
    empty: rows.length === 0 ? t('changes.none') : null,
  };
}

/** The refused attempts: one row per line, newest first, as many as the screen shows; their count above. */
export function refusedFile({ t, language, garage, data, readAt }) {
  const { title, lines } = head(t, 'refused', garage, language, readAt);
  const attempts = data.count?.attempts ?? 0;
  if (data.refused.length) {
    lines.push(attempts === 1 ? t('refused.countOne') : t('refused.countMany', { attempts: attempts.toLocaleString(locale(language)) }));
  }
  const rows = data.refused.map((line) => [
    time(line.at, garage, language),
    { text: piecesText(whoPieces(t, line)) || NOTHING },
    { text: piecesText(whatPieces(t, line)) },
    { text: whyWords(t, line) },
    { text: timesWords(line, language) },
    time(line.last_at ?? line.at, garage, language),
  ]);
  return {
    list: 'refused',
    title,
    garage: garage.name,
    lines,
    columns: columnsOf(t, 'refused'),
    rows,
    empty: rows.length === 0 ? t('refused.none') : null,
  };
}

/**
 * Alerts: that nothing is sent yet, then one row per person -- their phone
 * number and address as kept, their language, that they have not
 * confirmed, and the alerts they get each way, in the platform's order.
 */
export function alertsFile({ t, language, garage, data, readAt }) {
  const { title, lines } = head(t, 'alerts', garage, language, readAt);
  const order = data.alerts.map((a) => a.key);
  const rows = data.contacts.map((p) => [
    { text: p.name },
    { text: canText(p) ? p.phone : t('alerts.none') },
    { text: canEmail(p) ? p.email : t('alerts.none') },
    { text: languageWords(t, p.language) },
    { text: p.confirmed ? t('alerts.isConfirmed') : t('alerts.notConfirmed') },
    { text: alertNames(t, p.by_text, order, language) ?? NOTHING },
    { text: alertNames(t, p.by_email, order, language) ?? NOTHING },
  ]);
  return {
    list: 'alerts',
    title,
    garage: garage.name,
    lines: [...lines, t('alerts.notSentYet')],
    columns: columnsOf(t, 'alerts'),
    rows,
    empty: rows.length === 0 ? t('alerts.nobody') : null,
  };
}

/**
 * Card readers: every connection a lane has had, current ones first, as the
 * platform lists them -- the lane by its name, the reader by the name it was
 * given, when it was connected, and when it ended or that it has not.
 */
export function readersFile({ t, language, garage, data, readAt }) {
  const { title, lines } = head(t, 'readers', garage, language, readAt);
  const laneName = (id) => (data.lanes ?? []).find((l) => l.id === id)?.name ?? NOTHING;
  const rows = (data.connections ?? []).map((c) => [
    { text: laneName(c.lane_id) },
    { text: c.label },
    time(c.bound_at, garage, language),
    c.unbound_at ? time(c.unbound_at, garage, language) : { text: t('readers.stillConnected') },
  ]);
  return {
    list: 'readers',
    title,
    garage: garage.name,
    lines,
    columns: columnsOf(t, 'readers'),
    rows,
    empty: rows.length === 0 ? t('readers.historyNone') : null,
  };
}

export const FILES = { inside: insideFile, lanes: lanesFile, changes: changesFile, refused: refusedFile, alerts: alertsFile, readers: readersFile };

// Characters a computer refuses in a file name, and control characters.
const REFUSED_IN_NAMES = /[/\\:*?"<>|\p{Cc}\p{Cf}]/gu;
export const NAME_LIMIT = 120;

/**
 * `{list title} - {YYYY-MM-DD HHmm in garage time} - {garage name}.{ext}`,
 * with every character a computer refuses in a file name removed, and the
 * name capped at NAME_LIMIT characters before the extension.
 */
export function fileName(file, garage, readAt, extension) {
  const w = wallClock(readAt, garage.timezone);
  const two = (n) => String(n).padStart(2, '0');
  const stamp = `${w.year}-${two(w.month)}-${two(w.day)} ${two(w.hour)}${two(w.minute)}`;
  // Leading dots hide a file on some computers; trailing dots and spaces are dropped by others.
  const clean = (text) =>
    String(text).replace(REFUSED_IN_NAMES, '').replace(/\s+/g, ' ').trim().replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  const title = clean(file.title);
  // The garage's name gives way first, so the list and the time always fit.
  const room = Math.max(0, NAME_LIMIT - title.length - stamp.length - 6);
  const name = clean([...clean(garage.name)].slice(0, room).join(''));
  // The garage's name comes last: a name in a right-to-left script placed
  // before the time would carry the time along with it on screen, drawn ahead
  // of the name and with its parts reversed (U3 fix round, chat's decision).
  return `${[title, stamp, name].filter(Boolean).join(' - ')}.${extension}`;
}
