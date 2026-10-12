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
//   U7g fix 1:
//   F2  every tick with words (a special's days, the most per day and per
//       week, grace, the confirmation), in English and Spanish, at 1280 and
//       360 px: no tick's words over another tick or a field; a press at each
//       day's centre ticks that day; the confirmation in at most three lines
//       at 1280 px;
//   F3  Open refused because a lane computer went quiet as it was pressed:
//       ONE message on the open step, and Setup read again, so the checklist
//       above no longer says that step is done;
//   F4  check 6 reads the button's real `disabled`, and a press sends nothing;
//   F7  the start day offers only days after today;
//   E1  the price table says, in words, where the time-based rate was charged
//       because it was less than the special.
//
//   U7g fix 2:
//   G2  Try a stay on the re-gate's walk plan saved (a discount and a service
//       fee on every stay), each short stay, English and Spanish: the words say
//       the hour was less, though the discount and the fee applied too;
//   G4  every tick and every field inside its own box -- its special's, and the
//       panel -- in English and Spanish, at 1280 and 360 px;
//   F7  a fresh page in Spanish, today typed as the start day, the FIRST press
//       of Review: the app's own sentence (the form has noValidate).
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
import { buildPlan, moneyText, tableStays } from '../src/rates.js';
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
// A second, with nothing stored, for the Spanish pass over the form (F2).
const SPANISH = stub.makeGarage(A, { name: 'Rates check garage es', timezone: 'America/New_York', currency: 'USD' });
const recorded = recordedPlans({ buildPlan, startOfDay, tableStays });
// A third, holding only the re-gate's walk plan (a discount and a service fee), for Try a stay (fix 2, G2).
const WALK = stub.makeGarage(A, { name: 'Rates check walk garage', timezone: 'America/New_York', currency: 'USD' });
stub.storeRates(WALK.id, recorded.walk.plan);
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

/**
 * F2: every worded tick in view, as drawn -- the tick and its words together --
 * over no other tick and no field, and (where days are shown) a press at each
 * day's centre ticking that day and no other. `where` names the screen.
 */
async function ticksHold(page, where) {
  const r = await page.evaluate(() => {
    const shown = (el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0;
    };
    const drawn = (el) => {
      const rects = [el, ...el.querySelectorAll('*')].filter(shown).map((e) => e.getBoundingClientRect());
      return { l: Math.min(...rects.map((x) => x.left)), t: Math.min(...rects.map((x) => x.top)), r: Math.max(...rects.map((x) => x.right)), b: Math.max(...rects.map((x) => x.bottom)) };
    };
    const meet = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
    const ticks = [...document.querySelectorAll('main .tick-words')].filter(shown);
    const fields = [...document.querySelectorAll('main input, main select, main textarea, main button:not(.tick-words)')].filter(shown);
    const over = [];
    ticks.forEach((tk, i) => {
      const a = drawn(tk);
      ticks.forEach((other, j) => {
        if (j > i && meet(a, drawn(other))) over.push(`${tk.dataset.tick} over ${other.dataset.tick}`);
      });
      for (const f of fields) if (!tk.contains(f) && meet(a, f.getBoundingClientRect())) over.push(`${tk.dataset.tick} over ${f.dataset.field ?? f.dataset.action ?? f.tagName}`);
    });
    // G4: each tick and each field inside its own box -- a special's box, and the panel --
    // not only free of the others: a row of days that will not wrap runs off the side.
    const outside = [];
    for (const el of [...ticks, ...fields]) {
      const a = el.classList.contains('tick-words') ? drawn(el) : el.getBoundingClientRect();
      const a2 = { l: a.l ?? a.left, r: a.r ?? a.right };
      for (const box of [el.closest('[data-special-at]'), el.closest('.panel')].filter(Boolean)) {
        const b = box.getBoundingClientRect();
        if (a2.r > b.right + 0.5 || a2.l < b.left - 0.5) outside.push(`${el.dataset.tick ?? el.dataset.field ?? el.dataset.action ?? el.tagName} past ${box.dataset.specialAt ? `special ${box.dataset.specialAt}` : 'the panel'} by ${Math.round(Math.max(a2.r - b.right, b.left - a2.l))} px`);
      }
    }
    return { n: ticks.length, over, outside };
  });
  check(r.n > 0 && r.over.length === 0, `F2 ${where}: ${r.n} ticks with words, none over another tick or a field${r.over.length ? `: ${r.over.slice(0, 4).join('; ')}` : ''}`);
  check(r.outside.length === 0, `G4 ${where}: every tick and field inside its own box${r.outside.length ? `: ${r.outside.slice(0, 4).join('; ')}` : ''}`);
  // A real press at each day's centre, then back.
  const days = await page.$$eval('main [data-tick^="day-"]', (els) => els.map((e, i) => ({ i, tick: e.dataset.tick })));
  const wrong = [];
  for (const { i, tick } of days) {
    const at = page.locator('main [data-tick^="day-"]').nth(i);
    await at.scrollIntoViewIfNeeded();
    const centre = await at.evaluate((el) => {
      const rects = [el, ...el.querySelectorAll('*')].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
      const l = Math.min(...rects.map((x) => x.left));
      const r = Math.max(...rects.map((x) => x.right));
      const t = Math.min(...rects.map((x) => x.top));
      const b = Math.max(...rects.map((x) => x.bottom));
      return { x: (l + r) / 2, y: (t + b) / 2 };
    });
    const states = () => page.$$eval('main [data-tick^="day-"]', (els) => els.map((e) => e.getAttribute('aria-checked')));
    const before = await states();
    await page.mouse.click(centre.x, centre.y);
    const after = await states();
    const changed = after.map((v, k) => (v !== before[k] ? k : -1)).filter((k) => k >= 0);
    if (changed.length !== 1 || changed[0] !== i) wrong.push(`${tick} (${changed.map((k) => days[k]?.tick).join(', ') || 'nothing'} changed)`);
    if (changed.length) await page.mouse.click(centre.x, centre.y);
  }
  if (days.length) check(wrong.length === 0, `F2 ${where}: a press at each of ${days.length} days' centres ticks that day${wrong.length ? `: ${wrong.slice(0, 3).join('; ')}` : ''}`);
}

/** F2: how many lines the confirmation's words take. */
const confirmLines = (page) =>
  page.$eval('[data-tick="checked-prices"] > span:last-child', (el) => {
    // The line boxes of the words themselves: a flex item reports one rect however many lines it holds.
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
  });

/** The worded ticks of the form at 1280 and 360 px, with the most per week shown too; then as it was. */
async function formTicksHold(page, language) {
  await page.click('[data-tick="week-max-on"]');
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await ticksHold(page, `${language}, the form, ${width} px`);
  }
  await page.click('[data-tick="week-max-on"]');
  await page.setViewportSize({ width: 1360, height: 900 });
}

/** The confirmation tick at 1280 and 360 px: over nothing, and in at most three lines at 1280. */
async function confirmTickHolds(page, language) {
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await ticksHold(page, `${language}, the confirmation, ${width} px`);
    if (width === 1280) {
      const lines = await confirmLines(page);
      check(lines >= 1 && lines <= 3, `F2 ${language}: the confirmation is ${lines} line(s) at 1280 px`);
    }
  }
  await page.setViewportSize({ width: 1360, height: 900 });
}

/** The form's time-based rate filled in by hand as `f`, the table form: what the browser check prices. */
async function fillForm(page, f) {
  await set(page, '[data-field="time-first-minutes"]', f.time.firstMinutes);
  await set(page, '[data-field="time-first-price"]', f.time.firstPrice);
  await set(page, '[data-field="time-next-minutes"]', f.time.nextMinutes);
  await set(page, '[data-field="time-next-price"]', f.time.nextPrice);
}

/** The rest of the table form, the start day included. `words` is the language's dictionary. */
async function fillRest(page, f, words) {
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
    check(ticked.join() === s.days.join(), `special ${i + 1}: "${words[`rates.preset.${s.preset}`]}" ticks its days: ${ticked.join(', ')}`);
    await set(page, `${at} [data-field="special-enter-from"]`, s.enterFrom);
    await set(page, `${at} [data-field="special-enter-by"]`, s.enterBy);
    await set(page, `${at} [data-field="special-leave-by"]`, s.leaveBy);
    await page.click(`${at} [data-control="next-day"] [data-value="${s.nextDay}"]`);
    await pick(page, `${at} [data-field="special-charge"]`, s.charge);
    await set(page, `${at} [data-field="special-flat"]`, s.flat);
  }
  await page.click('[data-control="starts"] [data-value="day"]');
  await set(page, '[data-field="rates-day"]', f.day);
}

/**
 * G2 (fix 2): Try a stay on the walk plan saved, each short stay the table holds:
 * the hour was charged as less, and the words say so though the discount and the
 * fee applied too. In a page of its own, in the owner's language as it stands.
 */
async function walkTries(language, words) {
  const ctx = await browser.newContext({ locale: language === 'es' ? 'es-US' : 'en-US', timezoneId: 'Asia/Tokyo', viewport: { width: 1360, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(base);
  await p.waitForSelector('.page-title');
  await p.fill('input[name="email"]', A.email);
  await p.fill('input[name="password"]', A.password);
  await p.click('button[type="submit"]');
  await p.click(`.garage-choice[data-garage="${WALK.id}"]`);
  await p.waitForSelector('.nav');
  await go(p, '#/rates', words['page.rates.title']);
  const windows = recorded.walk.plan.rules.filter((r) => r.type === 'time_window');
  for (const [i, stay] of recorded.walk.short.entries()) {
    const [a] = stub.recordedTry(`a stay tried, the walk plan saved, short stay ${i + 1}`).stays;
    const line = a.rate_lines.find((l) => l.code === 'time_based_used');
    const want = fill(words['rates.why.timeLess'], { name: windows.find((r) => r.id === line.rule_id).label, special: moneyText(line.compared_minor, 'USD', language), time: moneyText(a.subtotal_minor, 'USD', language) });
    await set(p, '[data-field="try-entry"]', stay.entry);
    await set(p, '[data-field="try-exit"]', stay.exit);
    // Each try answered afresh: every short stay costs the same, so an old answer would read alike.
    const [res] = await Promise.all([p.waitForResponse((r) => r.url().endsWith('/rate-plans/try'), { timeout: 5000 }), p.click('[data-action="try-stay"]')]);
    const priced = res.status() === 200 && (await settles(p, (fee) => document.querySelector('[data-tried="priced"]')?.dataset.fee === fee, String(a.fee_minor)));
    const said = (await p.textContent('[data-special-words]').catch(() => '')) ?? '';
    const adjusted = a.rate_lines.filter((l) => l.code === 'time_window.applied').length;
    check(priced && said.includes(want) && adjusted === 2, `G2 ${language} try a stay on the walk plan, short stay ${i + 1} (${stay.entry}): "${said}"`);
  }
  await ctx.close();
}

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
  await fillForm(page, f);
  // Nothing is chosen for the owner: the review is refused until it is.
  await page.click('[data-action="review-rates"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-problem-at="time.rounding"]'))), 'a started period is not chosen for the owner: asked for');
  await fillRest(page, f, EN);
  // F7: the start day offers only days after today, and a day that is not is refused.
  await page.click('[data-control="starts"] [data-value="day"]');
  const min = await page.getAttribute('[data-field="rates-day"]', 'min');
  const tomorrow = await page.evaluate((zone) => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  }, RIVERSIDE.timezone);
  check(min === tomorrow, `F7 the start day offers days from tomorrow in the garage's time (${min}, tomorrow ${tomorrow})`);
  const today = new Date(Date.parse(`${tomorrow}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  for (const [day, what] of [[today, 'today'], ['2020-01-06', 'a past day']]) {
    await set(page, '[data-field="rates-day"]', day);
    await page.click('[data-action="review-rates"]');
    check(await settles(page, (w) => document.querySelector('[data-problem-at="day"]')?.textContent.includes(w), EN['rates.need.dayAfterToday']) && !(await page.$('[data-form="review-rates"]')), `F7 ${what} as the start day: refused, "${EN['rates.need.dayAfterToday']}"`);
  }
  await set(page, '[data-field="rates-day"]', f.day);
  await formTicksHold(page, 'en');
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
  // E1: a short stay inside the early bird's times, where the hour is less than it: the words say so.
  const short = await page.$$eval('[data-list="price-table"] tbody tr[data-why="specialShort"]', (rows) => rows.map((r) => ({ fee: Number(r.dataset.fee), says: r.cells[6].textContent })));
  const earlyShort = short.find((r) => r.says.includes('Early bird fit'));
  const timeLess = fill(EN['rates.why.timeLess'], { name: 'Early bird', time: moneyText(800, 'USD', 'en'), special: moneyText(1500, 'USD', 'en') });
  check(earlyShort?.fee === 800 && earlyShort.says.includes(timeLess), `E1 the table: "${earlyShort?.says}" (${earlyShort?.fee})`);
  // F1: the rows about the most per day say what the engine's breakdown of each says.
  const capRows = await page.$$eval('[data-list="price-table"] tbody tr[data-why^="dayMax"]', (rows) => rows.map((r) => `${r.dataset.why}=${r.dataset.says}`));
  check(capRows.join() === 'dayMaxTakes=dayMaxTakes,dayMaxBefore=dayMaxBefore', `F1 the most per day: ${capRows.join(', ')}`);
  await confirmTickHolds(page, 'en');
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
  // E1: a stay the hour prices for less than the early bird: the line, in words.
  await set(page, '[data-field="try-entry"]', recorded.table.short.entry);
  await set(page, '[data-field="try-exit"]', recorded.table.short.exit);
  await page.click('[data-action="try-stay"]');
  check(await settles(page, () => document.querySelector('[data-tried="priced"]')?.dataset.fee === '800'), 'E1 try a stay, less by the hour: priced at $8.00');
  const lessWords = await page.textContent('[data-special-words]').catch(() => '');
  check((lessWords ?? '').includes(timeLess), `E1 try a stay: "${lessWords}"`);

  // ── Check 6: the Open button ───────────────────────────────────────────
  await go(page, '#/setup', EN['page.setup.title']);
  await page.waitForSelector('[data-step="open"]');
  const missing = await page.$$eval('[data-still-missing]', (els) => els.map((e) => e.dataset.stillMissing));
  // F4: the button's own `disabled` (not aria-disabled, which a press ignores), and a press sends nothing.
  const activations = () => requests.filter((r) => r.method === 'POST' && r.path.endsWith('/activate')).length;
  const sentBefore = activations();
  const reallyDisabled = await page.$eval('[data-action="open-garage"]', (b) => b.disabled === true);
  await page.$eval('[data-action="open-garage"]', (b) => b.click());
  if (await page.$('[data-action="open-yes"]')) await page.click('[data-action="open-yes"]');
  await page.waitForTimeout(300);
  check(missing.length > 0 && reallyDisabled && activations() === sentBefore, `6 steps missing (${missing.join(', ')}): Open cannot be pressed${reallyDisabled ? '' : ' (not disabled)'}${activations() === sentBefore ? '' : ' (a press reached the platform)'}`);
  if (await page.$('[data-action="open-no"]')) await page.click('[data-action="open-no"]');
  const toLanes = await page.$('[data-still-missing="lanes"] a');
  if (toLanes) {
    await toLanes.click();
    check(await settles(page, (t) => document.querySelector('.page-title')?.textContent === t, EN['page.lanes.title']), '6 a missing step leads to where it is done');
    await go(page, '#/setup', EN['page.setup.title']);
  }
  // Every step done, and a lane computer goes quiet just as Open is pressed (the gate's walk).
  stub.openingAs(RIVERSIDE.id, { shown: [], refuse: ['lane_computers'], goesUndone: true, allDone: true });
  await go(page, '#/rates', EN['page.rates.title']);
  await go(page, '#/setup', EN['page.setup.title']);
  await page.waitForSelector('[data-action="open-garage"]');
  check((await page.$eval('[data-step="lane_computers"]', (el) => el.dataset.done)) === 'yes', 'F3 before Open: "Lanes connected" is Done (the control on the re-read)');
  check(!(await page.isDisabled('[data-action="open-garage"]')), '6 nothing missing: Open can be pressed');
  await page.click('[data-action="open-garage"]');
  check((await page.textContent('[data-notice="open-stays-open"]')) === EN['setup.open.confirm'], '6 one confirmation: once open, it stays open');
  await page.click('[data-action="open-yes"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-notice="open-refused"] [data-still-missing="lane_computers"]'))), '6 refused: what is missing listed in plain words');
  // F3: one message on the open step, and Setup read again: the step above is not Done any more.
  check(await settles(page, () => document.querySelector('[data-step="lane_computers"]')?.dataset.done === 'no'), 'F3 refused: Setup read again, "Lanes connected" is not Done above');
  const openStep = await page.$eval('[data-step="open"]', (el) => ({
    notices: [...el.querySelectorAll('[data-notice]')].map((n) => n.dataset.notice),
    facts: [...el.querySelectorAll(':scope > .setup-facts > li')].map((li) => li.textContent),
    problems: el.querySelectorAll('.problem, [data-problem]').length,
    text: el.innerText,
  }));
  const said = [EN['setup.fact.canOpen'], EN['problem.notReadyToOpen'], EN['setup.open.missing']].filter((x) => openStep.text.includes(x));
  check(openStep.notices.join() === 'open-refused' && openStep.facts.length === 0 && openStep.problems === 0 && said.length === 0, `F3 refused: the open step says one thing (${openStep.notices.join(', ') || 'no notice'}${openStep.facts.length ? `; facts: ${openStep.facts.join(' / ')}` : ''}${said.length ? `; also: ${said.join(' / ')}` : ''})`);
  check(await page.$eval('[data-action="open-garage"]', (b) => b.disabled === true), 'F3 refused: Open cannot be pressed again until the step is done');
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

  // ── G2 (fix 2): Try a stay on the walk plan, a discount and a fee on every stay ──
  await walkTries('en', EN);

  // ── Spanish: the findings and the Open refusal in the other language ────
  await chooseOnSettings(page, 'language', 'es');
  await page.click('.nav-item[href="#/rates"]');
  check(await settles(page, (t) => document.querySelector('.page-title')?.textContent === t, ES['page.rates.title']), 'es: Tarifas');
  // The words as written (innerText follows a CSS capitalisation).
  const esText = await page.evaluate(() => document.querySelector('main').textContent);
  check(esText.includes(ES['rates.inForce']) && !ENGINE_WORDS.test(esText), `es: the Rates page in Spanish, no engine word${ENGINE_WORDS.test(esText) ? `: "${esText.match(ENGINE_WORDS)[0]}"` : ''}${esText.includes(ES['rates.inForce']) ? '' : '; no "Tarifas vigentes"'}`);

  // ── F2 in Spanish: the form's ticks and the confirmation, on a garage with nothing stored ──
  const es = await (await browser.newContext({ locale: 'es-US', timezoneId: 'Asia/Tokyo', viewport: { width: 1360, height: 900 } })).newPage();
  await es.goto(base);
  await es.waitForSelector('.page-title');
  await es.fill('input[name="email"]', A.email);
  await es.fill('input[name="password"]', A.password);
  await es.click('button[type="submit"]');
  await es.click(`.garage-choice[data-garage="${SPANISH.id}"]`);
  await es.waitForSelector('.nav');
  await go(es, '#/rates', ES['page.rates.title']);
  await es.click('[data-action="change-rates"]');
  await es.waitForSelector('[data-form="change-rates"]');
  await fillForm(es, TABLE_FORM);
  await fillRest(es, TABLE_FORM, ES);
  // F7 (fix 2): today typed as the start day, and Review pressed for the FIRST time on
  // this page: the app's own sentence, in Spanish -- never the browser's bubble.
  await set(es, '[data-field="rates-day"]', today);
  await es.click('[data-action="review-rates"]');
  check(
    (await settles(es, (w) => document.querySelector('[data-problem-at="day"]')?.textContent.includes(w), ES['rates.need.dayAfterToday'])) && !(await es.$('[data-form="review-rates"]')),
    `F7 es, a fresh page, today typed, the first press of Review: "${ES['rates.need.dayAfterToday']}"`,
  );
  await set(es, '[data-field="rates-day"]', TABLE_FORM.day);
  await formTicksHold(es, 'es');
  await es.click('[data-action="review-rates"]');
  await es.click('[data-action="price-table"]');
  check(await settles(es, () => document.querySelectorAll('[data-list="price-table"] tbody tr').length > 0), 'es: the price table is priced');
  const esShort = await es.$$eval('[data-list="price-table"] tbody tr[data-why="specialShort"]', (rows) => rows.map((r) => r.cells[6].textContent));
  const esLess = fill(ES['rates.why.timeLess'], { name: 'Early bird', time: moneyText(800, 'USD', 'es'), special: moneyText(1500, 'USD', 'es') });
  check(esShort.some((x) => x.includes(esLess)), `E1 es: the table says "${esLess}" (${esShort.find((x) => x.startsWith('Early bird'))})`);
  await confirmTickHolds(es, 'es');
  await walkTries('es', ES);
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
