#!/usr/bin/env node
// Platform 0048 (and #90): record what the platform answers the Exceptions
// page into test/platform-shapes.json (`exceptions_answers`).
//
// The record of a car let out holds what only a real exit makes: a card
// declined at the reader, the reader gone offline, the lane's own events,
// the payment canceled by the let-out, the gate agent's messages and calls
// copied, the lane's pictures, the sweep that finishes the record and the
// retention purge that blanks a copy. So this starts the
// platform itself, from a checkout of it (PLATFORM_DIR, with its npm
// packages), on its own test harness: the rate engine at its pin, its Stripe
// stand-in (no Stripe account or key), its gate-agent stand-in, an owner
// made with its createAdmin, and a database prepared and migrated as its
// README says:
//
//   PLATFORM_DIR=<platform checkout> APP_DATABASE_URL=... (and the rest of the
//   platform's test environment) ORIGIN=http://admin.example \
//   RECORDED_FROM='<the header words>' [WHOLE_TO=<a file outside this repository>] \
//   node test/record-exceptions.js
//
// WHOLE_TO keeps each story as answered (values and all), to build the
// stand-in's from; it is never written into this repository. Every address
// and name here is invented.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { recordExceptions } from './platform-shapes.js';

const { PLATFORM_DIR, ORIGIN = 'http://admin.example', RECORDED_FROM, WHOLE_TO } = process.env;
if (!PLATFORM_DIR || !RECORDED_FROM || !process.env.APP_DATABASE_URL) {
  console.error('PLATFORM_DIR, APP_DATABASE_URL and RECORDED_FROM are required');
  process.exit(1);
}
// The owner signs in from this page's address, over plain http on this computer.
process.env.ADMIN_ORIGIN = ORIGIN;
process.env.SESSION_COOKIE_INSECURE = 'true';

const from = (path) => import(pathToFileURL(join(PLATFORM_DIR, path)).href);
const H = await from('test/exit-harness.js');
const { startGateAgentStub } = await from('test/gate-agent-stub.js');
const { createAdmin } = await from('src/adminAccount.js');
const exceptions = await from('src/exceptions.js');
const { pool, withTenant } = await from('src/db.js');

const MINUTE = 60_000;
// One picture, as a lane sends one: a PNG of one pixel.
const PICTURE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const at = (ms) => new Date(Date.now() + ms).toISOString();
const hex32 = () => randomBytes(16).toString('hex');
const TOKEN = `gate-agent-recording-${hex32()}`;

/** A delivery attempt as the gate agent keeps one. */
const attempt = (when, result, over = {}) => ({
  at: when, result, reply_code: null, reply: null, http_status: null, reason: null, refused_recipients: [], transient: result === 'failed' ? true : null, ...over,
});
/** One sink's delivery of a message. */
const delivery = (sink, kind, recipients, state, attempts, over = {}) => ({
  sink, kind, recipients, recipient_configured: recipients.length > 0, state,
  sent_at: attempts[0]?.at ?? null,
  delivered_at: state === 'delivered' ? attempts.at(-1).at : null,
  next_attempt_at: null, attempts,
  acknowledgement: 'not_acknowledged', acknowledged_at: null, acknowledged_by: null, superseded_by: null, ...over,
});
/** A message record as the gate agent's monitor keeps one (its contract, version 2). */
const messageRecord = ({ lane = 'lane-1', when, code, subject = null, transition = 'raised', origin = 'target', target = 'lane', deliveries, revision, cleared = null }) => ({
  record_id: `m-${hex32()}`, revision, kind: 'transition', site_id: 'site-1', monitor_id: 'monitor-1', lane_id: lane,
  target, target_kind: target, code, subject, origin, transition, at: when, first_seen_at: when, cleared_at: cleared,
  source: 'measured', caveat: null, status: null, paged: deliveries.some((d) => d.recipients.length > 0), deliveries,
});
/** One agent event, every key the contract gives it. */
const agentEvent = (kind, when, over = {}) => ({
  kind, site_id: 'site-1', agent_id: 'agent-1', intercom: 'sip:exit-door@example.com', lane: 'exit', case: null, authorisation: null, human: null,
  at: when, keyed: null, caller_stated_identity: 'sip:exit-door@example.com', released: null, ticket_id: null, authorised_by: null, code: null,
  reason: null, lane_event_cursor: null, relay_port: null, relay_ms: null, cause: null, display: null, geometry: null, ...over,
});
/** A call record as the gate agent keeps one. */
const callRecord = (over) => ({
  call_id: `c-${hex32()}`, revision: 1, site_id: 'site-1', agent_id: 'agent-1', disposition: 'answered', intercom: 'sip:exit-door@example.com', lane: 'exit',
  caller_stated_identity: 'sip:exit-door@example.com', started_at: null, case: null, case_spoken_at: null, person_called: null, rang_person_at: null,
  person_answered_at: null, person_answered_as: null, authorisation: null, authorisation_at: null, keyed: null, ticket_id: null, ended_at: null,
  outcome: null, recording: null, events: [], ...over,
});

const h = await H.startHarness();
const gate = await startGateAgentStub({ token: TOKEN });
const refusing = await startGateAgentStub({ token: TOKEN });
refusing.behaviour.status = 403;
const dir = mkdtempSync(join(tmpdir(), 'record-exceptions-'));
writeFileSync(join(dir, 'token'), `${TOKEN}\n`);
// An admin's email names one admin on the whole platform: a new one each run.
const owner = { email: `owner-exceptions-${hex32().slice(0, 6)}@example.com`, password: `recording-${hex32()}` };
let g;
let exitLaneFile;

/** The deployment's file naming the garage's gate agent: the monitor's and the agent's address, and the exit lane's names. */
function gateAt(monitor, agent) {
  const file = join(dir, `gate-${randomUUID()}.json`);
  writeFileSync(file, JSON.stringify({
    garages: {
      [g.world.garage]: {
        monitor: { url: monitor, token_file: join(dir, 'token') },
        agent: { url: agent, token_file: join(dir, 'token') },
        lanes: { [g.world.exitLane]: { monitor_lane: 'lane-1', agent_lane: 'exit' } },
      },
    },
  }));
  return file;
}

const ok = async (res, what) => {
  if (!res.ok) throw new Error(`${what}: ${res.status} ${await res.text()}`);
  return res.json();
};

/** The owner, signed in from the page's address: the cookie. */
async function ownerCookie() {
  const res = await fetch(`${h.base}/api/v1/auth/sign-in`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(owner) });
  await ok(res, 'the owner signs in');
  return res.headers.get('set-cookie').split(';')[0];
}

/** A picture a lane computer sends: for an event (its entry, its exit case) or none of them. */
const lanePicture = async (device, eventId, takenAt) =>
  ok(await h.call(device, 'POST', '/lane/pictures', { picture_ref: `p-${hex32().slice(0, 12)}`, event_id: eventId, taken_at: takenAt, image: PICTURE }), 'a lane sends a picture');

const hooks = {
  async letOuts() {
    const { garage, exitLane } = g.world;
    // 1. Owing: a card declined, the reader offline when tried again, the lane asking
    //    for a person; the gate agent paging and called; the owner lets it out.
    exitLaneFile = gateAt(gate.url, gate.url);
    process.env.GATE_AGENTS_FILE = exitLaneFile;
    const entryEvent = randomUUID();
    const exitEvent = randomUUID();
    const first = await H.enter(h, g, { inMin: 95, eventId: entryEvent });
    const exit = await H.caseAt(h, g, first.plate, { eventId: exitEvent });
    // Its pictures: at the entry with its stay, at the exit with its case, and one the exit lane kept in its window.
    await lanePicture(g.entry, entryEvent, at(-95 * MINUTE));
    await lanePicture(g.exit, exitEvent, at(-0.5 * MINUTE));
    await lanePicture(g.exit, randomUUID(), at(-0.4 * MINUTE));
    const started = await H.pay(h, g, exit.id);
    h.stub.presentCard(started.payment.payment_intent_id, { decline: 'generic_decline' });
    await H.caseOf(h, g, exit.id);
    h.stub.behaviour.failNext = { status: 400, code: 'terminal_reader_offline', message: 'offline', path: /process_payment_intent/ };
    const offline = await h.call(g.exit, 'POST', `/lane/exits/${exit.id}/pay`);
    if (offline.status !== 503) throw new Error(`the reader offline: ${offline.status} ${await offline.text()}`);
    await ok(await h.call(g.exit, 'POST', '/lane/events', { events: [
      { event_id: randomUUID(), kind: 'fallback_needs_human', occurred_at: at(-0.3 * MINUTE), detail: { cause: 'reader_declined', plate: first.plate } },
    ] }), 'the lane asks for a person');
    const t = (min) => at(-min * MINUTE);
    gate.store.messages.push(
      // Delivered: the email on its second try, the pager at once, and the log.
      messageRecord({ when: t(4), code: 'reader_unreachable', subject: 'reader-1', revision: 1, deliveries: [
        delivery('log', 'log', [], 'delivered', [attempt(t(4), 'accepted')]),
        delivery('night-desk', 'email', ['night-desk@example.com'], 'delivered', [
          attempt(t(4), 'failed', { reason: 'email: Connection unexpectedly closed' }),
          attempt(t(3.5), 'accepted', { reply_code: 250, reply: '2.0.0 Ok: queued as 4F2A9C01' }),
        ]),
        delivery('pager', 'webhook', ['paging.example.com'], 'delivered', [attempt(t(4), 'accepted', { http_status: 204 })]),
      ] }),
      // Not delivered: the email refused for good (one of its two people refused by name), the pager retrying.
      messageRecord({ when: t(3), code: 'reader_unreachable', subject: 'reader-1', transition: 'still_active', revision: 2, deliveries: [
        delivery('night-desk', 'email', ['night-desk@example.com', 'gate-duty@example.com'], 'failed', [
          attempt(t(3), 'failed', { reply_code: 451, reply: '4.3.0 Try again later', reason: 'email: the mail server asked to try later' }),
          attempt(t(2.5), 'failed', { reply_code: 550, reply: '5.1.1 Mailbox unknown', reason: 'email: refused for good', refused_recipients: ['gate-duty@example.com'], transient: false }),
        ]),
        delivery('pager', 'webhook', ['paging.example.com'], 'retrying', [attempt(t(3), 'failed', { http_status: 502, reason: 'webhook: the receiver did not take it' })], { next_attempt_at: t(-1) }),
      ] }),
      // About no lane: the monitor's own, told to its log only -- nobody was paged.
      messageRecord({ lane: null, when: t(2), code: 'platform_unreachable', origin: 'monitor', target: 'platform', revision: 3, deliveries: [
        delivery('log', 'log', [], 'delivered', [attempt(t(2), 'accepted')]),
      ] }),
      // Another lane's: never copied.
      messageRecord({ lane: 'lane-2', when: t(2), code: 'camera_unreachable', revision: 4, deliveries: [delivery('log', 'log', [], 'delivered', [attempt(t(2), 'accepted')])] }),
    );
    gate.store.calls.push(
      // Answered: the person on duty keyed "open now".
      callRecord({
        revision: 1, started_at: t(3), case: 'malfunction_active', case_spoken_at: t(2.9), person_called: 'sip:duty@example.com', rang_person_at: t(2.9),
        person_answered_at: t(2.8), person_answered_as: 'sip:duty@example.com', authorisation: 'open_now', authorisation_at: t(2.7), ended_at: t(2.6),
        outcome: 'authorisation_received',
        events: [
          agentEvent('call_answered', t(3)),
          agentEvent('case_spoken', t(2.9), { case: 'malfunction_active' }),
          agentEvent('human_called', t(2.9), { human: 'sip:duty@example.com' }),
          agentEvent('authorisation_received', t(2.7), { authorisation: 'open_now', authorised_by: 'sip:duty@example.com' }),
          agentEvent('vend_refused', t(2.7), { code: 'lane_refused', reason: 'the lane is waiting on a payment' }),
          agentEvent('call_ended', t(2.6)),
        ],
      }),
      // Rung, nobody answered.
      callRecord({
        revision: 2, started_at: t(2), case: 'malfunction_active', case_spoken_at: t(1.9), person_called: 'sip:duty@example.com', rang_person_at: t(1.9),
        ended_at: t(1.4), outcome: 'human_unreachable', keyed: null,
        events: [agentEvent('call_answered', t(2)), agentEvent('human_called', t(1.9), { human: 'sip:duty@example.com' }), agentEvent('human_unreachable', t(1.4)), agentEvent('call_ended', t(1.4))],
      }),
      // Refused busy, before anyone knew which door: no lane.
      callRecord({ revision: 3, disposition: 'refused_busy', lane: null, intercom: 'agent-1', caller_stated_identity: 'sip:entry-door@example.com', started_at: t(1.2), outcome: 'refused_busy', events: [agentEvent('call_refused_busy', t(1.2), { lane: null, intercom: 'agent-1', caller_stated_identity: 'sip:entry-door@example.com' })] }),
    );
    const cookie = await ownerCookie();
    await ok(await fetch(`${h.base}/api/v1/garages/${garage}/exits/${exit.id}/let-out`, {
      method: 'POST', headers: { origin: ORIGIN, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Card declined twice; reader offline. Driver gave a name and will pay by phone.' }),
    }), 'the owner lets the first car out');

    // 2. Paid at the reader, and a person at the lane opened for it anyway; no gate agent set up.
    delete process.env.GATE_AGENTS_FILE;
    const second = await H.enter(h, g, { inMin: 40 });
    const paid = await H.caseAt(h, g, second.plate);
    await H.payAndPresent(h, g, paid.id);
    // The lane's close names the moment the car crossed: now, after the first car's let-out.
    await ok(await H.close(h, g, paid.id, { let_out_by: 'human_open_now', exit_at: new Date().toISOString() }), 'the lane opens for the paid car');

    // 3. Owing, let out with the account's key; the monitor not answering, the agent refusing.
    const unreachableFile = gateAt('http://127.0.0.1:9', refusing.url);
    process.env.GATE_AGENTS_FILE = unreachableFile;
    const third = await H.enter(h, g, { inMin: 20 });
    const owing = await H.caseAt(h, g, third.plate);
    await ok(await h.call(g.op, 'POST', `/garages/${garage}/exits/${owing.id}/let-out`, { reason: 'Barrier stuck open <b>again</b>' }), 'the key lets the third car out');

    // 4. Owing, let out with the key, the gate agent copied -- and those copies later blanked by the retention purge.
    process.env.GATE_AGENTS_FILE = exitLaneFile;
    const fourth = await H.enter(h, g, { inMin: 10 });
    const blanked = await H.caseAt(h, g, fourth.plate);
    await ok(await h.call(g.op, 'POST', `/garages/${garage}/exits/${blanked.id}/let-out`, { reason: 'Driver showed a paid receipt from the pay station' }), 'the key lets the fourth car out');

    // The sweep, once each window has passed: the lane's events after the let-out,
    // and the gate agent's whole window again (said after the first let-out: recovered).
    const rows = await withTenant(g.tenant, async (c) => (await c.query('SELECT * FROM exceptions WHERE garage_id = $1 ORDER BY let_out_at', [garage])).rows);
    const byCase = (id) => rows.find((x) => x.exit_id === id);
    const [one, three, four] = [byCase(exit.id), byCase(owing.id), byCase(blanked.id)];
    await withTenant(g.tenant, (c) => c.query(
      "INSERT INTO events (tenant_id, garage_id, lane_id, event_id, kind, occurred_at, detail) VALUES ($1, $2, $3, $4, 'exit_confirmed', $5, $6)",
      [g.tenant, garage, exitLane, randomUUID(), new Date(one.let_out_at.getTime() + MINUTE), JSON.stringify({ state: 'crossed', plate: first.plate })],
    ));
    gate.store.messages.push(messageRecord({ when: new Date(one.let_out_at.getTime() + 2 * MINUTE).toISOString(), code: 'reader_unreachable', subject: 'reader-1', transition: 'recovered', cleared: new Date(one.let_out_at.getTime() + 2 * MINUTE).toISOString(), revision: 5, deliveries: [
      delivery('night-desk', 'email', ['night-desk@example.com'], 'delivered', [attempt(new Date(one.let_out_at.getTime() + 2 * MINUTE).toISOString(), 'accepted', { reply_code: 250, reply: '2.0.0 Ok: queued as 4F2A9C02' })]),
    ] }));
    const write = (fn) => withTenant(g.tenant, fn);
    const finished = (x) => ({ now: new Date(x.window_to.getTime() + MINUTE) });
    for (const x of rows) {
      process.env.GATE_AGENTS_FILE = x === one || x === four ? exitLaneFile : x === three ? unreachableFile : '';
      if (!process.env.GATE_AGENTS_FILE) delete process.env.GATE_AGENTS_FILE;
      await exceptions.finish(write, g.tenant, x, finished(x));
    }
    // The retention purge, as blankExpiredCopies writes it, for the fourth car's copies alone: the
    // others must keep theirs, and its window is the account's, not one record's.
    await withTenant(g.tenant, (c) => c.query(
      `UPDATE exception_records SET records = '[]'::jsonb, purged_at = now()
        WHERE tenant_id = $1 AND exception_id = $2 AND source = ANY($3::text[]) AND purged_at IS NULL`,
      [g.tenant, four.id, exceptions.GATE_AGENT_SOURCES],
    ));
  },
};

const kept = {};
try {
  g = await H.cardGarage(h, 'exceptions-recording');
  await createAdmin({ tenantId: g.tenant, ...owner });
  const answers = await recordExceptions(h.base, { origin: ORIGIN, owner, hooks: { ...hooks, whole: (what, data) => { kept[what] = data; } } });
  const file = new URL('./platform-shapes.json', import.meta.url);
  const shapes = JSON.parse(readFileSync(file, 'utf8'));
  shapes.exceptions_recorded_from = RECORDED_FROM;
  shapes.exceptions_answers = answers;
  writeFileSync(file, `${JSON.stringify(shapes, null, 2)}\n`);
  if (WHOLE_TO) writeFileSync(WHOLE_TO, `${JSON.stringify(kept, null, 2)}\n`);
  console.log(`${answers.length} answers recorded`);
} finally {
  delete process.env.GATE_AGENTS_FILE;
  await gate.close();
  await refusing.close();
  await h.stop();
  await pool.end();
  rmSync(dir, { recursive: true, force: true });
}
