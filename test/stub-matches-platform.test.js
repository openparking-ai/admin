import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { record, signInAnswer } from './platform-shapes.js';
import { startStub } from './stub-platform.js';

// The stand-in the checks run against answers as the real platform does: the
// same statuses, the same refusals word for word, the same shapes and the
// same cookie. test/platform-shapes.json was recorded from the platform (its
// header says which commit); this records the stand-in the same way.

const recorded = JSON.parse(readFileSync(new URL('./platform-shapes.json', import.meta.url), 'utf8'));
const ORIGIN = 'http://admin.example';

test('the stand-in answers every call and refusal the screens meet as the platform does', async () => {
  const stub = await startStub();
  try {
    stub.allowOrigin(ORIGIN);
    const answers = await record(stub.url, { origin: ORIGIN, owner: stub.data.a });
    assert.deepEqual(answers.map((a) => a.what), recorded.answers.map((a) => a.what));
    for (const [i, real] of recorded.answers.entries()) assert.deepEqual(answers[i], real, `the stand-in differs from the platform at "${real.what}"`);
  } finally {
    await stub.close();
  }
});

test('the stand-in can give the sign-in answers only a platform set up for them gives', async () => {
  const stub = await startStub();
  try {
    stub.allowOrigin(ORIGIN);
    assert.equal(typeof stub.failSignIn, 'function', 'the stand-in has no way to give them');
    const kinds = { 'too many tries from here': 'tooMany', busy: 'busy', 'not set up': 'notSetUp' };
    for (const [what, real] of Object.entries(recorded.sign_in_answers)) {
      const kind = Object.entries(kinds).find(([k]) => what.startsWith(k))?.[1];
      assert.ok(kind, `no stand-in answer for "${what}"`);
      stub.failSignIn(kind);
      assert.deepEqual(await signInAnswer(stub.url, { origin: ORIGIN, owner: stub.data.a }), real, what);
    }
  } finally {
    await stub.close();
  }
});
