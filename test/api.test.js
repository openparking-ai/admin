import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createClient, problemKey, STALE } from '../src/api.js';
import { translate } from '../src/i18n/index.js';

// A fetch that answers with what each test says, and records what was asked.
function fakeFetch(answer) {
  const asked = [];
  const fn = async (url, init) => {
    asked.push({ url, init });
    const a = typeof answer === 'function' ? answer(url, init) : answer;
    if (a instanceof Error) throw a;
    return { status: a.status, ok: a.status >= 200 && a.status < 300, text: async () => a.body };
  };
  return { fn, asked };
}
const json = (status, body) => ({ status, body: JSON.stringify(body) });

async function problemOf(promise) {
  try {
    await promise;
  } catch (p) {
    return p;
  }
  assert.fail('no problem was thrown');
}

const RAW = /[{}]|\b[1-5]\d\d\b|\b[a-z]+_[a-z_]+\b|JSON|Unexpected|Failed to fetch|TypeError/;

test('every failure the client can meet becomes words from the dictionaries, and nothing raw', async () => {
  const cases = [
    ['a refusal', json(401, { error: 'sign in refused', code: 'sign_in_refused' }), (c) => c.signIn('a@example.com', 'pw'), 'refused'],
    ['a session that ended', json(401, { error: 'x', code: 'session_ended' }), (c) => c.garages(), 'ended'],
    ['a body that is not JSON', { status: 502, body: '<html>502 Bad Gateway</html>' }, (c) => c.garages(), 'unexpected'],
    ['a dropped connection', new TypeError('Failed to fetch'), (c) => c.garages(), 'unreachable'],
    ['a code it does not know', json(409, { error: 'garage_frozen', code: 'garage_frozen' }), (c) => c.garages(), 'unexpected'],
    ['a 500', json(500, { error: 'internal error' }), (c) => c.garages(), 'unexpected'],
    ['a 200 that is not JSON', { status: 200, body: 'ok' }, (c) => c.garages(), 'unexpected'],
    ['a 200 of the wrong shape', json(200, { nope: true }), (c) => c.garages(), 'unexpected'],
  ];
  for (const [what, answer, call, kind] of cases) {
    const client = createClient({ fetch: fakeFetch(answer).fn });
    const problem = await problemOf(call(client));
    assert.equal(problem.kind, kind, what);
    assert.deepEqual(Object.keys(problem), ['kind'], `${what}: the problem carries nothing but its kind`);
    for (const language of ['en', 'es']) {
      const words = translate(language, problemKey(problem));
      assert.doesNotMatch(words, RAW, `${what} (${language}): "${words}"`);
    }
  }
});

test('requests are relative, same-origin, carry the cookie and never put anything in the address', async () => {
  const { fn, asked } = fakeFetch(json(200, { garages: [], lanes: [], sessions: [], email: 'a@example.com' }));
  const client = createClient({ fetch: fn });
  await client.signIn('a@example.com', 'the-password');
  await client.garages();
  await client.lanes('g/1?x');
  await client.carsInside('g1');
  for (const { url, init } of asked) {
    assert.match(url, /^\/api\/v1\//);
    assert.ok(!url.includes('?') && !url.includes('the-password') && !url.includes('example.com'), url);
    assert.equal(init.credentials, 'same-origin');
  }
  assert.equal(asked[2].url, '/api/v1/garages/g%2F1%3Fx/lanes');
  assert.deepEqual(JSON.parse(asked[0].init.body), { email: 'a@example.com', password: 'the-password' });
});

test('every 401 tells the screens; a signed-in owner turned away is told the session ended', async () => {
  let answer = json(200, { email: 'a@example.com' });
  const client = createClient({ fetch: fakeFetch(() => answer).fn });
  const heard = [];
  client.listen((kind) => heard.push(kind));
  await client.me();
  answer = json(401, { error: 'unknown or revoked operator token' });
  await problemOf(client.garages());
  assert.deepEqual(heard, ['ended']);
});

test('first load with no session is not "ended"; an ended one is', async () => {
  const plain = createClient({ fetch: fakeFetch(json(401, { error: 'operator token required' })).fn });
  const heardPlain = [];
  plain.listen((k) => heardPlain.push(k));
  assert.equal(await plain.me(), null);
  assert.deepEqual(heardPlain, [null]);

  const ended = createClient({ fetch: fakeFetch(json(401, { error: 'x', code: 'session_ended' })).fn });
  const heardEnded = [];
  ended.listen((k) => heardEnded.push(k));
  assert.equal(await ended.me(), null);
  assert.deepEqual(heardEnded, ['ended']);
});

test('an answer that arrives after a sign-out is thrown away, never handed to a screen', async () => {
  let release;
  const slow = new Promise((r) => (release = r));
  const client = createClient({
    fetch: async (url) => {
      if (url.endsWith('/garages')) await slow;
      return { status: 200, ok: true, text: async () => JSON.stringify({ garages: [{ id: 'a', name: 'A' }] }) };
    },
  });
  const pending = client.garages();
  await client.signOut();
  release();
  const problem = await problemOf(pending);
  assert.equal(problem.kind, STALE);
});

// Every answer the real sign-in route gives, as recorded from the platform
// (test/platform-shapes.json), and the words each one must show. A code the
// recording holds and this list does not is a failure: it would have no words.
const SIGN_IN_WORDS = {
  sign_in_refused: 'refused',
  sign_in_rate_limited: 'tooMany',
  sign_in_busy: 'busy',
  sign_in_not_configured: 'notSetUp',
  origin_refused: 'wrongPlace',
  sign_in_unreadable: 'incomplete',
};

test('every answer the real sign-in route gives has its own plain sentence, in both languages', async () => {
  const recorded = JSON.parse(readFileSync(new URL('./platform-shapes.json', import.meta.url), 'utf8'));
  const answers = [
    ...recorded.answers.filter((a) => a.what.startsWith('sign-in') && a.status >= 400),
    ...Object.values(recorded.sign_in_answers),
    // The route's own failure: 500 and nothing named (src/signIn.js, the error handler).
    { status: 500, body: { error: 'internal error' } },
  ];
  const seen = new Map();
  for (const { status, body } of answers) {
    const expected = body.code === undefined ? 'unexpected' : SIGN_IN_WORDS[body.code];
    assert.ok(expected, `the sign-in route answers ${status} "${body.code}", and no words are kept for it`);
    const client = createClient({ fetch: fakeFetch(json(status, body)).fn });
    const problem = await problemOf(client.signIn('a@example.com', 'pw'));
    assert.equal(problem.kind, expected, `${status} ${body.code ?? '(no code)'}`);
    for (const language of ['en', 'es']) {
      const words = translate(language, problemKey(problem));
      assert.doesNotMatch(words, RAW, `${expected} (${language}): "${words}"`);
      seen.set(`${language} ${expected}`, words);
    }
  }
  // Six answers and the route's own failure: seven different sentences in each language.
  for (const language of ['en', 'es']) {
    const sentences = [...seen].filter(([k]) => k.startsWith(`${language} `)).map(([, v]) => v);
    assert.equal(sentences.length, 7, `${language}: seven answers met`);
    assert.equal(new Set(sentences).size, 7, `${language}: each answer has its own sentence`);
  }
});
