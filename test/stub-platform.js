// A small stand-in for the platform, for the checks only. Never part of the
// built site.
//
// It answers the routes these screens use, in the shapes the platform's
// contract gives them:
//   POST /api/v1/auth/sign-in    { email, password } -> sets the session cookie
//   POST /api/v1/auth/sign-out   ends the session
//   GET  /api/v1/auth/me         { email, tenant_id, session_ends_at }
//   GET  /api/v1/garages         { garages: [{ id, name, timezone, currency, live }] }
//   GET  /api/v1/garages/:id/lanes          { lanes: [{ id, name, direction, devices, reader }] }
//   GET  /api/v1/garages/:id/sessions/open  { inside_count, unconfirmable_count, open_count, sessions }
// A refusal is 401 with code `sign_in_refused`; an ended session is 401 with
// code `session_ended`; a garage of another owner is 404. The cookie is
// HttpOnly, Secure, SameSite=Strict, Path=/api, with no Domain, and a POST
// carried by the cookie must come with the admin page's own Origin.
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
      garages: [
        { id: 'a1000000-0000-4000-8000-000000000001', name: 'Harbor Street Garage', timezone: 'America/New_York', currency: 'usd', live: true },
        { id: 'a2000000-0000-4000-8000-000000000002', name: 'Riverside Deck', timezone: 'America/Chicago', currency: 'usd', live: false },
      ],
      lanes: {
        'a1000000-0000-4000-8000-000000000001': [
          {
            id: 'la100000-0000-4000-8000-000000000001',
            name: 'North Entry',
            direction: 'entry',
            reader: { id: 'rd100000-0000-4000-8000-000000000001' },
            devices: [{ id: 'dv100000-0000-4000-8000-000000000001', name: 'Harbor entry computer', created_at: ago(90 * 24 * 60 * MINUTE), last_seen_at: ago(MINUTE + 5000), revoked_at: null }],
          },
          {
            id: 'la100000-0000-4000-8000-000000000002',
            name: 'North Exit',
            direction: 'exit',
            reader: null,
            devices: [
              // 3:40 pm in New York on 10 March 2026; 4:40 am on the 11th in Tokyo.
              { id: 'dv100000-0000-4000-8000-000000000002', name: 'Harbor exit computer', created_at: '2026-01-05T14:00:00Z', last_seen_at: '2026-03-10T19:40:00Z', revoked_at: null },
              { id: 'dv100000-0000-4000-8000-000000000003', name: 'Harbor old exit computer', created_at: '2025-11-01T14:00:00Z', last_seen_at: '2026-01-04T22:10:00Z', revoked_at: '2026-01-05T13:55:00Z' },
            ],
          },
          { id: 'la100000-0000-4000-8000-000000000003', name: 'Service Lane', direction: 'entry', reader: null, devices: [] },
        ],
        'a2000000-0000-4000-8000-000000000002': [],
      },
      open: {
        'a1000000-0000-4000-8000-000000000001': [
          // 11:05 am in New York on 10 March 2026; 1:05 am on the 11th in Tokyo.
          { id: 'ss100000-0000-4000-8000-000000000001', entry_at: '2026-03-10T15:05:00Z', currency: 'usd', entry_confirmation: 'confirmed', plate: 'HRB4410', plate_region: 'FL', ticket_ref: null, entry_lane: 'North Entry' },
          { id: 'ss100000-0000-4000-8000-000000000002', entry_at: '2026-03-10T17:20:00Z', currency: 'usd', entry_confirmation: 'confirmed', plate: null, plate_region: null, ticket_ref: 'HT-0042', entry_lane: 'North Entry' },
          { id: 'ss100000-0000-4000-8000-000000000003', entry_at: '2026-03-10T18:45:00Z', currency: 'usd', entry_confirmation: 'unconfirmable', plate: 'HRB7731', plate_region: 'FL', ticket_ref: null, entry_lane: 'Service Lane' },
        ],
        'a2000000-0000-4000-8000-000000000002': [],
      },
    },
    b: {
      email: 'owner-b@example.com',
      password: 'elm-court-test-password',
      tenant_id: 'bbbbbbbb-0000-4000-8000-000000000002',
      garages: [{ id: 'b1000000-0000-4000-8000-000000000001', name: 'Elm Court Garage', timezone: 'America/Los_Angeles', currency: 'usd', live: true }],
      lanes: {
        'b1000000-0000-4000-8000-000000000001': [
          { id: 'lb100000-0000-4000-8000-000000000001', name: 'Elm Gate', direction: 'entry', reader: null, devices: [{ id: 'dvb00000-0000-4000-8000-000000000001', name: 'Elm gate computer', created_at: ago(30 * 24 * 60 * MINUTE), last_seen_at: ago(20 * 1000), revoked_at: null }] },
        ],
      },
      open: { 'b1000000-0000-4000-8000-000000000001': [] },
    },
  };
}

/** Every piece of text of owner A's that a screen could show. */
export const A_TEXT = ['Harbor Street Garage', 'Riverside Deck', 'North Entry', 'North Exit', 'Service Lane', 'Harbor entry computer', 'HRB4410', 'HT-0042', 'owner-a@example.com'];

const COOKIE = 'opa_session';

export async function startStub({ port = 0 } = {}) {
  const data = owners();
  const sessions = new Map(); // token -> { owner, ended }
  const issued = [];
  let failNext = null;
  let allowedOrigin = null;
  const wrongTries = new Map();

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const refused = (res) => send(res, 401, { error: 'sign in refused', code: 'sign_in_refused' });

  const cookieOf = (req) => {
    const m = /(?:^|;\s*)opa_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie ?? '');
    return m ? m[1] : null;
  };

  const readBody = (req) =>
    new Promise((resolve) => {
      let text = '';
      req.on('data', (c) => (text += c));
      req.on('end', () => {
        try {
          resolve(JSON.parse(text));
        } catch {
          resolve(null);
        }
      });
    });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://stub');
    const path = url.pathname;

    // A failure asked for by a check, on the next read that is not sign-in.
    if (failNext && !path.startsWith('/api/v1/auth/sign-in')) {
      const kind = failNext;
      failNext = null;
      if (kind === 'nonJson') {
        res.writeHead(502, { 'Content-Type': 'text/html' });
        return res.end('<html><body>502 Bad Gateway</body></html>');
      }
      if (kind === 'unknownCode') return send(res, 409, { error: 'garage_frozen_for_audit', code: 'garage_frozen_for_audit' });
      if (kind === 'serverError') return send(res, 500, { error: 'internal error' });
      if (kind === 'ended') return send(res, 401, { error: 'session ended', code: 'session_ended' });
      if (kind === 'plain401') return send(res, 401, { error: 'unknown or revoked operator token' });
    }

    if (path === '/api/v1/auth/sign-in' && req.method === 'POST') {
      const body = await readBody(req);
      const who = Object.values(data).find((o) => o.email === String(body?.email ?? '').toLowerCase());
      const key = req.socket.remoteAddress + '|' + (who?.email ?? '');
      const tries = wrongTries.get(key) ?? 0;
      if (!who || tries >= 10 || body?.password !== who.password) {
        if (who) wrongTries.set(key, tries + 1);
        return refused(res);
      }
      wrongTries.delete(key);
      const token = randomBytes(32).toString('base64url');
      issued.push(token);
      sessions.set(token, { owner: who, ended: false });
      return send(res, 200, { email: who.email, tenant_id: who.tenant_id, session_ends_at: new Date(Date.now() + 30 * MINUTE).toISOString() }, {
        'Set-Cookie': `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api`,
      });
    }

    const token = cookieOf(req);
    const session = token ? sessions.get(token) : null;
    if (!session) return send(res, 401, { error: 'not signed in' });
    if (session.ended) return send(res, 401, { error: 'session ended', code: 'session_ended' });
    const who = session.owner;

    if (req.method !== 'GET') {
      if (!allowedOrigin || req.headers.origin !== allowedOrigin) return send(res, 403, { error: 'cross-site request refused', code: 'origin_refused' });
    }

    if (path === '/api/v1/auth/sign-out' && req.method === 'POST') {
      sessions.delete(token);
      return send(res, 200, { signed_out: true }, { 'Set-Cookie': `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0` });
    }
    if (path === '/api/v1/auth/me' && req.method === 'GET') {
      return send(res, 200, { email: who.email, tenant_id: who.tenant_id, session_ends_at: new Date(Date.now() + 30 * MINUTE).toISOString() });
    }
    if (path === '/api/v1/garages' && req.method === 'GET') return send(res, 200, { garages: who.garages });

    const m = /^\/api\/v1\/garages\/([^/]+)(\/lanes|\/sessions\/open)?$/.exec(path);
    if (m && req.method === 'GET') {
      const garage = who.garages.find((g) => g.id === m[1]);
      if (!garage) return send(res, 404, { error: 'garage not found' });
      if (!m[2]) return send(res, 200, { garage });
      if (m[2] === '/lanes') return send(res, 200, { lanes: who.lanes[garage.id] ?? [] });
      const stays = who.open[garage.id] ?? [];
      const confirmed = stays.filter((s) => s.entry_confirmation === 'confirmed').length;
      return send(res, 200, { inside_count: confirmed, unconfirmable_count: stays.length - confirmed, open_count: stays.length, sessions: stays });
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
    endSessions: () => {
      for (const s of sessions.values()) s.ended = true;
    },
    allowOrigin: (origin) => {
      allowedOrigin = origin;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
