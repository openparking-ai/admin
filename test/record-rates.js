#!/usr/bin/env node
// U7g / U7i: record what the platform answers the Rates page and the Open button,
// into test/platform-shapes.json (`rates_answers`), from a running platform
// with the rate engine at its pin and owner sign-in on:
//
//   PLATFORM=http://127.0.0.1:3077 ORIGIN=http://admin.example \
//   OWNER_EMAIL=... OWNER_PASSWORD=... RECORDED_FROM='<the header words>' node test/record-rates.js
//
// The stand-in (test/stub-platform.js) is then required to answer the same.

import { readFileSync, writeFileSync } from 'node:fs';
import { recordRates } from './platform-shapes.js';
import { STAY_LIST, recordedPlans } from './rates-forms.js';

const { PLATFORM, ORIGIN, OWNER_EMAIL, OWNER_PASSWORD, RECORDED_FROM } = process.env;
if (!PLATFORM || !ORIGIN || !OWNER_EMAIL || !OWNER_PASSWORD || !RECORDED_FROM) {
  console.error('PLATFORM, ORIGIN, OWNER_EMAIL, OWNER_PASSWORD and RECORDED_FROM are required');
  process.exit(1);
}
const file = new URL('./platform-shapes.json', import.meta.url);
const shapes = JSON.parse(readFileSync(file, 'utf8'));
const answers = await recordRates(PLATFORM, {
  origin: ORIGIN,
  owner: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  plans: recordedPlans(),
  stays: STAY_LIST,
  // The platform allows 20 tries a minute: wait the minute out.
  rest: () => new Promise((resolve) => setTimeout(resolve, 61_000)),
});
shapes.recorded_from = `${shapes.recorded_from} ${RECORDED_FROM}`;
shapes.rates_answers = answers;
writeFileSync(file, `${JSON.stringify(shapes, null, 2)}\n`);
console.log(`${answers.length} answers recorded`);
