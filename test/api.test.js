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
    ['a body that is not JSON', { status: 500, body: '<html>500 Internal Server Error</html>' }, (c) => c.garages(), 'unexpected'],
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

// Between the page and the platform there is a gateway: the development
// proxy, or whatever a garage serves the site behind. When it cannot reach
// the platform it answers for it, with a 502, 503 or 504 and a body that is
// not the platform's. That is "cannot be reached", as much as no answer at
// all. The platform's own answers keep their own words.
test('a gateway answering for a platform it cannot reach: the platform cannot be reached', async () => {
  const cases = [
    ['a 502 with a page of its own', { status: 502, body: '<html><body>502 Bad Gateway</body></html>' }, 'unreachable'],
    ['a 502 with no body', { status: 502, body: '' }, 'unreachable'],
    ['a 503 with no body', { status: 503, body: '' }, 'unreachable'],
    ['a 504 with a line of text', { status: 504, body: 'Gateway Timeout' }, 'unreachable'],
    ["the platform's own busy", json(503, { error: 'sign-in is busy, try again shortly', code: 'sign_in_busy' }), 'busy'],
    ["the platform's own 500", json(500, { error: 'internal error' }), 'unexpected'],
    ['a 500 that is not JSON', { status: 500, body: '<html>500</html>' }, 'unexpected'],
    ["a 503 of the platform's, not named", json(503, { error: 'x' }), 'unexpected'],
  ];
  // Every case is tried and every wrong one named, not only the first.
  const wrong = [];
  for (const [what, answer, kind] of cases) {
    for (const [call, how] of [[(c) => c.signIn('a@example.com', 'pw'), 'signing in'], [(c) => c.garages(), 'a read']]) {
      if (kind === 'busy' && how === 'a read') continue;
      const problem = await problemOf(call(createClient({ fetch: fakeFetch(answer).fn })));
      if (problem.kind !== kind) wrong.push(`${what}, ${how}: ${problem.kind}, not ${kind}`);
    }
  }
  assert.equal(wrong.length, 0, wrong.join('; '));
});

test('requests are relative, same-origin, carry the cookie and never put anything in the address', async () => {
  const { fn, asked } = fakeFetch(json(200, { garages: [], lanes: [], quiet_minutes: 5, screen: SCREEN, sessions: [], email: 'a@example.com' }));
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

const SCREEN = { characters: " !'+,-./0123456789:?ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÑÓÚÜ", message_max: 160 };

test("the lanes come with the platform's quiet setting and what the screens can show, and an answer without either is not taken", async () => {
  const read = (body) => createClient({ fetch: fakeFetch(json(200, body)).fn }).lanes('g1');
  assert.deepEqual(await read({ lanes: [], quiet_minutes: 30, screen: SCREEN }), { lanes: [], quietMinutes: 30, screen: { characters: SCREEN.characters, messageMax: 160 } });
  for (const quiet of [undefined, 0, '5', 2.5, null]) {
    assert.equal((await problemOf(read({ lanes: [], quiet_minutes: quiet, screen: SCREEN }))).kind, 'unexpected', JSON.stringify(quiet));
  }
  for (const screen of [undefined, null, {}, { characters: '', message_max: 160 }, { characters: 'AB', message_max: '160' }]) {
    assert.equal((await problemOf(read({ lanes: [], quiet_minutes: 5, screen }))).kind, 'unexpected', JSON.stringify(screen));
  }
});

test('a message refused for a character the screen cannot show is its own problem; other refusals of the board by name', async () => {
  const client = (status, body) => createClient({ fetch: fakeFetch(json(status, body)).fn });
  const chars = { error: 'x', code: 'lane_message_refused', details: { characters: ['€'] } };
  assert.equal((await problemOf(client(400, chars).closeLane('l1', { reason: 'full', message: '€' }))).kind, 'screenCharacters');
  assert.equal((await problemOf(client(400, { ...chars, code: 'board_text_refused' }).addBoardMessage('g1', {}))).kind, 'screenCharacters');
  assert.equal((await problemOf(client(400, { error: 'x', code: 'lane_message_refused' }).closeLane('l1', { reason: 'full', message: '' }))).kind, 'laneMessage');
  for (const [status, code, kind] of [[400, 'lane_reason_refused', 'laneReason'], [400, 'board_lanes_refused', 'boardLanes'], [400, 'board_time_refused', 'boardTime'], [400, 'board_text_refused', 'boardText'], [409, 'board_messages_full', 'boardFull'], [404, 'board_message_not_found', 'notFound']]) {
    assert.equal((await problemOf(client(status, { error: 'x', code }).addBoardMessage('g1', {}))).kind, kind, code);
  }
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

test('the language is kept with one PUT of {"language"}: relative, same-origin, nothing in the address', async () => {
  const { fn, asked } = fakeFetch(json(200, { language: 'es' }));
  const client = createClient({ fetch: fn });
  assert.deepEqual(await client.setLanguage('es'), { language: 'es' });
  assert.equal(asked.length, 1);
  assert.equal(asked[0].url, '/api/v1/auth/language');
  assert.equal(asked[0].init.method, 'PUT');
  assert.equal(asked[0].init.credentials, 'same-origin');
  assert.equal(asked[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(asked[0].init.body), { language: 'es' });
});

test('a language save that fails: a kind with words, nothing raw; a 401 sends the owner to sign in', async () => {
  const recorded = JSON.parse(readFileSync(new URL('./platform-shapes.json', import.meta.url), 'utf8'));
  const refusals = recorded.answers.filter((a) => a.what.startsWith('language') && a.status >= 400);
  assert.ok(refusals.length >= 4, 'the recording holds the language refusals');
  const cases = [
    ...refusals.filter((a) => a.status !== 401).map((a) => [a.what, json(a.status, a.body), a.status === 403 ? 'wrongPlace' : 'unexpected']),
    ['the platform stopped', new TypeError('Failed to fetch'), 'unreachable'],
    ['a gateway answering for it', { status: 502, body: '<html>502 Bad Gateway</html>' }, 'unreachable'],
    ['a 500', json(500, { error: 'internal error' }), 'unexpected'],
  ];
  for (const [what, answer, kind] of cases) {
    const problem = await problemOf(createClient({ fetch: fakeFetch(answer).fn }).setLanguage('es'));
    assert.equal(problem.kind, kind, what);
    for (const language of ['en', 'es']) assert.doesNotMatch(translate(language, problemKey(problem)), RAW, what);
  }
  for (const a of refusals.filter((r) => r.status === 401)) {
    let answer = json(200, { email: 'a@example.com', language: 'en' });
    const client = createClient({ fetch: fakeFetch(() => answer).fn });
    const heard = [];
    client.listen((k) => heard.push(k));
    await client.me();
    answer = json(a.status, a.body);
    assert.equal((await problemOf(client.setLanguage('es'))).kind, 'ended', a.what);
    assert.deepEqual(heard, ['ended'], `${a.what}: the screens were told`);
  }
});

// U6: every refusal the routes of Taxes and fees, Getting paid and Card readers
// give, each its own plain sentence and never the platform's own words: as
// recorded from the platform (test/platform-shapes.json), and the two no
// platform can be brought to give in a recording (two accounts naming one
// garage, a reader bound to another lane), as the stand-in gives them in the
// platform's words (src/stripeAccount.js, src/terminal.js).
const U6_KIND = {
  tax_set_effective_from_taken: 'taxStartTaken', tax_set_not_storable: 'taxNotKept', rate_engine_unavailable: 'taxNotChecked',
  connect_not_configured: 'cardsNotSetUp', garage_not_found: 'garageNotFound', bad_country: 'countryRefused', stripe_refused: 'stripeRefused',
  stripe_unreachable: 'stripeUnreachable', stripe_account_ambiguous: 'accountTwice', no_stripe_account: 'noAccount',
  card_payments_not_active: 'cardsNotActive', bad_location: 'placeRefused', no_terminal_location: 'noPlace', bad_reader: 'readerRefused',
  lane_has_reader: 'laneHasReader', reader_bound_elsewhere: 'readerElsewhere', no_reader_bound: 'noReader', lane_not_found: 'notFound',
};
/** The client's call for a recorded answer, by what it was. */
function u6Call(what) {
  const post = !/^(taxes|payment account|readers place|card readers)(, (of a garage not theirs|none yet|with Stripe Connect not set up))?$/.test(what) && !/^card readers/.test(what);
  if (what.startsWith('taxes')) return post ? (c) => c.addTaxList('g', { effective_from: 'x', rules: [] }) : (c) => c.taxLists('g');
  if (what.startsWith("Stripe's page")) return (c) => c.stripePage('g');
  if (what.startsWith('payment account, checked')) return (c) => c.checkPaymentAccount('g');
  if (what.startsWith('payment account')) return post ? (c) => c.makePaymentAccount('g', 'US') : (c) => c.paymentAccount('g');
  if (what.startsWith('readers place')) return post ? (c) => c.setReaderPlace('g', {}) : (c) => c.readerPlace('g');
  if (what.startsWith('card readers')) return (c) => c.readerConnections('g');
  if (/disconnected/.test(what)) return (c) => c.disconnectReader('l');
  if (what.startsWith('a card reader')) return (c) => c.connectReader('l', 'code', 'name');
  return null;
}

test('U6 every refusal of taxes, the payment account and card readers has its own plain sentence, and the platform\'s words never reach one', async () => {
  const recorded = JSON.parse(readFileSync(new URL('./platform-shapes.json', import.meta.url), 'utf8')).answers;
  const from = recorded.findIndex((a) => a.what === 'taxes, a new list');
  const to = recorded.findIndex((a) => a.what === 'changes, after the card reader');
  assert.ok(from > 0 && to > from, 'the recording holds the U6 answers');
  const refusals = recorded.slice(from, to).filter((a) => a.status >= 400);
  const { startStub } = await import('./stub-platform.js');
  const stub = await startStub();
  const fromStandIn = stub.moneyRefusals();
  await stub.close();
  const cases = [
    ...refusals.map((a) => [a.what, a.status, a.body, u6Call(a.what)]),
    ['two accounts naming one garage', ...fromStandIn.stripe_account_ambiguous, (c) => c.makePaymentAccount('g', 'US')],
    ['a reader bound to another lane', ...fromStandIn.reader_bound_elsewhere, (c) => c.connectReader('l', 'code', 'name')],
  ];
  const seen = new Set();
  for (const [what, status, body, call] of cases) {
    assert.ok(call, `no client call for "${what}"`);
    const want = body.code === undefined ? { 400: 'taxListRefused', 404: 'garageNotFound' }[status] : U6_KIND[body.code];
    assert.ok(want, `"${what}": ${status} ${body.code ?? '(no code)'} has no words kept for it`);
    const problem = await problemOf(call(createClient({ fetch: fakeFetch(json(status, body)).fn })));
    assert.equal(problem.kind, want, `"${what}"`);
    for (const language of ['en', 'es']) {
      const words = translate(language, problemKey(problem));
      assert.doesNotMatch(words, RAW, `${what} (${language}): "${words}"`);
      assert.ok(!words.includes(body.error), `${what} (${language}): the platform's own words`);
      assert.notEqual(words, translate(language, 'problem.unexpected'), `${what} (${language}): said as "something went wrong"`);
    }
    seen.add(want);
  }
  // Every refusal the brief names, taken from the platform's source, was met here.
  for (const kind of ['taxListRefused', 'taxStartTaken', 'taxNotKept', 'taxNotChecked', 'garageNotFound', 'cardsNotSetUp', 'countryRefused', 'stripeRefused', 'stripeUnreachable', 'accountTwice', 'noAccount', 'cardsNotActive', 'placeRefused', 'noPlace', 'readerRefused', 'laneHasReader', 'readerElsewhere', 'noReader', 'notFound']) {
    assert.ok(seen.has(kind), `no refusal met for ${kind}`);
  }
});

test('"cannot be reached" and "give a phone number or an email" are two sentences, each shown where it belongs', async () => {
  const stopped = await problemOf(createClient({ fetch: fakeFetch(new TypeError('Failed to fetch')).fn }).garages());
  const noWay = await problemOf(createClient({ fetch: fakeFetch(json(400, { error: 'a person needs a phone number, an email address, or both', code: 'alert_contact_unreachable' })).fn }).addPerson('g', { name: 'A' }));
  assert.equal(stopped.kind, 'unreachable');
  assert.equal(noWay.kind, 'contactUnreachable');
  for (const [language, reached, phoneOrEmail] of [['en', /cannot be reached/, /phone number, an email address/], ['es', /No se puede comunicar/, /teléfono, un correo/]]) {
    assert.match(translate(language, problemKey(stopped)), reached, `${language}: the platform stopped`);
    assert.match(translate(language, problemKey(noWay)), phoneOrEmail, `${language}: a person with no way to reach them`);
  }
});

test('U6 the onboarding link: only an address of the web, opened and never kept', async () => {
  const link = (url) => json(201, { onboarding_link: { url, expires_at: null } });
  assert.equal(await createClient({ fetch: fakeFetch(link('https://connect.stripe.com/setup/s/x')).fn }).stripePage('g'), 'https://connect.stripe.com/setup/s/x');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 7]) {
    assert.equal((await problemOf(createClient({ fetch: fakeFetch(link(bad)).fn }).stripePage('g'))).kind, 'unexpected', String(bad));
  }
});
