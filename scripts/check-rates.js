#!/usr/bin/env node
/* global document, window */
// The Rates page and the Open button, in a real browser (U7g).
//
// Serves dist/ (run `npm run build` first) with /api sent to the stand-in
// platform (test/stub-platform.js), whose prices are the rate engine's,
// replayed from test/platform-shapes.json as recorded from the platform. In
// Chromium, with the browser in Tokyo time and the garage in Chicago's:
//
//   check 4   the form, filled in by hand as test/rates-forms.js's table form,
//             sends exactly the document the page builds from that form; the
//             price table shows the engine's prices, row for row;
//   check 5   rates the engine finds a gap in: every finding a plain sentence,
//             in English and in Spanish, none of the engine's words, and the
//             review kept;
//   check 6   the Open button: not pressable while a step is missing, each
//             missing step listed and leading to where it is done; pressable
//             when nothing is; one confirmation; a refusal listed in plain
//             words; once open, the step says since when;
//   check 7   the Rates list and the price table: Download Excel, Download PDF
//             and Print, each a file of the list;
//   check 12  saving needs the tick and Confirm: nothing is sent before; a
//             stay added after pricing makes the table stale and Confirm
//             unpressable until it is priced again; the save says confirmed.
//
//   node scripts/check-rates.js

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { DICTIONARIES } from '../src/i18n/index.js';
import { startStub } from '../test/stub-platform.js';
import { TABLE_FORM, recordedPlans } from '../test/rates-forms.js';
import { buildPlan, tableStays } from '../src/rates.js';
import { startOfDay } from '../src/taxes.js';
import { chooseOnSettings } from './on-settings.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const EN = DICTIONARIES.en;
const ES = DICTIONARIES.es;
const DIR = mkdtempSync(join(tmpdir(), 'admin-rates-'));
const failures = [];
let passed = 0;
const check = (ok, what) => {
  if (ok) passed += 1;
  else failures.push(what);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};
const fill = (text, values = {}) => text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));

const stub = await startStub();
const A = stub.data.a;
// A garage made for this check, in the zone and money the rates were recorded in.
const RIVERSIDE = stub.makeGarage(A, { name: 'Rates check garage', timezone: 'America/New_York', currency: 'USD' });
const recorded = recordedPlans({ buildPlan, startOfDay, tableStays });
const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4363, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } } });
const base = server.resolvedUrls.local[0];
stub.allowOrigin(new URL(base).origin);
const browser = await chromium.launch();
const requests = [];

const settles = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 }).then(() => true, () => false);
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const ENGINE_WORDS = /GAP_|CONFLICT_|FAULT_|cheapest|QUALIFY|ACCUMULATE|increment|time_window|max_duration|plan_version|nothing prices/i;

async function go(page, hash, title) {
  await page.click(`.nav-item[href="${hash}"]`);
  return settles(page, (t) => document.querySelector('.page-title')?.textContent === t, title);
}
const set = (page, sel, value) => page.fill(sel, value);
const pick = (page, sel, value) => page.selectOption(sel, value);

try {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo', acceptDownloads: true, viewport: { width: 1360, height: 900 } });
  context.on('request', (r) => requests.push({ method: r.method(), path: new URL(r.url()).pathname, body: r.postData() ?? '' }));
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__printed = 0;
    window.print = () => {
      window.__printed += 1;
    };
  });
  await page.goto(base);
  await page.waitForSelector('.page-title');
  await page.fill('input[name="email"]', A.email);
  await page.fill('input[name="password"]', A.password);
  await page.click('button[type="submit"]');
  await page.click(`.garage-choice[data-garage="${RIVERSIDE.id}"]`);
  await page.waitForSelector('.nav');

  // ── The Rates page, with no rates ──────────────────────────────────────
  check(await go(page, '#/rates', EN['page.rates.title']), 'Rates is in the navigation');
  check(await settles(page, (w) => document.querySelector('[data-state]')?.textContent === w, EN['rates.none']), `no rates: "${EN['rates.none']}"`);
  check((await page.$$('[data-action="download-excel"]')).length === 0, 'no rates: no Download or Print');

  // ── The form, filled in by hand as the table form ──────────────────────
  await page.click('[data-action="change-rates"]');
  await page.waitForSelector('[data-form="change-rates"]');
  const f = TABLE_FORM;
  await set(page, '[data-field="time-first-minutes"]', f.time.firstMinutes);
  await set(page, '[data-field="time-first-price"]', f.time.firstPrice);
  await set(page, '[data-field="time-next-minutes"]', f.time.nextMinutes);
  await set(page, '[data-field="time-next-price"]', f.time.nextPrice);
  // Nothing is chosen for the owner: the review is refused until it is.
  await page.click('[data-action="review-rates"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-problem-at="time.rounding"]'))), 'a started period is not chosen for the owner: asked for');
  await pick(page, '[data-field="time-rounding"]', 'ceil');
  await page.click('[data-tick="day-max-on"]');
  await set(page, '[data-field="day-max-price"]', f.dayMax.price);
  await pick(page, '[data-field="day-max-kind"]', f.dayMax.kind);
  await page.click('[data-tick="grace-on"]');
  await set(page, '[data-field="grace-minutes"]', f.grace.minutes);
  for (const [i, s] of f.specials.entries()) {
    await page.click('[data-action="add-special"]');
    const at = `[data-special-at="${i + 1}"]`;
    await set(page, `${at} [data-field="special-name"]`, s.name);
    await pick(page, `${at} [data-field="special-preset"]`, s.preset);
    const ticked = await page.$$eval(`${at} [data-tick^="day-"][aria-checked="true"]`, (els) => els.map((e) => e.dataset.tick.slice(4)));
    check(ticked.join() === s.days.join(), `special ${i + 1}: "${EN[`rates.preset.${s.preset}`]}" ticks its days: ${ticked.join(', ')}`);
    await set(page, `${at} [data-field="special-enter-from"]`, s.enterFrom);
    await set(page, `${at} [data-field="special-enter-by"]`, s.enterBy);
    await set(page, `${at} [data-field="special-leave-by"]`, s.leaveBy);
    await page.click(`${at} [data-control="next-day"] [data-value="${s.nextDay}"]`);
    await pick(page, `${at} [data-field="special-charge"]`, s.charge);
    await set(page, `${at} [data-field="special-flat"]`, s.flat);
  }
  await page.click('[data-control="starts"] [data-value="day"]');
  await set(page, '[data-field="rates-day"]', f.day);
  await page.click('[data-action="review-rates"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-form="review-rates"]'))), 'the form, filled, opens the review');
  const sentences = await page.$$eval('[data-sentences="draft"] li', (els) => els.map((e) => e.textContent));
  check(sentences.some((x) => x.includes('First hour $8.00, then $4.00 each hour.')) && sentences.some((x) => x.startsWith('Early bird')), `the review says the rates in plain sentences: ${sentences.length}`);
  check(!ENGINE_WORDS.test(await bodyText(page)), 'no engine word on the review');

  // ── Check 12: nothing saved before the table is priced, ticked and confirmed ──
  const writes = () => requests.filter((r) => r.method === 'POST' && r.path.endsWith('/rate-plans')).length;
  check(await page.isDisabled('[data-action="confirm-rates"]'), '12 Confirm cannot be pressed before the table is priced');
  await page.click('[data-action="price-table"]');
  check(await settles(page, () => document.querySelectorAll('[data-list="price-table"] tbody tr').length > 0), 'the price table is priced');
  const tried = requests.filter((r) => r.path.endsWith('/rate-plans/try')).at(-1);
  const sentPlan = JSON.parse(tried.body).plan;
  const want = { ...recorded.table.plan, plan_version: sentPlan.plan_version };
  check(JSON.stringify(sentPlan) === JSON.stringify(want), '4 the form sends exactly the document the page builds from it (the one recorded)');
  const fees = await page.$$eval('[data-list="price-table"] tbody tr', (rows) => rows.map((r) => Number(r.dataset.fee)));
  check(fees.length === recorded.table.stays.length && fees[0] === 0 && fees.includes(1500) && fees.includes(2000), `4 the table holds the engine's prices, row for row (${fees.length} stays)`);
  check(await page.isDisabled('[data-action="confirm-rates"]'), '12 priced but not ticked: Confirm cannot be pressed');
  await page.click('[data-action="confirm-rates"]', { force: true }).catch(() => {});
  check(writes() === 0, '12 the tick ignored: nothing is sent');
  await page.click('[data-tick="checked-prices"]');
  check(!(await page.isDisabled('[data-action="confirm-rates"]')), '12 ticked: Confirm can be pressed');
  // A stay added after pricing: the table is stale until it is priced again.
  await set(page, '[data-field="add-entry"]', recorded.table.added.entry);
  await set(page, '[data-field="add-exit"]', recorded.table.added.exit);
  await page.click('[data-action="add-stay"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-notice="table-stale"]'))), '12 a stay added after pricing: the table says it must be priced again');
  check(await page.isDisabled('[data-action="confirm-rates"]'), '12 the stale table: Confirm cannot be pressed');
  await page.click('[data-action="price-table"]');
  check(await settles(page, () => !document.querySelector('[data-notice="table-stale"]')), '12 priced again: the table is current');

  // ── Check 7: the price table downloaded and printed ────────────────────
  for (const what of ['excel', 'pdf']) {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`[data-section="price-table"] [data-action="download-${what}"]`)]);
    const name = download.suggestedFilename();
    await download.saveAs(join(DIR, name));
    check(name.endsWith(what === 'excel' ? '.xlsx' : '.pdf') && name.includes(EN['page.priceTable.title'].split(' ')[0]), `7 the price table, Download ${what}: ${name}`);
  }
  await page.click('[data-section="price-table"] [data-action="print"]');
  check(await settles(page, () => window.__printed === 1), '7 the price table prints');

  // ── Check 5: rates the engine finds a gap in ────────────────────────────
  if (!(await page.$eval('[data-tick="checked-prices"]', (e) => e.getAttribute('aria-checked') === 'true'))) await page.click('[data-tick="checked-prices"]');
  stub.gapNextSave();
  await page.click('[data-action="confirm-rates"]');
  check(await settles(page, () => document.querySelectorAll('[data-section="findings"] li').length > 0), '5 the gap: its findings are listed');
  const findingText = await page.$$eval('[data-section="findings"] li', (els) => els.map((e) => e.textContent));
  check(findingText.every((x) => x.startsWith(EN['rates.finding.GAP_STAY_EXCEEDS_MAX_DURATION']) && !ENGINE_WORDS.test(x)), `5 each finding in a plain sentence: "${findingText[0]}"`);
  check(Boolean(await page.$('[data-form="review-rates"]')), '5 the review is kept');

  // ── Saved: the confirmation sent, the list shows it ────────────────────
  await page.click('[data-action="confirm-rates"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-section="later"]'))), 'saved: the rates show as starting later');
  const save = requests.filter((r) => r.method === 'POST' && r.path.endsWith('/rate-plans')).at(-1);
  check(JSON.parse(save.body).confirmed === true, '12 the save says confirmed');
  check(stub.ratesSaved(RIVERSIDE.id).length === 1, 'one set of rates saved');

  // ── Check 7: the Rates list downloaded and printed ─────────────────────
  for (const what of ['excel', 'pdf']) {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`[data-section="in-force"] [data-action="download-${what}"]`)]);
    check(download.suggestedFilename().endsWith(what === 'excel' ? '.xlsx' : '.pdf'), `7 the Rates list, Download ${what}: ${download.suggestedFilename()}`);
  }
  await page.click('[data-section="in-force"] [data-action="print"]');
  check(await settles(page, () => window.__printed === 2), '7 the Rates list prints');

  // ── Try a stay, on the rates saved ─────────────────────────────────────
  await set(page, '[data-field="try-entry"]', recorded.table.added.entry);
  await set(page, '[data-field="try-exit"]', recorded.table.added.exit);
  await page.click('[data-action="try-stay"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-tried="priced"]'))), 'try a stay: priced');
  const pays = await page.textContent('.tried-pays').catch(() => '');
  check(/^The driver pays \$\d+\.\d\d\.$/.test(pays ?? ''), `try a stay: "${pays}"`);

  // ── Check 6: the Open button ───────────────────────────────────────────
  await go(page, '#/setup', EN['page.setup.title']);
  await page.waitForSelector('[data-step="open"]');
  const missing = await page.$$eval('[data-still-missing]', (els) => els.map((e) => e.dataset.stillMissing));
  check(missing.length > 0 && (await page.isDisabled('[data-action="open-garage"]')), `6 steps missing (${missing.join(', ')}): Open cannot be pressed`);
  const toLanes = await page.$('[data-still-missing="lanes"] a');
  if (toLanes) {
    await toLanes.click();
    check(await settles(page, (t) => document.querySelector('.page-title')?.textContent === t, EN['page.lanes.title']), '6 a missing step leads to where it is done');
    await go(page, '#/setup', EN['page.setup.title']);
  }
  stub.openingAs(RIVERSIDE.id, { shown: [], refuse: ['lanes'] });
  await go(page, '#/rates', EN['page.rates.title']);
  await go(page, '#/setup', EN['page.setup.title']);
  await page.waitForSelector('[data-action="open-garage"]');
  check(!(await page.isDisabled('[data-action="open-garage"]')), '6 nothing missing: Open can be pressed');
  await page.click('[data-action="open-garage"]');
  check((await page.textContent('[data-notice="open-stays-open"]')) === EN['setup.open.confirm'], '6 one confirmation: once open, it stays open');
  await page.click('[data-action="open-yes"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-notice="open-refused"] [data-still-missing="lanes"]'))), '6 refused: what is missing listed in plain words');
  check(!ENGINE_WORDS.test(await bodyText(page)) && !(await bodyText(page)).includes('garage_not_activatable'), '6 no platform words on the refusal');
  stub.openingAs(RIVERSIDE.id, { shown: [], refuse: [] });
  await go(page, '#/rates', EN['page.rates.title']);
  await go(page, '#/setup', EN['page.setup.title']);
  await page.click('[data-action="open-garage"]');
  await page.click('[data-action="open-yes"]');
  check(await settles(page, () => document.querySelector('[data-step="open"]')?.dataset.done === 'yes'), '6 opened: the step is done');
  const since = await page.textContent('[data-step="open"] .setup-facts li');
  check(since?.startsWith('Open since'), `6 once open, the step says since when: "${since}"`);
  check(!(await page.$('[data-action="open-garage"]')), '6 once open, no Open button');

  // ── 360 px: the page, the form with a special, and Setup fit a phone's width ──
  await page.setViewportSize({ width: 360, height: 780 });
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await go(page, '#/rates', EN['page.rates.title']);
  check(await fits(), '360 px: the Rates page has no sideways scrolling');
  await page.click('[data-action="change-rates"]');
  await page.click('[data-action="add-special"]');
  await page.selectOption('[data-special-at="1"] [data-field="special-preset"]', 'weekends');
  check(await fits(), '360 px: the form with a special has no sideways scrolling');
  await page.click('[data-action="close-panel"]');
  await go(page, '#/setup', EN['page.setup.title']);
  check(await fits(), '360 px: Setup has no sideways scrolling');
  await page.setViewportSize({ width: 1360, height: 900 });

  // ── Spanish: the findings and the Open refusal in the other language ────
  await chooseOnSettings(page, 'language', 'es');
  await page.click('.nav-item[href="#/rates"]');
  check(await settles(page, (t) => document.querySelector('.page-title')?.textContent === t, ES['page.rates.title']), 'es: Tarifas');
  // The words as written (innerText follows a CSS capitalisation).
  const esText = await page.evaluate(() => document.querySelector('main').textContent);
  check(esText.includes(ES['rates.inForce']) && !ENGINE_WORDS.test(esText), `es: the Rates page in Spanish, no engine word${ENGINE_WORDS.test(esText) ? `: "${esText.match(ENGINE_WORDS)[0]}"` : ''}${esText.includes(ES['rates.inForce']) ? '' : '; no "Tarifas vigentes"'}`);
} catch (err) {
  failures.push(`the check stopped: ${err.message}`);
  console.error(err);
} finally {
  await browser.close();
  await server.close();
  await stub.close();
  rmSync(DIR, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.map((x) => `  - ${x}`).join('\n'));
  process.exit(1);
}
console.log(fill('rates and the Open button -- {n} checks', { n: passed }));
