// A small stand-in for the platform, for the checks only. Never part of the
// built site.
//
// It answers the routes these screens use as the platform does -- the same
// statuses, the same refusals word for word, the same shapes and the same
// cookie. test/stub-matches-platform.test.js holds it to that, against
// test/platform-shapes.json, recorded from the real platform:
//   POST /api/v1/auth/sign-in    { email, password } -> sets the session cookie; { email, tenant_id, session_ends_at, language }
//   POST /api/v1/auth/sign-out   ends the session: 204, no body
//   GET  /api/v1/auth/me         { email, tenant_id, session_ends_at, language }
//   PUT  /api/v1/auth/language   { language } -> the signed-in owner's own language, 'en' or 'es'; { language }
//   GET  /api/v1/garages         { garages: [{ id, name, timezone, currency, live }] }
//   GET  /api/v1/garages/:id/lanes          { lanes: [{ id, name, direction, devices, reader, closed, reopened }], quiet_minutes }
//   GET  /api/v1/garages/:id/sessions/open  { inside_count, unconfirmable_count, open_count, sessions }
// U4, as the platform's src/setup.js, src/lanes.js and src/changes.js answer:
//   GET    /api/v1/garages/:id/setup        { setup: { garage_id, open, takes_any_driver, steps: [{ key, done, facts }] } }
//   GET    /api/v1/garages/:id/changes[/:lineId]  { changes: [line], next } the changes made, newest first, 50 a page
//   GET    /api/v1/garages/:id/refused-attempts[/:lineId]  { refused: [line], next, count: { lines, attempts } } apart
//   A request that changes nothing writes no line (the same before and after).
//   PATCH  /api/v1/garages/:id              { transient_available: true | false } -> { garage }
//   POST   /api/v1/garages/:id/lanes        { name, direction } -> 201 { lane }
//   PATCH  /api/v1/lanes/:id                { name } -> { lane }
//   DELETE /api/v1/lanes/:id                204; a lane ever used is 409 lane_has_history
//   POST   /api/v1/lanes/:id/close          { reason, message, override? } -> { lane }; the last open
//                                           lane of a direction is 409 last_open_lane without override
//   POST   /api/v1/lanes/:id/reopen         -> { lane }; an open one is 409 lane_already_open
//   POST   /api/v1/lanes/:id/devices        { name } -> 201 { device, token, token_note }
//   POST   /api/v1/devices/:id/revoke       -> { device }
// U4b, as the platform's src/alerts.js answers:
//   GET    /api/v1/garages/:id/alerts       { alerts: [{ key, needs }], quiet_minutes, max_contacts, sending, contacts }
//   POST   /api/v1/garages/:id/alert-contacts           { name, phone?, email?, language? } -> 201 { contact }
//   PATCH  /api/v1/garages/:id/alert-contacts/:person   { name?, phone?, email?, language? } -> { contact, turned_off }
//   DELETE /api/v1/garages/:id/alert-contacts/:person   204
//   PUT    /api/v1/garages/:id/alert-contacts/:person/choices  { by_text, by_email } -> { contact }
//   A phone is kept as + and 8 to 15 digits (a US 10, or 11 starting with 1,
//   as +1...); an email trimmed, one @, no space, at most 254. A text needs a
//   phone and an email an address; taking one away turns its choices off.
//   At most 25 people a garage. Nothing is sent, and nobody is confirmed.
// Every change and every refused change is a line in the owner's change log.
// Sign-in answers as the platform's src/signIn.js does: not set up (no admin
// page named), a page at another address, a body it cannot read, too many
// tries from here, busy, refused (a wrong password, an unknown email, or ten
// wrong from here, which pauses this address for 30 minutes). An ended session
// is 401 `session_ended` and clears the cookie; a read with no cookie is 401
// with no code. Lanes of a garage not the owner's are 404; its cars inside are
// an empty list, as the platform answers. The cookie is HttpOnly, Secure,
// SameSite=Strict, Path=/api, with no Domain, and a POST carried by it must
// come with the admin page's own Origin. Each owner's language is kept on the
// owner, English until changed; anything but {"language": "en" | "es"} sent
// as JSON is 400 `language_refused`.
//
// Every name, address and plate here is invented.

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const MINUTE = 60_000;

/** Two owners. A has two garages, so the list to pick from shows; B has one. */
export function owners(now = Date.now()) {
  const ago = (ms) => new Date(now - ms).toISOString();
  return {
    a: {
      email: 'owner-a@example.com',
      password: 'harbor-street-test-password',
      tenant_id: 'aaaaaaaa-0000-4000-8000-000000000001',
      language: 'en',
      garages: [
        { id: 'a1000000-0000-4000-8000-000000000001', name: 'Harbor Street Garage', timezone: 'America/New_York', currency: 'USD', live: true },
        { id: 'a2000000-0000-4000-8000-000000000002', name: 'Riverside Deck', timezone: 'America/Chicago', currency: 'USD', live: false },
      ],
      lanes: {
        'a1000000-0000-4000-8000-000000000001': [
          {
            id: 'la100000-0000-4000-8000-000000000001',
            name: 'North Entry',
            direction: 'entry',
            reader: { reader_id: 'rd-stand-in-0001', label: 'North Entry reader', bound_at: ago(60 * 24 * 60 * MINUTE) },
            devices: [{ id: 'dv100000-0000-4000-8000-000000000001', name: 'Harbor entry computer', last_seen_at: ago(MINUTE + 5000), revoked_at: null }],
          },
          {
            id: 'la100000-0000-4000-8000-000000000002',
            name: 'North Exit',
            direction: 'exit',
            reader: null,
            devices: [
              // 3:40 pm in New York on 10 March 2026; 4:40 am on the 11th in Tokyo.
              { id: 'dv100000-0000-4000-8000-000000000002', name: 'Harbor exit computer', last_seen_at: '2026-03-10T19:40:00Z', revoked_at: null },
              { id: 'dv100000-0000-4000-8000-000000000003', name: 'Harbor old exit computer', last_seen_at: '2026-01-04T22:10:00Z', revoked_at: '2026-01-05T13:55:00Z' },
              // Added, never switched on: the platform's last_seen_at is null until a device is heard from.
              { id: 'dv100000-0000-4000-8000-000000000004', name: 'Harbor spare exit computer', last_seen_at: null, revoked_at: null },
            ],
          },
          { id: 'la100000-0000-4000-8000-000000000003', name: 'Service Lane', direction: 'entry', reader: null, devices: [] },
          {
            id: 'la100000-0000-4000-8000-000000000004',
            name: 'South Exit',
            direction: 'exit',
            reader: null,
            // Its only computer had its access cancelled: 10:30 am in New York on 10 March 2026.
            devices: [{ id: 'dv100000-0000-4000-8000-000000000005', name: 'Harbor south exit computer', last_seen_at: '2026-03-09T21:00:00Z', revoked_at: '2026-03-10T14:30:00Z' }],
          },
        ],
        'a2000000-0000-4000-8000-000000000002': [],
      },
      // People to tell (U4b). Invented: 555-01xx numbers and example.com addresses.
      people: {
        'a1000000-0000-4000-8000-000000000001': [
          { id: 'pa100000-0000-4000-8000-000000000001', name: 'Night manager', phone: '+15550100001', email: null, language: 'en', confirmed: false, by_text: ['lane_problem', 'lane_not_answering', 'garage_not_answering'], by_email: [] },
          { id: 'pa100000-0000-4000-8000-000000000002', name: 'Office', phone: null, email: 'office@example.com', language: 'es', confirmed: false, by_text: [], by_email: ['card_payments_stopped', 'garage_not_answering'] },
        ],
        'a2000000-0000-4000-8000-000000000002': [],
      },
      open: {
        'a1000000-0000-4000-8000-000000000001': [
          // 11:05 am in New York on 10 March 2026; 1:05 am on the 11th in Tokyo.
          { id: 'ss100000-0000-4000-8000-000000000001', entry_at: '2026-03-10T15:05:00Z', currency: 'USD', entry_confirmation: 'confirmed', plate: 'HRB4410', plate_region: 'FL', ticket_ref: null, entry_lane: 'North Entry' },
          { id: 'ss100000-0000-4000-8000-000000000002', entry_at: '2026-03-10T17:20:00Z', currency: 'USD', entry_confirmation: 'confirmed', plate: null, plate_region: null, ticket_ref: 'HT-0042', entry_lane: 'North Entry' },
          { id: 'ss100000-0000-4000-8000-000000000003', entry_at: '2026-03-10T18:45:00Z', currency: 'USD', entry_confirmation: 'unconfirmable', plate: 'HRB7731', plate_region: 'FL', ticket_ref: null, entry_lane: 'Service Lane' },
        ],
        'a2000000-0000-4000-8000-000000000002': [],
      },
    },
    b: {
      email: 'owner-b@example.com',
      password: 'elm-court-test-password',
      tenant_id: 'bbbbbbbb-0000-4000-8000-000000000002',
      language: 'en',
      garages: [{ id: 'b1000000-0000-4000-8000-000000000001', name: 'Elm Court Garage', timezone: 'America/Los_Angeles', currency: 'USD', live: true }],
      lanes: {
        'b1000000-0000-4000-8000-000000000001': [
          { id: 'lb100000-0000-4000-8000-000000000001', name: 'Elm Gate', direction: 'entry', reader: null, devices: [{ id: 'dvb00000-0000-4000-8000-000000000001', name: 'Elm gate computer', last_seen_at: ago(20 * 1000), revoked_at: null }] },
        ],
      },
      people: { 'b1000000-0000-4000-8000-000000000001': [] },
      open: { 'b1000000-0000-4000-8000-000000000001': [] },
    },
  };
}

/** What the stand-in keeps beside each garage for its checklist: the platform's own reads, in short. */
function setupData() {
  return {
    'a1000000-0000-4000-8000-000000000001': { transient_available: true, opened_at: '2026-01-02T15:00:00Z', rates: { stored: 1, in_force: 1, earliest: '2025-12-01T05:00:00.000Z' }, taxes: { stated: 1, in_force: 1, earliest: '2025-12-01T05:00:00.000Z', rules_in_force: 2 }, account: { account: true, charges_enabled: true, card_payments: 'active', details_submitted: true, read_at: '2026-01-02T14:00:00Z' } },
    'a2000000-0000-4000-8000-000000000002': { transient_available: null, opened_at: null, rates: { stored: 0, in_force: 0, earliest: null }, taxes: { stated: 0, in_force: 0, earliest: null, rules_in_force: null }, account: null },
    'b1000000-0000-4000-8000-000000000001': { transient_available: false, opened_at: '2026-02-01T18:00:00Z', rates: { stored: 1, in_force: 1, earliest: '2026-01-01T08:00:00.000Z' }, taxes: { stated: 1, in_force: 1, earliest: '2026-01-01T08:00:00.000Z', rules_in_force: 0 }, account: null },
  };
}

/** Every piece of text of owner A's that a screen could show. */
export const A_TEXT = ['Harbor Street Garage', 'Riverside Deck', 'North Entry', 'North Exit', 'Service Lane', 'Harbor entry computer', 'HRB4410', 'HT-0042', 'owner-a@example.com', 'Night manager', '+15550100001', 'office@example.com'];

// The platform's own words, as test/platform-shapes.json recorded them.
const SIGN_IN_REQUIRED = { error: 'Sign in first.', code: 'sign_in_required' };
const TOKEN_REQUIRED = { error: 'operator token required' };
const SESSION_ENDED = { error: 'The session has ended. Sign in again.', code: 'session_ended' };
const REFUSED = { error: 'Sign-in refused. Check the email and password.', code: 'sign_in_refused' };
const UNREADABLE = { error: 'The sign-in request could not be read. Send JSON: {"email", "password"}.', code: 'sign_in_unreadable' };
const ORIGIN_REFUSED = { error: 'This request did not come from the admin site.', code: 'origin_refused' };
const GARAGE_NOT_FOUND = { error: 'garage not found' };
const LANGUAGE_REFUSED = { error: 'The language must be "en" or "es", sent as JSON: {"language"}.', code: 'language_refused' };
const LANGUAGES = ['en', 'es'];
// The platform reads no language body longer than this.
const LANGUAGE_BODY_LIMIT = 256;
/** The sign-in answers a check can ask for, which only a platform set up for them gives. */
const SIGN_IN_ANSWERS = {
  tooMany: [429, { error: 'Too many sign-in attempts from here. Try again later.', code: 'sign_in_rate_limited' }],
  busy: [503, { error: 'Sign-in is busy. Try again in a moment.', code: 'sign_in_busy' }, { 'Retry-After': '2' }],
  notSetUp: [409, { error: 'This deployment has no admin origin configured, so owner sign-in is off.', code: 'sign_in_not_configured' }],
  wrongPlace: [403, ORIGIN_REFUSED],
};

const COOKIE = 'op_session';
const COOKIE_ATTRIBUTES = 'Path=/api; HttpOnly; SameSite=Strict';
const SESSION_SECONDS = 12 * 60 * 60;
const MAX_WRONG = 10;
const PAUSE = 30 * MINUTE;

// The platform's own sentences for the U4 refusals (src/lanes.js, src/app.js).
const LANE_NOT_FOUND_NAMED = { error: 'lane not found', code: 'lane_not_found' };
const LANE_NOT_FOUND = { error: 'lane not found' };
const DEVICE_NOT_FOUND = { error: 'device not found' };
const LANE_NAME_REFUSED = { error: 'name must be text of 1 to 80 characters, with no control or invisible formatting characters', code: 'lane_name_refused' };
const LANE_MESSAGE_REFUSED = { error: 'message must be text of 1 to 160 characters, with no control or invisible formatting characters', code: 'lane_message_refused' };
const LANE_REASON_REFUSED = { error: 'reason must be one of full, everyone: full lets pass and monthly holders in; everyone closes it to all', code: 'lane_reason_refused' };
const LANE_ALREADY_OPEN = { error: 'this lane is already open', code: 'lane_already_open' };
const ADD_LANE_REFUSED = { error: "name and direction ('entry' or 'exit') are required" };
const COMPUTER_NAME_REQUIRED = { error: 'name is required' };
const DRIVERS_REFUSED = (v) => ({ error: `transient_available is true or false, not ${JSON.stringify(v)}; unstated is the absence of the field, never a value` });
const lastOpen = (direction) => {
  const way = direction === 'entry' ? 'way in' : 'way out';
  return { error: `this is the last open ${way} of the garage: closing it leaves no ${way} open. Send override: true to close it anyway.`, code: 'last_open_lane', details: { direction } };
};
const CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const LINES_PAGE = 50;

// U4b: the platform's one list of alerts, and its sentences (src/alerts.js).
const ALERTS = [
  { key: 'lane_problem', needs: [] },
  { key: 'lane_not_answering', needs: ['quiet_minutes'] },
  { key: 'garage_not_answering', needs: [] },
  { key: 'card_payments_stopped', needs: [] },
  { key: 'attendant_link_dropped', needs: [] },
];
const ALERT_KEYS = ALERTS.map((a) => a.key);
const MAX_PEOPLE = 25;
const PERSON_NOT_FOUND = { error: 'alert contact not found', code: 'alert_contact_not_found' };
const PERSON_NAME_REFUSED = { error: 'name must be text of 1 to 80 characters, with no control or invisible formatting characters', code: 'alert_contact_name_refused' };
const UNREACHABLE = { error: 'a person needs a phone number, an email address, or both', code: 'alert_contact_unreachable' };
const PEOPLE_FULL = { error: `a garage has at most ${MAX_PEOPLE} people to tell`, code: 'alert_contacts_full' };
const TEXT_NEEDS_PHONE = { error: 'this person has no phone number, so they cannot get an alert by text', code: 'alert_text_needs_phone' };
const EMAIL_NEEDS_EMAIL = { error: 'this person has no email address, so they cannot get an alert by email', code: 'alert_email_needs_email' };
const PERSON_LANGUAGE_REFUSED = { error: 'language must be one of en, es', code: 'alert_contact_language_refused' };
const CHOICE_REFUSED = (name, why) => ({ error: `${name} ${why}`, code: 'alert_choice_refused' });

/** A refusal of the platform's src/alerts.js, as it says it: thrown, and answered by the route. */
class Refused extends Error {
  constructor(status, body) {
    super(body.error);
    this.status = status;
    this.body = body;
  }
}
const phoneRefused = (why, reason) => new Refused(400, {
  error: `phone ${why}. A US number is 10 digits, or 11 starting with 1; any other starts with + and holds 8 to 15 digits`,
  code: 'alert_contact_phone_refused',
  details: { reason },
});
const emailRefused = (why, reason) => new Refused(400, {
  error: `email ${why}. An email address has one @, no spaces and at most 254 characters`,
  code: 'alert_contact_email_refused',
  details: { reason },
});

/**
 * A name, as the platform's src/alerts.js and src/digits.js read it: after
 * compatibility normalisation, no @ of any width, and at most 6 decimal
 * digits of any script in all, whatever stands between them.
 */
function personName(raw) {
  const refused = (reason, error = PERSON_NAME_REFUSED.error) => new Refused(400, { error, code: PERSON_NAME_REFUSED.code, details: { reason } });
  if (typeof raw !== 'string') throw refused('not_text');
  const name = raw.trim();
  if (name === '' || name.length > 80 || CONTROL.test(name)) throw refused('shape');
  return name;
}
function personPhone(raw) {
  if (typeof raw !== 'string') throw phoneRefused('must be text', 'not_text');
  const typed = raw.trim();
  if (typed === '') throw phoneRefused('is empty', 'empty');
  if (CONTROL.test(typed)) throw phoneRefused('holds an invisible character', 'invisible');
  if (/\p{L}/u.test(typed)) throw phoneRefused('holds letters', 'letters');
  if (!/^\+?[0-9 ().-]+$/.test(typed)) throw phoneRefused('holds a character a phone number does not have', 'character');
  const digits = typed.replace(/[^0-9]/g, '');
  if (typed.startsWith('+')) {
    if (digits.length < 8) throw phoneRefused('is too short', 'too_short');
    if (digits.length > 15) throw phoneRefused('is too long', 'too_long');
    return `+${digits}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length < 10) throw phoneRefused('is too short for a US number, and has no + for another country', 'too_short');
  throw phoneRefused('is not a US number, and has no + for another country', 'not_us');
}
function personEmail(raw) {
  if (typeof raw !== 'string') throw emailRefused('must be text', 'not_text');
  const email = raw.trim();
  if (email === '') throw emailRefused('is empty', 'empty');
  if (CONTROL.test(email)) throw emailRefused('holds an invisible character', 'invisible');
  if (/[\p{Z}\s]/u.test(email)) throw emailRefused('holds a space', 'space');
  if (email.length > 254) throw emailRefused('is too long', 'too_long');
  const parts = email.split('@');
  if (parts.length !== 2) throw emailRefused(parts.length < 2 ? 'has no @' : 'has more than one @', parts.length < 2 ? 'no_at' : 'two_at');
  if (parts[0] === '' || parts[1] === '') throw emailRefused('needs something before and after the @', 'empty_side');
  return email;
}
function choiceList(raw, name) {
  if (!Array.isArray(raw) || raw.some((k) => typeof k !== 'string')) throw new Refused(400, CHOICE_REFUSED(name, `must be a list of alerts: ${ALERT_KEYS.join(', ')}`));
  if (raw.some((k) => !ALERT_KEYS.includes(k))) throw new Refused(400, CHOICE_REFUSED(name, `names an alert there is none of; the alerts are ${ALERT_KEYS.join(', ')}`));
  if (new Set(raw).size !== raw.length) throw new Refused(400, CHOICE_REFUSED(name, 'names an alert twice'));
  return ALERT_KEYS.filter((k) => raw.includes(k));
}
function onlyFields(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Refused(400, { error: `the body is JSON: {${keys.join(', ')}}` });
  const extra = Object.keys(body).find((k) => !keys.includes(k));
  if (extra !== undefined) throw new Refused(400, { error: `unknown field ${JSON.stringify(extra)}; the body is {${keys.join(', ')}}` });
}
const kept = (v) => (v === null ? 'none' : 'given');

export async function startStub({ port = 0 } = {}) {
  const data = owners();
  const setups = setupData();
  const log = new Map(); // tenant -> lines, oldest first
  const used = new Set(); // lanes with a stay or an event: never removable
  let quiet = 5; // the platform's LANE_QUIET_MINUTES, which its lanes and setup reads return
  let flipped = false; // a checklist whose `done` says the opposite of its facts, for the checks
  for (const o of Object.values(data)) {
    for (const lanes of Object.values(o.lanes)) for (const l of lanes) Object.assign(l, { closed: l.closed ?? null, reopened: l.reopened ?? null });
  }
  // The stand-in's stays are on these lanes, as the platform's would be.
  for (const o of Object.values(data)) for (const stays of Object.values(o.open)) for (const st of stays) {
    for (const lanes of Object.values(o.lanes)) for (const l of lanes) if (l.name === st.entry_lane) used.add(l.id);
  }
  const sessions = new Map(); // token -> { owner, ended }
  const issued = [];
  let failNext = null;
  let slowNext = 0;
  let failSignIn = null;
  let allowedOrigin = null;
  const wrongTries = new Map(); // address|email -> { count, pausedUntil }

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const clearCookie = { 'Set-Cookie': `${COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0; Secure` };

  const cookieOf = (req) => {
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)`).exec(req.headers.cookie ?? '');
    return m ? m[1] : null;
  };

  const readBody = (req, limit = Infinity) =>
    new Promise((resolve) => {
      let text = '';
      req.on('data', (c) => (text += c));
      req.on('end', () => {
        if (Buffer.byteLength(text) > limit) return resolve(null);
        try {
          resolve(JSON.parse(text));
        } catch {
          resolve(null);
        }
      });
    });

  /** The platform's reading of a sign-in body: exactly an email and a password, or nothing. */
  const signInBody = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const keys = Object.keys(body);
    if (keys.length !== 2 || typeof body.email !== 'string' || typeof body.password !== 'string') return null;
    const email = body.email.trim().toLowerCase();
    if (email.length < 3 || email.length > 254 || body.password === '') return null;
    return { email, password: body.password };
  };

  async function signIn(req, res) {
    if (failSignIn) {
      const [status, body, headers] = SIGN_IN_ANSWERS[failSignIn];
      failSignIn = null;
      return send(res, status, body, headers);
    }
    if (allowedOrigin === null) return send(res, ...SIGN_IN_ANSWERS.notSetUp);
    if (req.headers.origin !== undefined && req.headers.origin !== allowedOrigin) return send(res, 403, ORIGIN_REFUSED);
    const body = signInBody(await readBody(req));
    if (!body) return send(res, 400, UNREADABLE);
    const who = Object.values(data).find((o) => o.email === body.email);
    const key = `${req.socket.remoteAddress}|${body.email}`;
    const tries = wrongTries.get(key) ?? { count: 0, pausedUntil: 0 };
    const paused = tries.pausedUntil > Date.now();
    if (!who || paused || body.password !== who.password) {
      // A wrong password counts, during a pause too, and the tenth pauses this address.
      if (who && body.password !== who.password) {
        const count = !paused && tries.pausedUntil ? 1 : tries.count + 1;
        wrongTries.set(key, { count, pausedUntil: count >= MAX_WRONG ? Date.now() + PAUSE : tries.pausedUntil });
      }
      return send(res, 401, REFUSED);
    }
    wrongTries.delete(key);
    const token = randomBytes(32).toString('base64url');
    issued.push(token);
    sessions.set(token, { owner: who, ended: false });
    return send(res, 200, { email: who.email, tenant_id: who.tenant_id, session_ends_at: new Date(Date.now() + 30 * MINUTE).toISOString(), language: who.language }, {
      'Set-Cookie': `${COOKIE}=${token}; ${COOKIE_ATTRIBUTES}; Max-Age=${SESSION_SECONDS}; Secure`,
    });
  }

  // ── U4 ────────────────────────────────────────────────────────────────────
  // An answer from a U4 route: sent, and said so, so the routes after it do not answer too.
  const answer = (...args) => {
    send(...args);
    return true;
  };
  const linesOf = (who) => {
    if (!log.has(who.tenant_id)) log.set(who.tenant_id, []);
    return log.get(who.tenant_id);
  };
  let lineN = 0;
  const same = (x, y) => x !== null && y !== null && JSON.stringify(x) === JSON.stringify(y);
  const line = (who, { garageId = null, action, subject, before = null, after = null, outcome = 'done', refusal = null }) =>
    // Asked again, answered with what was there: the platform writes no line.
    same(before, after) ? 0 : linesOf(who).push({
      id: `c${String((lineN += 1)).padStart(7, '0')}-0000-4000-8000-000000000000`,
      garage_id: garageId,
      at: new Date(Date.now() + lineN).toISOString(),
      outcome,
      who: { kind: 'owner', name: who.email },
      action,
      subject,
      before,
      after,
      refusal,
      // The platform counts a repeated refusal on its line (0027); each line here is one attempt.
      attempts: 1,
      last_at: outcome === 'refused' ? new Date(Date.now() + lineN).toISOString() : null,
    });
  const laneOf = (who, laneId) => {
    for (const [garageId, lanes] of Object.entries(who.lanes)) {
      const lane = lanes.find((l) => l.id === laneId);
      if (lane) return { garageId, lane, lanes };
    }
    return null;
  };
  const deviceOf = (who, deviceId) => {
    for (const [garageId, lanes] of Object.entries(who.lanes)) {
      for (const lane of lanes) {
        const device = (lane.devices ?? []).find((d) => d.id === deviceId);
        if (device) return { garageId, lane, device };
      }
    }
    return null;
  };
  // A "not found" with no code is named by what was not found, as the platform's src/changes.js names it.
  const refuse = (res, who, status, body, at) => {
    line(who, { ...at, outcome: 'refused', refusal: body.code ?? (status === 404 ? at.missing ?? 'not_found' : { 400: 'bad_request' }[status]) ?? 'conflict' });
    return answer(res, status, body);
  };
  const subjectOfLane = (lane, name = lane.name) => ({ kind: 'lane', id: lane.id, name });
  const stateOf = (lane) => (lane.closed ? { state: 'closed', reason: lane.closed.reason, message: lane.closed.message } : { state: 'open' });
  const nameOk = (raw, max) => typeof raw === 'string' && raw.trim() !== '' && raw.trim().length <= max && !CONTROL.test(raw.trim());

  function checklist(who, garage) {
    const extra = setups[garage.id] ?? setupData()['a2000000-0000-4000-8000-000000000002'];
    const lanes = who.lanes[garage.id] ?? [];
    const now = Date.now();
    const laneLine = (l) => ({ lane_id: l.id, name: l.name, direction: l.direction });
    const computer = (l) => {
      const devices = l.devices ?? [];
      const live = devices.filter((d) => !d.revoked_at);
      if (devices.length === 0) return { state: 'none', last_heard_at: null };
      if (live.length === 0) return { state: 'cancelled', last_heard_at: null };
      const heard = live.map((d) => d.last_seen_at).filter(Boolean).map((x) => Date.parse(x));
      if (heard.length === 0) return { state: 'never_heard', last_heard_at: null };
      const latest = Math.max(...heard);
      return { state: now - latest < quiet * 60_000 ? 'working' : 'quiet', last_heard_at: new Date(latest).toISOString() };
    };
    const entry = lanes.filter((l) => l.direction === 'entry');
    const exit = lanes.filter((l) => l.direction === 'exit');
    const computers = lanes.map((l) => ({ ...laneLine(l), ...computer(l) }));
    const steps = [
      { key: 'garage_details', done: true, facts: { name: garage.name, timezone: garage.timezone, currency: garage.currency } },
      { key: 'drivers', done: extra.transient_available !== null, facts: { transient_available: extra.transient_available } },
      { key: 'lanes', done: entry.length > 0 && exit.length > 0, facts: { entry_lanes: entry.length, exit_lanes: exit.length, closed_lanes: lanes.filter((l) => l.closed).map(laneLine) } },
      { key: 'lane_computers', done: lanes.length > 0 && computers.every((c) => c.state === 'working'), facts: { quiet_minutes: quiet, lanes: lanes.length, working: computers.filter((c) => c.state === 'working').length, not_working: computers.filter((c) => c.state !== 'working') } },
      { key: 'rates', done: extra.rates.in_force > 0, facts: extra.rates },
      { key: 'taxes', done: extra.taxes.in_force > 0, facts: extra.taxes },
    ];
    if (extra.transient_available === true) {
      const a = extra.account;
      steps.push({ key: 'getting_paid', done: Boolean(a?.account && a.charges_enabled === true && a.card_payments === 'active'), facts: { can_be_set_up_here: false, account: Boolean(a?.account), charges_enabled: a?.charges_enabled ?? null, card_payments: a?.card_payments ?? null, details_submitted: a?.details_submitted ?? null, read_at: a?.read_at ?? null } });
      const without = exit.filter((l) => !l.reader);
      steps.push({ key: 'card_readers', done: exit.length > 0 && without.length === 0, facts: { exit_lanes: exit.length, with_reader: exit.length - without.length, without_reader: without.map(laneLine) } });
    }
    const gate = { rates: steps[4].done, drivers: steps[1].done, taxes: steps[5].done };
    // Worked out before the alerts step, which never holds opening back (U4b).
    const notDone = steps.filter((st) => !st.done).map((st) => st.key);
    const people = who.people?.[garage.id] ?? [];
    const told = ALERT_KEYS.map((key) => ({ key, by_text: people.filter((p) => p.by_text.includes(key)).length, by_email: people.filter((p) => p.by_email.includes(key)).length }));
    steps.push({ key: 'alerts', done: told.every((a) => a.by_text + a.by_email > 0), facts: { people: people.length, alerts: told, nobody_told: told.filter((a) => a.by_text + a.by_email === 0).map((a) => a.key) } });
    const open = extra.opened_at !== null;
    steps.push({ key: 'open', done: open, facts: { open, opened_at: extra.opened_at, required_missing: Object.keys(gate).filter((k) => !gate[k]), not_done: notDone } });
    // Asked for by a check: every step's `done` the opposite of what its facts
    // would suggest, so a page that worked a step out for itself shows it.
    if (flipped) for (const st of steps) st.done = !st.done;
    return { garage_id: garage.id, open, takes_any_driver: extra.transient_available, steps };
  }

  async function setupRoutes(req, res, path, who) {
    let m = /^\/api\/v1\/garages\/([^/]+)\/(setup|changes|refused-attempts)(?:\/([^/]+))?$/.exec(path);
    if (m && req.method === 'GET') {
      const garage = who.garages.find((g) => g.id === m[1]);
      if (!garage) return answer(res, 404, GARAGE_NOT_FOUND);
      if (m[2] === 'setup') {
        if (m[3]) return answer(res, 404, { error: 'not found' });
        return answer(res, 200, { setup: checklist(who, garage) });
      }
      const outcome = m[2] === 'changes' ? 'done' : 'refused';
      const mine = linesOf(who).filter((l) => (l.garage_id === garage.id || l.garage_id === null) && l.outcome === outcome);
      const all = mine.slice().reverse();
      const after = m[3] ?? null;
      const from = after === null ? 0 : all.findIndex((l) => l.id === after) + 1;
      if (after !== null && from === 0) return answer(res, 404, { error: 'change not found' });
      // A person to tell is named as they are now, or as removed with no name (the platform's src/changes.js).
      const people = Object.values(who.people ?? {}).flat();
      const page = all.slice(from, from + LINES_PAGE).map((l) => {
        if (l.subject?.kind !== 'alert_contact') return { ...l, subject: { ...l.subject, removed: false } };
        const now = people.find((p) => p.id === l.subject.id);
        return { ...l, subject: { ...l.subject, name: now ? now.name : null, removed: !now } };
      });
      const next = all.length > from + LINES_PAGE ? page[page.length - 1].id : null;
      if (outcome === 'done') return answer(res, 200, { changes: page, next });
      return answer(res, 200, { refused: page, next, count: { lines: mine.length, attempts: mine.reduce((n, l) => n + (l.attempts ?? 1), 0) } });
    }
    m = /^\/api\/v1\/garages\/([^/]+)$/.exec(path);
    if (m && req.method === 'PATCH') {
      const garage = who.garages.find((g) => g.id === m[1]);
      const body = (await readBody(req)) ?? {};
      if (!garage) return refuse(res, who, 404, GARAGE_NOT_FOUND, { action: 'garage.update', subject: { kind: 'unknown', id: null, name: null }, missing: 'garage_not_found' });
      const at = { garageId: garage.id, action: 'garage.update', subject: { kind: 'garage', id: garage.id, name: garage.name } };
      if (!('transient_available' in body)) return refuse(res, who, 400, { error: 'default_action or transient_available is required' }, at);
      if (body.transient_available !== true && body.transient_available !== false) return refuse(res, who, 400, DRIVERS_REFUSED(body.transient_available), at);
      const extra = setups[garage.id];
      const was = extra.transient_available;
      extra.transient_available = body.transient_available;
      line(who, { ...at, before: { transient_available: was }, after: { transient_available: body.transient_available } });
      // The platform answers with the garage's whole row.
      return answer(res, 200, {
        garage: {
          id: garage.id, tenant_id: who.tenant_id, name: garage.name, timezone: garage.timezone, currency: garage.currency,
          created_at: '2025-11-20T15:00:00.000Z', default_action: 'allow', space_class: 'standard',
          transient_available: body.transient_available, activated_at: extra.opened_at ?? '2026-01-02T15:00:00.000Z',
          garage_pass_link: null, monthly_billing_link: null, validations_link: null,
        },
      });
    }
    m = /^\/api\/v1\/garages\/([^/]+)\/lanes$/.exec(path);
    if (m && req.method === 'POST') {
      const garage = who.garages.find((g) => g.id === m[1]);
      const body = (await readBody(req)) ?? {};
      if (!garage) return refuse(res, who, 404, GARAGE_NOT_FOUND, { action: 'lane.add', subject: { kind: 'unknown', id: null, name: null }, missing: 'garage_not_found' });
      if (!body.name || !['entry', 'exit'].includes(body.direction)) return refuse(res, who, 400, ADD_LANE_REFUSED, { garageId: garage.id, action: 'lane.add', subject: { kind: 'garage', id: garage.id, name: garage.name } });
      const lane = { id: `la9${String(Date.now()).slice(-5)}-${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}-4000-8000-${String((lineN += 1)).padStart(12, '0')}`, name: body.name, direction: body.direction, reader: null, devices: [], closed: null, reopened: null };
      (who.lanes[garage.id] ??= []).push(lane);
      line(who, { garageId: garage.id, action: 'lane.add', subject: subjectOfLane(lane), after: { name: lane.name, direction: lane.direction } });
      return answer(res, 201, { lane: { id: lane.id, tenant_id: who.tenant_id, garage_id: garage.id, name: lane.name, direction: lane.direction, created_at: new Date().toISOString(), closed_reason: null, closed_message: null, closed_by: null, closed_at: null, reopened_by: null, reopened_at: null } });
    }
    m = /^\/api\/v1\/lanes\/([^/]+)(\/close|\/reopen|\/devices)?$/.exec(path);
    if (m && ['PATCH', 'DELETE', 'POST'].includes(req.method) && (req.method === 'POST') === Boolean(m[2])) {
      const found = laneOf(who, m[1]);
      const body = (await readBody(req)) ?? {};
      const action = { PATCH: 'lane.rename', DELETE: 'lane.remove' }[req.method] ?? { '/close': 'lane.close', '/reopen': 'lane.reopen', '/devices': 'computer.connect' }[m[2]];
      if (!found) return refuse(res, who, 404, m[2] === '/devices' ? LANE_NOT_FOUND : LANE_NOT_FOUND_NAMED, { action, subject: { kind: 'unknown', id: null, name: null }, missing: 'lane_not_found' });
      const { garageId, lane, lanes } = found;
      const at = { garageId, action, subject: subjectOfLane(lane) };
      if (req.method === 'PATCH') {
        const extra = Object.keys(body).filter((k) => k !== 'name');
        if (extra.length) return refuse(res, who, 400, { error: `unknown field ${JSON.stringify(extra[0])}; the body is {name}` }, at);
        if (!nameOk(body.name, 80)) return refuse(res, who, 400, LANE_NAME_REFUSED, at);
        const was = lane.name;
        lane.name = body.name.trim();
        line(who, { ...at, subject: subjectOfLane(lane), before: { name: was }, after: { name: lane.name } });
        return answer(res, 200, { lane: { id: lane.id, garage_id: garageId, name: lane.name, direction: lane.direction } });
      }
      if (req.method === 'DELETE') {
        const had = { stays: used.has(lane.id) ? 1 : 0, computers: (lane.devices ?? []).length, card_readers: lane.reader ? 1 : 0, events: 0 };
        const kept = Object.entries(had).filter(([, n]) => n > 0);
        if (kept.length) {
          return refuse(res, who, 409, {
            error: `this lane cannot be removed: it has ${kept.map(([what, n]) => `${n} ${what.replace('_', ' ')}`).join(', ')} on record, and removing it would lose that history. Rename it or close it instead.`,
            code: 'lane_has_history',
            details: had,
          }, at);
        }
        lanes.splice(lanes.indexOf(lane), 1);
        line(who, { ...at, before: { name: lane.name, direction: lane.direction } });
        return answer(res, 204);
      }
      if (m[2] === '/devices') {
        if (!body.name) return refuse(res, who, 400, COMPUTER_NAME_REQUIRED, at);
        const device = { id: `dv9${String(Date.now()).slice(-5)}-0000-4000-8000-${String((lineN += 1)).padStart(12, '0')}`, name: body.name, last_seen_at: null, revoked_at: null };
        (lane.devices ??= []).push(device);
        const token = `opl_${randomBytes(32).toString('base64url')}`;
        issued.push(token);
        line(who, { ...at, action: 'computer.connect', subject: { kind: 'computer', id: device.id, name: device.name }, after: { name: device.name, lane: lane.name } });
        return answer(res, 201, { device: { id: device.id, lane_id: lane.id, name: device.name, created_at: new Date().toISOString() }, token, token_note: 'shown once; it is not recoverable' });
      }
      if (m[2] === '/reopen') {
        if (Object.keys(body).length) return refuse(res, who, 400, { error: `unknown field ${JSON.stringify(Object.keys(body)[0])}; the body is {}` }, at);
        if (!lane.closed) return refuse(res, who, 409, LANE_ALREADY_OPEN, at);
        const was = stateOf(lane);
        lane.closed = null;
        lane.reopened = { by: { kind: 'owner', name: who.email }, at: new Date().toISOString() };
        line(who, { ...at, before: was, after: { state: 'open' } });
        return answer(res, 200, { lane: { id: lane.id, closed: null, reopened_at: lane.reopened.at } });
      }
      // close
      const extra = Object.keys(body).filter((k) => !['reason', 'message', 'override'].includes(k));
      if (extra.length) return refuse(res, who, 400, { error: `unknown field ${JSON.stringify(extra[0])}; the body is {reason, message, override}` }, at);
      if (!['full', 'everyone'].includes(body.reason)) return refuse(res, who, 400, LANE_REASON_REFUSED, at);
      if (!nameOk(body.message, 160)) return refuse(res, who, 400, LANE_MESSAGE_REFUSED, at);
      if (body.override !== undefined && body.override !== true) return refuse(res, who, 400, { error: 'override, when sent, is true', code: 'lane_override_refused' }, at);
      const others = lanes.filter((l) => l !== lane && l.direction === lane.direction && !l.closed);
      if (!lane.closed && others.length === 0 && body.override !== true) return refuse(res, who, 409, lastOpen(lane.direction), at);
      const was = stateOf(lane);
      const message = body.message.trim();
      lane.closed = { reason: body.reason, message, by: { kind: 'owner', name: who.email }, at: new Date().toISOString() };
      line(who, { ...at, action: was.state === 'open' ? 'lane.close' : 'lane.close_again', before: was, after: { state: 'closed', reason: body.reason, message, ...(body.override === true ? { last_open_overridden: true } : {}) } });
      return answer(res, 200, { lane: { id: lane.id, closed: { reason: lane.closed.reason, message, at: lane.closed.at } } });
    }
    const u4b = await alertRoutes(req, res, path, who);
    if (u4b !== undefined) return u4b;
    m = /^\/api\/v1\/devices\/([^/]+)\/revoke$/.exec(path);
    if (m && req.method === 'POST') {
      const found = deviceOf(who, m[1]);
      if (!found) return refuse(res, who, 404, DEVICE_NOT_FOUND, { action: 'computer.cancel', subject: { kind: 'unknown', id: null, name: null }, missing: 'computer_not_found' });
      const { garageId, lane, device } = found;
      const was = device.revoked_at;
      device.revoked_at ??= new Date().toISOString();
      line(who, { garageId, action: 'computer.cancel', subject: { kind: 'computer', id: device.id, name: device.name }, before: { access: was ? 'cancelled' : 'connected', lane: lane.name }, after: { access: 'cancelled', lane: lane.name } });
      return answer(res, 200, { device: { id: device.id, lane_id: lane.id, name: device.name, created_at: new Date().toISOString(), revoked_at: device.revoked_at } });
    }
    return undefined;
  }

  // ── U4b: the people to tell ───────────────────────────────────────────────
  const present = (p) => ({ id: p.id, name: p.name, phone: p.phone, email: p.email, language: p.language, confirmed: p.confirmed, by_text: [...p.by_text], by_email: [...p.by_email] });
  let personN = 0;

  async function alertRoutes(req, res, path, who) {
    let m = /^\/api\/v1\/garages\/([^/]+)\/alerts$/.exec(path);
    if (m && req.method === 'GET') {
      const garage = who.garages.find((g) => g.id === m[1]);
      if (!garage) return answer(res, 404, GARAGE_NOT_FOUND);
      return answer(res, 200, { alerts: ALERTS, quiet_minutes: quiet, max_contacts: MAX_PEOPLE, sending: false, contacts: (who.people[garage.id] ?? []).map(present) });
    }
    m = /^\/api\/v1\/garages\/([^/]+)\/alert-contacts(?:\/([^/]+)(\/choices)?)?$/.exec(path);
    if (!m) return undefined;
    const method = req.method;
    const action = m[3] ? 'alert_contact.choices' : !m[2] ? 'alert_contact.add' : { PATCH: 'alert_contact.change', DELETE: 'alert_contact.remove' }[method];
    const allowed = m[3] ? method === 'PUT' : m[2] ? ['PATCH', 'DELETE'].includes(method) : method === 'POST';
    if (!allowed) return undefined;
    const garage = who.garages.find((g) => g.id === m[1]);
    const body = method === 'DELETE' ? {} : (await readBody(req)) ?? {};
    if (!garage) return refuse(res, who, 404, GARAGE_NOT_FOUND, { action, subject: { kind: 'unknown', id: null, name: null }, missing: 'garage_not_found' });
    const people = (who.people[garage.id] ??= []);
    const at = { garageId: garage.id, action, subject: { kind: 'garage', id: garage.id, name: garage.name } };
    try {
      if (!m[2]) {
        onlyFields(body, ['name', 'phone', 'email', 'language']);
        const name = personName(body.name);
        const phone = body.phone === undefined || body.phone === null ? null : personPhone(body.phone);
        const email = body.email === undefined || body.email === null ? null : personEmail(body.email);
        if (body.language !== undefined && !LANGUAGES.includes(body.language)) throw new Refused(400, PERSON_LANGUAGE_REFUSED);
        const language = body.language ?? 'en';
        if (phone === null && email === null) throw new Refused(400, UNREACHABLE);
        if (people.length >= MAX_PEOPLE) throw new Refused(409, { ...PEOPLE_FULL, details: { max: MAX_PEOPLE } });
        const person = { id: `pa9${String((personN += 1)).padStart(5, '0')}-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, '0')}`, name, phone, email, language, confirmed: false, by_text: [], by_email: [] };
        people.push(person);
        // A line about a person holds their id and what kind of change it was, never anything typed.
        line(who, { garageId: garage.id, action, subject: { kind: 'alert_contact', id: person.id, name: null }, after: { language, phone: kept(phone), email: kept(email) } });
        return answer(res, 201, { contact: present(person) });
      }
      const person = people.find((p) => p.id === m[2]);
      // The body is read before the person is looked up, as the platform reads it.
      const next = {};
      let byText = [];
      let byEmail = [];
      if (method !== 'DELETE' && !m[3]) {
        onlyFields(body, ['name', 'phone', 'email', 'language']);
        if (body.name !== undefined) next.name = personName(body.name);
        if (body.phone !== undefined) next.phone = body.phone === null ? null : personPhone(body.phone);
        if (body.email !== undefined) next.email = body.email === null ? null : personEmail(body.email);
        if (body.language !== undefined && !LANGUAGES.includes(body.language)) throw new Refused(400, PERSON_LANGUAGE_REFUSED);
        if (body.language !== undefined) next.language = body.language;
      }
      if (m[3]) {
        onlyFields(body, ['by_text', 'by_email']);
        byText = choiceList(body.by_text, 'by_text');
        byEmail = choiceList(body.by_email, 'by_email');
      }
      if (!person) throw new Refused(404, PERSON_NOT_FOUND);
      const subject = { kind: 'alert_contact', id: person.id, name: null };
      if (method === 'DELETE') {
        people.splice(people.indexOf(person), 1);
        line(who, { garageId: garage.id, action, subject, before: { language: person.language, phone: kept(person.phone), email: kept(person.email), by_text: person.by_text, by_email: person.by_email } });
        return answer(res, 204);
      }
      if (m[3]) {
        if (byText.length && person.phone === null) throw new Refused(409, TEXT_NEEDS_PHONE);
        if (byEmail.length && person.email === null) throw new Refused(409, EMAIL_NEEDS_EMAIL);
        const before = {};
        const after = {};
        if (person.by_text.join() !== byText.join()) Object.assign(before, { by_text: person.by_text }) && Object.assign(after, { by_text: byText });
        if (person.by_email.join() !== byEmail.join()) Object.assign(before, { by_email: person.by_email }) && Object.assign(after, { by_email: byEmail });
        person.by_text = byText;
        person.by_email = byEmail;
        line(who, { garageId: garage.id, action, subject, before, after });
        return answer(res, 200, { contact: present(person) });
      }
      const phone = 'phone' in next ? next.phone : person.phone;
      const email = 'email' in next ? next.email : person.email;
      if (phone === null && email === null) throw new Refused(400, UNREACHABLE);
      const name = next.name ?? person.name;
      const language = next.language ?? person.language;
      const before = {};
      const after = {};
      if (name !== person.name) Object.assign(after, { name: 'changed' });
      if (language !== person.language) Object.assign(before, { language: person.language }) && Object.assign(after, { language });
      if (phone !== person.phone) Object.assign(before, { phone: kept(person.phone) }) && Object.assign(after, { phone: person.phone !== null && phone !== null ? 'changed' : kept(phone) });
      if (email !== person.email) Object.assign(before, { email: kept(person.email) }) && Object.assign(after, { email: person.email !== null && email !== null ? 'changed' : kept(email) });
      const turnedOff = { by_text: phone === null ? person.by_text : [], by_email: email === null ? person.by_email : [] };
      if (turnedOff.by_text.length) Object.assign(before, { by_text: person.by_text }) && Object.assign(after, { by_text: [] });
      if (turnedOff.by_email.length) Object.assign(before, { by_email: person.by_email }) && Object.assign(after, { by_email: [] });
      Object.assign(person, { name, phone, email, language, by_text: phone === null ? [] : person.by_text, by_email: email === null ? [] : person.by_email });
      line(who, { garageId: garage.id, action, subject, before, after });
      return answer(res, 200, { contact: present(person), turned_off: turnedOff });
    } catch (err) {
      if (!(err instanceof Refused)) throw err;
      return refuse(res, who, err.status, err.body, at);
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://stub');
    const path = url.pathname;

    // A delay asked for by a check, on the next read that is not sign-in.
    if (slowNext && !path.startsWith('/api/v1/auth/')) {
      const ms = slowNext;
      slowNext = 0;
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    // A failure asked for by a check, on the next read that is not sign-in.
    if (failNext && !path.startsWith('/api/v1/auth/sign-in')) {
      const kind = failNext;
      failNext = null;
      if (kind === 'nonJson') {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        return res.end('<html><body>500 Internal Server Error</body></html>');
      }
      // What a gateway in front of the platform answers when it cannot reach it.
      if (kind === 'gateway') {
        res.writeHead(502, { 'Content-Type': 'text/html' });
        return res.end('<html><body>502 Bad Gateway</body></html>');
      }
      if (kind === 'unknownCode') return send(res, 409, { error: 'garage_frozen_for_audit', code: 'garage_frozen_for_audit' });
      if (kind === 'serverError') return send(res, 500, { error: 'internal error' });
      if (kind === 'ended') return send(res, 401, SESSION_ENDED, clearCookie);
      if (kind === 'plain401') return send(res, 401, TOKEN_REQUIRED);
    }

    if (path === '/api/v1/auth/sign-in' && req.method === 'POST') return signIn(req, res);

    // Who the cookie names: the auth routes and the reads answer "not signed in" differently.
    const onAuth = path.startsWith('/api/v1/auth/');
    const token = cookieOf(req);
    if (!token) return send(res, 401, onAuth ? SIGN_IN_REQUIRED : TOKEN_REQUIRED);
    if (req.method !== 'GET' && (!allowedOrigin || req.headers.origin !== allowedOrigin)) return send(res, 403, ORIGIN_REFUSED);
    const session = sessions.get(token);
    if (!session || session.ended) return send(res, 401, SESSION_ENDED, clearCookie);
    const who = session.owner;

    if (path === '/api/v1/auth/sign-out' && req.method === 'POST') {
      session.ended = true;
      return send(res, 204, undefined, clearCookie);
    }
    if (path === '/api/v1/auth/me' && req.method === 'GET') {
      return send(res, 200, { email: who.email, tenant_id: who.tenant_id, session_ends_at: new Date(Date.now() + 30 * MINUTE).toISOString(), language: who.language });
    }
    if (path === '/api/v1/auth/language' && req.method === 'PUT') {
      // The owner is the session's; nothing else in the body is read.
      if (!/^application\/json\b/.test(req.headers['content-type'] ?? '')) return send(res, 400, LANGUAGE_REFUSED);
      const body = await readBody(req, LANGUAGE_BODY_LIMIT);
      const language = body && typeof body === 'object' && !Array.isArray(body) ? body.language : undefined;
      if (typeof language !== 'string' || !LANGUAGES.includes(language)) return send(res, 400, LANGUAGE_REFUSED);
      const was = who.language;
      who.language = language;
      line(who, { action: 'language.change', subject: { kind: 'language', id: null, name: null }, before: { language: was }, after: { language } });
      return send(res, 200, { language });
    }
    if (path === '/api/v1/garages' && req.method === 'GET') return send(res, 200, { garages: who.garages });

    const u4 = await setupRoutes(req, res, path, who);
    if (u4 !== undefined) return u4;

    const m = /^\/api\/v1\/garages\/([^/]+)(\/lanes|\/sessions\/open)?$/.exec(path);
    if (m && req.method === 'GET') {
      const garage = who.garages.find((g) => g.id === m[1]);
      // The platform's open-stays read is scoped by the owner and finds none for a garage not theirs.
      const stays = garage ? who.open[garage.id] ?? [] : [];
      if (m[2] === '/sessions/open') {
        const confirmed = stays.filter((s) => s.entry_confirmation === 'confirmed').length;
        return send(res, 200, { inside_count: confirmed, unconfirmable_count: stays.length - confirmed, open_count: stays.length, sessions: stays });
      }
      if (!garage) return send(res, 404, GARAGE_NOT_FOUND);
      if (!m[2]) return send(res, 200, { garage });
      return send(res, 200, { lanes: who.lanes[garage.id] ?? [], quiet_minutes: quiet });
    }
    return send(res, 404, { error: 'not found' });
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    data,
    issued,
    failNext: (kind) => {
      failNext = kind;
    },
    /** The next read that is not an auth route answers `ms` later. */
    slowNext: (ms) => {
      slowNext = ms;
    },
    /** The next sign-in answers as a platform set up to give it would: tooMany, busy, notSetUp or wrongPlace. */
    failSignIn: (kind) => {
      if (!SIGN_IN_ANSWERS[kind]) throw new Error(`no such sign-in answer: ${kind}`);
      failSignIn = kind;
    },
    /** A lane ever used (a stay or an event): never removable, as on the platform. */
    markUsed: (laneId) => used.add(laneId),
    /** The platform's quiet setting, as its lanes and setup reads return it; and a way to change it, as a deployment would. */
    quietMinutes: () => quiet,
    setQuietMinutes: (minutes) => {
      quiet = minutes;
    },
    /** Every step of every checklist answered with `done` reversed (true), or as worked out (false). */
    flipSetup: (on) => {
      flipped = Boolean(on);
    },
    /** Put `lines` (oldest first) as the owner's change log, for the file checks. */
    setChanges: (owner, lines) => log.set(owner.tenant_id, lines.slice()),
    /** The change log the stand-in kept, per owner, oldest first. */
    changes: (owner) => linesOf(owner).slice(),
    endSessions: () => {
      for (const s of sessions.values()) s.ended = true;
    },
    allowOrigin: (origin) => {
      allowedOrigin = origin;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
