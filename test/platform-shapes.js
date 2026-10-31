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
  // U7g: what the try priced, whole -- money, lines and instants, no id and
  // nothing of a person -- because the price IS what is recorded: the check
  // that the form says what the engine charges reads it.
  priced: (data) => data,
  // U7g: the rates read: the documents whole (the page's own, made from the
  // forms in test/rates-forms.js), and the kind of space.
  plans: (data) => ({ keys: Object.keys(data).sort(), space_class: data.space_class, plans: data.rate_plans.map((r) => ({ keys: Object.keys(r).sort(), plan: r.plan })) }),
  // U7i: the rates read, each start said as "when saved" -- rates start when they are saved.
  plansSaved: (data) => ({
    keys: Object.keys(data).sort(),
    space_class: data.space_class,
    plans: data.rate_plans.map((r) => ({ keys: Object.keys(r).sort(), id: typeof r.id, plan: { ...r.plan, effective_from: 'when saved' }, starts_as_sent: r.effective_from !== null && Date.parse(r.effective_from) === Date.parse(r.plan.effective_from) })),
  }),
  // U7i: a save's answer, its keys and the plan as sent, its start said as "when saved".
  saved: (data) => ({ keys: Object.keys(data).sort(), row: Object.keys(data.rate_plan).sort(), plan: { ...data.rate_plan.plan, effective_from: 'when saved' } }),
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
  // U7i: the change log after rates were saved: its newest line's start said as "when saved".
  changesSaved: (data) => {
    const out = STRUCTURE.changes(data);
    const after = out.newest.after;
    return { ...out, newest: { ...out.newest, after: after && after.effective_from ? { ...after, effective_from: 'when saved' } : after } };
  },
  // U7c: a garage just added: its checklist by structure, and which steps a new garage has done.
  added: (data) => ({
    keys: Object.keys(data).sort(),
    setup_keys: Object.keys(data.setup).sort(),
    open: data.setup.open,
    takes_any_driver: data.setup.takes_any_driver,
    steps: data.setup.steps.map((s) => ({ key: s.key, done: s.done, facts: Object.keys(s.facts).sort() })),
  }),
  // U7d-2: what a link is, as the status door says it -- the status, its sentence and the
  // invite's language word for word; the email and the end by kind only.
  link: (data) => ({
    keys: Object.keys(data).sort(),
    status: data.status,
    message: data.message,
    ...(data.language === undefined ? {} : { language: data.language, email: typeof data.email, expires_at: typeof data.expires_at }),
  }),
  // U7d-2: forgot's one sentence, and reset's, word for word.
  said: (data) => ({ keys: Object.keys(data).sort(), message: data.message }),
  // U4b: the alerts are the contract itself, in order; a person's fields by name.
  alerts: (data) => ({
    keys: Object.keys(data).sort(),
    alerts: data.alerts,
    quiet_minutes: typeof data.quiet_minutes,
    max_contacts: data.max_contacts,
    sending: data.sending,
    contact: Object.keys(data.contacts[0]).sort(),
  }),
  // Platform 0043: the change log after a stay was ended, its times said as "a time" -- when the
  // stay came in and left are the data's, not the contract's -- and, since 0045, what it owes said as
  // "an amount" (the garage's rates price it) and each exit lane case it closed by "an id".
  stayChanges: (data) => {
    const out = STRUCTURE.changes(data);
    const said = (k, v) => {
      if (['entered_at', 'exit_at'].includes(k) && v !== null) return 'a time';
      if (['owed_minor', 'paid_minor'].includes(k) && typeof v === 'number') return 'an amount';
      if (k === 'exit_cases_closed' && Array.isArray(v)) return v.map((c) => ({ ...c, exit_id: typeof c.exit_id === 'string' ? 'an id' : c.exit_id }));
      return v;
    };
    const timed = (side) => side && Object.fromEntries(Object.entries(side).map(([k, v]) => [k, said(k, v)]));
    return { ...out, newest: { ...out.newest, before: timed(out.newest.before), after: timed(out.newest.after) } };
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
 * Calls to a platform, each answer written down in `state.out`: its status,
 * the exact body of a refusal, the shape of any other body (or its structure,
 * STRUCTURE), and the cookie's attributes. Each call carries the page's
 * `origin` and the cookie the platform last set; `{garage}` in a path is
 * `state.garage`.
 */
function recorder(base, origin) {
  const state = { cookie: '', garage: null, out: [] };
  async function call(what, method, path, body, headers = {}, { quiet = false, structure = null, normalise = false } = {}) {
    const res = await fetch(`${base}/api/v1${path.replace('{garage}', state.garage)}`, {
      method,
      headers: Object.fromEntries(
        Object.entries({ origin, ...(state.cookie && { cookie: state.cookie }), ...(body !== undefined && { 'content-type': 'application/json' }), ...headers }).filter(([, v]) => v !== undefined),
      ),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) state.cookie = setCookie.split(';')[0].endsWith('=') ? '' : setCookie.split(';')[0];
    const text = await res.text();
    const data = text === '' ? null : JSON.parse(text);
    const refusal = res.status >= 400;
    if (quiet === 'limit') {
      // U7g: asked until "a minute"; only that refusal is written down.
      if (res.status !== 429) return data;
      state.out.push({ what, status: res.status, body: data });
      return 'refused';
    }
    if (quiet) {
      if (refusal) throw new Error(`${what}: ${res.status} ${text}`);
      return data;
    }
    if (structure && !refusal) {
      state.out.push({ what, status: res.status, structure: STRUCTURE[structure](data) });
      return data;
    }
    state.out.push({
      what,
      status: res.status,
      ...(refusal ? { body: normalise ? normalised(data) : data } : { shape: data === null ? 'empty' : shapeOf(data) }),
      ...(setCookie ? { cookie: cookieOf(setCookie) } : {}),
    });
    return data;
  }
  return { state, call };
}

/**
 * Every answer, in order. `owner` is { email, password }; the first garage of
 * the owner must have lanes and stays inside. `origin` is the admin page's own.
 */
export async function record(base, { origin, owner, elsewhere = 'http://elsewhere.example', hooks }) {
  if (!hooks) throw new Error('record needs the hooks that move the platform around it (U6: Stripe Connect, the rate engine, Stripe)');
  const { state, call } = recorder(base, origin);
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
  state.garage = (await call('garages', 'GET', '/garages')).garages[0].id;
  await call('lanes', 'GET', '/garages/{garage}/lanes');
  await call('cars inside', 'GET', '/garages/{garage}/sessions/open');
  await call('lanes, a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/lanes`);
  await call('cars inside, a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/sessions/open`);
  await setupCalls(call, (g) => (state.garage = g ?? state.garage), state.garage);
  await alertsCalls(call, state.garage);
  await boardCalls(call, state.garage);
  await moneyCalls(call, state.garage, hooks);
  await call('sign-out, from a page at another address', 'POST', '/auth/sign-out', undefined, { origin: elsewhere });
  const kept = state.cookie;
  await call('sign-out', 'POST', '/auth/sign-out');
  state.cookie = kept;
  await call('who is signed in, with the cookie from before the sign-out', 'GET', '/auth/me');
  state.cookie = kept;
  await call('a read, with the cookie from before the sign-out', 'GET', '/garages');
  state.cookie = kept;
  await call('language, with the cookie from before the sign-out', 'PUT', '/auth/language', { language: 'es' });
  return state.out;
}

/**
 * U7c: a garage added, as the Garages page adds one -- its name, time zone
 * and currency, nothing else -- with the refusals it can meet, then the
 * account's garages, the new garage's checklist, its change log and the
 * refused attempts. Recorded apart from `record`, after it: a garage added
 * stays on the account. Every name here is invented.
 */
export async function recordAddGarage(base, { origin, owner, elsewhere = 'http://elsewhere.example' }) {
  const { state, call } = recorder(base, origin);
  const added = { name: 'Recorded Garage', timezone: 'America/Denver', currency: 'USD' };
  await call('sign-in, to add a garage', 'POST', '/auth/sign-in', { email: owner.email, password: owner.password }, {}, { quiet: true });
  await call('a garage, added from a page at another address', 'POST', '/garages', added, { origin: elsewhere });
  await call('a garage, added with no time zone', 'POST', '/garages', { name: added.name, currency: added.currency });
  await call('a garage, added with no name', 'POST', '/garages', { ...added, name: '' });
  await call('a garage, added with its money in small letters', 'POST', '/garages', { ...added, currency: 'usd' });
  // U7d-2: the platform's own checks since 130d38d (its src/garageFields.js), each a 400 with its code.
  // The platform counts a refusal repeated on the line it already has (0027); the stand-in writes a
  // line each time. Each refusal after the first money one is of a kind not refused before it, so the
  // newest line is the same on both.
  await call('a garage, added with money no country uses', 'POST', '/garages', { ...added, currency: 'XYZ' });
  await call('a garage, added with a time zone the platform does not know', 'POST', '/garages', { ...added, timezone: 'Mars/Olympus' });
  await call('a garage, added with a name of 101 characters', 'POST', '/garages', { ...added, name: 'N'.repeat(101) });
  state.garage = (await call('a garage, added', 'POST', '/garages', added)).garage.id;
  await call('garages, after one was added', 'GET', '/garages');
  await call('setup, of the garage added', 'GET', '/garages/{garage}/setup', undefined, {}, { structure: 'added' });
  await call('changes, of the garage added', 'GET', '/garages/{garage}/changes', undefined, {}, { structure: 'changes' });
  await call('refused attempts, after a garage was refused', 'GET', '/garages/{garage}/refused-attempts', undefined, {}, { structure: 'refused' });
  return state.out;
}

/**
 * U7d-2: the four doors behind an emailed link -- an invite's status and its
 * accepting, a forgotten password and choosing a new one -- with every answer
 * the screens can meet. The token rides in the POST body only, as the screens
 * send it. `hooks` does what only the platform's operator can: invite an
 * email (`invite`, answering the link's token), send it again (`resend`),
 * move a link past its end (`expire`), make an admin on the invite's account
 * or elsewhere (`adminOnTenantOf`, `adminElsewhere`), and read the reset link
 * the last forgot sent (`resetLink`). Recorded apart, after the others: a
 * reset changes the owner's password. Every address here is invented.
 */
/**
 * U7f: the two tailgater settings and the banned cars, as the Setup page and
 * the Banned cars page meet them. `hooks.fresh(garage)` starts the garage with
 * the settings off and no car listed; `hooks.tailgater(garage)` lists one car
 * as the platform lists one -- a tailgater read at a lane, with a picture,
 * while the garage bans tailgaters. Recorded apart from `record`, after it.
 */
export async function recordBanned(base, { origin, owner, elsewhere = 'http://elsewhere.example', hooks }) {
  const { state, call } = recorder(base, origin);
  await call('sign-in, for the banned cars', 'POST', '/auth/sign-in', { email: owner.email, password: owner.password }, {}, { quiet: true });
  state.garage = (await call('garages, for the banned cars', 'GET', '/garages', undefined, {}, { quiet: true })).garages[0].id;
  await hooks.fresh(state.garage);
  await call('banned cars, none listed', 'GET', '/garages/{garage}/banned');
  await call('banned cars, a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/banned`);
  await call('tailgaters banned, from a page at another address', 'PATCH', '/garages/{garage}', { ban_tailgaters: true }, { origin: elsewhere });
  await call('tailgaters banned, not true or false', 'PATCH', '/garages/{garage}', { ban_tailgaters: 'yes' });
  await call('tailgaters banned, a reach the screens do not offer', 'PATCH', '/garages/{garage}', { ban_reach: 'everywhere' });
  await call('tailgaters banned', 'PATCH', '/garages/{garage}', { ban_tailgaters: true });
  await call('tailgaters banned again (nothing changes)', 'PATCH', '/garages/{garage}', { ban_tailgaters: true });
  await call('tailgaters banned, at all my garages', 'PATCH', '/garages/{garage}', { ban_reach: 'all' });
  await hooks.tailgater(state.garage);
  const [car] = (await call('banned cars, one listed', 'GET', '/garages/{garage}/banned')).cars;
  await call('a banned car, removed from a page at another address', 'POST', `/garages/{garage}/banned/${car.id}/remove`, undefined, { origin: elsewhere });
  await call('a banned car not on the list, removed', 'POST', `/garages/{garage}/banned/${NOT_THEIRS}/remove`);
  await call('a banned car, removed', 'POST', `/garages/{garage}/banned/${car.id}/remove`);
  await call('a banned car, removed again', 'POST', `/garages/{garage}/banned/${car.id}/remove`);
  await call('banned cars, after the removal', 'GET', '/garages/{garage}/banned');
  await call('tailgaters not banned, this garage only', 'PATCH', '/garages/{garage}', { ban_tailgaters: false, ban_reach: 'garage' });
  await call('changes, after the banned cars', 'GET', '/garages/{garage}/changes', undefined, {}, { structure: 'changes' });
  return state.out;
}

/**
 * Platform 0043: the stuck stays, as the Stuck stays page meets them -- the
 * list, the garage's hours, a stay ended (the car left) and one written off,
 * with every refusal the page can meet. `hooks.stays(garage)` lets in three
 * cars as the entry lane lets one in, each with one picture: 30 and 26 hours
 * ago, and one an hour ago that is not listed. Recorded apart from `record`,
 * after it, on a garage with no stay of its own. Then (0045) the exit lane
 * opens a case on the car of an hour ago, as a lane opens one for a car on
 * its loop (`hooks.atExit(garage)`, which answers that stay's id), and a
 * person ends the stay: the case is closed with it, in the change log.
 */
export async function recordStuck(base, { origin, owner, elsewhere = 'http://elsewhere.example', hooks }) {
  const { state, call } = recorder(base, origin);
  const HOUR = 3600 * 1000;
  await call('sign-in, for the stuck stays', 'POST', '/auth/sign-in', { email: owner.email, password: owner.password }, {}, { quiet: true });
  state.garage = (await call('garages, for the stuck stays', 'GET', '/garages', undefined, {}, { quiet: true })).garages[0].id;
  await call('stuck stays, none yet', 'GET', '/garages/{garage}/stays/stuck');
  await hooks.stays(state.garage);
  await call('stuck stays, a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/stays/stuck`);
  const [first, second] = (await call('stuck stays, two listed', 'GET', '/garages/{garage}/stays/stuck')).stays;
  await call('stuck after, from a page at another address', 'PATCH', '/garages/{garage}', { stuck_after_hours: 28 }, { origin: elsewhere });
  await call('stuck after, zero', 'PATCH', '/garages/{garage}', { stuck_after_hours: 0 });
  await call('stuck after, as text', 'PATCH', '/garages/{garage}', { stuck_after_hours: '28' });
  await call('stuck after, 28 hours', 'PATCH', '/garages/{garage}', { stuck_after_hours: 28 });
  await call('stuck stays, one listed after 28 hours', 'GET', '/garages/{garage}/stays/stuck');
  await call('stuck after, back to 24 hours', 'PATCH', '/garages/{garage}', { stuck_after_hours: 24 });
  await call("a stay's picture, asked through another stay", 'GET', `/garages/{garage}/stays/${second.id}/pictures/${first.pictures[0].id}`);
  const end = (stay) => `/garages/{garage}/stays/${stay.id}/end`;
  const leftAt = new Date(Date.parse(first.entered_at) + 2 * HOUR).toISOString();
  await call('a stay ended, from a page at another address', 'POST', end(first), { outcome: 'ended', reason: 'Backed out at the gate', left_at: leftAt }, { origin: elsewhere });
  await call('a stay ended, with no reason', 'POST', end(first), { outcome: 'ended', reason: ' ', left_at: leftAt });
  await call('a stay ended, its reason on two lines', 'POST', end(first), { outcome: 'ended', reason: 'Backed out\nat the gate', left_at: leftAt });
  await call('a stay ended, before it came in', 'POST', end(first), { outcome: 'ended', reason: 'Backed out at the gate', left_at: new Date(Date.parse(first.entered_at) - HOUR).toISOString() });
  await call('a stay not theirs, ended', 'POST', end({ id: NOT_THEIRS }), { outcome: 'ended', reason: 'Backed out at the gate' });
  await call('a stay ended, two hours after it came in', 'POST', end(first), { outcome: 'ended', reason: 'Backed out at the gate', left_at: leftAt });
  await call('a stay ended again', 'POST', end(first), { outcome: 'ended', reason: 'Backed out at the gate', left_at: leftAt });
  await call('a stay written off', 'POST', end(second), { outcome: 'abandoned', reason: 'Plate misread twice' });
  await call('stuck stays, after both were ended', 'GET', '/garages/{garage}/stays/stuck');
  await call('changes, after a stay was written off', 'GET', '/garages/{garage}/changes', undefined, {}, { structure: 'stayChanges' });
  await call('refused attempts, after the stays', 'GET', '/garages/{garage}/refused-attempts', undefined, {}, { structure: 'refused' });
  const atExit = await hooks.atExit(state.garage);
  await call('a stay an exit lane has open, ended', 'POST', end({ id: atExit }), { outcome: 'ended', reason: 'Left while the exit lane was down' });
  await call('changes, after a stay an exit lane had open was ended', 'GET', '/garages/{garage}/changes', undefined, {}, { structure: 'stayChanges' });
  return state.out;
}

/**
 * U7g / U7i: rates, trying a stay, saving with the owner's confirmation and
 * the rates checked against, and the Open button -- on a garage of its own,
 * the calls the Rates page makes and every refusal it can meet. `plans` is
 * test/rates-forms.js's recordedPlans, built at the time of the run (rates
 * start when they are saved). What a try priced is written down whole (the
 * price IS the contract); the rates read back, with each start said as "when
 * saved". `rest` waits out the platform's 20 tries a minute (the recording)
 * or forgets the tries (the stand-in).
 */
export async function recordRates(base, { origin, owner, hooks, plans, stays, rest = async () => {} }) {
  const { state, call } = recorder(base, origin);
  await call('sign-in, for the rates', 'POST', '/auth/sign-in', { email: owner.email, password: owner.password }, {}, { quiet: true });
  state.garage = (await call('a garage, for the rates', 'POST', '/garages', plans.garage, {}, { quiet: true })).garage.id;
  if (hooks?.lanes) await hooks.lanes(state.garage);
  // Each plan starts at the moment it is sent, as a save starts when it is confirmed.
  const fresh = (plan, ms = 0) => ({ ...plan, effective_from: new Date(Date.now() + ms).toISOString() });
  const rates = '/garages/{garage}/rate-plans';
  const tryIt = `${rates}/try`;
  const ids = async () => (await call('rates, for their ids', 'GET', rates, undefined, {}, { quiet: true })).rate_plans.map((r) => r.id);
  await call('rates, none yet', 'GET', rates, undefined, {}, { structure: 'plansSaved' });
  await call('rates, of a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/rate-plans`);
  await call('a stay tried, with no rates at all', 'POST', tryIt, { stays: [stays[0]] });
  await call('the regular rates tried', 'POST', tryIt, { plan: fresh(plans.regular), stays }, {}, { structure: 'priced' });
  await call('rates saved, not confirmed', 'POST', rates, { plan: fresh(plans.regular), based_on: null });
  await call('rates saved, starting an hour after they are saved', 'POST', rates, { plan: fresh(plans.regular, 3600_000), confirmed: true, based_on: null }, {}, { normalise: true });
  await call('rates saved, checked against rates the garage does not have', 'POST', rates, { plan: fresh(plans.regular), confirmed: true, based_on: '00000000-0000-4000-8000-000000000001' }, {}, { normalise: true });
  await call('rates saved, the regular rates', 'POST', rates, { plan: fresh(plans.regular), confirmed: true, based_on: null }, {}, { structure: 'saved' });
  const [regularId] = await ids();
  await call('the early bird tried', 'POST', tryIt, { plan: fresh(plans.early), stays }, {}, { structure: 'priced' });
  await call('rates saved, the early bird added', 'POST', rates, { plan: fresh(plans.early), confirmed: true, based_on: regularId }, {}, { structure: 'saved' });
  await call('rates saved, checked against the rates before the early bird', 'POST', rates, { plan: fresh(plans.change), confirmed: true, based_on: regularId }, {}, { normalise: true });
  await call('rates saved, checked against none, with rates saved', 'POST', rates, { plan: fresh(plans.change), confirmed: true }, {}, { normalise: true });
  await call('a stay tried, on the rates saved', 'POST', tryIt, { stays }, {}, { structure: 'priced' });
  await call('the max per day tried', 'POST', tryIt, { plan: fresh(plans.max), stays: [plans.maxStay] }, {}, { structure: 'priced' });
  await call('the other kinds of special tried', 'POST', tryIt, { plan: fresh(plans.other), stays }, {}, { structure: 'priced' });
  await rest();
  const newest = (await ids()).at(-1);
  await call('rates saved, with a gap', 'POST', rates, { plan: fresh(plans.gap), confirmed: true, based_on: newest });
  await call('a stay tried, rates with a gap', 'POST', tryIt, { plan: fresh(plans.gap), stays: [stays[0], plans.maxStay] }, {}, { structure: 'priced' });
  await call('rates saved, starting in the past', 'POST', rates, { plan: fresh(plans.change, -3600_000), confirmed: true, based_on: newest }, {}, { normalise: true });
  await call('rates saved, a name already saved', 'POST', rates, { plan: { ...fresh(plans.change), plan_version: plans.regular.plan_version }, confirmed: true, based_on: newest });
  await call('rates saved, a garage not theirs', 'POST', `/garages/${NOT_THEIRS}/rate-plans`, { plan: fresh(plans.change), confirmed: true, based_on: null });
  await call('a stay tried, leaving before it came in', 'POST', tryIt, { stays: [{ entry: '2031-03-15T10:00', exit: '2031-03-15T09:00' }] });
  await call('a stay tried, a garage not theirs', 'POST', `/garages/${NOT_THEIRS}/rate-plans/try`, { stays: [stays[0]] });
  await call('rates', 'GET', rates, undefined, {}, { structure: 'plansSaved' });
  await call('setup, with rates saved', 'GET', '/garages/{garage}/setup', undefined, {}, { structure: 'setup' });
  await call('the garage opened, with steps missing', 'POST', '/garages/{garage}/activate');
  const read = await call('rates, read for who saved them', 'GET', rates, undefined, {}, { quiet: true });
  const log = await call('changes, after the rates', 'GET', '/garages/{garage}/changes', undefined, {}, { structure: 'changesSaved' });
  // Item 11: each stored row's change-log line, matched by the row's id -- who, by kind and
  // whether named (never the name), and that it says confirmed.
  state.out.push({
    what: 'who saved each set of rates',
    status: 200,
    structure: read.rate_plans.map((row) => {
      const lines = log.changes.filter((l) => l.action === 'rate_plan.add' && l.subject.kind === 'rate_plan' && l.subject.id === row.id);
      return { plan_version: row.plan_version, id: typeof row.id, lines: lines.length, who: lines.map((l) => ({ kind: l.who.kind, name: typeof l.who.name })), confirmed: lines.map((l) => l.after?.confirmed === true), subject_name: lines.map((l) => l.subject.name === row.plan_version) };
    }),
  });
  await rest();
  // Last, so it holds back nothing above: tries until the platform says "a minute".
  let n = 0;
  for (;;) {
    n += 1;
    // An empty list: refused before any price, so only the count moves.
    const res = await call('a stay tried, too many in a minute', 'POST', tryIt, { stays: [] }, {}, { quiet: 'limit' });
    if (res === 'refused' || n > 40) break;
  }
  return state.out;
}

/**
 * The fill rule (platform 0034): a garage's number of spaces as the Garages
 * page sets it, rates that charge more when the garage is full as the Rates
 * page meets them, and every refusal of either. On a garage of its own, with
 * the regular rates of `plans` saved first; `fill` is the rule the Price Lab
 * writes. What a try priced is written down whole, as for the rates.
 */
export async function recordSpaces(base, { origin, owner, plans, fill, elsewhere = 'http://elsewhere.example' }) {
  const { state, call } = recorder(base, origin);
  await call('sign-in, for the spaces', 'POST', '/auth/sign-in', { email: owner.email, password: owner.password }, {}, { quiet: true });
  state.garage = (await call('a garage, for the spaces', 'POST', '/garages', { ...plans.garage, name: 'Recorded spaces garage' }, {}, { quiet: true })).garage.id;
  const fresh = (plan) => ({ ...plan, effective_from: new Date().toISOString() });
  const withFill = (plan) => ({ ...plan, plan_version: `${plan.plan_version}-fill`, rules: [...plan.rules, fill], adjust_order: plan.adjust_order ? [...plan.adjust_order, fill.id] : null });
  const rates = '/garages/{garage}/rate-plans';
  await call('rates saved, for the spaces', 'POST', rates, { plan: fresh(plans.regular), confirmed: true, based_on: null }, {}, { quiet: true });
  const newest = async () => (await call('rates, for their ids', 'GET', rates, undefined, {}, { quiet: true })).rate_plans.map((r) => r.id).at(-1);
  await call('spaces, none yet', 'GET', '/garages/{garage}');
  await call('spaces, zero', 'PATCH', '/garages/{garage}', { spaces: 0 });
  await call('spaces, as text', 'PATCH', '/garages/{garage}', { spaces: '120' });
  await call('spaces, from a page at another address', 'PATCH', '/garages/{garage}', { spaces: 120 }, { origin: elsewhere });
  await call('spaces, a garage not theirs', 'PATCH', `/garages/${NOT_THEIRS}`, { spaces: 120 });
  await call('rates with a fill rule saved, no spaces yet', 'POST', rates, { plan: fresh(withFill(plans.regular)), confirmed: true, based_on: await newest() });
  const missing = withFill(plans.regular);
  missing.rules = missing.rules.map((r) => (r.id === fill.id ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'raises_vip_extra')) : r));
  await call('rates with a fill rule saved, a choice left out', 'POST', rates, { plan: fresh(missing), confirmed: true, based_on: await newest() });
  await call('spaces, set', 'PATCH', '/garages/{garage}', { spaces: 120 });
  await call('spaces, set again (nothing changes)', 'PATCH', '/garages/{garage}', { spaces: 120 });
  await call('garages, with spaces', 'GET', '/garages');
  await call('a stay tried, how full out of range', 'POST', `${rates}/try`, { stays: [{ entry: '2031-03-15T10:00', exit: '2031-03-15T12:00', occupancy_at_entry_bp: 10001 }] });
  await call('a stay tried, a fill rule and no figure', 'POST', `${rates}/try`, { plan: fresh(withFill(plans.regular)), stays: [{ entry: '2031-03-15T10:00', exit: '2031-03-15T12:00' }] }, {}, { structure: 'priced' });
  await call('a stay tried, a fill rule, below it and at it', 'POST', `${rates}/try`, {
    plan: fresh(withFill(plans.regular)),
    stays: [7999, 8000].map((occupancy_at_entry_bp) => ({ entry: '2031-03-15T10:00', exit: '2031-03-15T12:00', occupancy_at_entry_bp })),
  }, {}, { structure: 'priced' });
  await call('rates with a fill rule saved', 'POST', rates, { plan: fresh(withFill(plans.regular)), confirmed: true, based_on: await newest() }, {}, { structure: 'saved' });
  await call('spaces, cleared under a fill rule', 'PATCH', '/garages/{garage}', { spaces: null });
  await call('changes, after the spaces', 'GET', '/garages/{garage}/changes', undefined, {}, { structure: 'changesSaved' });
  return state.out;
}

export async function recordAccountLinks(base, { origin, owner, elsewhere = 'http://elsewhere.example', hooks }) {
  if (!hooks) throw new Error('recordAccountLinks needs the hooks that invite, resend, expire and read the reset link');
  const { state, call } = recorder(base, origin);
  const chosen = 'invited-owner-password-1';
  const short = 'eleven-char';
  const status = (what, token, headers = {}) => call(what, 'POST', '/auth/invite/status', { token }, headers, { structure: 'link' });
  const forgot = (what, email, headers = {}) => call(what, 'POST', '/auth/forgot', { email }, headers, { structure: 'said' });
  const accept = (what, token, password = chosen, language = 'es') => call(what, 'POST', '/auth/invite/accept', { token, password, language });
  const reset = (what, token, password = chosen) => call(what, 'POST', '/auth/reset', { token, password }, {}, { structure: 'said' });

  // An invite, ready, accepted, then used.
  const ready = await hooks.invite('invited-owner@example.com', 'es');
  await status('invite status, from a page at another address', ready, { origin: elsewhere });
  await call('invite status, a body the door does not read', 'POST', '/auth/invite/status', { token: ready, password: chosen });
  await status('invite status, ready', ready);
  await accept('invite accept, a password of 11 characters', ready, short);
  await accept('invite accept, a language the screens have no words for', ready, chosen, 'fr');
  await accept('invite accept', ready);
  await call('who is signed in, after accepting an invite', 'GET', '/auth/me');
  await call('garages, of an account just made', 'GET', '/garages');
  await status('invite status, used', ready);
  await accept('invite accept, used', ready);
  // Replaced by a newer one, and the newer one past its end.
  const first = await hooks.invite('replaced-owner@example.com', 'en');
  const second = await hooks.resend('replaced-owner@example.com');
  await status('invite status, replaced', first);
  await accept('invite accept, replaced', first);
  await hooks.expire('invite', second);
  await status('invite status, expired', second);
  await accept('invite accept, expired', second);
  // Not an invite.
  await status('invite status, a link that is not an invite', 'opi_not-a-real-invite');
  await accept('invite accept, a link that is not an invite', 'opi_not-a-real-invite');
  // The account, or the email, already has its admin.
  const hasAdmin = await hooks.invite('third-owner@example.com', 'en');
  await hooks.adminOnTenantOf(hasAdmin, 'another-admin@example.com');
  await accept('invite accept, the account already has its admin', hasAdmin);
  const emailTaken = await hooks.invite('fourth-owner@example.com', 'en');
  await hooks.adminElsewhere('fourth-owner@example.com');
  await accept('invite accept, the email already names an admin', emailTaken);

  // A forgotten password, and a new one chosen.
  await call('sign-in, before a reset', 'POST', '/auth/sign-in', { email: owner.email, password: owner.password }, {}, { quiet: true });
  await forgot('forgot, from a page at another address', owner.email, { origin: elsewhere });
  await forgot('forgot, a body the door does not read', 'x');
  await forgot('forgot, an email that names nobody', 'nobody-here@example.com');
  await forgot('forgot', owner.email);
  const replaced = await hooks.resetLink(owner.email);
  await forgot('forgot, asked again', owner.email);
  const link = await hooks.resetLink(owner.email);
  await reset('reset, replaced', replaced);
  await reset('reset, a link that is not a reset link', 'opr_not-a-real-reset');
  await call('reset, a body the door does not read', 'POST', '/auth/reset', { token: link });
  await reset('reset, a password of 11 characters', link, short);
  await reset('reset', link);
  await reset('reset, used', link);
  await call('who is signed in, with the session from before the reset', 'GET', '/auth/me');
  await call('sign-in, with the password from before the reset', 'POST', '/auth/sign-in', { email: owner.email, password: owner.password });
  await call('sign-in, with the new password', 'POST', '/auth/sign-in', { email: owner.email, password: chosen });
  await forgot('forgot, once more', owner.email);
  const late = await hooks.resetLink(owner.email);
  await hooks.expire('reset', late);
  await reset('reset, expired', late);
  return state.out;
}

/** U7d-2: one answer of a door, for the answers only a platform set up to give them can give. */
export async function linkAnswer(base, { origin, path = '/auth/forgot', body = { email: 'owner-a@example.com' } }) {
  const res = await fetch(`${base}/api/v1${path}`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: JSON.parse(await res.text()) };
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
