#!/usr/bin/env node
// Platform 0043: record what the platform answers the Stuck stays page into
// test/platform-shapes.json (`stuck_answers`), from a running platform with
// the rate engine, owner sign-in on and the demo's entry lane, whose key
// `npm run demo` writes to .demo-credentials.json:
//
//   PLATFORM=http://127.0.0.1:3277 ORIGIN=http://admin.example \
//   OWNER_EMAIL=... OWNER_PASSWORD=... LANE_CREDENTIALS=<platform>/.demo-credentials.json \
//   RECORDED_FROM='<the header words>' node test/record-stuck.js
//
// The stand-in (test/stub-platform.js) is then required to answer the same.

import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { recordStuck } from './platform-shapes.js';
import { STUCK_LET_IN } from './stub-platform.js';

const { PLATFORM, ORIGIN, OWNER_EMAIL, OWNER_PASSWORD, LANE_CREDENTIALS, RECORDED_FROM } = process.env;
if (!PLATFORM || !ORIGIN || !OWNER_EMAIL || !OWNER_PASSWORD || !LANE_CREDENTIALS || !RECORDED_FROM) {
  console.error('PLATFORM, ORIGIN, OWNER_EMAIL, OWNER_PASSWORD, LANE_CREDENTIALS and RECORDED_FROM are required');
  process.exit(1);
}
const lane = JSON.parse(readFileSync(LANE_CREDENTIALS, 'utf8')).entry_token;
const PICTURE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function fromLane(path, body) {
  const res = await fetch(`${PLATFORM}/api/v1/lane${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${lane}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`the entry lane's ${path}: ${res.status} ${await res.text()}`);
}

/** Each car let in as the entry lane lets one in: its open, then its one picture. */
const hooks = {
  stays: async () => {
    for (const { hoursAgo, plate } of STUCK_LET_IN) {
      const eventId = randomUUID();
      const at = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
      await fromLane('/sessions/open', { event_id: eventId, plate, entry_at: at, entry_confirmation: 'confirmed' });
      await fromLane('/pictures', { picture_ref: eventId.slice(0, 12), event_id: eventId, taken_at: at, image: PICTURE });
    }
  },
};

const file = new URL('./platform-shapes.json', import.meta.url);
const shapes = JSON.parse(readFileSync(file, 'utf8'));
const answers = await recordStuck(PLATFORM, { origin: ORIGIN, owner: { email: OWNER_EMAIL, password: OWNER_PASSWORD }, hooks });
shapes.stuck_recorded_from = RECORDED_FROM;
shapes.stuck_answers = answers;
writeFileSync(file, `${JSON.stringify(shapes, null, 2)}\n`);
console.log(`${answers.length} answers recorded`);
