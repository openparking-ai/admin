#!/usr/bin/env node
// The fill rule (platform 0034): record what the platform answers the Garages
// page's number of spaces and the Rates page's rates with a fill rule, into
// test/platform-shapes.json (`spaces_answers`), from a running platform with
// the rate engine at its pin and owner sign-in on:
//
//   PLATFORM=http://127.0.0.1:3277 ORIGIN=http://admin.example \
//   OWNER_EMAIL=... OWNER_PASSWORD=... RECORDED_FROM='<the header words>' node test/record-spaces.js
//
// The stand-in (test/stub-platform.js) is then required to answer the same.

import { readFileSync, writeFileSync } from 'node:fs';
import { recordSpaces } from './platform-shapes.js';
import { FILL_RULE, recordedPlans } from './rates-forms.js';

const { PLATFORM, ORIGIN, OWNER_EMAIL, OWNER_PASSWORD, RECORDED_FROM } = process.env;
if (!PLATFORM || !ORIGIN || !OWNER_EMAIL || !OWNER_PASSWORD || !RECORDED_FROM) {
  console.error('PLATFORM, ORIGIN, OWNER_EMAIL, OWNER_PASSWORD and RECORDED_FROM are required');
  process.exit(1);
}
const file = new URL('./platform-shapes.json', import.meta.url);
const shapes = JSON.parse(readFileSync(file, 'utf8'));
const answers = await recordSpaces(PLATFORM, { origin: ORIGIN, owner: { email: OWNER_EMAIL, password: OWNER_PASSWORD }, plans: recordedPlans(), fill: FILL_RULE });
shapes.spaces_recorded_from = RECORDED_FROM;
shapes.spaces_answers = answers;
writeFileSync(file, `${JSON.stringify(shapes, null, 2)}\n`);
console.log(`${answers.length} answers recorded`);
