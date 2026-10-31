import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linkAnswer, record, recordAccountLinks, recordAddGarage, recordBanned, recordRates, recordSpaces, recordStuck, signInAnswer } from './platform-shapes.js';
import { FILL_RULE, STAY_LIST, recordedPlans } from './rates-forms.js';
import { STUCK_LET_IN, startStub } from './stub-platform.js';

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
    // U6: what is around the platform, moved on the stand-in as the recording moved it on the platform.
    const hooks = {
      fresh: (garageId) => {
        Object.assign(stub.money(garageId), { account: null, place: null, connections: [] });
        for (const lane of stub.data.a.lanes[garageId]) lane.reader = null;
      },
      connect: (on) => stub.setConnect(on),
      engine: (on) => stub.setEngine(on),
      stripe: (on) => stub.setStripe(on),
      cards: (garageId, _account, side) => stub.setCards(garageId, side),
    };
    const answers = await record(stub.url, { origin: ORIGIN, owner: stub.data.a, hooks });
    assert.deepEqual(answers.map((a) => a.what), recorded.answers.map((a) => a.what));
    for (const [i, real] of recorded.answers.entries()) assert.deepEqual(answers[i], real, `the stand-in differs from the platform at "${real.what}"`);
  } finally {
    await stub.close();
  }
});

// U7c: a garage added, recorded from the platform apart from the answers above.
test('the stand-in adds a garage, and refuses one, as the platform does', async () => {
  const stub = await startStub();
  try {
    stub.allowOrigin(ORIGIN);
    const answers = await recordAddGarage(stub.url, { origin: ORIGIN, owner: stub.data.a });
    assert.deepEqual(answers.map((a) => a.what), recorded.add_garage_answers.map((a) => a.what));
    for (const [i, real] of recorded.add_garage_answers.entries()) assert.deepEqual(answers[i], real, `the stand-in differs from the platform at "${real.what}"`);
  } finally {
    await stub.close();
  }
});

// U7d-2: the four doors behind an emailed link, recorded from the platform apart from the answers above.
test('the stand-in answers the tailgater settings and the banned cars as the platform does (U7f)', async () => {
  const stub = await startStub();
  try {
    stub.allowOrigin(ORIGIN);
    const hooks = { fresh: (garageId) => stub.freshBans(garageId), tailgater: (garageId) => stub.listTailgater(garageId) };
    const answers = await recordBanned(stub.url, { origin: ORIGIN, owner: stub.data.a, hooks });
    assert.deepEqual(answers.map((a) => a.what), recorded.banned_answers.map((a) => a.what));
    for (const [i, real] of recorded.banned_answers.entries()) assert.deepEqual(answers[i], real, `the stand-in differs from the platform at "${real.what}"`);
  } finally {
    await stub.close();
  }
});

test('the stand-in answers an invite, a forgotten password and a reset as the platform does', async () => {
  const stub = await startStub();
  try {
    stub.allowOrigin(ORIGIN);
    const hooks = {
      invite: (email, language) => stub.invite(email, { language }),
      resend: (email) => stub.resendInvite(email),
      expire: (_kind, token) => stub.expireLink(token),
      adminOnTenantOf: (token, email) => stub.adminOnTenantOf(token, email),
      adminElsewhere: (email) => stub.adminElsewhere(email),
      resetLink: (email) => stub.sent().filter((m) => m.to === email && m.kind === 'reset').at(-1).token,
    };
    // A copy: a reset changes the stand-in's own owner, and the recorder signs in with the password from before it.
    const answers = await recordAccountLinks(stub.url, { origin: ORIGIN, owner: { ...stub.data.a }, hooks });
    assert.deepEqual(answers.map((a) => a.what), recorded.account_links_answers.map((a) => a.what));
    for (const [i, real] of recorded.account_links_answers.entries()) assert.deepEqual(answers[i], real, `the stand-in differs from the platform at "${real.what}"`);
  } finally {
    await stub.close();
  }
});

test('the stand-in can give the door answers only a platform set up for them gives', async () => {
  const stub = await startStub();
  try {
    stub.allowOrigin(ORIGIN);
    const kinds = { 'too many tries from here': 'tooMany', busy: 'busy', 'not set up': 'notSetUp' };
    for (const [what, real] of Object.entries(recorded.link_answers)) {
      const kind = Object.entries(kinds).find(([k]) => what.startsWith(k))?.[1];
      assert.ok(kind, `no stand-in answer for "${what}"`);
      stub.failLink(kind);
      assert.deepEqual(await linkAnswer(stub.url, { origin: ORIGIN }), real, what);
    }
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

// U7g: rates, trying a stay, saving with the confirmation, and the Open button,
// recorded from the platform with the rate engine at its pin apart from the answers above.
test('the stand-in answers the rates, the try and the Open button as the platform does (U7g)', async () => {
  const stub = await startStub();
  try {
    stub.allowOrigin(ORIGIN);
    const answers = await recordRates(stub.url, { origin: ORIGIN, owner: stub.data.a, plans: recordedPlans(), stays: STAY_LIST, rest: async () => stub.forgetTries() });
    assert.deepEqual(answers.map((a) => a.what), recorded.rates_answers.map((a) => a.what));
    for (const [i, real] of recorded.rates_answers.entries()) assert.deepEqual(answers[i], real, `the stand-in differs from the platform at "${real.what}"`);
  } finally {
    await stub.close();
  }
});

// The fill rule (platform 0034): the number of spaces and rates with a fill rule, recorded from the platform apart from the answers above.
test('the stand-in answers the number of spaces and rates with a fill rule as the platform does', async () => {
  const stub = await startStub();
  try {
    stub.allowOrigin(ORIGIN);
    const answers = await recordSpaces(stub.url, { origin: ORIGIN, owner: stub.data.a, plans: recordedPlans(), fill: FILL_RULE });
    assert.deepEqual(answers.map((a) => a.what), recorded.spaces_answers.map((a) => a.what));
    for (const [i, real] of recorded.spaces_answers.entries()) assert.deepEqual(answers[i], real, `the stand-in differs from the platform at "${real.what}"`);
  } finally {
    await stub.close();
  }
});

// Platform 0043: the stuck stays, recorded from the platform's demo garage, which had no stay of its
// own and rates in force before the cars came in; the stand-in's first garage is made the same.
test('the stand-in answers the stuck stays, the garage hours and a stay ended as the platform does', async () => {
  const stub = await startStub();
  try {
    stub.allowOrigin(ORIGIN);
    const garageId = stub.data.a.garages[0].id;
    stub.data.a.open[garageId] = [];
    stub.storeRates(garageId, recordedPlans('2020-01-01T00:00:00.000Z').regular);
    const cars = [];
    const hooks = {
      stays: async (g) => STUCK_LET_IN.forEach((car) => cars.push(stub.letIn(g, car))),
      // Platform 0045: the exit lane's case on the car of an hour ago, with no payment.
      atExit: async () => {
        stub.carAtExit(cars.at(-1).id);
        return cars.at(-1).id;
      },
    };
    const answers = await recordStuck(stub.url, { origin: ORIGIN, owner: stub.data.a, hooks });
    assert.deepEqual(answers.map((a) => a.what), recorded.stuck_answers.map((a) => a.what));
    for (const [i, real] of recorded.stuck_answers.entries()) assert.deepEqual(answers[i], real, `the stand-in differs from the platform at "${real.what}"`);
  } finally {
    await stub.close();
  }
});
