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
 * Every answer, in order. `owner` is { email, password }; the first garage of
 * the owner must have lanes and stays inside. `origin` is the admin page's own.
 */
export async function record(base, { origin, owner, elsewhere = 'http://elsewhere.example' }) {
  let cookie = '';
  const out = [];
  let garage = null;
  async function call(what, method, path, body, headers = {}) {
    const res = await fetch(`${base}/api/v1${path.replace('{garage}', garage)}`, {
      method,
      headers: { origin, ...(cookie && { cookie }), ...(body !== undefined && { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0].endsWith('=') ? '' : setCookie.split(';')[0];
    const text = await res.text();
    const data = text === '' ? null : JSON.parse(text);
    const refusal = res.status >= 400;
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
  await call('sign-in, a wrong password', 'POST', '/auth/sign-in', { email: owner.email, password: 'wrong-on-purpose' });
  await call('sign-in, from a page at another address', 'POST', '/auth/sign-in', { email: owner.email, password: owner.password }, { origin: elsewhere });
  await call('sign-in, the password left empty', 'POST', '/auth/sign-in', { email: owner.email, password: '' });
  await call('sign-in', 'POST', '/auth/sign-in', { email: owner.email, password: owner.password });
  await call('who is signed in', 'GET', '/auth/me');
  garage = (await call('garages', 'GET', '/garages')).garages[0].id;
  await call('lanes', 'GET', '/garages/{garage}/lanes');
  await call('cars inside', 'GET', '/garages/{garage}/sessions/open');
  await call('lanes, a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/lanes`);
  await call('cars inside, a garage not theirs', 'GET', `/garages/${NOT_THEIRS}/sessions/open`);
  await call('sign-out, from a page at another address', 'POST', '/auth/sign-out', undefined, { origin: elsewhere });
  const kept = cookie;
  await call('sign-out', 'POST', '/auth/sign-out');
  cookie = kept;
  await call('who is signed in, with the cookie from before the sign-out', 'GET', '/auth/me');
  cookie = kept;
  await call('a read, with the cookie from before the sign-out', 'GET', '/garages');
  return out;
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
