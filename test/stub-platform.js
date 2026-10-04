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
//   GET  /api/v1/garages/:id/lanes          { lanes: [{ id, name, direction, devices, reader }] }
//   GET  /api/v1/garages/:id/sessions/open  { inside_count, unconfirmable_count, open_count, sessions }
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
      open: { 'b1000000-0000-4000-8000-000000000001': [] },
    },
  };
}

/** Every piece of text of owner A's that a screen could show. */
export const A_TEXT = ['Harbor Street Garage', 'Riverside Deck', 'North Entry', 'North Exit', 'Service Lane', 'Harbor entry computer', 'HRB4410', 'HT-0042', 'owner-a@example.com'];

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

export async function startStub({ port = 0 } = {}) {
  const data = owners();
  const sessions = new Map(); // token -> { owner, ended }
  const issued = [];
  let failNext = null;
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

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://stub');
    const path = url.pathname;

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
      who.language = language;
      return send(res, 200, { language });
    }
    if (path === '/api/v1/garages' && req.method === 'GET') return send(res, 200, { garages: who.garages });

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
      return send(res, 200, { lanes: who.lanes[garage.id] ?? [] });
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
    /** The next sign-in answers as a platform set up to give it would: tooMany, busy, notSetUp or wrongPlace. */
    failSignIn: (kind) => {
      if (!SIGN_IN_ANSWERS[kind]) throw new Error(`no such sign-in answer: ${kind}`);
      failSignIn = kind;
    },
    endSessions: () => {
      for (const s of sessions.values()) s.ended = true;
    },
    allowOrigin: (origin) => {
      allowedOrigin = origin;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
