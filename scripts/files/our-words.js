// Lists that hold every word these pages can put in each column of a file
// (U4b fix round, F2): for scripts/check-pdf-words.js.
//
// Each list is shaped as the platform answers it, and is made so that every
// dictionary entry, every choice the code knows and every way of saying a
// time a column can show turns up in a row: every action and refusal, every
// field with every value, every alert, every state of a lane connection,
// every month, both halves of the day. What the owner types (a name, a
// plate, a message) is a short stand-in: only our own words are measured.
// Every name here is invented.

import { ACTIONS, CHOICES, FIELDS, REFUSALS, STORED } from '../../src/changes.js';

const MINUTE = 60_000;
export const READ_AT = new Date('2026-03-10T15:41:00Z');
export const GARAGE = { id: 'f2000000-0000-4000-8000-000000000001', name: 'Garage', timezone: 'America/New_York', currency: 'USD', live: true };
const ALERT_KEYS = ['lane_problem', 'lane_not_answering', 'garage_not_answering', 'card_payments_stopped', 'attendant_link_dropped'];
const QUIET = 5;

const uuid = (prefix, n) => `${prefix}${String(n).padStart(8 - prefix.length, '0')}-0000-4000-8000-000000000000`;
const ago = (ms) => new Date(READ_AT - ms).toISOString();

/** A time in every month, morning and afternoon, and in the read's own day. */
export const TIMES = [
  ...Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(2025, m, 14, 13, 5)).toISOString()),
  ...Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(2025, m, 27, 23, 55)).toISOString()),
  ago(3 * MINUTE),
  ago(9 * 60 * MINUTE),
];

export function insideData() {
  const sessions = TIMES.flatMap((at, i) =>
    ['confirmed', 'unconfirmable'].map((c, j) => ({
      id: uuid('a', i * 2 + j), entry_at: at, currency: 'USD', entry_confirmation: c, plate: 'P1', plate_region: null, ticket_ref: null, entry_lane: 'L',
    })),
  );
  return { inside_count: TIMES.length, unconfirmable_count: TIMES.length, open_count: sessions.length, sessions };
}

export function lanesData() {
  const lanes = [];
  let n = 0;
  const device = (fields) => ({ id: uuid('d', (n += 1)), name: 'C', last_seen_at: null, revoked_at: null, ...fields });
  const closings = [
    null,
    { reason: 'full', message: 'M', by: { kind: 'owner', name: 'o@example.com' }, at: ago(3 * MINUTE) },
    { reason: 'everyone', message: 'M', by: { kind: 'key', name: 'K' }, at: ago(2 * 24 * 60 * MINUTE) },
    { reason: 'everyone', message: 'M', by: { kind: 'owner', name: null }, at: TIMES[8] },
  ];
  const deviceSets = [
    [],
    [device({ last_seen_at: ago(MINUTE) })],
    [device({ last_seen_at: ago(40 * MINUTE) })],
    [device({ last_seen_at: TIMES[2] })],
    [device({})],
    [device({ last_seen_at: TIMES[4], revoked_at: TIMES[5] })],
    TIMES.map((at) => device({ last_seen_at: at })),
    TIMES.map((at) => device({ last_seen_at: at, revoked_at: at })),
  ];
  for (const [i, devices] of deviceSets.entries()) {
    for (const direction of ['entry', 'exit']) {
      lanes.push({
        id: uuid('e', lanes.length), name: 'L', direction,
        reader: i % 2 ? { reader_id: 'r', label: 'R', bound_at: TIMES[0] } : null,
        devices, closed: closings[(i + (direction === 'exit' ? 1 : 0)) % closings.length], reopened: null,
      });
    }
  }
  return { lanes, quietMinutes: QUIET };
}

/** Every value each field can be said with, and one the platform may add later. */
function fieldValues(field) {
  if (CHOICES[field]) return [...CHOICES[field], 'zzz'];
  if (STORED.has(field)) return ['S'];
  switch (field) {
    case 'direction': return ['entry', 'exit'];
    case 'language': return ['en', 'es', 'xx'];
    case 'timezone': return [...Intl.supportedValuesOf('timeZone'), 'Nowhere/Zzz'];
    case 'currency': return [...Intl.supportedValuesOf('currency'), 'ZZZ'];
    case 'effective_from': return TIMES;
    case 'by_text':
    case 'by_email': return [[], ALERT_KEYS, ...ALERT_KEYS.map((k) => [k]), ['zzz']];
    case 'taxes': return [[], [{ label: 'T', percent_bp: 825 }]];
    default: return [true, false, { a: 1 }, 'zzz'];
  }
}

const WHO = [
  { kind: 'owner', name: 'o@example.com' },
  { kind: 'owner', name: null },
  { kind: 'key', name: 'K' },
  { kind: 'key', name: null },
  { kind: 'outside', name: null },
  { kind: 'nobody', name: null },
];

export function changesData() {
  const changes = [];
  const line = (fields) => changes.push({
    id: uuid('c', changes.length), garage_id: GARAGE.id, outcome: 'done', refusal: null, attempts: 1, last_at: null,
    at: TIMES[changes.length % TIMES.length], who: WHO[changes.length % WHO.length], before: null, after: null,
    subject: { kind: 'lane', id: uuid('f', changes.length), name: 'N' }, ...fields,
  });
  for (const action of [...ACTIONS, 'zzz.unknown']) line({ action });
  line({ action: 'lane.rename', subject: { kind: 'lane', id: null, name: null } });
  for (const field of [...FIELDS, 'zzz_field']) {
    for (const value of fieldValues(field)) line({ action: 'garage.update', before: { [field]: null }, after: { [field]: value } });
  }
  return { changes, next: null };
}

export function refusedData() {
  const refused = [];
  const line = (fields) => refused.push({
    id: uuid('b', refused.length), garage_id: GARAGE.id, outcome: 'refused', before: null, after: null,
    at: TIMES[refused.length % TIMES.length], last_at: TIMES[(refused.length + 3) % TIMES.length],
    attempts: [1, 40, 1250, 1234567][refused.length % 4], who: WHO[refused.length % WHO.length],
    subject: { kind: 'lane', id: uuid('g', refused.length), name: 'N' }, ...fields,
  });
  for (const refusal of [...REFUSALS, 'zzz_refusal']) {
    for (const who of WHO) line({ action: 'lane.close', refusal, who });
  }
  for (const action of [...ACTIONS, 'zzz.unknown']) line({ action, refusal: 'bad_request' });
  line({ action: 'key.cancel', refusal: 'key_cancelled', who: { kind: 'key', name: 'K' } });
  line({ action: 'key.cancel', refusal: 'key_expired', who: { kind: 'key', name: 'K' } });
  line({ action: 'lane.close', refusal: 'session_ended', who: { kind: 'owner', name: 'o@example.com' } });
  line({ action: 'refused.many', refusal: 'too_many_refused', who: { kind: 'outside', name: null }, subject: { kind: 'unknown', id: null, name: null } });
  return { refused, next: null, count: { lines: refused.length, attempts: refused.reduce((x, l) => x + l.attempts, 0) } };
}

export function alertsData() {
  const contacts = [];
  const person = (fields) => contacts.push({
    id: uuid('p', contacts.length), name: 'N', phone: '+15550100001', email: 'n@example.com', language: 'en', confirmed: false, by_text: [], by_email: [], ...fields,
  });
  for (const language of ['en', 'es', 'xx']) for (const confirmed of [false, true]) person({ language, confirmed });
  person({ phone: null });
  person({ email: null });
  for (const keys of [ALERT_KEYS, ...ALERT_KEYS.map((k) => [k]), ['zzz'], ALERT_KEYS.slice(0, 2), ALERT_KEYS.slice(2)]) person({ by_text: keys, by_email: keys });
  return {
    alerts: ALERT_KEYS.map((key) => ({ key, needs: key === 'lane_not_answering' ? ['quiet_minutes'] : [] })),
    quietMinutes: QUIET,
    maxContacts: 25,
    contacts,
  };
}

export const LISTS = { inside: insideData, lanes: lanesData, changes: changesData, refused: refusedData, alerts: alertsData };
