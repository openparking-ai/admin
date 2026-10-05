// What the platform answers, as these screens meet it, for the check that the
// stand-in in test/stub-platform.js answers the same way.
//
// `record` makes the calls the screens make, plus the refusals they can meet,
// against a running platform, and writes down each answer's status, the exact
// body of every refusal, the SHAPE of every other body (its keys and the kinds
// of value under each), and the cookie's attributes. Nothing it writes holds a
// value of a successful answer, a cookie or an id.
//
// test/platform-shapes.json is this, recorded from the real platform (its
// header says which commit); test/stub-matches-platform.test.js records the
// stand-in the same way and requires the two to be equal.

/** The kinds of value under each key, merged across every item of a list. */
export function shapeOf(value) {
  if (value === null) return { types: ['null'] };
  if (Array.isArray(value)) {
    const shape = { types: ['array'] };
    for (const item of value) shape.items = merge(shape.items, shapeOf(item));
    return shape;
  }
  if (typeof value === 'object') {
    const keys = {};
    for (const k of Object.keys(value).sort()) keys[k] = shapeOf(value[k]);
    return { types: ['object'], keys };
  }
  return { types: [typeof value] };
}

function merge(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = { types: [...new Set([...a.types, ...b.types])].sort() };
  if (a.keys && b.keys) {
    out.keys = {};
    for (const k of [...new Set([...Object.keys(a.keys), ...Object.keys(b.keys)])].sort()) {
      // A key one object has and another lacks is a difference in shape, written as "absent".
      out.keys[k] = merge(a.keys[k] ?? { types: ['absent'] }, b.keys[k] ?? { types: ['absent'] });
    }
  } else if (a.keys || b.keys) {
    // One side is an object and the other is not (null): the object's keys stand.
    out.keys = a.keys ?? b.keys;
  }
  if (a.items || b.items) out.items = merge(a.items, b.items);
  return out;
}

/** The cookie's name and attributes, without its value or how long it lasts. */
function cookieOf(header) {
  if (!header) return undefined;
  const [pair, ...attributes] = header.split(';').map((s) => s.trim());
  return {
    name: pair.slice(0, pair.indexOf('=')),
    cleared: pair.endsWith('='),
    attributes: attributes
      .filter((a) => a !== 'Secure') // Secure is off on plain-http development; the stand-in keeps it.
      .map((a) => (a.startsWith('Max-Age=') ? (a === 'Max-Age=0' ? a : 'Max-Age') : a))
      .sort(),
  };
}

const NOT_THEIRS = '00000000-0000-4000-8000-000000000009';

/**
 * The setup read and the change log, written down by their structure: each
 * step's key in order and the names of its facts; a line's fields. Their
 * values -- how many lanes, which steps are done, who changed what -- are the
 * data's, not the contract's, and differ between the platform's demo and the
 * stand-in's garages.
 */
const STRUCTURE = {
  setup: (data) => ({
    keys: Object.keys(data).sort(),
    setup_keys: Object.keys(data.setup).sort(),
    steps: data.setup.steps.map((s) => ({ key: s.key, fields: Object.keys(s).sort(), facts: Object.keys(s.facts).sort() })),
  }),
  changes: (data) => {
    const [line] = data.changes;
    return {
      keys: Object.keys(data).sort(),
      newest: { keys: Object.keys(line).sort(), who: Object.keys(line.who).sort(), subject: Object.keys(line.subject).sort(), action: line.action, outcome: line.outcome, before: line.before, after: line.after },
    };
  },
  refused: (data) => {
    const [line] = data.refused;
    return {
      keys: Object.keys(data).sort(),
      count: Object.keys(data.count).sort(),
      newest: { keys: Object.keys(line).sort(), who: Object.keys(line.who).sort(), subject: Object.keys(line.subject).sort(), action: line.action, outcome: line.outcome, refusal: line.refusal, before: line.before, after: line.after },
    };
  },
};

/**
 * Every answer, in order. `owner` is { email, password }; the first garage of
 * the owner must have lanes and stays inside. `origin` is the admin page's own.
 */
export async function record(base, { origin, owner, elsewhere = 'http://elsewhere.example' }) {
  let cookie = '';
  const out = [];
  let garage = null;
  async function call(what, method, path, body, headers = {}, { quiet = false, structure = null } = {}) {
    const res = await fetch(`${base}/api/v1${path.replace('{garage}', garage)}`, {
      method,
      headers: Object.fromEntries(
        Object.entries({ origin, ...(cookie && { cookie }), ...(body !== undefined && { 'content-type': 'application/json' }), ...headers }).filter(([, v]) => v !== undefined),
      ),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0].endsWith('=') ? '' : setCookie.split(';')[0];
    const text = await res.text();
    const data = text === '' ? null : JSON.parse(text);
    const refusal = res.status >= 400;
    if (quiet) {
      if (refusal) throw new Error(`${what}: ${res.status} ${text}`);
      return data;
    }
    if (structure && !refusal) {
      out.push({ what, status: res.status, structure: STRUCTURE[structure](data) });
      return data;
    }
    out.push({
      what,
      status: res.status,
      ...(refusal ? { body: data } : { shape: data === null ? 'empty' : shapeOf(data) }),
      ...(setCookie ? { cookie: cookieOf(setCookie) } : {}),
    });
    return data;
  }
  await call('who is signed in, before signing in', 'GET', '/auth/me');
  await call('a read, before signing in', 'GET', '/garages');
  await call('language, before signing in', 'PUT', '/auth/language', { language: 'es' });
  await call('sign-in, a wrong password', 'POST', '/auth/sign-in', { email: owner.email, password: 'wrong-on-purpose' });
  await call('sign-in, from a page at another address', 'POST', '/auth/sign-in', { email: owner.email, password: owner.password }, { origin: elsewhere });
  await call('sign-in, the password left empty', 'POST', '/auth/sign-in', { email: owner.email, password: '' });
  await call('sign-in', 'POST', '/auth/sign-in', { email: owner.email, password: owner.password });
  await call('who is signed in', 'GET', '/auth/me');
  await call('language, from a page at another address', 'PUT', '/auth/language', { language: 'es' }, { origin: elsewhere });
  await call('language, with no page address', 'PUT', '/auth/language', { language: 'es' }, { origin: undefined });
  await call('language, one the screens have no words for', 'PUT', '/auth/language', { language: 'fr' });
  await call('language, Spanish', 'PUT', '/auth/language', { language: 'es' });
  await call('who is signed in, after choosing Spanish', 'GET', '/auth/me');
  await call('language, back to English', 'PUT', '/auth/language', { language: 'en' });
  garage = (await call('garages', 'GET', '/garages')).garages[0].id;
  await call('lanes', 'GET', '/garages/{garage}/lanes');
  await call('cars inside', 'GET', '/garages/{garage}/sessions/open');
  await call('lanes, a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/lanes`);
  await call('cars inside, a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/sessions/open`);
  await setupCalls(call, (g) => (garage = g ?? garage), garage);
  await call('sign-out, from a page at another address', 'POST', '/auth/sign-out', undefined, { origin: elsewhere });
  const kept = cookie;
  await call('sign-out', 'POST', '/auth/sign-out');
  cookie = kept;
  await call('who is signed in, with the cookie from before the sign-out', 'GET', '/auth/me');
  cookie = kept;
  await call('a read, with the cookie from before the sign-out', 'GET', '/garages');
  cookie = kept;
  await call('language, with the cookie from before the sign-out', 'PUT', '/auth/language', { language: 'es' });
  return out;
}

/**
 * U4: the setup read, the drivers answer, lane setup and closing, a lane
 * computer connected and cancelled, and the change log -- with every refusal
 * the screens can meet. Lanes the stand-in and the demo hold in different
 * numbers are closed quietly first, so the recorded answers are the same
 * calls on both.
 */
async function setupCalls(call, _keep, garage) {
  const g = (path) => path.replace('{garage}', garage);
  await call('drivers, answered yes', 'PATCH', g('/garages/{garage}'), { transient_available: true });
  await call('drivers, answered yes again (nothing changes)', 'PATCH', g('/garages/{garage}'), { transient_available: true });
  await call('drivers, taken back to unanswered', 'PATCH', g('/garages/{garage}'), { transient_available: null });
  await call('setup', 'GET', '/garages/{garage}/setup', undefined, {}, { structure: 'setup' });
  await call('setup, a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/setup`);
  const before = (await call('lanes, before lane setup', 'GET', '/garages/{garage}/lanes', undefined, {}, { quiet: true })).lanes;
  const lane = (await call('a lane, added', 'POST', '/garages/{garage}/lanes', { name: 'Recorded Entry', direction: 'entry' })).lane;
  await call('a lane, added with no direction', 'POST', '/garages/{garage}/lanes', { name: 'No Direction' });
  await call('a lane, renamed', 'PATCH', `/lanes/${lane.id}`, { name: 'Recorded Entry 2' });
  await call('a lane, renamed to the name it has', 'PATCH', `/lanes/${lane.id}`, { name: 'Recorded Entry 2' });
  await call('a lane, renamed to nothing', 'PATCH', `/lanes/${lane.id}`, { name: '   ' });
  await call('a lane not theirs, renamed', 'PATCH', `/lanes/${NOT_THEIRS}`, { name: 'Mine' });
  await call('a lane, closed: full', 'POST', `/lanes/${lane.id}/close`, { reason: 'full', message: 'Garage full.' });
  await call('a lane, closed again: everyone', 'POST', `/lanes/${lane.id}/close`, { reason: 'everyone', message: 'Closed tonight.' });
  await call('a lane, closed with no message', 'POST', `/lanes/${lane.id}/close`, { reason: 'full', message: '' });
  await call('a lane, closed for no known reason', 'POST', `/lanes/${lane.id}/close`, { reason: 'night', message: 'Closed.' });
  const entries = before.filter((l) => l.direction === 'entry');
  for (const other of entries.slice(1)) await call('another way in, closed', 'POST', `/lanes/${other.id}/close`, { reason: 'everyone', message: 'Closed.', override: true }, {}, { quiet: true });
  await call('the last open way in, closed', 'POST', `/lanes/${entries[0].id}/close`, { reason: 'everyone', message: 'Closed.' });
  await call('the last open way in, closed on purpose', 'POST', `/lanes/${entries[0].id}/close`, { reason: 'everyone', message: 'Closed.', override: true });
  await call('a lane, reopened', 'POST', `/lanes/${entries[0].id}/reopen`);
  await call('a lane, reopened while open', 'POST', `/lanes/${entries[0].id}/reopen`);
  for (const other of entries.slice(1)) await call('another way in, reopened', 'POST', `/lanes/${other.id}/reopen`, undefined, {}, { quiet: true });
  const device = (await call('a lane computer, connected', 'POST', `/lanes/${lane.id}/devices`, { name: 'Recorded computer' })).device;
  await call('a lane computer, with no name', 'POST', `/lanes/${lane.id}/devices`, { name: '' });
  await call('a lane computer not theirs, connected', 'POST', `/lanes/${NOT_THEIRS}/devices`, { name: 'Mine' });
  await call('a lane computer, its access cancelled', 'POST', `/devices/${device.id}/revoke`);
  await call('a lane computer not theirs, cancelled', 'POST', `/devices/${NOT_THEIRS}/revoke`);
  await call('a lane that had a computer, removed', 'DELETE', `/lanes/${lane.id}`);
  const spare = (await call('a spare lane, added', 'POST', '/garages/{garage}/lanes', { name: 'Spare', direction: 'exit' }, {}, { quiet: true })).lane;
  await call('a lane never used, removed', 'DELETE', `/lanes/${spare.id}`);
  await call('a lane not theirs, removed', 'DELETE', `/lanes/${NOT_THEIRS}`);
  await call('lanes, after lane setup', 'GET', '/garages/{garage}/lanes');
  await call('a lane, renamed back', 'PATCH', `/lanes/${lane.id}`, { name: 'Recorded Entry' });
  await call('changes', 'GET', '/garages/{garage}/changes', undefined, {}, { structure: 'changes' });
  await call('changes, after a line not in this log', 'GET', `/garages/{garage}/changes/${NOT_THEIRS}`);
  await call('changes, a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/changes`);
  await call('refused attempts', 'GET', '/garages/{garage}/refused-attempts', undefined, {}, { structure: 'refused' });
  await call('refused attempts, after a line not in this log', 'GET', `/garages/{garage}/refused-attempts/${NOT_THEIRS}`);
  await call('refused attempts, a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/refused-attempts`);
}

/** One sign-in, for the answers only a platform set up to give them can give. */
export async function signInAnswer(base, { origin, owner }) {
  const res = await fetch(`${base}/api/v1/auth/sign-in`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: owner.email, password: 'wrong-on-purpose' }),
  });
  return { status: res.status, body: JSON.parse(await res.text()) };
}
