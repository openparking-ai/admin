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
//   POST /api/v1/garages         { name, timezone, currency } -> 201 { garage } (U7c), the garage's whole row,
//                                not open, nothing stated; one with no name, time zone or currency is 400
//                                with no code; since platform 130d38d (U7d-2) a name of more than 100
//                                characters, money not on the list and a time zone the platform does not
//                                know are each a 400 with its own sentence and code (its src/garageFields.js)
// U7d-2, the four doors behind an emailed link, as the platform's src/accountDoors.js answers them:
//   POST /api/v1/auth/invite/status  { token }                     -> { status, message[, email, language, expires_at] }
//   POST /api/v1/auth/invite/accept  { token, password, language } -> { email, tenant_id, session_ends_at, language } and the cookie
//   POST /api/v1/auth/forgot         { email }                     -> { message }, the same whoever it names
//   POST /api/v1/auth/reset          { token, password }           -> { email, message }
//   An invite lasts seven days and a reset link one hour; each works once. A
//   link that is not ready is 409 invite_<status> or reset_<status>. A reset
//   ends every session of the owner. No door reads a cookie or the query.
//   As on the platform, no door answers sooner than the floor (500 ms) after
//   the request arrived: so a page's first "who is signed in?" is answered
//   first, as it is in life.
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
// U4c, as the platform's src/lanes.js, src/screenText.js and src/board.js answer:
//   GET    /api/v1/garages/:id/lanes          ... and screen: { characters, message_max }
//   POST   /api/v1/lanes/:id/close            full on a way out is 400 lane_reason_refused; a
//                                             character the screen cannot show, 400 naming each
//   GET    /api/v1/garages/:id/board          { timezone, messages_max, messages, lanes, screen }
//   POST   /api/v1/garages/:id/board-messages            { text, lanes, starts?, ends? } -> 201 { message }
//   PATCH  /api/v1/garages/:id/board-messages/:message   { text?, lanes?, starts?, ends? } -> { message }
//   DELETE /api/v1/garages/:id/board-messages/:message   204
//   PUT    /api/v1/lanes/:id/board-prices                { show } -> { lane: { id, prices } }
//   Times are the garage's own, YYYY-MM-DDTHH:MM, kept as instants; at most 20 messages a garage.
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
import { CURRENCY_CODES } from '../src/garages.js';

const MINUTE = 60_000;

/** Three owners. A has two garages, so the list to pick from shows; B has one; C, a new account, has none (U7c). */
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
            reader: { reader_id: 'tmr_stubNorthEntry', label: 'North Entry reader', bound_at: ago(60 * 24 * 60 * MINUTE) },
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
    c: {
      email: 'owner-c@example.com',
      password: 'new-account-test-password',
      tenant_id: 'cccccccc-0000-4000-8000-000000000003',
      language: 'en',
      garages: [],
      lanes: {},
      people: {},
      open: {},
    },
  };
}

/** What the stand-in keeps beside each garage for its checklist: the platform's own reads, in short. */
function setupData() {
  return {
    'a1000000-0000-4000-8000-000000000001': { transient_available: true, opened_at: '2026-01-02T15:00:00Z', rates: { stored: 1, in_force: 1, earliest: '2025-12-01T05:00:00.000Z' } },
    'a2000000-0000-4000-8000-000000000002': { transient_available: null, opened_at: null, rates: { stored: 0, in_force: 0, earliest: null } },
    'b1000000-0000-4000-8000-000000000001': { transient_available: false, opened_at: '2026-02-01T18:00:00Z', rates: { stored: 1, in_force: 1, earliest: '2026-01-01T08:00:00.000Z' } },
  };
}

/**
 * U6: what the stand-in keeps of each garage's taxes, payment account, its
 * readers' place and every reader connection, as the platform's
 * src/taxes.js, src/stripeAccount.js and src/terminal.js keep them. Harbor
 * charges two taxes and takes cards; its North Entry reader is connected
 * (the lanes read says so too), and North Exit had one, since ended.
 * Riverside has said nothing and has no account. Elm Court charges no tax.
 */
function moneyData() {
  const rule = (id, label, percent_bp, rounding, sequence) => ({ id, label, percent_bp, rounding, sequence });
  return {
    'a1000000-0000-4000-8000-000000000001': {
      taxSets: [
        { id: 'ts100000-0000-4000-8000-000000000001', garage_id: 'a1000000-0000-4000-8000-000000000001', effective_from: '2025-12-01T05:00:00.000000Z', rule_count: 2, created_at: '2025-11-28T15:00:00.000Z', rules: [rule('city', 'City parking tax', 1850, 'nearest', 1), rule('state', 'State surcharge', 600, 'up', 2)] },
      ],
      account: {
        garage_id: 'a1000000-0000-4000-8000-000000000001', account_id: 'acct_stubHarbor', create_requested_at: '2025-12-20T15:00:00.000Z', account_recorded_at: '2025-12-20T15:00:01.000Z',
        card_payments: 'active', card_payments_read_at: '2026-01-02T14:00:00.000Z', charges_enabled: true, charges_enabled_read_at: '2026-01-02T14:00:00.000Z', details_submitted: true, details_submitted_read_at: '2026-01-02T14:00:00.000Z',
      },
      place: { garage_id: 'a1000000-0000-4000-8000-000000000001', location_id: 'tml_stubHarbor', display_name: '200 Harbor Street, Springfield, IL 62701, US', created_at: '2025-12-21T16:00:00.000Z' },
      connections: [
        { lane_id: 'la100000-0000-4000-8000-000000000002', reader_id: 'tmr_stubOldExit', label: 'Old exit reader', location_id: 'tml_stubHarbor', bound_at: '2026-01-10T15:00:00.000Z', unbound_at: '2026-02-01T16:30:00.000Z' },
      ],
    },
    'a2000000-0000-4000-8000-000000000002': { taxSets: [], account: null, place: null, connections: [] },
    'b1000000-0000-4000-8000-000000000001': {
      taxSets: [{ id: 'ts100000-0000-4000-8000-000000000002', garage_id: 'b1000000-0000-4000-8000-000000000001', effective_from: '2026-01-01T08:00:00.000000Z', rule_count: 0, created_at: '2025-12-30T18:00:00.000Z', rules: [] }],
      account: null,
      place: null,
      connections: [],
    },
  };
}

/** Every piece of text of owner A's that a screen could show. */
export const A_TEXT = ['Harbor Street Garage', 'Riverside Deck', 'North Entry', 'North Exit', 'Service Lane', 'Harbor entry computer', 'HRB4410', 'HT-0042', 'owner-a@example.com', 'Night manager', '+15550100001', 'office@example.com', 'City parking tax', 'North Entry reader', '200 Harbor Street'];

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

// U7d-2: the four doors' own words, as the platform's src/accountDoors.js says them.
const INVITE_SENTENCES = {
  ready: 'This invite is ready. Choose a password to finish.',
  used: 'This invite was already used. Sign in instead.',
  expired: 'This invite has ended. Ask for a new one.',
  replaced: 'A newer invite was sent. Use the link in the latest email.',
  invalid: 'This link is not an invite. Check that the whole link was used.',
};
const RESET_SENTENCES = {
  used: 'This reset link was already used. Ask for a new one if you need it.',
  expired: 'This reset link has ended. Ask for a new one.',
  replaced: 'A newer reset link was sent. Use the link in the latest email.',
  invalid: 'This link is not a reset link. Check that the whole link was used.',
};
const FORGOT_SENT = { message: 'If that email names an account, a link to choose a new password is on its way. It works once, for one hour.' };
const PASSWORD_REFUSED = { error: 'The password must be 12 to 1024 characters.', code: 'password_refused' };
const INVITE_HAS_ADMIN = { error: 'This account already has its admin. Sign in instead.', code: 'invite_has_admin' };
const INVITE_EMAIL_TAKEN = { error: 'That email already names an admin. Sign in instead.', code: 'invite_email_taken' };
const RESET_DONE = 'The password is changed, and every session of the account is signed out. Sign in with the new password.';
const DOOR_UNREADABLE = {
  status: { error: 'The request could not be read. Send JSON: {"token"}.', code: 'invite_unreadable' },
  accept: { error: 'The request could not be read. Send JSON: {"token", "password", "language"}.', code: 'invite_unreadable' },
  forgot: { error: 'The request could not be read. Send JSON: {"email"}.', code: 'forgot_unreadable' },
  reset: { error: 'The request could not be read. Send JSON: {"token", "password"}.', code: 'reset_unreadable' },
};
/** The doors' answers a check can ask for, which only a platform set up for them gives (link_answers). */
const LINK_ANSWERS = {
  tooMany: [429, { error: 'Too many attempts from here. Try again later.', code: 'link_rate_limited' }],
  busy: [503, { error: 'Busy. Try again in a moment.', code: 'link_busy' }],
  notSetUp: [409, { error: 'This deployment has no admin origin configured, so owner sign-in is off.', code: 'sign_in_not_configured' }],
};
const INVITE_TOKEN = /^opi_[A-Za-z0-9_-]{43}$/;
const RESET_TOKEN = /^opr_[A-Za-z0-9_-]{43}$/;
const DAY = 24 * 60 * MINUTE;
const DOORS = { '/api/v1/auth/invite/status': 'status', '/api/v1/auth/invite/accept': 'accept', '/api/v1/auth/forgot': 'forgot', '/api/v1/auth/reset': 'reset' };
// The platform's SIGN_IN_REFUSAL_FLOOR_MS, which holds every answer of the four doors.
const DOOR_FLOOR_MS = 500;

/** The body, when it has exactly these keys, each a string; or null. As the platform reads a door's body. */
function exactly(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const has = Object.keys(body);
  return has.length === keys.length && keys.every((k) => has.includes(k) && typeof body[k] === 'string') ? body : null;
}
const DOOR_SHAPES = {
  status: (b) => (exactly(b, ['token']) && b.token.length <= 128 ? b : null),
  accept: (b) => (exactly(b, ['token', 'password', 'language']) && b.token.length <= 128 && LANGUAGES.includes(b.language) ? b : null),
  forgot: (b) => {
    if (!exactly(b, ['email'])) return null;
    const email = b.email.trim().toLowerCase();
    return email.length >= 3 && email.length <= 254 ? { email } : null;
  },
  reset: (b) => (exactly(b, ['token', 'password']) && b.token.length <= 128 ? b : null),
};
const passwordOk = (p) => [...p].length >= 12 && [...p].length <= 1024;
/** What a link is now, as the platform's src/invites.js says it. */
const linkStatus = (row, now = Date.now()) => (!row ? 'invalid' : row.used_at ? 'used' : row.replaced_at ? 'replaced' : row.expires_at <= now ? 'expired' : 'ready');

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
// U7c, as the platform's src/app.js answers POST /garages.
const ADD_GARAGE_REFUSED = { error: 'name, timezone and currency are required' };
// U7d-2: since platform 130d38d, its src/garageFields.js, each in its own sentence.
const GARAGE_NAME_MAX = 100;
const GARAGE_NAME_REFUSED = { error: `name must be text of 1 to ${GARAGE_NAME_MAX} characters`, code: 'garage_name_refused' };
const GARAGE_TIMEZONE_REFUSED = { error: 'timezone must be a time zone name this platform knows, such as "America/New_York"', code: 'garage_timezone_refused' };
const GARAGE_CURRENCY_REFUSED = { error: 'currency must be an ISO 4217 currency code in use today, such as "USD"', code: 'garage_currency_refused' };
const garageCurrencyInCapitals = (code) => ({ error: `currency is written in capital letters: "${code}"`, code: 'garage_currency_refused' });
const COMPUTER_NAME_REQUIRED = { error: 'name is required' };
const DRIVERS_REFUSED = (v) => ({ error: `transient_available is true or false, not ${JSON.stringify(v)}; unstated is the absence of the field, never a value` });
const lastOpen = (direction) => {
  const way = direction === 'entry' ? 'way in' : 'way out';
  return { error: `this is the last open ${way} of the garage: closing it leaves no ${way} open. Send override: true to close it anyway.`, code: 'last_open_lane', details: { direction } };
};
const CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const LINES_PAGE = 50;

// U4c: what a lane's screen can draw (the platform's src/screen-characters.json), and its sentences.
export const SCREEN_CHARACTERS = " !'+,-./0123456789:?ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÑÓÚÜ";
const MESSAGE_MAX = 160;
const BOARD_MAX = 20;
const FULL_IS_A_WAY_IN = { error: 'reason full is for a way in: it lets pass and monthly holders in. A way out is closed to everyone', code: 'lane_reason_refused' };
const BOARD_NOT_FOUND = { error: 'board message not found', code: 'board_message_not_found' };
const BOARD_LANES_REFUSED = { error: 'lanes is the list of lanes the message shows on: one or more lane ids of this garage, each once', code: 'board_lanes_refused' };
const BOARD_FULL = { error: `a garage has at most ${BOARD_MAX} board messages: remove one first`, code: 'board_messages_full', details: { max: BOARD_MAX } };
const timeRefused = (field) => ({ error: `${field} is a date and time in the garage's own time, as YYYY-MM-DDTHH:MM, or null for none`, code: 'board_time_refused' });
// An id's shape. The stand-in's own ids carry letters past f (la1..., bm...), so the shape is read, not the hex.
const UUID = /^[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}$/i;

/** Text for a lane's screen, as the platform's src/lanes.js takes it: the refusal's body, or null. */
function screenTextRefused(raw, field, code) {
  if (typeof raw !== 'string') return { error: `${field} must be text of 1 to ${MESSAGE_MAX} characters`, code };
  const text = raw.trim();
  if (text === '' || text.length > MESSAGE_MAX || CONTROL.test(text)) {
    return { error: `${field} must be text of 1 to ${MESSAGE_MAX} characters, with no control or invisible formatting characters`, code };
  }
  const drawable = new Set([...SCREEN_CHARACTERS]);
  const absent = [];
  for (const c of text) {
    const upper = [...c.toUpperCase()];
    if ((upper.length !== 1 || !drawable.has(upper[0])) && !absent.includes(c)) absent.push(c);
  }
  if (!absent.length) return null;
  const named = absent.map((c) => `"${c}" (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`).join(', ');
  return {
    error: `${field} has ${absent.length === 1 ? 'a character' : 'characters'} the lane's screen cannot show: ${named}. The screen shows letters A to Z, the digits, spaces, the Spanish accented letters, and . , - : ' ! ? / +`,
    code,
    details: { characters: absent },
  };
}

/** A time zone the platform knows (its database's pg_timezone_names): here, one this runtime can keep time in. */
function zoneKnown(raw) {
  if (typeof raw !== 'string' || raw.length > 64 || raw === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** A garage-time moment, YYYY-MM-DDTHH:MM, as the instant it is in `timeZone`. */
function instantIn(local, timeZone) {
  const [y, mo, d, h, mi] = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local).slice(1).map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (at) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - at;
  };
  let at = wall - offset(wall);
  at = wall - offset(at);
  return new Date(at).toISOString();
}

/** A real date and time, as the platform's src/board.js reads one. */
function localOk(raw) {
  const m = typeof raw === 'string' ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw) : null;
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate() && h <= 23 && mi <= 59;
}

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

// ── U6: the platform's sentences for taxes, the payment account and card readers ──
// src/stripe.js, src/stripeAccount.js, src/terminal.js and src/app.js (taxSetRefusal), word for word.
const NO_CONNECT = { error: 'This deployment has no Stripe Connect configured.', code: 'connect_not_configured' };
const GARAGE_NOT_FOUND_NAMED = { error: 'garage not found', code: 'garage_not_found' };
const BAD_COUNTRY = { error: 'country is required: the garage\'s country as two capital letters (ISO 3166-1 alpha-2), e.g. "US"', code: 'bad_country' };
const NO_ACCOUNT = { error: 'this garage has no Stripe account yet; create it first', code: 'no_stripe_account' };
const NO_PLACE = { error: 'this garage has no Location yet; create it first', code: 'no_terminal_location' };
const NO_READER = { error: 'this lane has no reader bound', code: 'no_reader_bound' };
const cardsNotActive = (state) => ({
  error: `this garage's Stripe account cannot take a card yet: Stripe reports card_payments '${state}'. Finish onboarding through the onboarding link, then ask again.`,
  code: 'card_payments_not_active',
});
const placeRefused = (error) => ({ error, code: 'bad_location' });
const readerRefused = (error) => ({ error, code: 'bad_reader' });
const STRIPE_AWAY = { error: 'Stripe could not be reached: fetch failed', code: 'stripe_unreachable' };
const CODE_REFUSED = { error: 'Stripe refused the request (400, resource_missing): registration code is not valid', code: 'stripe_refused' };
const ADDRESS_FIELDS = ['line1', 'line2', 'city', 'state', 'postal_code', 'country'];
const ENGINE_AWAY = { error: 'RATE_ENGINE_URL is not set; a tax set is judged by the engine before it is stored, and by nothing else; the tax set was not stored', code: 'rate_engine_unavailable' };
const INTEGER_MAX = 2_147_483_647;

/** A value as the rate engine's Python writes it in a sentence (`{value!r}`). */
const pyRepr = (v) => (v === null || v === undefined ? 'None' : typeof v === 'string' ? `'${v}'` : typeof v === 'boolean' ? (v ? 'True' : 'False') : Array.isArray(v) ? 'list' : String(v));
const pyType = (v) => (v === null || v === undefined ? 'NoneType' : Array.isArray(v) ? 'list' : typeof v === 'string' ? 'str' : typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'float') : typeof v === 'boolean' ? 'bool' : 'dict');

/**
 * A tax list, judged as the rate engine's load_tax_sets judges one (its
 * sentences), then as the platform's assertStorable: null when it would be
 * kept, else [status, body] as the platform answers. The instant is returned
 * as the engine reads it, in UTC to the microsecond.
 */
function judgeTaxList(raw) {
  const engine = (sentence) => [400, { error: `the rate engine refused the tax set: ${sentence}` }];
  // The platform hands the list to the engine as its request's tax_sets[0]: the engine's sentences name it so.
  const where = 'request.tax_sets[0]';
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { refused: engine(`${where} must be an object, got ${pyType(raw)}.`) };
  const keys = ['effective_from', 'rules'];
  const missing = keys.filter((k) => !(k in raw)).sort();
  if (missing.length) return { refused: engine(`${where} is missing required field(s): ${missing.join(', ')}. This module has no defaults; a field it cannot read is a pricing decision nobody made.`) };
  const unknown = Object.keys(raw).filter((k) => !keys.includes(k)).sort();
  if (unknown.length) return { refused: engine(`${where} carries key(s) this version does not understand: ${unknown.join(', ')}. They are REJECTED rather than ignored -- an ignored key is how a plan an operator believes is live prices something else. Upgrade the engine, or remove the key.`) };
  const at = raw.effective_from;
  if (typeof at !== 'string') return { refused: engine(`${where}.effective_from must be an ISO 8601 string, got ${pyType(at)}.`) };
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)(Z|[+-]\d{2}:\d{2})?$/.exec(at);
  if (!m) return { refused: engine(`${where}.effective_from is not ISO 8601: '${at}' (Invalid isoformat string: '${at}').`) };
  if (!m[2]) return { refused: engine(`${where}.effective_from has no UTC offset ('${at}'). A naive timestamp is refused: it would be read in whatever zone the server happens to run in, which is a different fee on a different machine.`) };
  if (!Array.isArray(raw.rules)) return { refused: engine(`${where}.rules must be a list. An EMPTY list is how a garage states that it charges no tax from this set's effective_from.`) };
  const ids = new Set();
  const places = new Map();
  for (const [i, r] of raw.rules.entries()) {
    const w = `${where}.rules[${i}]`;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return { refused: engine(`${w} must be an object, got ${pyType(r)}.`) };
    const ruleKeys = ['id', 'label', 'percent_bp', 'rounding', 'sequence'];
    const gone = ruleKeys.filter((k) => !(k in r)).sort();
    if (gone.length) return { refused: engine(`${w} is missing required field(s): ${gone.join(', ')}. This module has no defaults; a field it cannot read is a pricing decision nobody made.`) };
    const odd = Object.keys(r).filter((k) => !ruleKeys.includes(k)).sort();
    if (odd.length) return { refused: engine(`${w} carries key(s) this version does not understand: ${odd.join(', ')}. They are REJECTED rather than ignored -- an ignored key is how a plan an operator believes is live prices something else. Upgrade the engine, or remove the key.`) };
    if (typeof r.id !== 'string' || !r.id.trim()) return { refused: engine(`${w}.id must be a non-empty string.`) };
    if (typeof r.label !== 'string' || !r.label.trim()) return { refused: engine(`${w}.label must be a non-empty string. It is what a driver and an operator both read on the line.`) };
    if (!Number.isInteger(r.percent_bp) || r.percent_bp < 1) return { refused: engine(`${w}.percent_bp must be a positive whole number, got ${pyRepr(r.percent_bp)}.`) };
    if (!['up', 'down', 'nearest'].includes(r.rounding)) {
      return { refused: engine(`${w}.rounding is ${pyRepr(r.rounding)}; expected one of up, down, nearest. There is no default: a percentage lands on a fraction of a minor unit, and who keeps that fraction is the garage's to state.`) };
    }
    if (!Number.isInteger(r.sequence) || r.sequence < 0) return { refused: engine(`${w}.sequence must be a whole number, got ${pyRepr(r.sequence)}.`) };
    if (ids.has(r.id)) return { refused: engine(`${where}.rules contains two rules with id '${r.id}'.`) };
    ids.add(r.id);
    if (places.has(r.sequence)) {
      return { refused: engine(`${where}.rules: '${places.get(r.sequence)}' and '${r.id}' both state sequence ${r.sequence}. The order of a set's taxes is the garage's to state, and two rules in one place is an order nobody stated.`) };
    }
    places.set(r.sequence, r.id);
  }
  // The platform's own limit of where it keeps a set (src/taxes.js assertStorable).
  for (const [i, r] of raw.rules.entries()) {
    for (const key of ['percent_bp', 'sequence']) {
      if (r[key] > INTEGER_MAX) {
        const field = `tax_set.rules[${i}].${key}`;
        return {
          refused: [409, {
            error: `${field} is ${r[key]}, outside the column's integer range -2147483648 to 2147483647. The rate engine accepts this set; this is a limit of where this platform keeps it, not a judgement of the set, and nothing was stored`,
            code: 'tax_set_not_storable',
            details: { field, limit: 'integer_range' },
          }],
        };
      }
    }
  }
  const instant = new Date(at.replace(/(\.\d{3})\d*/, '$1')).toISOString();
  const micro = (m[1].match(/\.(\d{1,6})/)?.[1] ?? '').padEnd(6, '0');
  return { effectiveFrom: `${instant.slice(0, 19)}.${micro}Z`, rules: raw.rules };
}

/** What the platform's activation readout says of a garage's tax lists, at `now`. */
function taxFacts(sets, now = Date.now()) {
  if (!sets.length) return { stated: 0, in_force: 0, earliest: null, rules_in_force: null };
  const started = sets.filter((s) => Date.parse(s.effective_from) <= now).sort((a, b) => Date.parse(a.effective_from) - Date.parse(b.effective_from));
  const earliest = Math.min(...sets.map((s) => Date.parse(s.effective_from)));
  return { stated: sets.length, in_force: started.length, earliest: new Date(earliest).toISOString(), rules_in_force: started.length ? started.at(-1).rule_count : null };
}

export async function startStub({ port = 0 } = {}) {
  const data = owners();
  const setups = setupData();
  const money = moneyData();
  /** U6: what the stand-in holds of a garage's taxes, account, place and connections. */
  const moneyOf = (garageId) => (money[garageId] ??= { taxSets: [], account: null, place: null, connections: [] });
  let connectOn = true; // a platform with Stripe Connect set up (STRIPE_API_KEY and the two return addresses)
  let engineOn = true; // the rate engine answers
  let stripeOn = true; // Stripe answers
  let refuseNext = null; // the next U6 write is refused with this code, as the platform says it
  const log = new Map(); // tenant -> lines, oldest first
  const used = new Set(); // lanes with a stay or an event: never removable
  let quiet = 5; // the platform's LANE_QUIET_MINUTES, which its lanes and setup reads return
  let flipped = false; // a checklist whose `done` says the opposite of its facts, for the checks
  let refuseGarage = false; // U7c: the next garage added is refused, as the platform refuses one
  const garageBodies = []; // U7c: every body sent to POST /garages, as sent
  for (const o of Object.values(data)) {
    for (const lanes of Object.values(o.lanes)) for (const l of lanes) Object.assign(l, { closed: l.closed ?? null, reopened: l.reopened ?? null });
  }
  // U6: a lane's reader in the lanes read is its current connection, first in the garage's list of them.
  for (const o of Object.values(data)) {
    for (const [garageId, lanes] of Object.entries(o.lanes)) {
      const held = moneyOf(garageId);
      for (const l of lanes.filter((x) => x.reader)) {
        held.connections.unshift({ lane_id: l.id, reader_id: l.reader.reader_id, label: l.reader.label, location_id: held.place?.location_id ?? 'tml_stubHarbor', bound_at: l.reader.bound_at, unbound_at: null });
      }
    }
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

  // ── U7d-2: the four doors behind an emailed link ───────────────────────────
  const invites = new Map(); // token -> { tenant_id, email, language, company, expires_at, used_at, replaced_at }
  const resets = new Map(); // token -> { email, expires_at, used_at, replaced_at }
  const sent = []; // every email the stand-in "sent": { to, kind, token }
  const doorRequests = []; // every request to a door: { door, method, url, body }, as it arrived
  let failLink = null;
  let doorFloor = DOOR_FLOOR_MS;
  let tenantN = 0;
  const newLink = (prefix) => `${prefix}${randomBytes(32).toString('base64url')}`;
  const ownerByEmail = (email) => Object.values(data).find((o) => o.email === email) ?? null;

  /** An invite for `email` to become the one owner of a new account, as `invite-admin` makes one. Answers the link's token. */
  function invite(email, { language = 'en', company = 'Invited company' } = {}) {
    if (ownerByEmail(email)) throw new Error(`${email} already names an owner`);
    if ([...invites.values()].some((i) => i.email === email && linkStatus(i) === 'ready')) throw new Error(`${email} already has an invite waiting`);
    tenantN += 1;
    const token = newLink('opi_');
    invites.set(token, { tenant_id: `d7${String(tenantN).padStart(6, '0')}-0000-4000-8000-000000000000`, email, language, company, expires_at: Date.now() + 7 * DAY, used_at: null, replaced_at: null });
    sent.push({ to: email, kind: 'invite', token });
    return token;
  }
  /** The waiting invite of `email` replaced by a new one, as `invite-admin --resend` does. */
  function resendInvite(email) {
    const live = [...invites.entries()].find(([, i]) => i.email === email && linkStatus(i) === 'ready');
    if (!live) throw new Error(`no invite is waiting for ${email}`);
    live[1].replaced_at = Date.now();
    const token = newLink('opi_');
    invites.set(token, { ...live[1], expires_at: Date.now() + 7 * DAY, replaced_at: null });
    sent.push({ to: email, kind: 'invite', token });
    return token;
  }
  /** A new owner, on `tenant_id`, as accepting an invite or `create-admin` makes one. */
  function makeOwner({ email, password, tenant_id, language }) {
    const key = `owner-${Object.keys(data).length + 1}`;
    data[key] = { email, password, tenant_id, language, garages: [], lanes: {}, people: {}, open: {} };
    return data[key];
  }

  async function door(req, res, answerNow, which) {
    const arrived = Date.now();
    // Every answer held to the floor, as the platform holds it.
    const send = (...args) => setTimeout(() => answerNow(...args), Math.max(0, arrived + doorFloor - Date.now()));
    const raw = await new Promise((resolve) => {
      let text = '';
      req.on('data', (c) => (text += c));
      req.on('end', () => resolve(text));
    });
    doorRequests.push({ door: which, method: req.method, url: req.url, body: raw });
    if (failLink) {
      const [status, body] = LINK_ANSWERS[failLink];
      failLink = null;
      return send(res, status, body);
    }
    if (allowedOrigin === null) return send(res, ...LINK_ANSWERS.notSetUp);
    if (req.headers.origin !== undefined && req.headers.origin !== allowedOrigin) return send(res, 403, ORIGIN_REFUSED);
    if (!/^application\/json\b/.test(req.headers['content-type'] ?? '')) return send(res, 400, DOOR_UNREADABLE[which]);
    let body;
    try {
      body = DOOR_SHAPES[which](JSON.parse(raw));
    } catch {
      body = null;
    }
    if (!body) return send(res, 400, DOOR_UNREADABLE[which]);

    if (which === 'status' || which === 'accept') {
      const found = INVITE_TOKEN.test(body.token) ? invites.get(body.token) ?? null : null;
      const status = linkStatus(found);
      if (which === 'status') {
        return send(res, 200, { status, message: INVITE_SENTENCES[status], ...(status === 'ready' ? { email: found.email, language: found.language, expires_at: new Date(found.expires_at).toISOString() } : {}) });
      }
      if (status !== 'ready') return send(res, 409, { error: INVITE_SENTENCES[status], code: `invite_${status}` });
      if (!passwordOk(body.password)) return send(res, 400, PASSWORD_REFUSED);
      if (Object.values(data).some((o) => o.tenant_id === found.tenant_id)) return send(res, 409, INVITE_HAS_ADMIN);
      if (ownerByEmail(found.email)) return send(res, 409, INVITE_EMAIL_TAKEN);
      const who = makeOwner({ email: found.email, password: body.password, tenant_id: found.tenant_id, language: body.language });
      found.used_at = Date.now();
      const token = randomBytes(32).toString('base64url');
      issued.push(token);
      sessions.set(token, { owner: who, ended: false });
      // Signed in as sign-in signs in: the same answer, and the same cookie.
      const signedIn = { email: who.email, tenant_id: who.tenant_id, session_ends_at: new Date(Date.now() + 30 * MINUTE).toISOString(), language: who.language };
      return send(res, 200, signedIn, { 'Set-Cookie': `${COOKIE}=${token}; ${COOKIE_ATTRIBUTES}; Max-Age=${SESSION_SECONDS}; Secure` });
    }
    if (which === 'forgot') {
      const who = ownerByEmail(body.email);
      if (who) {
        for (const r of resets.values()) if (r.email === who.email && !r.used_at && !r.replaced_at) r.replaced_at = Date.now();
        const token = newLink('opr_');
        resets.set(token, { email: who.email, expires_at: Date.now() + 60 * MINUTE, used_at: null, replaced_at: null });
        sent.push({ to: who.email, kind: 'reset', token });
      }
      return send(res, 200, FORGOT_SENT);
    }
    // reset
    const found = RESET_TOKEN.test(body.token) ? resets.get(body.token) ?? null : null;
    const status = linkStatus(found);
    if (status !== 'ready') return send(res, 409, { error: RESET_SENTENCES[status], code: `reset_${status}` });
    if (!passwordOk(body.password)) return send(res, 400, PASSWORD_REFUSED);
    const who = ownerByEmail(found.email);
    who.password = body.password;
    for (const sn of sessions.values()) if (sn.owner === who) sn.ended = true;
    for (const key of [...wrongTries.keys()]) if (key.endsWith(`|${who.email}`)) wrongTries.delete(key);
    found.used_at = Date.now();
    return send(res, 200, { email: who.email, message: RESET_DONE });
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

  /**
   * U7c: a garage made on `who`'s account, as the platform makes one: not
   * open, nothing stated, no lanes, nobody to tell. Its whole row, as
   * POST /garages answers it.
   */
  let garageN = 0;
  function makeGarage(who, { name, timezone, currency, live = false }) {
    garageN += 1;
    const id = `c7${String(garageN).padStart(6, '0')}-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, '0')}`;
    who.garages.push({ id, name, timezone, currency, live });
    setups[id] = { transient_available: null, opened_at: live ? new Date().toISOString() : null, rates: { stored: 0, in_force: 0, earliest: null } };
    who.lanes[id] = [];
    (who.people ??= {})[id] = [];
    who.open[id] = [];
    return {
      id, tenant_id: who.tenant_id, name, timezone, currency, created_at: new Date().toISOString(), default_action: 'allow', space_class: 'standard',
      transient_available: null, activated_at: setups[id].opened_at, garage_pass_link: null, monthly_billing_link: null, validations_link: null,
    };
  }

  /** POST /garages: exactly as the platform takes it, a refusal written in the log; an id, a row and a line for a garage made. */
  async function addGarage(req, res, who) {
    const body = (await readBody(req)) ?? {};
    garageBodies.push(body);
    const at = { action: 'garage.create', subject: { kind: 'unknown', id: null, name: null } };
    if (refuseGarage || !body.name || !body.timezone || !body.currency) {
      refuseGarage = false;
      return refuse(res, who, 400, ADD_GARAGE_REFUSED, at);
    }
    // U7d-2: the platform's own checks, in its order: the name, the money, the time zone.
    if (typeof body.name !== 'string' || body.name.trim() === '' || [...body.name].length > GARAGE_NAME_MAX) return refuse(res, who, 400, GARAGE_NAME_REFUSED, at);
    if (!CURRENCY_CODES.includes(body.currency)) {
      const capitals = typeof body.currency === 'string' && CURRENCY_CODES.includes(body.currency.toUpperCase());
      return refuse(res, who, 400, capitals ? garageCurrencyInCapitals(body.currency.toUpperCase()) : GARAGE_CURRENCY_REFUSED, at);
    }
    if (!zoneKnown(body.timezone)) return refuse(res, who, 400, GARAGE_TIMEZONE_REFUSED, at);
    const garage = makeGarage(who, { name: body.name, timezone: body.timezone, currency: body.currency });
    line(who, {
      garageId: garage.id, action: 'garage.create', subject: { kind: 'garage', id: garage.id, name: garage.name }, before: null,
      after: { name: garage.name, timezone: garage.timezone, currency: garage.currency, default_action: garage.default_action, space_class: garage.space_class, transient_available: null },
    });
    return answer(res, 201, { garage });
  }

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
      { key: 'garage_details', done: Boolean(garage.name && garage.timezone && garage.currency), facts: { name: garage.name, timezone: garage.timezone, currency: garage.currency } },
      { key: 'drivers', done: extra.transient_available !== null, facts: { transient_available: extra.transient_available } },
      { key: 'lanes', done: entry.length > 0 && exit.length > 0, facts: { entry_lanes: entry.length, exit_lanes: exit.length, closed_lanes: lanes.filter((l) => l.closed).map(laneLine) } },
      { key: 'lane_computers', done: lanes.length > 0 && computers.every((c) => c.state === 'working'), facts: { quiet_minutes: quiet, lanes: lanes.length, working: computers.filter((c) => c.state === 'working').length, not_working: computers.filter((c) => c.state !== 'working') } },
      { key: 'rates', done: extra.rates.in_force > 0, facts: extra.rates },
    ];
    // U6: the taxes and the account as the stand-in holds them, read as the platform's activation readout reads them.
    const held = moneyOf(garage.id);
    const taxes = taxFacts(held.taxSets);
    steps.push({ key: 'taxes', done: taxes.in_force > 0, facts: taxes });
    if (extra.transient_available === true) {
      const a = held.account;
      steps.push({ key: 'getting_paid', done: Boolean(a?.account_id && a.charges_enabled === true && a.card_payments === 'active'), facts: { can_be_set_up_here: connectOn, account: Boolean(a?.account_id), charges_enabled: a?.charges_enabled ?? null, card_payments: a?.card_payments ?? null, details_submitted: a?.details_submitted ?? null, read_at: a?.charges_enabled_read_at ?? null } });
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
      return answer(res, 201, { lane: { id: lane.id, tenant_id: who.tenant_id, garage_id: garage.id, name: lane.name, direction: lane.direction, created_at: new Date().toISOString(), closed_reason: null, closed_message: null, closed_by: null, closed_at: null, reopened_by: null, reopened_at: null, board_prices: false } });
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
        // As the platform's src/lanes.js: the lane comes off every message, a message left on no lane goes with it, and the line names both.
        lanes.splice(lanes.indexOf(lane), 1);
        const board = boardOf(who, garageId);
        const on = board.messages.filter((msg) => msg.lanes.includes(lane.id));
        const off = on.filter((msg) => msg.lanes.length > 1);
        const gone = on.filter((msg) => msg.lanes.length === 1);
        for (const msg of off) msg.lanes = msg.lanes.filter((id) => id !== lane.id);
        board.messages = board.messages.filter((msg) => !gone.includes(msg));
        board.prices.delete(lane.id);
        const said = {
          ...(off.length ? { messages_off: off.map((msg) => msg.text) } : {}),
          ...(gone.length ? { messages_removed: gone.map((msg) => msg.text) } : {}),
        };
        line(who, { ...at, before: { name: lane.name, direction: lane.direction, ...said } });
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
      const cannot = screenTextRefused(body.message, 'message', 'lane_message_refused');
      if (cannot) return refuse(res, who, 400, cannot, at);
      if (body.override !== undefined && body.override !== true) return refuse(res, who, 400, { error: 'override, when sent, is true', code: 'lane_override_refused' }, at);
      if (body.reason === 'full' && lane.direction !== 'entry') return refuse(res, who, 400, FULL_IS_A_WAY_IN, at);
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
    const u4c = await boardRoutes(req, res, path, who);
    if (u4c !== undefined) return u4c;
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

  // ── U4c: the lanes' screens ───────────────────────────────────────────────
  const boards = new Map(); // tenant|garage -> { messages, prices }
  const boardOf = (who, garageId) => {
    const key = `${who.tenant_id}|${garageId}`;
    if (!boards.has(key)) boards.set(key, { messages: [], prices: new Set() });
    return boards.get(key);
  };
  let boardN = 0;
  const local = (instant, timeZone) => {
    if (instant === null) return null;
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  const presentMessage = (m, garage) => ({ id: m.id, text: m.text, lanes: [...m.lanes], starts: local(m.starts_at, garage.timezone), ends: local(m.ends_at, garage.timezone), starts_at: m.starts_at, ends_at: m.ends_at, created_at: m.created_at });
  const messageLine = (m, garage, lanes) => {
    const p = presentMessage(m, garage);
    return { text: p.text, lanes: lanes.filter((l) => m.lanes.includes(l.id)).map((l) => l.name), starts: p.starts, ends: p.ends };
  };

  async function boardRoutes(req, res, path, who) {
    let m = /^\/api\/v1\/garages\/([^/]+)\/board$/.exec(path);
    if (m && req.method === 'GET') {
      const garage = who.garages.find((g) => g.id === m[1]);
      if (!garage) return answer(res, 404, GARAGE_NOT_FOUND);
      const board = boardOf(who, garage.id);
      const lanes = who.lanes[garage.id] ?? [];
      return answer(res, 200, {
        timezone: garage.timezone,
        messages_max: BOARD_MAX,
        messages: board.messages.map((x) => presentMessage(x, garage)),
        lanes: lanes.map((l) => ({ id: l.id, name: l.name, direction: l.direction, prices: board.prices.has(l.id) })),
        screen: { characters: SCREEN_CHARACTERS, message_max: MESSAGE_MAX },
      });
    }
    m = /^\/api\/v1\/lanes\/([^/]+)\/board-prices$/.exec(path);
    if (m && req.method === 'PUT') {
      const found = laneOf(who, m[1]);
      const body = (await readBody(req)) ?? {};
      const action = 'lane.board_prices';
      if (!found) return refuse(res, who, 404, LANE_NOT_FOUND_NAMED, { action, subject: { kind: 'unknown', id: null, name: null }, missing: 'lane_not_found' });
      const { garageId, lane } = found;
      const at = { garageId, action, subject: subjectOfLane(lane) };
      const extra = Object.keys(body).filter((k) => k !== 'show');
      if (extra.length) return refuse(res, who, 400, { error: `unknown field ${JSON.stringify(extra[0])}; the body is {show}` }, at);
      if (typeof body.show !== 'boolean') return refuse(res, who, 400, { error: 'show is true (this lane shows the price) or false', code: 'board_prices_refused' }, at);
      const prices = boardOf(who, garageId).prices;
      const was = prices.has(lane.id);
      if (body.show) prices.add(lane.id);
      else prices.delete(lane.id);
      line(who, { ...at, before: { prices: was }, after: { prices: body.show } });
      return answer(res, 200, { lane: { id: lane.id, prices: body.show } });
    }
    m = /^\/api\/v1\/garages\/([^/]+)\/board-messages(?:\/([^/]+))?$/.exec(path);
    if (!m) return undefined;
    const method = req.method;
    if (m[2] ? !['PATCH', 'DELETE'].includes(method) : method !== 'POST') return undefined;
    const action = !m[2] ? 'board_message.add' : { PATCH: 'board_message.change', DELETE: 'board_message.remove' }[method];
    const garage = who.garages.find((g) => g.id === m[1]);
    const body = method === 'DELETE' ? {} : (await readBody(req)) ?? {};
    if (m[2] && !UUID.test(m[2])) return refuse(res, who, 404, BOARD_NOT_FOUND, { action, subject: { kind: 'unknown', id: null, name: null }, missing: 'board_message_not_found' });
    if (!garage) return refuse(res, who, 404, GARAGE_NOT_FOUND, { action, subject: { kind: 'unknown', id: null, name: null }, missing: 'garage_not_found' });
    const board = boardOf(who, garage.id);
    const lanes = who.lanes[garage.id] ?? [];
    const at = { garageId: garage.id, action, subject: { kind: 'garage', id: garage.id, name: garage.name } };
    const keys = ['text', 'lanes', 'starts', 'ends'];
    if (method !== 'DELETE') {
      const extra = Object.keys(body).filter((k) => !keys.includes(k));
      if (extra.length) return refuse(res, who, 400, { error: `unknown field ${JSON.stringify(extra[0])}; the body is {${keys.join(', ')}}` }, at);
    }
    const lanesOk = (raw) => Array.isArray(raw) && raw.length > 0 && raw.every((id) => typeof id === 'string' && UUID.test(id)) && new Set(raw).size === raw.length;
    const checkLanes = (ids) => {
      const unknown = ids.filter((id) => !lanes.some((l) => l.id === id));
      return unknown.length ? { error: 'lanes names a lane that is not one of this garage', code: 'board_lanes_refused', details: { lanes: unknown } } : null;
    };
    const timesRefused = (startsAt, endsAt) => {
      if (startsAt !== null && endsAt !== null && Date.parse(endsAt) <= Date.parse(startsAt)) return { error: 'ends is after starts', code: 'board_time_refused' };
      if (endsAt !== null && Date.parse(endsAt) <= Date.now()) return { error: 'ends has already passed: a message that ended would never be shown', code: 'board_time_refused' };
      return null;
    };
    if (method === 'POST') {
      const textNo = screenTextRefused(body.text, 'text', 'board_text_refused');
      if (textNo) return refuse(res, who, 400, textNo, at);
      if (!lanesOk(body.lanes)) return refuse(res, who, 400, BOARD_LANES_REFUSED, at);
      for (const f of ['starts', 'ends']) if ((body[f] ?? null) !== null && !localOk(body[f])) return refuse(res, who, 400, timeRefused(f), at);
      if (board.messages.length >= BOARD_MAX) return refuse(res, who, 409, BOARD_FULL, at);
      const lanesNo = checkLanes(body.lanes);
      if (lanesNo) return refuse(res, who, 400, lanesNo, at);
      const startsAt = (body.starts ?? null) === null ? null : instantIn(body.starts, garage.timezone);
      const endsAt = (body.ends ?? null) === null ? null : instantIn(body.ends, garage.timezone);
      const timeNo = timesRefused(startsAt, endsAt);
      if (timeNo) return refuse(res, who, 400, timeNo, at);
      boardN += 1;
      const message = {
        id: `bm${String(boardN).padStart(6, '0')}-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, '0')}`,
        text: body.text.trim(), lanes: lanes.filter((l) => body.lanes.includes(l.id)).map((l) => l.id), starts_at: startsAt, ends_at: endsAt, created_at: new Date().toISOString(),
      };
      board.messages.push(message);
      line(who, { garageId: garage.id, action, subject: { kind: 'board_message', id: message.id, name: message.text }, after: messageLine(message, garage, lanes) });
      return answer(res, 201, { message: presentMessage(message, garage) });
    }
    // The platform asks for something to change before it looks the message up.
    if (method === 'PATCH' && Object.keys(body).length === 0) return refuse(res, who, 400, { error: 'send at least one of text, lanes, starts, ends', code: 'board_message_refused' }, at);
    const message = board.messages.find((x) => x.id === m[2]);
    if (!message) return refuse(res, who, 404, BOARD_NOT_FOUND, { ...at, missing: 'board_message_not_found' });
    const mat = { garageId: garage.id, action, subject: { kind: 'board_message', id: message.id, name: message.text } };
    if (method === 'DELETE') {
      board.messages.splice(board.messages.indexOf(message), 1);
      line(who, { ...mat, before: messageLine(message, garage, lanes) });
      return answer(res, 204);
    }
    if (body.text !== undefined) {
      const textNo = screenTextRefused(body.text, 'text', 'board_text_refused');
      if (textNo) return refuse(res, who, 400, textNo, at);
    }
    if (body.lanes !== undefined && !lanesOk(body.lanes)) return refuse(res, who, 400, BOARD_LANES_REFUSED, at);
    for (const f of ['starts', 'ends']) if (body[f] !== undefined && body[f] !== null && !localOk(body[f])) return refuse(res, who, 400, timeRefused(f), at);
    if (body.lanes !== undefined) {
      const lanesNo = checkLanes(body.lanes);
      if (lanesNo) return refuse(res, who, 400, lanesNo, at);
    }
    const startsAt = body.starts === undefined ? message.starts_at : body.starts === null ? null : instantIn(body.starts, garage.timezone);
    const endsAt = body.ends === undefined ? message.ends_at : body.ends === null ? null : instantIn(body.ends, garage.timezone);
    if (body.starts !== undefined || body.ends !== undefined) {
      const timeNo = timesRefused(startsAt, endsAt);
      if (timeNo) return refuse(res, who, 400, timeNo, at);
    }
    const before = messageLine(message, garage, lanes);
    if (body.text !== undefined) message.text = body.text.trim();
    if (body.lanes !== undefined) message.lanes = lanes.filter((l) => body.lanes.includes(l.id)).map((l) => l.id);
    message.starts_at = startsAt;
    message.ends_at = endsAt;
    line(who, { ...mat, subject: { kind: 'board_message', id: message.id, name: message.text }, before, after: messageLine(message, garage, lanes) });
    return answer(res, 200, { message: presentMessage(message, garage) });
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

  // ── U6 ────────────────────────────────────────────────────────────────────
  // Taxes (src/taxes.js and the tax-sets routes), the payment account
  // (src/stripeAccount.js) and card readers (src/terminal.js), as the platform
  // answers them, in the order it checks: Stripe Connect set up, the garage
  // or lane, what was sent, then the account. A refusal that is a 4xx is a
  // line in the change log; a 5xx is not (the platform logs 4xx only).
  const MONEY = [
    ['GET', /^\/api\/v1\/garages\/([^/]+)\/tax-sets$/, 'taxLists'],
    ['POST', /^\/api\/v1\/garages\/([^/]+)\/tax-sets$/, 'addTaxList'],
    ['GET', /^\/api\/v1\/garages\/([^/]+)\/stripe-account$/, 'account'],
    ['POST', /^\/api\/v1\/garages\/([^/]+)\/stripe-account$/, 'makeAccount'],
    ['POST', /^\/api\/v1\/garages\/([^/]+)\/stripe-account\/onboarding-link$/, 'stripePage'],
    ['POST', /^\/api\/v1\/garages\/([^/]+)\/stripe-account\/refresh$/, 'checkAccount'],
    ['GET', /^\/api\/v1\/garages\/([^/]+)\/stripe-account\/location$/, 'place'],
    ['POST', /^\/api\/v1\/garages\/([^/]+)\/stripe-account\/location$/, 'setPlace'],
    ['GET', /^\/api\/v1\/garages\/([^/]+)\/readers$/, 'connections'],
    ['POST', /^\/api\/v1\/lanes\/([^/]+)\/reader$/, 'connect'],
    ['POST', /^\/api\/v1\/lanes\/([^/]+)\/reader\/unbind$/, 'disconnect'],
  ];
  const ACTION = {
    addTaxList: 'tax_set.add', makeAccount: 'payment_account.create', stripePage: 'payment_account.setup_link', checkAccount: 'payment_account.read',
    setPlace: 'payment_account.reader_place', connect: 'lane.card_reader_connect', disconnect: 'lane.card_reader_disconnect',
  };
  /** Every refusal these routes can give, by code, as the platform says it: for a check to ask for (refuseNext). */
  const MONEY_REFUSALS = {
    tax_set_invalid: [400, { error: 'the rate engine refused the tax set: request.tax_sets[0].rules[0].percent_bp must be a positive whole number, got 0.' }],
    tax_set_effective_from_taken: [409, { error: 'two tax sets would be in force from one instant: set ts100000-0000-4000-8000-000000000001, stated 2025-11-28T15:00:00.000Z, already takes effect at 2025-12-01T05:00:00.000000Z, and this set would take effect at 2025-12-01T05:00:00Z. Which one is in force would be decided by nothing; refused, both named', code: 'tax_set_effective_from_taken', details: { held: { id: 'ts100000-0000-4000-8000-000000000001', effective_from: '2025-12-01T05:00:00.000000Z', created_at: '2025-11-28T15:00:00.000Z' }, refused: { effective_from: '2025-12-01T05:00:00Z', rule_count: 1 } } }],
    tax_set_not_storable: [409, { error: 'tax_set.rules[0].percent_bp is 3000000000, outside the column\'s integer range -2147483648 to 2147483647. The rate engine accepts this set; this is a limit of where this platform keeps it, not a judgement of the set, and nothing was stored', code: 'tax_set_not_storable', details: { field: 'tax_set.rules[0].percent_bp', limit: 'integer_range' } }],
    rate_engine_unavailable: [503, ENGINE_AWAY],
    connect_not_configured: [409, NO_CONNECT],
    bad_country: [400, BAD_COUNTRY],
    stripe_refused: [502, CODE_REFUSED],
    stripe_unreachable: [503, STRIPE_AWAY],
    stripe_account_ambiguous: [409, { error: 'Stripe holds 2 accounts naming this garage (acct_stubOne, acct_stubTwo); one garage has one account, so none is attached and none is made. A person decides which is the garage\'s.', code: 'stripe_account_ambiguous' }],
    no_stripe_account: [409, NO_ACCOUNT],
    card_payments_not_active: [409, cardsNotActive('inactive')],
    bad_location: [400, placeRefused('address.line1 and address.country are required')],
    no_terminal_location: [409, NO_PLACE],
    bad_reader: [400, readerRefused('registration_code is required: the code the reader shows')],
    lane_has_reader: [409, { error: 'this lane already has reader tmr_stubNorthEntry bound; unbind it first', code: 'lane_has_reader' }],
    reader_bound_elsewhere: [409, { error: 'reader tmr_stubNorthEntry is bound to another lane; unbind it there first', code: 'reader_bound_elsewhere' }],
    no_reader_bound: [409, NO_READER],
    lane_not_found: [404, LANE_NOT_FOUND_NAMED],
    garage_not_found: [404, GARAGE_NOT_FOUND_NAMED],
  };
  const presentAccount = (a) => a && {
    garage_id: a.garage_id, account_id: a.account_id, create_requested_at: a.create_requested_at, account_recorded_at: a.account_recorded_at,
    card_payments: a.card_payments, card_payments_read_at: a.card_payments_read_at, charges_enabled: a.charges_enabled, charges_enabled_read_at: a.charges_enabled_read_at,
    details_submitted: a.details_submitted, details_submitted_read_at: a.details_submitted_read_at,
  };
  // What Stripe holds of each account, as its read reports it; the stand-in's own Stripe.
  const stripeSide = new Map(); // account_id -> { card_payments, charges_enabled, details_submitted }
  for (const held of Object.values(money)) {
    if (held.account) stripeSide.set(held.account.account_id, { card_payments: held.account.card_payments, charges_enabled: held.account.charges_enabled, details_submitted: held.account.details_submitted });
  }
  let made = 0;
  /** Ask the stand-in's Stripe now, and keep what it says with when it was read (refreshAccount). */
  const readStripe = (held) => {
    const side = stripeSide.get(held.account.account_id);
    const at = new Date().toISOString();
    const before = { card_payments: held.account.card_payments, charges_enabled: held.account.charges_enabled, details_submitted: held.account.details_submitted };
    Object.assign(held.account, { ...side, card_payments_read_at: at, charges_enabled_read_at: at, details_submitted_read_at: at });
    return { before, after: { ...side } };
  };

  async function moneyRoutes(req, res, path, who) {
    const route = MONEY.find(([method, re]) => method === req.method && re.test(path));
    if (!route) return undefined;
    const [, re, name] = route;
    const id = re.exec(path)[1];
    const body = req.method === 'POST' ? ((await readBody(req)) ?? {}) : null;
    const byLane = name === 'connect' || name === 'disconnect';
    const found = byLane ? laneOf(who, id) : null;
    const garage = byLane ? who.garages.find((g) => g.id === found?.garageId) : who.garages.find((g) => g.id === id);
    const at = { garageId: garage?.id ?? null, action: ACTION[name], subject: found ? subjectOfLane(found.lane) : garage ? { kind: 'garage', id: garage.id, name: garage.name } : { kind: 'unknown', id: null, name: null } };
    // A refusal: a line in the log for a 4xx write; a read, or a 5xx, answers only.
    const no = (status, refusal, missing) => (req.method === 'POST' && status < 500 ? refuse(res, who, status, refusal, { ...at, missing }) : answer(res, status, refusal));

    if (refuseNext && req.method === 'POST') {
      const [status, refusal] = MONEY_REFUSALS[refuseNext];
      refuseNext = null;
      return no(status, refusal, status === 404 ? (byLane ? 'lane_not_found' : 'garage_not_found') : undefined);
    }

    // ── Taxes: not a Stripe route. The list is judged before the garage is looked up.
    if (name === 'taxLists') {
      if (!garage) return answer(res, 404, GARAGE_NOT_FOUND);
      return answer(res, 200, { tax_sets: [...moneyOf(garage.id).taxSets].sort((a, b) => Date.parse(a.effective_from) - Date.parse(b.effective_from)) });
    }
    if (name === 'addTaxList') {
      if (!engineOn) return no(...MONEY_REFUSALS.rate_engine_unavailable);
      const judged = judgeTaxList(body?.tax_set ?? null);
      if (judged.refused) return no(...judged.refused);
      if (!garage) return no(404, GARAGE_NOT_FOUND, 'garage_not_found');
      const held = moneyOf(garage.id);
      const clash = held.taxSets.find((s) => Date.parse(s.effective_from) === Date.parse(judged.effectiveFrom) && s.effective_from.slice(19) === judged.effectiveFrom.slice(19));
      if (clash) {
        return no(409, {
          error: `two tax sets would be in force from one instant: set ${clash.id}, stated ${clash.created_at}, already takes effect at ${clash.effective_from}, and this set would take effect at ${body.tax_set.effective_from}. Which one is in force would be decided by nothing; refused, both named`,
          code: 'tax_set_effective_from_taken',
          details: { held: { id: clash.id, effective_from: clash.effective_from, created_at: clash.created_at }, refused: { effective_from: body.tax_set.effective_from, rule_count: judged.rules.length } },
        });
      }
      made += 1;
      const rules = [...judged.rules].sort((a, b) => a.sequence - b.sequence).map(({ id: ruleId, label, percent_bp, rounding, sequence }) => ({ id: ruleId, label, percent_bp, rounding, sequence }));
      const stored = { id: `ts9${String(made).padStart(5, '0')}-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, '0')}`, garage_id: garage.id, effective_from: judged.effectiveFrom, rule_count: rules.length, created_at: new Date().toISOString(), rules };
      held.taxSets.push(stored);
      line(who, { garageId: garage.id, action: 'tax_set.add', subject: { kind: 'tax_set', id: stored.id, name: null }, before: null, after: { effective_from: stored.effective_from, taxes: rules.map((r) => ({ label: r.label, percent_bp: r.percent_bp })) } });
      return answer(res, 201, { tax_set: stored });
    }

    // ── Stripe Connect: every route first says whether it is set up here.
    if (!connectOn) return no(409, NO_CONNECT);
    // Connecting a reader reads what was sent before it looks for the lane (bindReader).
    if (name === 'connect') {
      if (typeof body.registration_code !== 'string' || !body.registration_code.trim()) return no(400, readerRefused('registration_code is required: the code the reader shows'));
      if (typeof body.label !== 'string' || !body.label.trim()) return no(400, readerRefused('label is required'));
    }
    if (!garage) return no(404, byLane ? LANE_NOT_FOUND_NAMED : GARAGE_NOT_FOUND_NAMED, byLane ? 'lane_not_found' : 'garage_not_found');
    const held = moneyOf(garage.id);
    if (name === 'account') return answer(res, 200, { stripe_account: presentAccount(held.account) });
    if (name === 'makeAccount') {
      if (held.account) return answer(res, 200, { stripe_account: presentAccount(held.account) });
      if (typeof body.country !== 'string' || !/^[A-Z]{2}$/.test(body.country)) return no(400, BAD_COUNTRY);
      if (!stripeOn) return no(...MONEY_REFUSALS.stripe_unreachable);
      made += 1;
      const now = new Date().toISOString();
      held.account = {
        garage_id: garage.id, account_id: `acct_stub${made}`, create_requested_at: now, account_recorded_at: now,
        card_payments: null, card_payments_read_at: null, charges_enabled: null, charges_enabled_read_at: null, details_submitted: null, details_submitted_read_at: null,
      };
      stripeSide.set(held.account.account_id, { card_payments: 'inactive', charges_enabled: false, details_submitted: false });
      line(who, { garageId: garage.id, action: 'payment_account.create', subject: { kind: 'payment_account', id: null, name: null }, before: { account: false }, after: { account: true } });
      return answer(res, 201, { stripe_account: presentAccount(held.account) });
    }
    if (name === 'stripePage' || name === 'checkAccount') {
      if (!held.account) return no(409, NO_ACCOUNT);
      if (!stripeOn) return no(...MONEY_REFUSALS.stripe_unreachable);
      if (name === 'stripePage') {
        // Stripe's own page. Here: a page of the admin site's own, so a check's browser never leaves it.
        return answer(res, 201, { onboarding_link: { url: `${allowedOrigin ?? 'http://127.0.0.1'}/#/stripe-stand-in`, expires_at: new Date(Date.now() + 5 * MINUTE).toISOString() } });
      }
      const { before, after } = readStripe(held);
      line(who, { garageId: garage.id, action: 'payment_account.read', subject: { kind: 'payment_account', id: null, name: null }, before, after });
      return answer(res, 200, { stripe_account: presentAccount(held.account) });
    }
    // A Location, a reader: refused while the account cannot take a card, as Stripe says now.
    const takesCardsNow = () => {
      if (!held.account) return [409, NO_ACCOUNT];
      if (!stripeOn) return MONEY_REFUSALS.stripe_unreachable;
      readStripe(held);
      return held.account.card_payments === 'active' ? null : [409, cardsNotActive(held.account.card_payments)];
    };
    if (name === 'place') return answer(res, 200, { location: held.place });
    if (name === 'connections') return answer(res, 200, { readers: [...held.connections].sort((a, b) => (a.unbound_at === null) - (b.unbound_at === null) || Date.parse(a.bound_at) - Date.parse(b.bound_at)).reverse() });
    if (name === 'setPlace') {
      if (held.place) return answer(res, 200, { location: held.place });
      if (typeof body.display_name !== 'string' || !body.display_name.trim()) return no(400, placeRefused('display_name is required'));
      const address = body.address;
      if (!address || typeof address !== 'object' || Array.isArray(address)) return no(400, placeRefused('address is required: {line1, city, postal_code, country, ...}'));
      for (const [k, v] of Object.entries(address)) {
        if (!ADDRESS_FIELDS.includes(k)) return no(400, placeRefused(`unknown address field ${JSON.stringify(k)}`));
        if (typeof v !== 'string') return no(400, placeRefused(`address.${k} is a string`));
      }
      if (!address.line1 || !address.country) return no(400, placeRefused('address.line1 and address.country are required'));
      const cannot = takesCardsNow();
      if (cannot) return no(...cannot);
      held.place = { garage_id: garage.id, location_id: `tml_stub${(made += 1)}`, display_name: body.display_name.trim(), created_at: new Date().toISOString() };
      line(who, { garageId: garage.id, action: 'payment_account.reader_place', subject: { kind: 'payment_account', id: null, name: null }, before: null, after: { place_name: held.place.display_name } });
      return answer(res, 201, { location: held.place });
    }
    const { lane } = found;
    const current = held.connections.find((c) => c.lane_id === lane.id && c.unbound_at === null);
    if (name === 'connect') {
      const code = body.registration_code;
      const label = body.label.trim();
      if (current) return no(409, { error: `this lane already has reader ${current.reader_id} bound; unbind it first`, code: 'lane_has_reader' });
      if (!held.place) return no(409, NO_PLACE);
      const cannot = takesCardsNow();
      if (cannot) return no(...cannot);
      // The stand-in's Stripe takes the codes its test readers show, as Stripe's simulated reader's does.
      if (!code.trim().startsWith('simulated')) return no(...MONEY_REFUSALS.stripe_refused);
      const connection = { lane_id: lane.id, reader_id: `tmr_stub${(made += 1)}`, label, location_id: held.place.location_id, bound_at: new Date().toISOString(), unbound_at: null };
      held.connections.push(connection);
      lane.reader = { reader_id: connection.reader_id, label, bound_at: connection.bound_at };
      line(who, { garageId: garage.id, action: 'lane.card_reader_connect', subject: { kind: 'reader', id: connection.reader_id, name: label }, before: null, after: { lane: lane.name, label } });
      return answer(res, 201, { reader: connection });
    }
    if (!current) return no(409, NO_READER);
    current.unbound_at = new Date().toISOString();
    lane.reader = null;
    line(who, { garageId: garage.id, action: 'lane.card_reader_disconnect', subject: { kind: 'reader', id: current.reader_id, name: current.label }, before: { label: current.label }, after: null });
    return answer(res, 200, { reader: current });
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
    // U7d-2: the four doors read no cookie, and no query.
    if (DOORS[path] && req.method === 'POST') return door(req, res, send, DOORS[path]);

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
    if (path === '/api/v1/garages' && req.method === 'POST') return addGarage(req, res, who);

    const u6 = await moneyRoutes(req, res, path, who);
    if (u6 !== undefined) return u6;
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
      return send(res, 200, { lanes: who.lanes[garage.id] ?? [], quiet_minutes: quiet, screen: { characters: SCREEN_CHARACTERS, message_max: MESSAGE_MAX } });
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
    // ── U7d-2 ──
    /** An invite for `email` to own a new account, as `invite-admin` makes one: `{ language, company }`. Answers the link's token. */
    invite: (email, options) => invite(email, options),
    /** The waiting invite of `email` replaced by a new one (`invite-admin --resend`). Answers the new token. */
    resendInvite: (email) => resendInvite(email),
    /** The link `token` (an invite or a reset) past its end. */
    expireLink: (token) => {
      const row = invites.get(token) ?? resets.get(token);
      if (!row) throw new Error('no such link at the stand-in');
      row.expires_at = Date.now() - MINUTE;
    },
    /** An owner made on the account `token`'s invite is for, with another email, as `create-admin` makes one. */
    adminOnTenantOf: (token, email) => makeOwner({ email, password: 'made-at-the-database-1', tenant_id: invites.get(token).tenant_id, language: 'en' }),
    /** An owner of another account with `email`, as `create-admin` makes one. */
    adminElsewhere: (email) => {
      tenantN += 1;
      return makeOwner({ email, password: 'made-at-the-database-1', tenant_id: `e7${String(tenantN).padStart(6, '0')}-0000-4000-8000-000000000000`, language: 'en' });
    },
    /** Every email the stand-in sent, oldest first: `{ to, kind: 'invite' | 'reset', token }`. */
    sent: () => sent.slice(),
    /** Every request that reached one of the four doors, as it arrived: `{ door, method, url, body }`. */
    doorRequests: () => doorRequests.slice(),
    /** How long the doors hold every answer, in ms (the platform's floor, 500, unless set). */
    setDoorFloor: (ms) => {
      doorFloor = ms;
    },
    /** The next door answers as a platform set up to give it would: tooMany, busy or notSetUp. */
    failLink: (kind) => {
      if (!LINK_ANSWERS[kind]) throw new Error(`no such door answer: ${kind}`);
      failLink = kind;
    },
    // ── U7c ──
    /** A garage on `owner`'s account, made as the platform makes one: `{ name, timezone, currency, live }`. */
    addGarage: (owner, garage) => makeGarage(owner, garage),
    /** The next garage added is refused (400), as the platform refuses one. */
    refuseNextGarage: () => {
      refuseGarage = true;
    },
    /** Every body sent to POST /garages, as sent, oldest first. */
    garageBodies: () => structuredClone(garageBodies),
    /** Every step of every checklist answered with `done` reversed (true), or as worked out (false). */
    flipSetup: (on) => {
      flipped = Boolean(on);
    },
    // ── U6 ──
    /** What the stand-in holds of a garage's taxes, account, readers' place and reader connections. */
    money: (garageId) => moneyOf(garageId),
    /** Stripe Connect set up on this platform, as a deployment's STRIPE_API_KEY and return addresses do. */
    setConnect: (on) => {
      connectOn = Boolean(on);
    },
    /** The rate engine answering, or not (RATE_ENGINE_URL unset). */
    setEngine: (on) => {
      engineOn = Boolean(on);
    },
    /** Stripe answering, or not. */
    setStripe: (on) => {
      stripeOn = Boolean(on);
    },
    /** Stripe's side of a garage's account moves (onboarding done, card payments turned on), as Stripe's would. */
    setCards: (garageId, side) => {
      const account = moneyOf(garageId).account;
      if (!account) throw new Error(`garage ${garageId} has no account at the stand-in`);
      stripeSide.set(account.account_id, { ...stripeSide.get(account.account_id), ...side });
    },
    /** The next write to a U6 route answers with this refusal, as the platform says it (MONEY_REFUSALS). */
    refuseNext: (code) => {
      if (!MONEY_REFUSALS[code]) throw new Error(`no such refusal: ${code}`);
      refuseNext = code;
    },
    /** Every refusal the U6 routes give, by code, with the platform's own words. */
    moneyRefusals: () => structuredClone(MONEY_REFUSALS),
    /** Whether the garage takes drivers without a pass: true, false or null (unanswered). */
    setDrivers: (garageId, takes) => {
      setups[garageId].transient_available = takes;
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
