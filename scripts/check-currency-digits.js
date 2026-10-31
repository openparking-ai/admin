#!/usr/bin/env node
// Every currency's digits after the point, as the rate engine at its pin has
// them (OP-NODE-006). A price typed on these screens is stored in the
// currency's smallest unit; the engine reads that number back by its own
// table, so the two tables must be one.
//
// The engine's table is READ FROM THE ENGINE -- `MINOR_UNIT_DIGITS` in
// src/rate_engine/currency.py, imported by Python from the engine's own
// source at the commit in rate-engine.pin -- and compared with
// src/currencyDigits.js entry for entry: a code missing here, a code here the
// engine does not price in, or a code with other digits. Then every currency
// a garage can be added with (CURRENCY_CODES, src/garages.js) must be one the
// engine prices in, and the money helpers (src/rates.js) must use the
// engine's digits for it: the digits, a price typed and read back, and the
// price shown. A failure names the code.
//
//   node scripts/check-currency-digits.js
//
// RATE_ENGINE_SRC names a checkout of the engine to read; its HEAD must be the
// pin. Without it the engine is fetched at the pin (git, one commit deep) into
// node_modules/.cache/rate-engine/<pin> and read from there.

import { engineCurrencyDigits, enginePin } from './engine-at-pin.js';
import { MINOR_UNIT_DIGITS } from '../src/currencyDigits.js';
import { CURRENCY_CODES } from '../src/garages.js';
import { currencyDigits, moneyText, parseMoney, typedMoney } from '../src/rates.js';

const failures = [];
const fail = (what) => {
  failures.push(what);
  console.log(`  FAIL ${what}`);
};

let engine;
try {
  engine = engineCurrencyDigits();
} catch (err) {
  console.error(`  FAIL the engine's currency table could not be read: ${err.message}`);
  process.exit(1);
}
const ours = MINOR_UNIT_DIGITS;
console.log(`  the engine at ${enginePin().slice(0, 7)} prices in ${Object.keys(engine).length} currencies; src/currencyDigits.js has ${Object.keys(ours).length}; a garage can be added with ${CURRENCY_CODES.length}`);

// The table, entry for entry.
for (const code of Object.keys(engine).sort()) {
  if (!Object.hasOwn(ours, code)) fail(`${code}: the engine prices in it with ${engine[code]} digits, and src/currencyDigits.js does not have it`);
  else if (ours[code] !== engine[code]) fail(`${code}: ${ours[code]} digits in src/currencyDigits.js, ${engine[code]} in the engine`);
}
for (const code of Object.keys(ours).sort()) if (!Object.hasOwn(engine, code)) fail(`${code}: in src/currencyDigits.js, and the engine does not price in it`);

// Every currency offered, through the money helpers. 1234567 in the smallest
// unit is "12345.67" with 2 digits, "1234.567" with 3, "1234567" with none.
const AMOUNT = 1234567;
for (const code of CURRENCY_CODES) {
  if (!Object.hasOwn(engine, code)) {
    fail(`${code}: a garage can be added with it, and the engine does not price in it`);
    continue;
  }
  const digits = engine[code];
  if (currencyDigits(code) !== digits) {
    fail(`${code}: the money helpers write it with ${currencyDigits(code)} digits, the engine with ${digits}`);
    continue;
  }
  const typed = typedMoney(AMOUNT, code);
  const after = typed.includes('.') ? typed.split('.')[1].length : 0;
  if (after !== digits) fail(`${code}: ${AMOUNT} is typed back as "${typed}", not with ${digits} digits after the point`);
  const back = parseMoney(typed, code).minor;
  if (back !== AMOUNT) fail(`${code}: "${typed}" typed is stored as ${back}, not ${AMOUNT}`);
  const shown = moneyText(AMOUNT, code, 'en');
  const shownAfter = /[.](\d+)\D*$/.exec(shown)?.[1]?.length ?? 0;
  if (shownAfter !== digits) fail(`${code}: ${AMOUNT} is shown as "${shown}", not with ${digits} digits after the point`);
}

if (failures.length) {
  console.error(`\n${failures.length} currency problem(s): a price in these would be stored in other units than the engine reads.`);
  process.exit(1);
}
console.log(`  ok   src/currencyDigits.js is the engine's table, entry for entry (${Object.keys(engine).length} currencies)`);
console.log(`  ok   every currency a garage can be added with (${CURRENCY_CODES.length}) is priced by the engine, and typed, stored and shown with its digits`);
