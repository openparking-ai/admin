#!/usr/bin/env node
/* global document */
// The Rates page when things change under the owner, in a real browser: other
// owners' saves, this computer's clock, rates written elsewhere, taxes that
// change, and a fault while a page is drawn.
//
// Serves dist/ (run `npm run build` first) with /api sent to the stand-in
// platform (test/stub-platform.js), which asks the rate engine at this
// repository's pin for every judgement and every price, and refuses rates
// dated more than a minute from its own clock, as the platform does. In
// Chromium, the browser in Tokyo time and the garage in New York's:
//
//   ahead      rates saved a moment ago by an owner whose computer runs 45 s
//              ahead: shown as the rates in force, a save built on them,
//              naming them, and starting after them (OP-NODE-012);
//   slow       this computer's clock two minutes slow: Confirm saves, the
//              rates dated by the platform's clock (OP-NODE-014);
//   gone       a special being changed, removed by another owner while the
//              check page is open: Confirm refused, then the Rates page again
//              saying the rates changed -- never a blank screen (OP-NODE-010);
//   not here   a special with settings the form cannot show (any span, a
//              longest stay): no Change, a sentence saying why, Remove kept
//              (OP-NODE-011);
//   taxes      two lists of taxes that both number their line tax-1: the
//              calculator names the line from the list in force when the car
//              left (OP-NODE-013);
//   catcher    rates the page cannot draw: the page says something went wrong
//              and offers to load it again, never a blank screen (OP-NODE-010).
//
//   node scripts/check-rates-meanwhile.js

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { DICTIONARIES } from '../src/i18n/index.js';
import { startStub } from '../test/stub-platform.js';
import { STAYS, recordedPlans } from '../test/rates-forms.js';
import { goNav } from './nav.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const EN = DICTIONARIES.en;
const failures = [];
let passed = 0;
const check = (ok, what) => {
  if (ok) passed += 1;
  else failures.push(what);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};

const stub = await startStub();
const A = stub.data.a;
const ZONE = 'America/New_York';
const garageNamed = (name) => stub.makeGarage(A, { name, timezone: ZONE, currency: 'USD' });
const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4373, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } } });
const base = server.resolvedUrls.local[0];
stub.allowOrigin(new URL(base).origin);
const browser = await chromium.launch();
const requests = [];

const settles = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const lastSave = () => JSON.parse(requests.filter((r) => r.method === 'POST' && r.path.endsWith('/rate-plans')).at(-1)?.body || '{}');
const HOUR = 3600_000;

/** Rates stored on `garage` by owner A: the early bird's (test/rates-forms.js), as `name`, from `from`, changed by `change`. */
function store(garage, name, from, change = (p) => p) {
  const plan = change({ ...recordedPlans(new Date(from).toISOString()).early, plan_version: name, effective_from: new Date(from).toISOString() });
  stub.storeRates(garage.id, plan, A);
  return plan;
}

/** Signed in as A on `garage`'s Rates page, in a context of its own. `slowBy`: this computer's clock that many ms behind. */
async function ratesPage(garage, { slowBy = 0 } = {}) {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo', viewport: { width: 1360, height: 900 } });
  context.on('request', (r) => requests.push({ method: r.method(), path: new URL(r.url()).pathname, body: r.postData() ?? '' }));
  const page = await context.newPage();
  if (slowBy) {
    await page.clock.install({ time: new Date(Date.now() - slowBy) });
    await page.clock.resume();
  }
  await page.goto(base);
  await page.waitForSelector('.page-title');
  await page.fill('input[name="email"]', A.email);
  await page.fill('input[name="password"]', A.password);
  await page.click('button[type="submit"]');
  await page.click(`.garage-choice[data-garage="${garage.id}"]`);
  await page.waitForSelector('.nav');
  await goNav(page, '#/rates');
  return page;
}

const shownRates = (page) => page.$$eval('[data-sentences="current"] li', (els) => els.map((e) => e.textContent));

/** A new first price typed in the regular rates, the check page priced, ticked and confirmed. */
async function saveFirstPrice(page, price) {
  await page.waitForSelector('[data-field="time-first-price"]');
  await page.fill('[data-field="time-first-price"]', price);
  await page.click('[data-action="save-regular"]');
  await settles(page, () => document.querySelectorAll('[data-list="price-table"] tbody tr').length > 0 && !document.querySelector('[data-notice="table-pricing"]'), undefined, 15000);
  await page.click('[data-tick="checked-prices"]');
  await page.click('[data-action="confirm-rates"]');
}

try {
  // ── ahead: rates saved by an owner whose computer runs 45 s ahead (OP-NODE-012) ──
  {
    const garage = garageNamed('Rates ahead garage');
    store(garage, 'meanwhile-before', Date.now() - HOUR);
    const ahead = store(garage, 'meanwhile-ahead', Date.now() + 45_000, (p) => ({ ...p, rules: p.rules.map((r) => (r.type === 'grace' ? { ...r, minutes: 20 } : r)) }));
    const page = await ratesPage(garage);
    check(await settles(page, () => [...document.querySelectorAll('[data-sentences="current"] li')].some((li) => li.textContent.includes('20 minutes'))), `ahead: the rates saved a moment ahead are the rates in force (${(await shownRates(page)).join(' | ')})`);
    await saveFirstPrice(page, '9');
    const saved = await settles(page, () => Boolean(document.querySelector('[data-notice="saved"]')), undefined, 15000);
    const sent = lastSave();
    const aheadRow = stub.rateRows(garage.id).find((r) => r.plan_version === ahead.plan_version);
    check(saved, `ahead: saved${saved ? '' : ` -- ${await page.textContent('main').catch(() => '')}`}`);
    check(sent.based_on === aheadRow.id && sent.plan?.rules.find((r) => r.type === 'grace')?.minutes === 20, `ahead: the save built on the rates in force and naming them (grace ${sent.plan?.rules.find((r) => r.type === 'grace')?.minutes}, based_on ${sent.based_on === aheadRow.id ? 'the newest' : sent.based_on})`);
    check(Date.parse(sent.plan?.effective_from) > Date.parse(ahead.effective_from), `ahead: the save starts after the rates it replaces (${sent.plan?.effective_from} after ${ahead.effective_from}), so they never take over from it`);
    await page.context().close();
  }

  // ── slow: this computer's clock two minutes slow (OP-NODE-014) ──────────
  {
    const garage = garageNamed('Rates slow clock garage');
    store(garage, 'slow-before', Date.now() - HOUR);
    const page = await ratesPage(garage, { slowBy: 120_000 });
    const pressed = Date.now();
    await saveFirstPrice(page, '9');
    const saved = await settles(page, () => Boolean(document.querySelector('[data-notice="saved"]')), undefined, 15000);
    const refused = await page.$eval('[data-problem]', (el) => el.dataset.problem).catch(() => null);
    check(saved, `slow: with this computer two minutes slow, Confirm saves${saved ? '' : ` (refused: ${refused})`}`);
    const sent = lastSave();
    check(Math.abs(Date.parse(sent.plan?.effective_from) - pressed) < 60_000, `slow: the rates dated by the platform's clock, not this computer's (${sent.plan?.effective_from})`);
    await page.context().close();
  }

  // ── gone: a special removed by another owner while it is being changed (OP-NODE-010) ──
  {
    const garage = garageNamed('Rates gone special garage');
    const before = store(garage, 'gone-before', Date.now() - HOUR);
    const page = await ratesPage(garage);
    await page.click('[data-section="specials"] [data-special-in-force="1"] [data-action="change-special"]');
    await page.waitForSelector('[data-editing="change"]');
    await page.fill('[data-editing="change"] [data-field="special-flat"]', '15');
    await page.click('[data-action="save-special"]');
    await settles(page, () => document.querySelectorAll('[data-list="price-table"] tbody tr').length > 0 && !document.querySelector('[data-notice="table-pricing"]'), undefined, 15000);
    // Another owner removes the early bird and saves.
    stub.storeRates(garage.id, { ...before, plan_version: 'gone-removed', effective_from: new Date().toISOString(), adjust_order: null, rules: before.rules.filter((r) => r.type !== 'time_window') }, A);
    await page.click('[data-tick="checked-prices"]');
    await page.click('[data-action="confirm-rates"]');
    const back = await settles(page, (w) => !document.querySelector('[data-form="review-rates"]') && document.querySelector('main [data-problem="ratesChanged"]')?.textContent === w, EN['problem.ratesChanged']);
    const broke = Boolean(await page.$('[data-problem="pageBroke"]'));
    const blank = await page.evaluate(() => document.getElementById('root')?.innerText.trim() === '');
    check(back && !broke && !blank, `gone: back on the Rates page, "${EN['problem.ratesChanged']}"${broke ? ' (the page broke)' : ''}${blank ? ' (a blank screen)' : ''}`);
    check(await settles(page, (w) => document.querySelector('[data-section="specials"]')?.textContent.includes(w), EN['rates.specials.none']), 'gone: the special rates as read again, without the one removed');
    check(stub.rateRows(garage.id).length === 2, 'gone: nothing stored by the refused Confirm');
    await page.context().close();
  }

  // ── not here: a special with settings the form cannot show (OP-NODE-011) ──
  {
    const garage = garageNamed('Rates written elsewhere garage');
    store(garage, 'elsewhere', Date.now() - HOUR, (p) => {
      const other = recordedPlans(p.effective_from).other;
      const weekend = other.rules.find((r) => r.label === 'Weekend');
      return { ...p, rules: [...p.rules, { ...weekend, day_span: 'any_span', effect: { ...weekend.effect, max_duration_minutes: 2880 } }] };
    });
    const page = await ratesPage(garage);
    await page.waitForSelector('[data-special-in-force="2"]');
    const rows = await page.$$eval('[data-special-in-force]', (els) => els.map((li) => ({ name: li.querySelector('.special-name')?.textContent, change: Boolean(li.querySelector('[data-action="change-special"]')), remove: Boolean(li.querySelector('[data-action="remove-special"]')), said: li.querySelector('[data-notice="special-not-here"]')?.textContent ?? null })));
    const weekend = rows.find((r) => r.name === 'Weekend');
    const early = rows.find((r) => r.name === 'Early bird');
    check(weekend && !weekend.change && weekend.remove && weekend.said === EN['rates.special.notHere'], `not here: the special written elsewhere has no Change, "${EN['rates.special.notHere']}", and Remove (${JSON.stringify(weekend)})`);
    check(early && early.change && early.remove && early.said === null, 'not here: a special the form shows whole can be changed');
    await page.context().close();
  }

  // ── taxes: two lists that both number their line tax-1 (OP-NODE-013) ──
  {
    const garage = garageNamed('Rates two tax lists garage');
    store(garage, 'taxes-before', Date.now() - HOUR);
    stub.storeTaxList(garage.id, { effective_from: '2026-01-01T05:00:00.000000Z', rules: [{ id: 'tax-1', label: 'City parking tax', percent_bp: 600, rounding: 'nearest', sequence: 1 }] });
    stub.storeTaxList(garage.id, { effective_from: '2032-01-01T05:00:00.000000Z', rules: [{ id: 'tax-1', label: 'State parking tax', percent_bp: 800, rounding: 'nearest', sequence: 1 }] });
    const page = await ratesPage(garage);
    const calc = '[data-section="calculator"]';
    await page.waitForSelector(`${calc} [data-field="try-entry"]`);
    await page.fill(`${calc} [data-field="try-entry"]`, STAYS.plain.entry);
    await page.fill(`${calc} [data-field="try-exit"]`, STAYS.plain.exit);
    await page.click(`${calc} [data-action="try-stay"]`);
    await settles(page, () => Boolean(document.querySelector('[data-section="calculator"] [data-tried="priced"] [data-line-tax="yes"]')), undefined, 15000);
    const taxLines = await page.$$eval(`${calc} [data-line-tax="yes"]`, (rows) => rows.map((r) => `${r.cells[0].textContent} ${r.cells[1].textContent}`));
    check(taxLines.length === 1 && taxLines[0].startsWith('City parking tax '), `taxes: a stay that left in 2031 taxed and named by the list in force then: ${taxLines.join(' | ')}`);
    await page.context().close();
  }

  // ── catcher: rates the page cannot draw (OP-NODE-010) ──────────────────
  {
    const garage = garageNamed('Rates unreadable garage');
    store(garage, 'unreadable', Date.now() - HOUR, (p) => ({ ...p, rules: 'not a list of rules' }));
    const page = await ratesPage(garage);
    const caught = await settles(page, (w) => document.querySelector('[data-problem="pageBroke"] p')?.textContent === w, EN['problem.unexpected']);
    const blank = await page.evaluate(() => document.getElementById('root')?.innerText.trim() === '');
    check(caught && !blank, `catcher: a fault while drawing says "${EN['problem.unexpected']}"${blank ? ' (a blank screen)' : ''}`);
    const again = await page.textContent('[data-problem="pageBroke"] [data-action="load-again"]').catch(() => null);
    check(again === EN.retry, `catcher: and offers "${EN.retry}"`);
    if (again) {
      await Promise.all([page.waitForEvent('load', { timeout: 10000 }), page.click('[data-problem="pageBroke"] [data-action="load-again"]')]);
      check(await settles(page, () => document.getElementById('root')?.innerText.trim() !== ''), `catcher: "${EN.retry}" loads the page again`);
    }
    await page.context().close();
  }
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
