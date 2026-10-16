#!/usr/bin/env node
/* global document */
// The Rates page's two rules of rate setup (decided 2026-10-16), in a real
// browser, in English and Spanish:
//
//   cheapest   "When more than one price applies, the car always pays the
//              cheapest." -- by the caps (right after Max per week) and by
//              the special rates (above the list);
//   longest    "Stays longer than 90 days can't be priced automatically; they
//              need an operator." -- in the same two places, its days from
//              LONGEST_STAY_DAYS (src/rates.js); in each box the second
//              sentence 6 px under the first;
//   calculator a stay of exactly 90 days priced; a minute more: that sentence
//              instead of a price, the price before it gone, and nothing sent
//              to be priced; the same in Spanish;
//   check page its calculator says the same, and a stay past it is not added
//              to the price table, nothing sent.
//
// Serves dist/ (run `npm run build` first) with /api sent to the stand-in
// platform (test/stub-platform.js), which prices every stay through the rate
// engine at this repository's pin. In Chromium, the browser in Tokyo time and
// the garage in New York's. The stays are in spring 2031, with no change of
// the clocks between them.
//
//   node scripts/check-rate-rules.js

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { DICTIONARIES } from '../src/i18n/index.js';
import { LONGEST_STAY_DAYS } from '../src/rates.js';
import { startStub } from '../test/stub-platform.js';
import { recordedPlans } from '../test/rates-forms.js';
import { chooseOnSettings } from './on-settings.js';
import { goNav } from './nav.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const EN = DICTIONARIES.en;
const ES = DICTIONARIES.es;
const failures = [];
let passed = 0;
const check = (ok, what) => {
  if (ok) passed += 1;
  else failures.push(what);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};
const fill = (text, values = {}) => text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));
const rules = (W) => ({ cheapest: W['rates.rule.cheapest'], longest: fill(W['rates.rule.longest'], { days: LONGEST_STAY_DAYS }) });

const stub = await startStub();
const A = stub.data.a;
const ZONE = 'America/New_York';
const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4383, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } } });
const base = server.resolvedUrls.local[0];
stub.allowOrigin(new URL(base).origin);
const browser = await chromium.launch();
const requests = [];
const tries = () => requests.filter((r) => r.method === 'POST' && r.path.endsWith('/rate-plans/try')).length;
const settles = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const HOUR = 3600_000;

// Exactly LONGEST_STAY_DAYS (90) days, and a minute more: April to the end of June 2031, New York, no clock change.
const CAME_IN = '2031-04-01T10:00';
const LONGEST = '2031-06-30T10:00';
const MINUTE_MORE = '2031-06-30T10:01';

/** Signed in as A on `garage`'s Rates page, in a context of its own. */
async function ratesPage(garage) {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo', viewport: { width: 1360, height: 900 } });
  context.on('request', (r) => requests.push({ method: r.method(), path: new URL(r.url()).pathname }));
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForSelector('.page-title');
  await page.fill('input[name="email"]', A.email);
  await page.fill('input[name="password"]', A.password);
  await page.click('button[type="submit"]');
  await page.click(`.garage-choice[data-garage="${garage.id}"]`);
  await page.waitForSelector('.nav');
  await goNav(page, '#/rates');
  await page.waitForSelector('[data-section="specials"]');
  return page;
}

/** Each rule where it is said: its words, and where it stands. */
const rulesShown = (page) =>
  page.evaluate(() => {
    const read = (el) => (el ? { cheapest: el.querySelector('[data-rule="cheapest"]')?.textContent ?? null, longest: el.querySelector('[data-rule="longest"]')?.textContent ?? null } : null);
    const caps = document.querySelector('[data-section="regular"] [data-rules="caps"]');
    const specials = document.querySelector('[data-section="specials"] [data-rules="specials"]');
    const list = document.querySelector('[data-section="specials"] .special-list');
    // In each box, the gap between its two sentences (6 px).
    const spacing = (el) => {
      const [one, two] = el ? [...el.querySelectorAll('[data-rule]')] : [];
      return one && two ? Math.round(two.getBoundingClientRect().top - one.getBoundingClientRect().bottom) : null;
    };
    return {
      layout: [spacing(caps), spacing(specials)],
      caps: read(caps),
      // Right after Max per week, before the free grace period.
      capsAfter: caps?.previousElementSibling?.dataset.part ?? null,
      specials: read(specials),
      // Above the special rates in force.
      specialsAbove: Boolean(specials && list && specials.compareDocumentPosition(list) & 4),
    };
  });

const CALC = 'main [data-section="calculator"]';

/**
 * A stay typed into the calculator shown (the Rates page's or the check
 * page's) and worked out: what it says once settled -- the longest stay's
 * sentence, or an answer for this very stay (not one greyed as priced for
 * another) -- and how many tries were sent for it.
 */
async function tryStay(page, entry, exit) {
  const before = tries();
  await page.fill(`${CALC} [data-field="try-entry"]`, entry);
  await page.fill(`${CALC} [data-field="try-exit"]`, exit);
  await page.click(`${CALC} [data-action="try-stay"]`);
  await settles(page, (c) => Boolean(document.querySelector(`${c} [data-notice="try-too-long"]`) || document.querySelector(`${c} [data-stale="no"] [data-tried]`)), CALC, 15000);
  // A try sent would have been counted by now; one not sent stays unsent.
  await page.waitForTimeout(400);
  const said = await page.evaluate((c) => {
    const calc = document.querySelector(c);
    return {
      tried: calc.querySelector('[data-tried]')?.dataset.tried ?? null,
      fee: calc.querySelector('[data-tried="priced"]')?.dataset.fee ?? null,
      tooLong: calc.querySelector('[data-notice="try-too-long"]')?.textContent ?? null,
    };
  }, CALC);
  return { ...said, sent: tries() - before };
}

try {
  const garage = stub.makeGarage(A, { name: 'Rate rules garage', timezone: ZONE, currency: 'USD' });
  const from = new Date(Date.now() - HOUR).toISOString();
  stub.storeRates(garage.id, { ...recordedPlans(from).early, plan_version: 'rules-before', effective_from: from }, A);
  const page = await ratesPage(garage);

  for (const [language, W] of [['en', EN], ['es', ES]]) {
    if (language === 'es') {
      await chooseOnSettings(page, 'language', 'es');
      await goNav(page, '#/rates');
      await settles(page, (w) => document.querySelector('.page-title')?.textContent === w, ES['page.rates.title']);
      await page.waitForSelector('[data-section="specials"]');
    }
    const want = rules(W);
    const shown = await rulesShown(page);
    check(shown.caps?.cheapest === want.cheapest && shown.caps?.longest === want.longest && shown.capsAfter === 'week-max', `${language}: the rules by the caps, right after Max per week: "${want.cheapest}" "${want.longest}" (${JSON.stringify(shown.caps)}, after ${shown.capsAfter})`);
    check(shown.specials?.cheapest === want.cheapest && shown.specials?.longest === want.longest && shown.specialsAbove, `${language}: the rules by the special rates, above the list (${JSON.stringify(shown.specials)})`);
    if (language === 'en') check(shown.layout.every((gap) => gap === 6), `en: each rules box: its second sentence 6 px under the first (${JSON.stringify(shown.layout)} px)`);

    // The calculator on the Rates page: exactly the longest stay priced, a minute more refused.
    if (language === 'en') {
      const longest = await tryStay(page, CAME_IN, LONGEST);
      check(longest.tried === 'priced' && longest.fee !== null && longest.tooLong === null && longest.sent === 1, `${language}: calculator: a stay of exactly ${LONGEST_STAY_DAYS} days is priced (${JSON.stringify(longest)})`);
    }
    const over = await tryStay(page, CAME_IN, MINUTE_MORE);
    check(over.tooLong === want.longest && over.tried === null && over.sent === 0, `${language}: calculator: a stay of ${LONGEST_STAY_DAYS} days and a minute says "${want.longest}" instead of a price, nothing sent (${JSON.stringify(over)})`);
  }

  // The check page, in English again: its calculator, and a stay added to the price table.
  await chooseOnSettings(page, 'language', 'en');
  await goNav(page, '#/rates');
  await page.waitForSelector('[data-field="time-first-price"]');
  await page.fill('[data-field="time-first-price"]', '9');
  await page.click('[data-action="save-regular"]');
  await settles(page, () => document.querySelectorAll('[data-list="price-table"] tbody tr').length > 0 && !document.querySelector('[data-notice="table-pricing"]'), undefined, 15000);
  const want = rules(EN);
  const onCheck = await tryStay(page, CAME_IN, MINUTE_MORE);
  check(onCheck.tooLong === want.longest && onCheck.tried === null && onCheck.sent === 0, `check page: its calculator says "${want.longest}" for a stay of ${LONGEST_STAY_DAYS} days and a minute, nothing sent (${JSON.stringify(onCheck)})`);
  const rows = await page.$$eval('[data-list="price-table"] tbody tr', (els) => els.length);
  const sentBefore = tries();
  await page.fill('[data-add-stay] [data-field="add-entry"]', CAME_IN);
  await page.fill('[data-add-stay] [data-field="add-exit"]', MINUTE_MORE);
  await page.click('[data-action="add-stay"]');
  await settles(page, () => Boolean(document.querySelector('[data-notice="add-too-long"]')));
  await page.waitForTimeout(400);
  const added = {
    said: await page.textContent('[data-notice="add-too-long"]').catch(() => null),
    rows: await page.$$eval('[data-list="price-table"] tbody tr', (els) => els.length),
    sent: tries() - sentBefore,
  };
  check(added.said === want.longest && added.rows === rows && added.sent === 0, `check page: a stay of ${LONGEST_STAY_DAYS} days and a minute is not added to the price table, "${want.longest}", nothing sent (${JSON.stringify(added)}, ${rows} rows before)`);
  await page.context().close();
} catch (err) {
  failures.push(`the check stopped: ${err.message}`);
  console.error(err);
} finally {
  await browser.close();
  await server.close();
  await stub.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.map((x) => `  - ${x}`).join('\n'));
  process.exit(1);
}
