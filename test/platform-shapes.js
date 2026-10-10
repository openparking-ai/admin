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
      // U4b fix round 2: a person is named when the log is read, or said to be removed -- the kinds, never the name.
      subject_name: line.subject.name === null ? 'null' : typeof line.subject.name,
      subject_removed: line.subject.removed,
    };
  },
  // U4b: the alerts are the contract itself, in order; a person's fields by name.
  alerts: (data) => ({
    keys: Object.keys(data).sort(),
    alerts: data.alerts,
    quiet_minutes: typeof data.quiet_minutes,
    max_contacts: data.max_contacts,
    sending: data.sending,
    contact: Object.keys(data.contacts[0]).sort(),
  }),
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
export async function record(base, { origin, owner, elsewhere = 'http://elsewhere.example', hooks }) {
  if (!hooks) throw new Error('record needs the hooks that move the platform around it (U6: Stripe Connect, the rate engine, Stripe)');
  let cookie = '';
  const out = [];
  let garage = null;
  async function call(what, method, path, body, headers = {}, { quiet = false, structure = null, normalise = false } = {}) {
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
      ...(refusal ? { body: normalise ? normalised(data) : data } : { shape: data === null ? 'empty' : shapeOf(data) }),
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
  await alertsCalls(call, garage);
  await boardCalls(call, garage);
  await moneyCalls(call, garage, hooks);
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

/**
 * U4b: the alerts read, a person added, changed, given choices and removed,
 * with every refusal the Alerts page can meet. Every person, number and
 * address here is invented.
 */
async function alertsCalls(call, garage) {
  const base = `/garages/${garage}/alert-contacts`;
  const person = (await call('a person to tell, added', 'POST', base, { name: 'Recorded manager', phone: '(555) 010-0199', email: 'recorded.manager@example.com', language: 'es' })).contact;
  await call('alerts', 'GET', `/garages/${garage}/alerts`, undefined, {}, { structure: 'alerts' });
  await call('alerts, a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/alerts`);
  await call('a person to tell, a phone with letters', 'POST', base, { name: 'Letters', phone: '555-CALL-NOW' });
  await call('a person to tell, a phone too short', 'POST', base, { name: 'Short', phone: '555-0101' });
  await call('a person to tell, an address with two @', 'POST', base, { name: 'Two at', email: 'two@@example.com' });
  await call('a person to tell, an address with a space', 'POST', base, { name: 'Space', email: 'two words@example.com' });
  await call('a person to tell, neither a phone nor an address', 'POST', base, { name: 'Nobody to reach' });
  // U4b fix round 2: what a name holds is the owner's -- a number in any form, or an @ -- and never in a log.
  for (const [what, name] of [['a number', 'Call 5550100199'], ['a number in circled digits', 'Maria ❺❺❺⓿❶⓿⓿❶❾❾'], ['a number in words', 'Maria five five five'], ['an @', 'Mail me＠example']]) {
    const kept = (await call(`a person to tell, a name holding ${what}`, 'POST', base, { name, email: 'named.number@example.com' })).contact;
    await call(`a person to tell, a name holding ${what}, removed quietly`, 'DELETE', `${base}/${kept.id}`, undefined, {}, { quiet: true });
  }
  await call('a person to tell, a garage not theirs', 'POST', `/garages/${NOT_THEIRS}/alert-contacts`, { name: 'Elsewhere', email: 'elsewhere@example.com' });
  const mailOnly = (await call('a person to tell, email only', 'POST', base, { name: 'Recorded office', email: 'recorded.office@example.com' }, {}, { quiet: true })).contact;
  await call('choices, a text for someone with no phone', 'PUT', `${base}/${mailOnly.id}/choices`, { by_text: ['lane_problem'], by_email: [] });
  await call('choices, an alert there is none of', 'PUT', `${base}/${person.id}/choices`, { by_text: ['no_such_alert'], by_email: [] });
  await call('choices, set', 'PUT', `${base}/${person.id}/choices`, { by_text: ['lane_problem', 'card_payments_stopped'], by_email: ['garage_not_answering'] });
  await call('a person to tell, changed to what they are', 'PATCH', `${base}/${person.id}`, { name: 'Recorded manager' });
  await call('a person to tell, renamed', 'PATCH', `${base}/${person.id}`, { name: 'Recorded manager 2' });
  await call('changes, after a person was renamed', 'GET', `/garages/${garage}/changes`, undefined, {}, { structure: 'changes' });
  await call('a person to tell, the phone taken away', 'PATCH', `${base}/${person.id}`, { phone: null });
  await call('a person to tell, the last way to reach them taken away', 'PATCH', `${base}/${person.id}`, { email: null });
  await call('a person to tell not theirs, changed', 'PATCH', `${base}/${NOT_THEIRS}`, { name: 'Mine' });
  await call('a person to tell, removed', 'DELETE', `${base}/${person.id}`);
  await call('a person to tell not theirs, removed', 'DELETE', `${base}/${NOT_THEIRS}`);
  await call('a person to tell, removed quietly', 'DELETE', `${base}/${mailOnly.id}`, undefined, {}, { quiet: true });
  await call('changes, after a person was removed', 'GET', `/garages/${garage}/changes`, undefined, {}, { structure: 'changes' });
}

/**
 * U4c: a way out closed full, a closing message the screen cannot show, and
 * the board -- a message added, changed and removed, and a lane's price
 * switched on and off -- with every refusal the board can meet.
 */
async function boardCalls(call, garage) {
  const lanes = (await call('lanes, for the board', 'GET', `/garages/${garage}/lanes`, undefined, {}, { quiet: true })).lanes;
  const entry = lanes.find((l) => l.direction === 'entry');
  const exit = lanes.find((l) => l.direction === 'exit');
  const base = `/garages/${garage}/board-messages`;
  await call('a way out, closed full', 'POST', `/lanes/${exit.id}/close`, { reason: 'full', message: 'Garage is full.' });
  await call('a lane, closed with a character the screen cannot show', 'POST', `/lanes/${entry.id}/close`, { reason: 'full', message: 'Full — sorry', override: true });
  await call('board, before any message', 'GET', `/garages/${garage}/board`);
  await call('board, a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/board`);
  const message = (await call('a board message, added', 'POST', base, { text: 'Event tonight', lanes: [entry.id, exit.id], starts: '2030-01-01T08:00', ends: '2030-01-01T23:30' })).message;
  const plain = (await call('a board message, added with no times', 'POST', base, { text: 'Use the south door', lanes: [entry.id] })).message;
  await call('a board message, a character the screen cannot show', 'POST', base, { text: 'Fee € 10', lanes: [entry.id] });
  await call('a board message, no lane', 'POST', base, { text: 'Hi', lanes: [] });
  await call('a board message, a lane not theirs', 'POST', base, { text: 'Hi', lanes: [NOT_THEIRS] });
  await call('a board message, a time that is not one', 'POST', base, { text: 'Hi', lanes: [entry.id], starts: '2030-02-30T08:00' });
  await call('a board message, an end already past', 'POST', base, { text: 'Hi', lanes: [entry.id], ends: '2001-01-01T08:00' });
  await call('a board message, a garage not theirs', 'POST', `/garages/${NOT_THEIRS}/board-messages`, { text: 'Hi', lanes: [entry.id] });
  await call('board', 'GET', `/garages/${garage}/board`);
  await call('a board message, changed', 'PATCH', `${base}/${message.id}`, { text: 'Event tomorrow', ends: null });
  await call('a board message, changed with nothing', 'PATCH', `${base}/${message.id}`, {});
  await call('a board message, an end before its start', 'PATCH', `${base}/${message.id}`, { ends: '2029-12-31T08:00' });
  await call('a board message not theirs, changed', 'PATCH', `${base}/${NOT_THEIRS}`, { text: 'Mine' });
  await call('a board message, removed', 'DELETE', `${base}/${message.id}`);
  await call('a board message not theirs, removed', 'DELETE', `${base}/${NOT_THEIRS}`);
  await call('a board message, removed quietly', 'DELETE', `${base}/${plain.id}`, undefined, {}, { quiet: true });
  await call('price on a lane screen, on', 'PUT', `/lanes/${entry.id}/board-prices`, { show: true });
  await call('price on a lane screen, neither on nor off', 'PUT', `/lanes/${entry.id}/board-prices`, { show: 'yes' });
  await call('price on a lane screen not theirs', 'PUT', `/lanes/${NOT_THEIRS}/board-prices`, { show: true });
  await call('price on a lane screen, off', 'PUT', `/lanes/${entry.id}/board-prices`, { show: false });
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

/**
 * A refusal whose words name things made in the run -- an id, a moment, a
 * Stripe account, place or reader -- with each of those said as what it is,
 * so the platform's sentence and the stand-in's are compared word for word
 * around them.
 */
export function normalised(value) {
  if (typeof value === 'string') {
    return value
      .replace(/[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}/gi, '<id>')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?/g, '<time>')
      .replace(/\b(acct|tml|tmr)_[A-Za-z0-9]+/g, '<$1>');
  }
  if (Array.isArray(value)) return value.map(normalised);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalised(v)]));
  return value;
}

/**
 * U6: the garage's taxes, its payment account, the place of its card readers
 * and a reader connected and disconnected -- with every refusal the three
 * pages can meet that a platform can be brought to give. `hooks` moves what
 * is around the platform, the same way on both: Stripe Connect set up or not
 * (`connect`), the rate engine answering (`engine`), Stripe answering
 * (`stripe`), Stripe turning card payments on for an account (`cards`); and
 * `fresh` leaves the garage with no account, place or reader, as the
 * platform's demo garage is. Every list, number and address here is invented.
 */
async function moneyCalls(call, garage, hooks) {
  const taxes = `/garages/${garage}/tax-sets`;
  const list = (effective_from, rules) => ({ tax_set: { effective_from, rules } });
  const line = (over = {}) => ({ id: 'tax-1', label: 'Recorded city tax', percent_bp: 1850, rounding: 'nearest', sequence: 1, ...over });
  await hooks.fresh(garage);
  await call('taxes, a new list', 'POST', taxes, list('2031-01-01T00:00:00-05:00', [line(), line({ id: 'tax-2', label: 'Recorded state tax', percent_bp: 600, rounding: 'up', sequence: 2 })]));
  await call('taxes, a list starting at the moment another starts', 'POST', taxes, list('2031-01-01T05:00:00Z', [line()]), {}, { normalise: true });
  await call('taxes, a line of 0 percent', 'POST', taxes, list('2031-02-01T00:00:00-05:00', [line({ percent_bp: 0 })]));
  await call('taxes, a line with no rounding chosen', 'POST', taxes, list('2031-02-01T00:00:00-05:00', [line({ rounding: '' })]));
  await call('taxes, a line with no name', 'POST', taxes, list('2031-02-01T00:00:00-05:00', [line({ label: '  ' })]));
  await call('taxes, a percent past what can be kept', 'POST', taxes, list('2031-02-01T00:00:00-05:00', [line({ percent_bp: 3000000000 })]));
  await call('taxes, a list with no time zone', 'POST', taxes, list('2031-02-01T00:00:00', [line()]));
  await call('taxes, a new list: no tax', 'POST', taxes, list('2031-03-01T00:00:00-05:00', []));
  await call('taxes, a garage not theirs', 'POST', `/garages/${NOT_THEIRS}/tax-sets`, list('2031-04-01T00:00:00-04:00', [line()]));
  await hooks.engine(false);
  await call('taxes, the rate engine not answering', 'POST', taxes, list('2031-04-01T00:00:00-04:00', [line()]));
  await hooks.engine(true);
  await call('taxes', 'GET', taxes);
  await call('taxes, of a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/tax-sets`);

  const account = `/garages/${garage}/stripe-account`;
  const place = { display_name: '1 Recorded Street, Springfield, IL 62701, US', address: { line1: '1 Recorded Street', city: 'Springfield', state: 'IL', postal_code: '62701', country: 'US' } };
  await hooks.connect(false);
  await call('payment account, with Stripe Connect not set up', 'GET', account);
  await call('payment account, made with Stripe Connect not set up', 'POST', account, { country: 'US' });
  await call('readers place, with Stripe Connect not set up', 'GET', `${account}/location`);
  await call('card readers, with Stripe Connect not set up', 'GET', `/garages/${garage}/readers`);
  await hooks.connect(true);
  await call('payment account, none yet', 'GET', account);
  await call('payment account, of a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/stripe-account`);
  await call("Stripe's page, with no account yet", 'POST', `${account}/onboarding-link`);
  await call('payment account, checked with no account yet', 'POST', `${account}/refresh`);
  await call('payment account, a country that is not one', 'POST', account, { country: 'usa' });
  const made = (await call('payment account, made', 'POST', account, { country: 'US' })).stripe_account;
  await call('payment account, made again', 'POST', account, { country: 'US' });
  await call('payment account', 'GET', account);
  await call("Stripe's page", 'POST', `${account}/onboarding-link`);
  await call('payment account, checked', 'POST', `${account}/refresh`);
  await call('readers place, none yet', 'GET', `${account}/location`);
  await call('readers place, given while card payments are off', 'POST', `${account}/location`, place);
  const lanes = (await call('lanes, for the card readers', 'GET', `/garages/${garage}/lanes`, undefined, {}, { quiet: true })).lanes;
  const exit = lanes.find((l) => l.direction === 'exit');
  const reader = (over = {}) => ({ registration_code: 'simulated-wpe', label: 'Recorded exit reader', ...over });
  await call('a card reader, with no place given yet', 'POST', `/lanes/${exit.id}/reader`, reader());
  await hooks.cards(garage, made.account_id, { card_payments: 'active', charges_enabled: true, details_submitted: true });
  await call('payment account, checked after Stripe turned card payments on', 'POST', `${account}/refresh`);
  await call('readers place, with no name', 'POST', `${account}/location`, { ...place, display_name: '' });
  await call('readers place, with no street', 'POST', `${account}/location`, { ...place, address: { country: 'US' } });
  await call('readers place, given', 'POST', `${account}/location`, place);
  await call('readers place, given again', 'POST', `${account}/location`, place);
  await call('readers place', 'GET', `${account}/location`);
  await call('readers place, of a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/stripe-account/location`);
  await call('card readers, none yet', 'GET', `/garages/${garage}/readers`);
  await call('a card reader, with no code', 'POST', `/lanes/${exit.id}/reader`, reader({ registration_code: '' }));
  await call('a card reader, with no name', 'POST', `/lanes/${exit.id}/reader`, reader({ label: ' ' }));
  await call('a card reader, a lane not theirs', 'POST', `/lanes/${NOT_THEIRS}/reader`, reader());
  await call('a card reader, a code Stripe does not take', 'POST', `/lanes/${exit.id}/reader`, reader({ registration_code: 'not-a-real-code' }));
  await call('a card reader, connected', 'POST', `/lanes/${exit.id}/reader`, reader());
  await call('a card reader, on a lane that has one', 'POST', `/lanes/${exit.id}/reader`, reader({ registration_code: 'simulated-wpe-2' }), {}, { normalise: true });
  await call('card readers', 'GET', `/garages/${garage}/readers`);
  await call('lanes, with a card reader', 'GET', `/garages/${garage}/lanes`);
  await call('a card reader, disconnected', 'POST', `/lanes/${exit.id}/reader/unbind`);
  await call('a card reader, disconnected again', 'POST', `/lanes/${exit.id}/reader/unbind`);
  await call('a card reader not theirs, disconnected', 'POST', `/lanes/${NOT_THEIRS}/reader/unbind`);
  await call('card readers, after one was disconnected', 'GET', `/garages/${garage}/readers`);
  await hooks.stripe(false);
  await call('payment account, checked with Stripe not answering', 'POST', `${account}/refresh`);
  await hooks.stripe(true);
  await call('changes, after the card reader', 'GET', `/garages/${garage}/changes`, undefined, {}, { structure: 'changes' });
}
