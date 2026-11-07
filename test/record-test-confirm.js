#!/usr/bin/env node
// Platform 0052: record what the platform answers the Getting paid page's tick
// into test/platform-shapes.json (`test_confirm_answers`). The account has to
// come to take cards, which only Stripe says, so this starts the platform
// itself, from a checkout of it (PLATFORM_DIR, with its npm packages), on its
// own test harness: the rate engine at its pin and its Stripe stand-in (no
// Stripe account or key), an owner made with its createAdmin, and a database
// prepared and migrated as its README says:
//
//   PLATFORM_DIR=<platform checkout> APP_DATABASE_URL=... (and the rest of the
//   platform's test environment) ORIGIN=http://admin.example \
//   RECORDED_FROM='<the header words>' node test/record-test-confirm.js
//
// Every address and name here is invented.

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { recordTestConfirm } from './platform-shapes.js';

const { PLATFORM_DIR, ORIGIN = 'http://admin.example', RECORDED_FROM } = process.env;
if (!PLATFORM_DIR || !RECORDED_FROM || !process.env.APP_DATABASE_URL) {
  console.error('PLATFORM_DIR, APP_DATABASE_URL and RECORDED_FROM are required');
  process.exit(1);
}
// The owner signs in from this page's address, over plain http on this computer.
process.env.ADMIN_ORIGIN = ORIGIN;
process.env.SESSION_COOKIE_INSECURE = 'true';

const from = (path) => import(pathToFileURL(join(PLATFORM_DIR, path)).href);
const H = await from('test/exit-harness.js');
const { createTenant } = await from('test/helpers.js');
const { createAdmin } = await from('src/adminAccount.js');
const { pool } = await from('src/db.js');

const h = await H.startHarness();
H.configure(h.stub);
const tenantId = await createTenant('recorded-tick');
// An admin's email names one admin on the whole platform: a new one each run.
const owner = { email: `owner-tick-${randomBytes(3).toString('hex')}@example.com`, password: `recording-${randomBytes(16).toString('hex')}` };
await createAdmin({ tenantId, ...owner });
const answers = await recordTestConfirm(h.base, {
  origin: ORIGIN,
  owner,
  hooks: { cards: (_garage, account, side) => h.stub.setState(account.account_id, side) },
});
await h.stop();
await pool.end();

const file = new URL('./platform-shapes.json', import.meta.url);
const shapes = JSON.parse(readFileSync(file, 'utf8'));
shapes.test_confirm_recorded_from = RECORDED_FROM;
shapes.test_confirm_answers = answers;
writeFileSync(file, `${JSON.stringify(shapes, null, 2)}\n`);
console.log(`${answers.length} answers recorded`);
