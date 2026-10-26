// Passkeys: the browser's conversions (src/passkeys.js) and the client's steps (src/api.js).
// The platform's options go in as JSON and the browser's answer comes out as JSON, every
// binary field base64url; the challenge's id goes back with it; every refusal is words.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, problemKey } from '../src/api.js';
import { translate } from '../src/i18n/index.js';
import { answerJson, askForPasskey, creationOptions, fromBase64url, makePasskey, passkeysHere, requestOptions, toBase64url } from '../src/passkeys.js';

function fakeFetch(answer) {
  const asked = [];
  const fn = async (url, init) => {
    asked.push({ url, init, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const a = answer(url, init, asked.length);
    return { status: a.status, ok: a.status >= 200 && a.status < 300, text: async () => (a.body === undefined ? '' : JSON.stringify(a.body)) };
  };
  return { fn, asked };
}
async function problemOf(promise) {
  try {
    await promise;
  } catch (p) {
    return p;
  }
  return assert.fail('no problem was thrown');
}
const buf = (...b) => new Uint8Array(b).buffer;
const same = (a, b) => assert.deepEqual([...new Uint8Array(a)], [...new Uint8Array(b)]);

test('base64url both ways, at every length, and nothing else read as it', () => {
  for (let n = 0; n < 40; n += 1) {
    const bytes = new Uint8Array(n).map((_, i) => (i * 37 + n) % 256);
    const text = toBase64url(bytes);
    assert.match(text, /^[A-Za-z0-9_-]*$/);
    same(fromBase64url(text), bytes.buffer);
  }
  assert.equal(toBase64url(buf(251, 255, 191)), '-_-_');
  for (const bad of ['a+b', 'a/b', 'ab==', 'a', 'é', 42, null, undefined]) assert.equal(fromBase64url(bad), null, String(bad));
});

test("the platform's options, made what the browser takes", () => {
  const get = requestOptions({ challenge: 'AQID', rpId: 'example.com', allowCredentials: [{ id: 'BAU', type: 'public-key' }], userVerification: 'preferred' });
  same(get.challenge, buf(1, 2, 3));
  same(get.allowCredentials[0].id, buf(4, 5));
  assert.equal(get.rpId, 'example.com');
  assert.equal(requestOptions({ challenge: 'AQID' }).allowCredentials, undefined);

  const create = creationOptions({ challenge: 'AQID', rp: { name: 'x', id: 'example.com' }, user: { id: 'Bgc', name: 'o@example.com', displayName: 'o' }, excludeCredentials: [{ id: 'CA', type: 'public-key' }] });
  same(create.challenge, buf(1, 2, 3));
  same(create.user.id, buf(6, 7));
  assert.equal(create.user.name, 'o@example.com');
  same(create.excludeCredentials[0].id, buf(8));

  for (const bad of [null, {}, { challenge: 'a+b' }, { challenge: 'AQID', allowCredentials: [{ id: '+' }] }]) {
    assert.equal(problemOfSync(() => requestOptions(bad)), 'unexpected');
  }
  assert.equal(problemOfSync(() => creationOptions({ challenge: 'AQID' })), 'unexpected');
});
function problemOfSync(fn) {
  try {
    fn();
  } catch (p) {
    return p.kind;
  }
  return null;
}

const assertion = {
  id: 'Y3JlZA', rawId: buf(99, 114, 101, 100), type: 'public-key', authenticatorAttachment: 'platform',
  response: { clientDataJSON: buf(1), authenticatorData: buf(2), signature: buf(3), userHandle: buf(4) },
  getClientExtensionResults: () => ({}),
};
const attestation = {
  id: 'Y3JlZA', rawId: buf(99, 114, 101, 100), type: 'public-key',
  response: { clientDataJSON: buf(1), attestationObject: buf(5), getTransports: () => ['internal'] },
  getClientExtensionResults: () => ({}),
};

test("the browser's answer, as the platform reads it", () => {
  assert.deepEqual(answerJson(assertion), {
    id: 'Y3JlZA', rawId: 'Y3JlZA', type: 'public-key', authenticatorAttachment: 'platform',
    response: { clientDataJSON: 'AQ', authenticatorData: 'Ag', signature: 'Aw', userHandle: 'BA' }, clientExtensionResults: {},
  });
  assert.deepEqual(answerJson(attestation), {
    id: 'Y3JlZA', rawId: 'Y3JlZA', type: 'public-key',
    response: { clientDataJSON: 'AQ', attestationObject: 'BQ', transports: ['internal'] }, clientExtensionResults: {},
  });
});

test("the browser's window: closed is 'no passkey used', anything else a refusal, never raw", async () => {
  const options = { challenge: 'AQID', user: { id: 'Bgc', name: 'n', displayName: 'n' } };
  const failing = (name) => ({ get: async () => { throw Object.assign(new Error('raw words'), { name }); }, create: async () => { throw Object.assign(new Error('raw words'), { name }); } });
  assert.equal((await problemOf(askForPasskey(options, failing('NotAllowedError')))).kind, 'passkeyStopped');
  assert.equal((await problemOf(askForPasskey(options, failing('AbortError')))).kind, 'passkeyStopped');
  assert.equal((await problemOf(askForPasskey(options, failing('SecurityError')))).kind, 'passkeyRefused');
  assert.equal((await problemOf(makePasskey(options, failing('InvalidStateError')))).kind, 'passkeyNotAdded');
  assert.equal((await problemOf(askForPasskey(options, { get: async () => null }))).kind, 'passkeyStopped');
  let given;
  const answered = await askForPasskey(options, { get: async (o) => ((given = o), assertion) });
  same(given.publicKey.challenge, buf(1, 2, 3));
  assert.equal(answered.response.signature, 'Aw');
  assert.equal(passkeysHere({}), false);
  assert.equal(passkeysHere({ PublicKeyCredential: function PublicKeyCredential() {}, navigator: { credentials: { get() {} } } }), true);
});

test('signing in with a passkey: the options, the answer to them, and the challenge id sent back', async () => {
  const { fn, asked } = fakeFetch((url) =>
    url.endsWith('/passkey/options')
      ? { status: 200, body: { challenge_id: 'c1', options: { challenge: 'AQID' } } }
      : url.endsWith('/auth/me')
        ? { status: 200, body: { kind: 'linked', email: 'p@example.com', language: 'es', permissions: ['lanes:read'], garages: ['g1'] } }
        : { status: 200, body: { email: 'p@example.com', tenant_id: 't', session_ends_at: '2030-01-01T00:00:00Z', language: 'es' } },
  );
  const client = createClient({ fetch: fn });
  let seen;
  const who = await client.passkeySignIn(async (options) => ((seen = options), { id: 'cred', response: {} }));
  assert.deepEqual(seen, { challenge: 'AQID' });
  // The sign-in's answer, then /auth/me's: what the person may open is known before any screen draws.
  assert.equal(who.language, 'es');
  assert.equal(who.session_ends_at, '2030-01-01T00:00:00Z');
  assert.deepEqual(who.permissions, ['lanes:read']);
  assert.deepEqual(asked.map((a) => [a.init.method, a.url]), [['POST', '/api/v1/auth/passkey/options'], ['POST', '/api/v1/auth/passkey/sign-in'], ['GET', '/api/v1/auth/me']]);
  assert.deepEqual(asked[1].body, { challenge_id: 'c1', response: { id: 'cred', response: {} } });
  for (const a of asked) assert.equal(a.init.credentials, 'same-origin');
});

test('every passkey refusal, and the new refusals of every route, become their own words', async () => {
  const cases = [
    ['a passkey refused', 401, 'passkey_refused', 'passkeyRefused', (c) => c.passkeySignIn(async () => ({}))],
    ['passkeys not set up', 409, 'passkeys_not_configured', 'passkeysOff', (c) => c.passkeySignIn(async () => ({}))],
    ['the accounts module could not decide', 503, 'sign_in_undecided', 'undecided', (c) => c.signIn('p@example.com', 'pw')],
    ['the accounts module could not decide, signed in', 503, 'accounts_undecided', 'undecided', (c) => c.garages()],
    ['a permission refused', 403, 'permission_refused', 'notAllowed', (c) => c.lanes('g1')],
    ['a challenge ended', 409, 'passkey_challenge_ended', 'passkeyEnded', (c) => c.renamePasskey('k', 'n')],
    ['not added', 400, 'passkey_not_added', 'passkeyNotAdded', (c) => c.renamePasskey('k', 'n')],
    ['known', 409, 'passkey_known', 'passkeyKnown', (c) => c.renamePasskey('k', 'n')],
    ['full', 409, 'passkeys_full', 'passkeysFull', (c) => c.renamePasskey('k', 'n')],
    ['a name refused', 400, 'passkey_name_refused', 'passkeyName', (c) => c.renamePasskey('k', 'n')],
    ['kept elsewhere', 409, 'passkeys_elsewhere', 'passkeysElsewhere', (c) => c.passkeys()],
    ['not found', 404, 'passkey_not_found', 'notFound', (c) => c.removePasskey('k')],
    ['busy', 503, 'passkeys_busy', 'busy', (c) => c.passkeySignIn(async () => ({}))],
  ];
  for (const [what, status, code, kind, call] of cases) {
    const client = createClient({ fetch: fakeFetch(() => ({ status, body: { error: 'raw words', code } })).fn });
    const problem = await problemOf(call(client));
    assert.equal(problem.kind, kind, what);
    for (const language of ['en', 'es']) assert.notEqual(translate(language, problemKey(problem)), problemKey(problem), `${what} (${language})`);
  }
});

test("the browser's own refusal stops the sign-in before the second step", async () => {
  const { fn, asked } = fakeFetch(() => ({ status: 200, body: { challenge_id: 'c1', options: { challenge: 'AQID' } } }));
  const client = createClient({ fetch: fn });
  const problem = await problemOf(client.passkeySignIn(() => askForPasskey({ challenge: 'AQID' }, { get: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } })));
  assert.equal(problem.kind, 'passkeyStopped');
  assert.equal(asked.length, 1);
});

test("the admin's passkeys: listed, added with the challenge id, renamed and removed with the id in the body", async () => {
  const { fn, asked } = fakeFetch((url) => {
    if (url.endsWith('/passkeys/options')) return { status: 200, body: { challenge_id: 'c2', options: { challenge: 'AQID', user: { id: 'Bgc' } } } };
    if (url.endsWith('/passkeys/remove')) return { status: 204 };
    if (url.endsWith('/passkeys') && asked.at(-1).init.method === 'GET') return { status: 200, body: { passkeys: [{ id: 'k1', name: 'Laptop' }] } };
    return { status: url.endsWith('/rename') ? 200 : 201, body: { passkey: { id: 'k1', name: 'Phone' } } };
  });
  const client = createClient({ fetch: fn });
  assert.deepEqual(await client.passkeys(), [{ id: 'k1', name: 'Laptop' }]);
  assert.deepEqual(await client.addPasskey('Phone', async () => ({ id: 'new' })), { id: 'k1', name: 'Phone' });
  await client.renamePasskey('k1', 'Phone');
  await client.removePasskey('k1');
  assert.deepEqual(asked.map((a) => [a.init.method, a.url, a.body]), [
    ['GET', '/api/v1/auth/passkeys', undefined],
    ['POST', '/api/v1/auth/passkeys/options', undefined],
    ['POST', '/api/v1/auth/passkeys', { challenge_id: 'c2', name: 'Phone', response: { id: 'new' } }],
    ['POST', '/api/v1/auth/passkeys/rename', { id: 'k1', name: 'Phone' }],
    ['POST', '/api/v1/auth/passkeys/remove', { id: 'k1' }],
  ]);
  // No passkey's id is ever in an address.
  for (const a of asked) assert.doesNotMatch(a.url, /k1|c2/);
});

test('a password sign-in learns what the person may open from /auth/me; if that read fails, the sign-in still holds', async () => {
  const signedIn = { email: 'p@example.com', tenant_id: 't', session_ends_at: '2030-01-01T00:00:00Z', language: 'en' };
  const me = { kind: 'linked', email: 'p@example.com', language: 'en', permissions: ['garages:read'], garages: 'all' };
  const ok = createClient({ fetch: fakeFetch((url) => ({ status: 200, body: url.endsWith('/auth/me') ? me : signedIn })).fn });
  assert.deepEqual((await ok.signIn('p@example.com', 'pw')).permissions, ['garages:read']);
  const failing = createClient({ fetch: fakeFetch((url) => (url.endsWith('/auth/me') ? { status: 503, body: { error: 'x', code: 'accounts_undecided' } } : { status: 200, body: signedIn })).fn });
  assert.deepEqual(await failing.signIn('p@example.com', 'pw'), signedIn);
});

test('an options answer without its challenge id is refused before the browser is asked', async () => {
  const client = createClient({ fetch: fakeFetch(() => ({ status: 200, body: { options: { challenge: 'AQID' } } })).fn });
  let asked = false;
  const problem = await problemOf(client.passkeySignIn(async () => ((asked = true), {})));
  assert.equal(problem.kind, 'unexpected');
  assert.equal(asked, false);
});
