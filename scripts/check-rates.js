#!/usr/bin/env node
/* global document, window, getComputedStyle, NodeFilter */
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
//   U7i (the owner's walk, 2026-10-12), checks 1-10 of its brief:
//   1   every frame of the form whole: its top line unbroken, nothing within
//       12 px of its edges (en, es; 1280, 360 px);
//   2   three fields missing: three red frames, three named links by the
//       Save, the first focused, and each link going to its field;
//   3   no date or time box shows digits before a pick: a plain prompt, and a
//       picked value in full dark text;
//   4   two saves, the regular rates and each special on its own: each sends
//       exactly the document the page builds (recorded), the other part byte
//       for byte as stored, and its table priced on the rates whole;
//   5   one stay, one fee: the calculator on the rates in force and on the
//       rates being changed, the table, and a real close (recorded on the
//       same weekday and times); the calculator asks the platform;
//   6   the check page prices its table as it opens and when a stay is added;
//   7   a "$", "minutes" or "%" inside every number's box; the calculator
//       first on the check page, and saving nothing;
//   8   every field empty on opening with its value in force beside it; all
//       left empty, the rates sent are the ones in force;
//   9   each set of rates says who saved and confirmed it, and when, from its
//       own change-log line;
//   10  no wait cursor anywhere; every locked control with its reason beside
//       it -- and the check page's steps, the one to do marked.
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
import { CARRY_DAYS, TABLE_FORM, TWO_SAVE_DAYS, carrySaves, recordedPlans } from '../test/rates-forms.js';
import { buildPlan, moneyText, tableStays } from '../src/rates.js';
import { garageDateTime } from '../src/time.js';
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
// U7i fix 1: a garage with rates in force (stored on the stand-in's side, from a past day, as
// the owner saved them) for the walk of a change carried into rates saved to start later.
const CARRY_DOCS = carrySaves({ startOfDay, inForceFrom: '2026-01-05T00:00:00-05:00' });
const CARRY = stub.makeGarage(A, { name: 'Rates carry garage', timezone: 'America/New_York', currency: 'USD' });
stub.storeRates(CARRY.id, CARRY_DOCS.now, A);
// And one whose rates in force hold a special (the early bird, from a past day): the special
// rates as they will be start with the ones in force (the real platform's walk found it unlisted).
const IN_FORCE_SPECIAL = stub.makeGarage(A, { name: 'Rates special in force garage', timezone: 'America/New_York', currency: 'USD' });
stub.storeRates(IN_FORCE_SPECIAL.id, { ...CARRY_DOCS.early, effective_from: '2026-01-05T00:00:00-05:00' }, A);
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
      for (const box of [el.closest('[data-special-new], [data-special-in-force]'), el.closest('.panel')].filter(Boolean)) {
        const b = box.getBoundingClientRect();
        if (a2.r > b.right + 0.5 || a2.l < b.left - 0.5) outside.push(`${el.dataset.tick ?? el.dataset.field ?? el.dataset.action ?? el.tagName} past ${box.matches('[data-special-new], [data-special-in-force]') ? 'its special' : 'the panel'} by ${Math.round(Math.max(a2.r - b.right, b.left - a2.l))} px`);
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

/** The regular rates filled in by hand as `f` (the table form's): the time-based rate, the most per day, grace. */
async function fillRegular(page, f, { rounding = true } = {}) {
  await set(page, '[data-field="time-first-minutes"]', f.time.firstMinutes);
  await set(page, '[data-field="time-first-price"]', f.time.firstPrice);
  await set(page, '[data-field="time-next-minutes"]', f.time.nextMinutes);
  await set(page, '[data-field="time-next-price"]', f.time.nextPrice);
  if (rounding) await pick(page, '[data-field="time-rounding"]', 'ceil');
}
async function fillRegularRest(page, f) {
  await pick(page, '[data-field="time-rounding"]', 'ceil');
  if ((await page.getAttribute('[data-tick="day-max-on"]', 'aria-checked')) !== 'true') await page.click('[data-tick="day-max-on"]');
  await set(page, '[data-field="day-max-price"]', f.dayMax.price);
  await pick(page, '[data-field="day-max-kind"]', f.dayMax.kind);
  await page.click('[data-tick="grace-on"]');
  await set(page, '[data-field="grace-minutes"]', f.grace.minutes);
}

/** When a save starts: "from the start of" `day`, in the section `within`. */
async function startsOn(page, within, day) {
  await page.click(`${within} [data-control="starts"] [data-value="day"]`);
  await set(page, `${within} [data-field="rates-day"]`, day);
}

/** A new special, filled in by hand as `s`, in the special being added. `words` is the language's dictionary. */
async function fillSpecial(page, s, words, i) {
  const at = '[data-special-new]';
  await set(page, `${at} [data-field="special-name"]`, s.name);
  await pick(page, `${at} [data-field="special-preset"]`, s.preset);
  const ticked = await page.$$eval(`${at} [data-tick^="day-"][aria-checked="true"]`, (els) => els.map((e) => e.dataset.tick.slice(4)));
  check(ticked.join() === s.days.join(), `special ${i}: "${words[`rates.preset.${s.preset}`]}" ticks its days: ${ticked.join(', ')}`);
  await set(page, `${at} [data-field="special-enter-from"]`, s.enterFrom);
  await set(page, `${at} [data-field="special-enter-by"]`, s.enterBy);
  await set(page, `${at} [data-field="special-leave-by"]`, s.leaveBy);
  await page.click(`${at} [data-control="next-day"] [data-value="${s.nextDay}"]`);
  await pick(page, `${at} [data-field="special-charge"]`, s.charge);
  await set(page, `${at} [data-field="special-flat"]`, s.flat);
}

/** The check page open and its table priced by itself, no press: the try it sent, and its rows. */
async function reviewPriced(page, what) {
  const opened = await settles(page, () => Boolean(document.querySelector('[data-form="review-rates"]')));
  const priced = await settles(page, () => document.querySelectorAll('[data-list="price-table"] tbody tr').length > 0 && !document.querySelector('[data-notice="table-pricing"]'));
  check(opened && priced, `6 ${what}: the check page prices its table as it opens, with no press`);
  check(!(await page.$('[data-action="price-table"]')), `6 ${what}: no "Price these stays" button`);
  const tried = requests.filter((r) => r.path.endsWith('/rate-plans/try') && JSON.parse(r.body || '{}').stays?.length > 1).at(-1);
  return tried ? JSON.parse(tried.body) : null;
}
/** Two documents the same but for their names. */
const sameDoc = (a, b) => JSON.stringify({ ...a, plan_version: null }) === JSON.stringify({ ...b, plan_version: null });

/**
 * Check 1: every frame of the form -- each part of the regular rates, each
 * special's box -- with its top line unbroken (no title sitting on it) and no
 * text or field within 12 px of its edges.
 */
async function framesHold(page, where) {
  const r = await page.evaluate(() => {
    const shown = (el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const frames = [...document.querySelectorAll('main fieldset.rates-part, main [data-special-new], main .special-in-force')].filter(shown);
    const bad = [];
    for (const f of frames) {
      const box = f.getBoundingClientRect();
      const cs = getComputedStyle(f);
      const top = box.top + parseFloat(cs.borderTopWidth);
      const name = f.dataset.part ?? (f.dataset.specialNew !== undefined ? 'the new special' : `special ${f.dataset.specialInForce}`);
      const legend = f.querySelector(':scope > legend');
      if (legend && shown(legend) && legend.getBoundingClientRect().top < top - 0.5) bad.push(`${name}: its title sits on the top line`);
      // Every piece of text, and every field, at least 12 px inside the frame.
      const pieces = [];
      const walker = document.createTreeWalker(f, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim() || !shown(n.parentElement)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const rect of range.getClientRects()) if (rect.width > 0) pieces.push({ rect, what: n.textContent.trim().slice(0, 24) });
      }
      for (const el of f.querySelectorAll('input, select, button, .unit-box')) if (shown(el)) pieces.push({ rect: el.getBoundingClientRect(), what: el.dataset.field ?? el.dataset.tick ?? el.dataset.action ?? el.tagName });
      for (const { rect, what } of pieces) {
        const gap = Math.min(rect.left - box.left, box.right - rect.right, rect.top - box.top, box.bottom - rect.bottom);
        if (gap < 12 - 0.5) bad.push(`${name}: "${what}" ${Math.round(gap)} px from the edge`);
      }
    }
    return { n: frames.length, bad };
  });
  check(r.n > 0 && r.bad.length === 0, `1 ${where}: ${r.n} frames, each top line whole and nothing within 12 px of an edge${r.bad.length ? `: ${r.bad.slice(0, 4).join('; ')}` : ''}`);
}

/**
 * Check 3: no date or time box shows digits before a pick -- its value empty,
 * its own text not drawn, a plain prompt shown -- and a picked one in full dark text.
 */
async function datesHold(page, where) {
  await page.evaluate(() => document.activeElement?.blur());
  const r = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('main input[type="date"], main input[type="time"], main input[type="datetime-local"]')].filter((el) => el.getBoundingClientRect().width > 0);
    const primary = getComputedStyle(document.body).color;
    const bad = [];
    let empty = 0;
    for (const el of boxes) {
      const prompt = el.parentElement.querySelector('.when-prompt');
      const promptShown = prompt && getComputedStyle(prompt).display !== 'none';
      const colour = getComputedStyle(el).color;
      const drawn = !/rgba\(0, 0, 0, 0\)|transparent/.test(colour);
      const name = el.dataset.field;
      if (el.value === '') {
        empty += 1;
        if (drawn) bad.push(`${name} empty, its own text drawn (${colour})`);
        if (!promptShown) bad.push(`${name} empty, no prompt`);
      } else {
        if (colour !== primary) bad.push(`${name} picked, in ${colour}, not the dark text ${primary}`);
        if (promptShown) bad.push(`${name} picked, the prompt still shown`);
      }
    }
    return { n: boxes.length, empty, bad, prompts: [...new Set(boxes.map((el) => el.parentElement.querySelector('.when-prompt')?.textContent))] };
  });
  check(r.n > 0 && r.bad.length === 0, `3 ${where}: ${r.n} date and time boxes (${r.empty} empty, each "${r.prompts.join('" / "')}"), none showing digits before a pick${r.bad.length ? `: ${r.bad.slice(0, 4).join('; ')}` : ''}`);
}

/**
 * Check 10: nothing on the page has a wait or progress cursor, and every
 * locked control has its reason beside it, in its own row (a pager's arrow
 * has the page it is on, said beside it).
 */
async function lockedHold(page, where, { atLeast = 1 } = {}) {
  const r = await page.evaluate(() => {
    const shown = (el) => el.getBoundingClientRect().width > 0;
    const waits = [...document.querySelectorAll('main *')].filter((el) => shown(el) && /wait|progress/.test(getComputedStyle(el).cursor)).map((el) => el.dataset.action ?? el.dataset.tick ?? el.tagName);
    const locked = [...document.querySelectorAll('main button:disabled, main input:disabled, main select:disabled')].filter(shown);
    const silent = [];
    for (const el of locked) {
      if (el.closest('.pager')?.querySelector('.pager-where')) continue;
      const key = el.dataset.action ?? el.dataset.tick;
      const row = el.closest('.act-row, .tick-row');
      const reason = row?.querySelector(`[data-reason-for="${key}"]`);
      if (!reason || !shown(reason) || !reason.textContent.trim()) silent.push(key ?? el.tagName);
    }
    return { waits, locked: locked.length, silent };
  });
  check(r.waits.length === 0, `10 ${where}: no wait or progress cursor${r.waits.length ? `: ${r.waits.slice(0, 4).join(', ')}` : ''}`);
  check(r.locked >= atLeast && r.silent.length === 0, `10 ${where}: ${r.locked} locked control(s), each with its reason beside it${r.silent.length ? `; none for: ${r.silent.join(', ')}` : ''}`);
}

/** Check 7: every money field shows "$", every minutes field "minutes", every percent "%", inside its box. */
const MONEY = ['time-first-price', 'time-next-price', 'day-max-price', 'week-max-price', 'special-flat', 'special-rate-first-price', 'special-rate-next-price'];
const MINUTES = ['time-first-minutes', 'time-next-minutes', 'grace-minutes', 'special-rate-first-minutes', 'special-rate-next-minutes'];
async function unitsHold(page, where, words, extra = {}) {
  const want = { ...Object.fromEntries(MONEY.map((f) => [f, '$'])), ...Object.fromEntries(MINUTES.map((f) => [f, words['rates.unit.minutes']])), ...extra };
  const r = await page.evaluate((want) => {
    const out = [];
    for (const [field, unit] of Object.entries(want)) {
      for (const el of document.querySelectorAll(`main input[data-field="${field}"]`)) {
        if (el.getBoundingClientRect().width === 0) continue;
        const box = el.closest('.unit-box');
        const said = box ? [...box.querySelectorAll('[data-unit-text]')].filter((u) => u.getBoundingClientRect().width > 0).map((u) => u.textContent) : [];
        const inside = box && [...box.querySelectorAll('[data-unit-text]')].every((u) => {
          const a = u.getBoundingClientRect();
          const b = box.getBoundingClientRect();
          return a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
        });
        out.push({ field, unit, said, ok: said.length === 1 && said[0] === unit && inside });
      }
    }
    return out;
  }, want);
  const bad = r.filter((x) => !x.ok);
  check(r.length > 0 && bad.length === 0, `7 ${where}: ${r.length} number fields, each with its unit inside its box${bad.length ? `: ${bad.map((x) => `${x.field} shows "${x.said.join('')}", not "${x.unit}"`).slice(0, 4).join('; ')}` : ''}`);
}

/**
 * Check 8: on opening, no field holds a value; each has the value in force
 * beside it ("Now: ..."), and each tick says how it is now.
 */
async function nothingPrefilled(page, within, where, words) {
  const r = await page.evaluate(
    ({ within, now }) => {
      const area = document.querySelector(within);
      const fields = [...area.querySelectorAll('input[type="text"], select, input[type="time"], input[type="date"]')].filter((el) => el.getBoundingClientRect().width > 0 && el.dataset.field !== 'rates-day');
      const filled = fields.filter((el) => el.value !== '').map((el) => `${el.dataset.field}=${el.value}`);
      const noNow = fields.filter((el) => !el.closest('label')?.querySelector('[data-now]')?.textContent.startsWith(now)).map((el) => el.dataset.field);
      const ticks = [...area.querySelectorAll(':scope fieldset.rates-part [data-tick]')];
      const tickNoNow = ticks.filter((tk) => !tk.closest('fieldset').querySelector(':scope > [data-now]')?.textContent.startsWith(now)).map((tk) => tk.dataset.tick);
      return { n: fields.length, filled, noNow, ticks: ticks.length, tickNoNow };
    },
    { within, now: words['rates.now'].split('{')[0] },
  );
  check(r.n > 0 && r.filled.length === 0, `8 ${where}: ${r.n} fields, none prefilled${r.filled.length ? `: ${r.filled.join(', ')}` : ''}`);
  check(r.noNow.length === 0 && r.tickNoNow.length === 0, `8 ${where}: each field and each of ${r.ticks} ticks says its value in force beside it${r.noNow.length + r.tickNoNow.length ? `; none for: ${[...r.noNow, ...r.tickNoNow].join(', ')}` : ''}`);
}

/** Item 11 / check 9: each set of rates listed names who saved and confirmed it, and when -- its own change-log line. */
async function saversHold(page, where) {
  // The change log is read after the rates: wait for each set of rates to say who saved it.
  await settles(page, (n) => document.querySelectorAll('[data-saved-at]').length === n, stub.rateRows(RIVERSIDE.id).length);
  const shownBy = await page.$$eval('[data-saved-by]', (els) => els.map((e) => ({ version: e.dataset.planVersion, name: e.dataset.savedBy, at: e.dataset.savedAt, text: e.textContent })));
  const rows = stub.rateRows(RIVERSIDE.id);
  const log = stub.lines(A).filter((l) => l.action === 'rate_plan.add');
  const wrong = [];
  for (const row of rows) {
    const line = log.find((l) => l.subject.id === row.id);
    const s = shownBy.find((x) => x.version === row.plan_version);
    if (!s || !line || s.name !== line.who.name || s.at !== line.at || !s.text.startsWith(fill(EN['rates.savedBy.confirmed'], { name: line.who.name, when: '' }).split(' on ')[0])) wrong.push(`${row.plan_version}: shows "${s?.text}" (${s?.at}), its line says ${line?.who.name} at ${line?.at}`);
  }
  check(rows.length > 0 && shownBy.length === rows.length && wrong.length === 0, `9 ${where}: each of ${rows.length} sets of rates says who saved and confirmed it, and when, from its own line${wrong.length ? `: ${wrong.slice(0, 2).join('; ')}` : ''}`);
}

/** Check 2: a Save pressed with fields missing: a red frame and a red sentence on each, each named in a link by the Save, and focus on the first. */
async function missingHold(page, within, want, where) {
  const r = await page.evaluate(
    ({ within, want }) => {
      const area = document.querySelector(within);
      const line = getComputedStyle(document.documentElement).getPropertyValue('--line-wrong').trim();
      const probe = document.createElement('span');
      probe.style.color = line;
      document.body.append(probe);
      const red = getComputedStyle(probe).color;
      probe.remove();
      const framed = want.filter((field) => {
        const el = area.querySelector(`[data-field="${field}"]`);
        const frame = el.closest('.unit-box') ?? el;
        const sentence = el.closest('.field')?.querySelector('.field-wrong');
        return getComputedStyle(frame).borderTopColor === red && parseFloat(getComputedStyle(frame).borderTopWidth) >= 2 && sentence && getComputedStyle(sentence).color !== getComputedStyle(document.body).color;
      });
      const links = [...area.querySelectorAll('[data-notice="form-not-ready"] [data-goes-to]')].map((b) => ({ to: b.dataset.goesTo, text: b.textContent }));
      const ids = want.map((field) => area.querySelector(`[data-field="${field}"]`).id);
      return { framed, links, ids, focused: document.activeElement?.id ?? null };
    },
    { within, want },
  );
  check(r.framed.length === want.length, `2 ${where}: ${want.length} missing fields, ${r.framed.length} in a red frame with a red sentence (${r.framed.join(', ')})`);
  check(r.links.length === want.length && r.links.every((l, i) => l.to === r.ids[i] && l.text.trim().length > 0), `2 ${where}: the Save lists each by name: ${r.links.map((l) => `"${l.text}"`).join(', ')}`);
  check(r.focused === r.ids[0], `2 ${where}: the page moves to the first (${r.focused})`);
  // Each link jumps to its field.
  const jumped = [];
  for (const [i, link] of r.links.entries()) {
    await page.click(`${within} [data-goes-to="${link.to}"]`);
    const at = await page.evaluate(() => document.activeElement?.id ?? null);
    if (at === r.ids[i]) jumped.push(i);
  }
  check(jumped.length === want.length, `2 ${where}: each of the ${want.length} links goes to its field (${jumped.length} did)`);
}

/**
 * F3 (U7i fix 1), the class: every link in every missing-fields list on the
 * page resolves to an element that is drawn, and a press moves into it.
 */
async function linksHaveTargets(page, where) {
  const links = await page.$$eval('[data-notice="form-not-ready"] [data-goes-to]', (els) => els.map((b) => b.dataset.goesTo));
  const missing = [];
  for (const to of links) {
    const drawn = await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0;
    }, to);
    if (!drawn) {
      missing.push(`${to} (not on the page)`);
      continue;
    }
    await page.click(`[data-notice="form-not-ready"] [data-goes-to="${to}"]`);
    const inside = await page.evaluate((id) => {
      const el = document.getElementById(id);
      return Boolean(el && document.activeElement && (el === document.activeElement || el.contains(document.activeElement)));
    }, to);
    if (!inside) missing.push(`${to} (the press moved nowhere)`);
  }
  // Known-present: the list this is called on has links.
  check(links.length > 0 && missing.length === 0, `F3 ${where}: each of ${links.length} links in the missing-fields list goes to a field on the page${missing.length ? `: ${missing.join('; ')}` : ''}`);
}

/**
 * U7i fix 1 (the gate's F2, and checks 1, 2 and 4): a garage with rates in force,
 * walked in English, every save from a day in 2030 so each table is the same
 * every day this runs (the real platform's walk, with "Now", is in the receipt):
 *
 *   an early bird saved to start Mar 14 is listed in the special rates with its
 *   start, with Change and Remove; grace 10 -> 20 from Mar 10 carries into it:
 *   the check page lists the Mar 14 rates rebuilt, with their own priced table,
 *   one tick and one Confirm, and the save sends them in `carry`; the Mar 14
 *   rates saved before show as replaced, by whom; the calculator prices a stay
 *   after Mar 14 by the rebuilt rates; a later version that set its own regular
 *   rates keeps them and the check page says so; the early bird, changed from
 *   where it is listed, starts with the rates it starts with. F1 on the way: an
 *   answer whose rates were changed after it is greyed and says so.
 */
async function carryWalk() {
  const D = CARRY_DOCS;
  const ctx = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo', viewport: { width: 1360, height: 900 } });
  const sent = [];
  ctx.on('request', (r) => sent.push({ method: r.method(), path: new URL(r.url()).pathname, body: r.postData() ?? '' }));
  const p = await ctx.newPage();
  await p.goto(base);
  await p.waitForSelector('.page-title');
  await p.fill('input[name="email"]', A.email);
  await p.fill('input[name="password"]', A.password);
  await p.click('button[type="submit"]');
  await p.click(`.garage-choice[data-garage="${CARRY.id}"]`);
  await p.waitForSelector('.nav');
  // The walk above left the owner in Spanish: this one reads the English words.
  await chooseOnSettings(p, 'language', 'en');
  await go(p, '#/rates', EN['page.rates.title']);
  const REGULAR = '[data-section="regular"]';
  const SPEC = '[data-section="specials"]';
  const CALC = '[data-section="calculator"]';
  const lastTry = () => JSON.parse(sent.filter((r) => r.path.endsWith('/rate-plans/try')).at(-1)?.body || '{}');
  const lastSave = () => JSON.parse(sent.filter((r) => r.method === 'POST' && r.path.endsWith('/rate-plans')).at(-1)?.body || '{}');
  const rowId = (version) => stub.rateRowsAll(CARRY.id).find((r) => r.plan_version === version)?.id;
  const versionOf = (doc) => stub.rateRowsAll(CARRY.id).find((r) => sameDoc(r.plan, doc))?.plan_version;
  const timeOf = (iso) => garageDateTime(iso, CARRY.timezone, 'en');
  // A press that may find its control locked or gone: the walk goes on, and the checks after it say what is wrong.
  const press = (sel) => p.click(sel, { timeout: 5000 }).then(() => true, () => false);
  const tickAndConfirm = async () => (await press('[data-tick="checked-prices"]')) && (await press('[data-action="confirm-rates"]'));
  check(await settles(p, () => document.querySelector('[data-state]')?.dataset.state === 'current'), 'fix 1: the carry garage has rates in force');

  // ── The early bird, saved to start Mar 14 ─────────────────────────────
  await p.click('[data-action="add-special"]');
  await p.waitForSelector('[data-special-new]');
  // F3: a new special with no choice picked: every link in its list goes to a field on the page.
  await p.click('[data-action="save-special"]');
  const daysLink = await p.$$eval('[data-special-new] [data-goes-to]', (els) => els.map((e) => e.dataset.goesTo));
  check(!daysLink.some((x) => x.endsWith('special-days')) && daysLink.some((x) => x.endsWith('special-preset')), `F3 no choice picked: the list says "${EN['rates.special.choice']}: ${EN['rates.need.preset']}" and no days line (${daysLink.length} links)`);
  await linksHaveTargets(p, 'a new special, no choice picked');
  const [early] = TABLE_FORM.specials;
  await fillSpecial(p, early, EN, 1);
  await startsOn(p, '[data-special-new]', CARRY_DAYS.early);
  // F1, the gate's first probe: an answer for the early bird at $15, then $12 typed.
  await p.click(`${CALC} [data-control="calc-rates"] [data-value="changing"]`);
  await set(p, `${CALC} [data-field="try-entry"]`, D.calc.earlyStay.entry);
  await set(p, `${CALC} [data-field="try-exit"]`, D.calc.earlyStay.exit);
  await p.click(`${CALC} [data-action="try-stay"]`);
  check(await settles(p, () => document.querySelector('[data-section="calculator"] [data-tried="priced"]')?.dataset.fee === '1500'), 'F1 the calculator, the early bird at $15 being added: $15.00');
  await set(p, '[data-special-new] [data-field="special-flat"]', '12.00');
  const staleSpecial = await p.evaluate(() => ({ stale: document.querySelector('[data-section="calculator"] [data-stale]')?.dataset.stale, notice: document.querySelector('[data-section="calculator"] [data-notice="calc-stale"]')?.textContent ?? null, grey: document.querySelector('[data-section="calculator"] .tried-stale') !== null }));
  check(staleSpecial.stale === 'yes' && staleSpecial.notice === EN['rates.calc.stale'] && staleSpecial.grey, `F1 $12 typed after it was priced at $15: the old answer greyed, "${staleSpecial.notice}"`);
  await set(p, '[data-special-new] [data-field="special-flat"]', '15.00');
  check(await settles(p, () => document.querySelector('[data-section="calculator"] [data-stale]')?.dataset.stale === 'no'), 'F1 control: typed back to $15, the answer is for the rates as typed again');
  await p.click('[data-action="save-special"]');
  await reviewPriced(p, 'fix 1, the early bird from Mar 14');
  check(sameDoc(lastTry().plan, D.early) && !lastTry().carry, '4 fix 1: the early bird from Mar 14 sends the document the page builds (recorded), nothing to carry');
  await tickAndConfirm();
  check(await settles(p, () => document.querySelectorAll('[data-section="later"] [data-plan="later"]').length === 1), 'fix 1: saved, the early bird starts later');

  // ── F2 #1: the special saved for later is listed, with its start, Change and Remove ──
  const listed = await p.$$eval(`${SPEC} [data-special-in-force]`, (els) => els.map((e) => ({ starts: e.dataset.specialStarts, name: e.querySelector('.special-name')?.textContent, change: Boolean(e.querySelector('[data-action="change-special"]')), remove: Boolean(e.querySelector('[data-action="remove-special"]')), says: e.querySelector('[data-notice="special-starts-later"]')?.textContent ?? '' })));
  const wantStart = fill(EN['rates.special.startsLater'], { time: timeOf(D.early.effective_from) });
  check(listed.length === 1 && listed[0].name === 'Early bird' && listed[0].starts === D.early.effective_from && listed[0].change && listed[0].remove && listed[0].says === wantStart, `F2 a special saved to start later is listed, "${listed[0]?.says}", with Change and Remove (${listed.length} listed)`);

  // ── Grace 10 -> 20 from Mar 10: carried into the Mar 14 rates ─────────
  await set(p, `${REGULAR} [data-field="grace-minutes"]`, '20');
  await startsOn(p, REGULAR, CARRY_DAYS.grace);
  await p.click(`${CALC} [data-control="calc-rates"] [data-value="changing"]`);
  await set(p, `${CALC} [data-field="try-entry"]`, D.calc.graceStay.entry);
  await set(p, `${CALC} [data-field="try-exit"]`, D.calc.graceStay.exit);
  await p.click(`${CALC} [data-action="try-stay"]`);
  check(await settles(p, () => document.querySelector('[data-section="calculator"] [data-tried="priced"]')?.dataset.fee === '0'), '8 fix 1: the calculator, a 15-minute stay on Mar 20 with grace 20 being saved from Mar 10: $0.00, by the Mar 14 rates rebuilt (hand: 15 min inside 20 free)');
  const calcTry = lastTry();
  check(sameDoc(calcTry.plan, D.grace) && calcTry.carry?.length === 1 && calcTry.carry[0].withdraw === rowId(versionOf(D.early)) && sameDoc(calcTry.carry[0].plan, D.graceCarry.carried[0]), '8 fix 1: the calculator asked with the plans as the save leaves them (the Mar 14 rates rebuilt, in carry)');
  // F1, the gate's second probe: grace typed again after the answer.
  await set(p, `${REGULAR} [data-field="grace-minutes"]`, '25');
  check(await settles(p, () => document.querySelector('[data-section="calculator"] [data-stale]')?.dataset.stale === 'yes' && Boolean(document.querySelector('[data-section="calculator"] [data-notice="calc-stale"]'))), 'F1 grace 20 -> 25 typed after the answer: the old answer greyed and said to be old');
  await set(p, `${REGULAR} [data-field="grace-minutes"]`, '20');
  await set(p, `${CALC} [data-field="try-exit"]`, '2030-03-20T10:16');
  check(await settles(p, () => document.querySelector('[data-section="calculator"] [data-stale]')?.dataset.stale === 'yes'), 'F1 the stay changed after the answer: greyed too');
  await set(p, `${CALC} [data-field="try-exit"]`, D.calc.graceStay.exit);
  await p.click('[data-action="save-regular"]');
  await reviewPriced(p, 'fix 1, grace 20 from Mar 10');
  const later1 = '[data-section="carried"] [data-carried="later-1"]';
  check(await settles(p, (sel) => document.querySelectorAll(`${sel} [data-list="price-table-later"] tbody tr`).length > 0, later1), '7 fix 1: the Mar 14 rates rebuilt, with a priced table of their own');
  const carriedSays = await p.evaluate((sel) => ({ head: document.querySelector(`${sel} h3`)?.textContent, sentences: [...document.querySelectorAll(`${sel} [data-sentences="carried"] li`)].map((li) => li.textContent), rows: document.querySelectorAll(`${sel} [data-list="price-table-later"] tbody tr`).length }), later1);
  check(carriedSays.head === fill(EN['rates.review.carriedAt'], { time: timeOf(D.early.effective_from) }) && carriedSays.sentences.some((x) => x.includes('20 minutes')) && carriedSays.sentences.some((x) => x.startsWith('Early bird')) && carriedSays.rows === recorded.carry.stays.grace1.length, `7 fix 1: "${carriedSays.head}": grace 20 and the early bird, ${carriedSays.rows} rows`);
  check((await p.textContent('[data-tick="checked-prices"]')).includes(EN['rates.review.tickCarried'].slice(0, 30)) && (await p.$$('[data-tick="checked-prices"]')).length === 1 && (await p.$$('[data-action="confirm-rates"]')).length === 1, '7 fix 1: one tick and one Confirm for all');
  await tickAndConfirm();
  await settles(p, () => document.querySelectorAll('[data-section="earlier"] [data-plan="replaced"] [data-replaced-by]').length === 1);
  const save1 = lastSave();
  check(sameDoc(save1.plan, D.grace) && save1.carry?.length === 1 && save1.carry[0].withdraw === rowId(versionOf(D.early)) && sameDoc(save1.carry[0].plan, D.graceCarry.carried[0]) && save1.confirmed === true, '6 fix 1: the save sends today\'s rates and the Mar 14 rates rebuilt, in carry, confirmed');
  const replacedSays = await p.$$eval('[data-section="earlier"] [data-plan="replaced"] [data-replaced-by]', (els) => els.map((e) => ({ by: e.dataset.replacedBy, text: e.textContent })));
  check(replacedSays.length === 1 && replacedSays[0].by === A.email && replacedSays[0].text.startsWith(fill(EN['rates.replaced.by'], { name: A.email, when: '' }).split(' on ')[0]), `9 fix 1: the Mar 14 rates saved before: "${replacedSays[0]?.text}"`);
  const laterNow = await p.$$eval('[data-section="later"] [data-plan="later"]', (els) => els.map((e) => e.dataset.starts));
  check(laterNow.length === 2, `fix 1: two later versions in force after the save (${laterNow.join(', ')})`);

  // ── A later version with its own regular rates, from Mar 24 ───────────
  await set(p, `${REGULAR} [data-field="time-first-price"]`, '9.00');
  await startsOn(p, REGULAR, CARRY_DAYS.own);
  await p.click('[data-action="save-regular"]');
  await reviewPriced(p, 'fix 1, their own regular rates from Mar 24');
  check(sameDoc(lastTry().plan, D.own) && !lastTry().carry && !(await p.$('[data-section="carried"]')), '4 fix 1: $9 the first hour from Mar 24, built on the Mar 14 rates as they now are; nothing later to carry into');
  await tickAndConfirm();
  check(await settles(p, () => document.querySelectorAll('[data-section="later"] [data-plan="later"]').length === 3), 'fix 1: saved, three later versions');

  // ── Check 2: $5 each hour after, from Mar 12 -- Mar 24 keeps its own ──
  await set(p, `${REGULAR} [data-field="time-next-price"]`, '5.00');
  await startsOn(p, REGULAR, CARRY_DAYS.next);
  await p.click('[data-action="save-regular"]');
  await reviewPriced(p, 'fix 1, $5 from Mar 12');
  const own = await p.$$eval('[data-section="carried"] [data-notice="own-section"]', (els) => els.map((e) => e.textContent));
  const wantOwn = fill(EN['rates.review.ownRegular'], { time: timeOf(D.own.effective_from) });
  check(own.length === 1 && own[0] === wantOwn, `2 fix 1: "${own[0]}"`);
  check((await p.$$('[data-section="carried"] [data-carried]')).length === 1, '2 fix 1: only the Mar 14 rates are rebuilt');
  await settles(p, (sel) => document.querySelectorAll(`${sel} [data-list="price-table-later"] tbody tr`).length > 0, later1);
  await tickAndConfirm();
  await settles(p, () => document.querySelectorAll('[data-section="earlier"] [data-plan="replaced"]').length === 2);
  const save2 = lastSave();
  check(save2.carry?.length === 1 && sameDoc(save2.carry[0].plan, D.nextCarry.carried[0]), '2 fix 1: the save carries $5 into the Mar 14 rates only');
  const ownStored = stub.rateRowsAll(CARRY.id).find((r) => r.plan_version === versionOf(D.own));
  // With the $5 save stored beside them (a save that never happened leaves Mar 24 alone too).
  const nextStored = stub.rateRowsAll(CARRY.id).some((r) => !r.withdrawn_at && sameDoc(r.plan, D.nextCarry.carried[0]));
  check(nextStored && ownStored && !ownStored.withdrawn_at && ownStored.plan.rules.find((r) => r.type === 'increment').first_period_minor === 900 && ownStored.plan.rules.find((r) => r.type === 'increment').repeat_period_minor === 400, '2 fix 1: stored, the Mar 14 rates with $5, and the Mar 24 rates keep their own: $9, then $4');

  // ── The early bird changed where it is listed: it starts with its rates ──
  const earlyAt = await p.$$eval(`${SPEC} [data-special-in-force]`, (els) => els.findIndex((e) => e.querySelector('.special-name')?.textContent === 'Early bird') + 1);
  await press(`${SPEC} [data-special-in-force="${earlyAt}"] [data-action="change-special"]`);
  await p.waitForSelector('[data-editing="change"]', { timeout: 5000 }).catch(() => {});
  const startsWith = await p.textContent('[data-editing="change"] [data-notice="special-starts-with"]').catch(() => null);
  check(startsWith === fill(EN['rates.special.startsWith'], { time: timeOf(D.early.effective_from) }) && !(await p.$('[data-editing="change"] [data-control="starts"]')), `5 fix 1: a later special being changed starts with its rates: "${startsWith}"`);
  await p.fill('[data-editing="change"] [data-field="special-flat"]', '12.00', { timeout: 5000 }).catch(() => {});
  await press('[data-action="save-special"]');
  await reviewPriced(p, 'fix 1, the early bird changed with it');
  const replacesSays = await p.textContent('[data-notice="replaces-later"]').catch(() => null);
  check(replacesSays === fill(EN['rates.review.replaces'], { time: timeOf(D.early.effective_from) }), `5 fix 1: "${replacesSays}"`);
  await settles(p, (sel) => document.querySelectorAll(`${sel} [data-list="price-table-later"] tbody tr`).length > 0, later1);
  await tickAndConfirm();
  // Who replaced each is said once the change log is read: wait for the lines themselves.
  await settles(p, () => document.querySelectorAll('[data-section="earlier"] [data-plan="replaced"] [data-replaced-by]').length === 4);
  const save3 = lastSave();
  check(sameDoc(save3.plan, D.special) && save3.carry?.length === 2 && save3.carry[0].plan === undefined && sameDoc(save3.carry[1].plan, D.specialCarry.carried[0]), '5 fix 1: the save replaces the Mar 14 rates itself, and carries the change into Mar 24, which kept the specials');
  const replacedAll = await p.$$eval('[data-section="earlier"] [data-plan="replaced"] [data-replaced-by]', (els) => els.map((e) => e.dataset.replacedBy));
  check(replacedAll.length === 4 && replacedAll.every((x) => x === A.email), `9 fix 1: each of the 4 versions replaced says so, and by whom (${replacedAll.length})`);
  check(!ENGINE_WORDS.test(await bodyText(p)), 'fix 1: no engine word on the page');

  // ── A special in force now: listed first, in words, with Change and Remove ──
  await p.goto(base);
  await p.click(`.garage-choice[data-garage="${IN_FORCE_SPECIAL.id}"]`);
  await p.waitForSelector('.nav');
  await go(p, '#/rates', EN['page.rates.title']);
  const inForce = await settles(p, () => Boolean(document.querySelector('[data-section="specials"] [data-special-in-force="1"]')));
  const row = inForce ? await p.$eval(`${SPEC} [data-special-in-force="1"]`, (e) => ({ starts: e.dataset.specialStarts, text: e.innerText, change: Boolean(e.querySelector('[data-action="change-special"]')) })) : null;
  check(inForce && row.starts === 'now' && row.text.includes('$15.00') && row.change && !row.text.includes(fill(EN['rates.special.startsLater'], { time: '' }).split(' ')[0] + ' '), `5 fix 1: a special in force is listed, in words, with Change (${row ? row.text.replace(/\s+/g, ' ').slice(0, 90) : 'the page did not draw'})`);
  await ctx.close();
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
  const writes = () => requests.filter((r) => r.method === 'POST' && r.path.endsWith('/rate-plans')).length;
  const tries = () => requests.filter((r) => r.path.endsWith('/rate-plans/try')).length;
  const u = recorded.u7i;
  const REG = '[data-section="regular"]';
  const SPECIALS = '[data-section="specials"]';

  // ── The Rates page, with no rates ──────────────────────────────────────
  check(await go(page, '#/rates', EN['page.rates.title']), 'Rates is in the navigation');
  check(await settles(page, (w) => document.querySelector('[data-state]')?.textContent === w, EN['rates.none']), `no rates: "${EN['rates.none']}"`);
  check((await page.$$('[data-action="download-excel"]')).length === 0, 'no rates: no Download or Print');
  check(Boolean(await page.$(REG)) && Boolean(await page.$(SPECIALS)) && Boolean(await page.$('[data-section="calculator"]')), '6 two sections, each with its own Save, and the price calculator apart from them');
  check((await page.textContent(`${SPECIALS} [data-reason-for="add-special"]`).catch(() => '')) === EN['rates.specials.regularFirst'], `13 no rates yet: Add a special rate is locked, "${EN['rates.specials.regularFirst']}"`);
  await lockedHold(page, 'en, no rates yet', { atLeast: 2 });
  await datesHold(page, 'en, no rates yet');

  // ── The regular rates, filled in by hand: three left missing (check 2) ─────
  await fillRegular(page, TABLE_FORM, { rounding: false });
  await page.click('[data-tick="day-max-on"]');
  check(writes() === 0 && tries() === 0, 'nothing sent while the form is filled in');
  await page.click('[data-action="save-regular"]');
  await missingHold(page, REG, ['time-rounding', 'day-max-price', 'day-max-kind'], 'en, the regular rates');
  await linksHaveTargets(page, 'en, the regular rates');
  check(!(await page.$('[data-form="review-rates"]')), '2 with fields missing, the check page does not open');
  await fillRegularRest(page, TABLE_FORM);
  await page.click('[data-tick="week-max-on"]');
  await unitsHold(page, 'en, the regular rates', EN);
  await page.click('[data-tick="week-max-on"]');
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await framesHold(page, `en, the regular rates, ${width} px`);
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  // F7: the start day offers only days after today, and a day that is not is refused.
  await page.click(`${REG} [data-control="starts"] [data-value="day"]`);
  await datesHold(page, 'en, the start day, not picked');
  const min = await page.getAttribute(`${REG} [data-field="rates-day"]`, 'min');
  const tomorrow = await page.evaluate((zone) => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  }, RIVERSIDE.timezone);
  check(min === tomorrow, `F7 the start day offers days from tomorrow in the garage's time (${min}, tomorrow ${tomorrow})`);
  const today = new Date(Date.parse(`${tomorrow}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  for (const [day, what] of [[today, 'today'], ['2020-01-06', 'a past day']]) {
    await set(page, `${REG} [data-field="rates-day"]`, day);
    await page.click('[data-action="save-regular"]');
    check(await settles(page, (w) => document.querySelector('[data-section="regular"] [data-wrong-for$="-day"]')?.textContent.includes(w), EN['rates.need.dayAfterToday']) && !(await page.$('[data-form="review-rates"]')), `F7 ${what} as the start day: refused, "${EN['rates.need.dayAfterToday']}"`);
  }
  await set(page, `${REG} [data-field="rates-day"]`, TWO_SAVE_DAYS.regular);
  await datesHold(page, 'en, the start day picked');
  await formTicksHold(page, 'en');

  // ── Save the regular rates: the check page, priced by itself ───────────
  await page.click('[data-action="save-regular"]');
  const sentRegular = await reviewPriced(page, 'the regular rates');
  check(sentRegular && sameDoc(sentRegular.plan, u.regular), '4 the regular rates send exactly the document the page builds (the one recorded)');
  const steps = () => page.$$eval('[data-steps] li', (els) => els.map((e) => `${e.dataset.step}${e.getAttribute('aria-current') === 'step' ? '*' : ''}`).join(' '));
  check((await steps()) === '1 2* 3', `13 the check page's steps in order, the one to do marked: ${await steps()}`);
  check(await page.isDisabled('[data-action="confirm-rates"]'), '12 priced but not ticked: Confirm cannot be pressed');
  check((await page.textContent('[data-reason-for="confirm-rates"]').catch(() => '')) === EN['rates.review.needTick'], `13 Confirm locked: "${EN['rates.review.needTick']}" beside it`);
  await lockedHold(page, 'en, the check page before the tick');
  await page.click('[data-action="confirm-rates"]', { force: true }).catch(() => {});
  check(writes() === 0, '12 the tick ignored: nothing is sent');
  await confirmTickHolds(page, 'en');
  await page.click('[data-tick="checked-prices"]');
  check((await steps()) === '1 2 3*', `13 ticked: step 3 marked: ${await steps()}`);
  check(!(await page.isDisabled('[data-action="confirm-rates"]')), '12 ticked: Confirm can be pressed');
  await page.click('[data-action="confirm-rates"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-section="later"]'))), 'saved: the regular rates show as starting later');
  check(JSON.parse(requests.filter((r) => r.method === 'POST' && r.path.endsWith('/rate-plans')).at(-1).body).confirmed === true, '12 the save says confirmed');

  // ── Check 8: the form opens empty, the rates in force beside each field ──
  await page.waitForSelector(`${REG} [data-now]`);
  await nothingPrefilled(page, REG, 'en, the regular rates', EN);
  await saversHold(page, 'after the regular rates');
  // Saved with every field empty: the same rates, and the check page says so.
  await startsOn(page, REG, TWO_SAVE_DAYS.nothing);
  await page.click('[data-action="save-regular"]');
  const sentNothing = await reviewPriced(page, 'nothing changed');
  check(sentNothing && sameDoc(sentNothing.plan, u.nothing) && JSON.stringify(sentNothing.plan.rules) === JSON.stringify(stub.ratesSaved(RIVERSIDE.id)[0].rules), '8 every field left empty: the rates sent are the ones in force, rule for rule');
  check(Boolean(await page.$('[data-notice="nothing-changed"]')), `8 the check page says nothing changed: "${EN['rates.review.nothingChanged'].slice(0, 40)}…"`);
  await page.click('[data-action="back-to-form"]');

  // ── A special added on its own: the early bird ─────────────────────────
  await page.click('[data-action="add-special"]');
  await page.waitForSelector('[data-special-new]');
  await datesHold(page, 'en, a new special');
  const [early, weekend] = TABLE_FORM.specials;
  await page.click('[data-action="save-special"]');
  const newMissing = await page.$$eval('[data-special-new] [data-goes-to]', (els) => els.length);
  check(newMissing >= 6, `10 a new special starts empty and its fields are needed: ${newMissing} named by its Save`);
  await linksHaveTargets(page, 'en, a new special, nothing typed');
  // Check 7 on the special's own numbers: its hourly rate, a percent, an amount.
  await pick(page, '[data-special-new] [data-field="special-charge"]', 'rate');
  await unitsHold(page, 'en, a special at its own hourly rate', EN);
  await pick(page, '[data-special-new] [data-field="special-charge"]', 'adjust');
  await pick(page, '[data-special-new] [data-field="special-amount-kind"]', 'percent');
  await unitsHold(page, 'en, a special, a percent', EN, { 'special-amount': '%' });
  await pick(page, '[data-special-new] [data-field="special-amount-kind"]', 'fixed');
  await unitsHold(page, 'en, a special, an amount', EN, { 'special-amount': '$' });
  await fillSpecial(page, early, EN, 1);
  await startsOn(page, '[data-special-new]', TWO_SAVE_DAYS.early);
  await datesHold(page, 'en, a new special filled in');
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await framesHold(page, `en, a new special, ${width} px`);
    await ticksHold(page, `en, a new special, ${width} px`);
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  // Check 5, the calculator on the rates being changed: priced by the platform, beside what is stored.
  const calc = '[data-section="calculator"]';
  await page.click(`${calc} [data-control="calc-rates"] [data-value="changing"]`);
  check((await page.textContent(`${calc} [data-notice="calc-changing"]`).catch(() => '')) === fill(EN['rates.calc.onSpecial'], { name: early.name }), 'the calculator says which change it prices');
  await set(page, `${calc} [data-field="try-entry"]`, recorded.table.added.entry);
  await set(page, `${calc} [data-field="try-exit"]`, recorded.table.added.exit);
  const before = tries();
  await page.click(`${calc} [data-action="try-stay"]`);
  check(await settles(page, () => Boolean(document.querySelector('[data-section="calculator"] [data-tried="priced"]'))), '5 the calculator, the rates being changed: priced');
  const calcTry = requests.filter((r) => r.path.endsWith('/rate-plans/try')).at(-1);
  check(tries() === before + 1 && sameDoc(JSON.parse(calcTry.body).plan, u.early), '5 the calculator asked the platform, with the rates as this save makes them');
  const calcChanging = Number(await page.getAttribute(`${calc} [data-tried="priced"]`, 'data-fee'));
  check(writes() === 1, '7 the calculator saves nothing');
  await page.click('[data-action="save-special"]');
  const sentEarly = await reviewPriced(page, 'the early bird added');
  check(sentEarly && sameDoc(sentEarly.plan, u.early), '4 the early bird added sends exactly the document the page builds');
  const stored1 = stub.ratesSaved(RIVERSIDE.id)[0];
  const regularRules = (p) => JSON.stringify(p.rules.filter((r) => r.type !== 'time_window'));
  check(sentEarly && regularRules(sentEarly.plan) === regularRules(stored1), '4 a special saved: the regular rates byte for byte as stored');
  check(sentEarly && sentEarly.stays.length === recorded.u7i.stays.early.length, `4 the table prices the rates whole: the early bird's rows are in it (${sentEarly?.stays.length} stays)`);
  await page.click('[data-tick="checked-prices"]');
  // The change log read slowly (CI, 2026-10-12): the rates just saved are never said to be missing from it.
  stub.delayChanges(1500);
  await page.click('[data-action="confirm-rates"]');
  check(await settles(page, () => document.querySelectorAll('[data-section="later"] [data-plan="later"]').length === 2), 'saved: two sets of rates starting later');
  const tooSoon = await page.$$eval('[data-saved-by="unknown"]', (els) => els.length);
  stub.delayChanges(0);
  check(tooSoon === 0, `9 a save just made, its change log still being read: no set of rates said to be missing from it (${tooSoon})`);

  // ── The weekend added: the table form's rates, whole ───────────────────
  await page.click('[data-action="add-special"]');
  await fillSpecial(page, weekend, EN, 2);
  await startsOn(page, '[data-special-new]', TWO_SAVE_DAYS.full);
  await page.click('[data-action="save-special"]');
  const sentFull = await reviewPriced(page, 'the weekend added');
  check(sentFull && sameDoc(sentFull.plan, recorded.table.plan), '4 the weekend added: the document is the table form\'s, whole (the one recorded)');
  check(sentFull && JSON.stringify(sentFull.plan.rules.find((r) => r.id === 'special-10')) === JSON.stringify(stub.ratesSaved(RIVERSIDE.id)[1].rules.find((r) => r.id === 'special-10')), '4 a special added: the others byte for byte as stored');
  const sentences = await page.$$eval('[data-sentences="draft"] li', (els) => els.map((e) => e.textContent));
  check(sentences.some((x) => x.includes('First hour $8.00, then $4.00 each hour.')) && sentences.some((x) => x.startsWith('Early bird')) && sentences.some((x) => x.startsWith('Weekend')), `the check page says the rates whole, in plain sentences: ${sentences.length}`);
  check(!ENGINE_WORDS.test(await bodyText(page)), 'no engine word on the check page');
  const fees = await page.$$eval('[data-list="price-table"] tbody tr', (rows) => rows.map((r) => Number(r.dataset.fee)));
  check(fees.length === recorded.table.stays.length && fees[0] === 0 && fees.includes(1500) && fees.includes(2000), `4 the table holds the engine's prices, row for row (${fees.length} stays)`);
  // E1: a short stay inside the early bird's times, where the hour is less than it: the words say so.
  const short = await page.$$eval('[data-list="price-table"] tbody tr[data-why="specialShort"]', (rows) => rows.map((r) => ({ fee: Number(r.dataset.fee), says: r.cells[6].textContent })));
  const earlyShort = short.find((r) => r.says.includes('Early bird fit'));
  const timeLess = fill(EN['rates.why.timeLess'], { name: 'Early bird', time: moneyText(800, 'USD', 'en'), special: moneyText(1500, 'USD', 'en') });
  check(earlyShort?.fee === 800 && earlyShort.says.includes(timeLess), `E1 the table: "${earlyShort?.says}" (${earlyShort?.fee})`);
  const capRows = await page.$$eval('[data-list="price-table"] tbody tr[data-why^="dayMax"]', (rows) => rows.map((r) => `${r.dataset.why}=${r.dataset.says}`));
  check(capRows.join() === 'dayMaxTakes=dayMaxTakes,dayMaxBefore=dayMaxBefore', `F1 the most per day: ${capRows.join(', ')}`);
  // Check 5 on the check page: the calculator is first, above the table, on the rates being changed.
  const order = await page.$$eval('main [data-section], main [data-form]', (els) => els.map((e) => e.dataset.section ?? e.dataset.form));
  check(order.indexOf('calculator') >= 0 && order.indexOf('calculator') < order.indexOf('price-table'), `7 the calculator is first on the check page, above the table (${order.join(', ')})`);
  await set(page, `${calc} [data-field="try-entry"]`, recorded.table.added.entry);
  await set(page, `${calc} [data-field="try-exit"]`, recorded.table.added.exit);
  await page.click(`${calc} [data-action="try-stay"]`);
  check(await settles(page, () => Boolean(document.querySelector('[data-section="calculator"] [data-tried="priced"]'))), '5 the calculator on the check page: priced');
  const calcCheck = Number(await page.getAttribute(`${calc} [data-tried="priced"]`, 'data-fee'));
  // Check 6: a stay added prices the table again by itself; Confirm waits for it.
  await page.click('[data-tick="checked-prices"]');
  const triesBefore = tries();
  await set(page, '[data-field="add-entry"]', recorded.table.added.entry);
  await set(page, '[data-field="add-exit"]', recorded.table.added.exit);
  await datesHold(page, 'en, the check page, a stay to add picked');
  stub.delayTries(1500);
  await page.click('[data-action="add-stay"]');
  // While the table is priced again: Confirm and the tick locked, the reason said, step 1 marked.
  const waiting = await settles(page, () => Boolean(document.querySelector('[data-notice="table-pricing"]')));
  check(waiting && (await page.isDisabled('[data-action="confirm-rates"]')) && (await page.isDisabled('[data-tick="checked-prices"]')), '12 a stay added: Confirm and the tick are locked while the table is priced again');
  check((await page.textContent('[data-reason-for="confirm-rates"]').catch(() => '')) === EN['rates.review.wait'] && (await steps()) === '1* 2 3', `13 while it is priced: "${EN['rates.review.wait']}", step 1 marked (${await steps()})`);
  await lockedHold(page, 'en, the check page, pricing again', { atLeast: 2 });
  stub.delayTries(0);
  check(await settles(page, (n) => document.querySelectorAll('[data-list="price-table"] tbody tr').length === n && !document.querySelector('[data-notice="table-pricing"]'), recorded.table.stays.length + 1), '6 a stay added: the table prices itself again, with no press, and holds it');
  check(tries() === triesBefore + 1, `6 a stay added: one try, sent by itself (${tries() - triesBefore})`);
  await datesHold(page, 'en, the check page, the stay added');
  const addedFee = Number(await page.getAttribute('[data-list="price-table"] tbody tr[data-why="added"]', 'data-fee'));
  check(!(await page.isDisabled('[data-action="confirm-rates"]')), '12 priced again: Confirm can be pressed');

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
  stub.gapNextSave();
  await page.click('[data-action="confirm-rates"]');
  check(await settles(page, () => document.querySelectorAll('[data-section="findings"] li').length > 0), '5 the gap: its findings are listed');
  const findingText = await page.$$eval('[data-section="findings"] li', (els) => els.map((e) => e.textContent));
  check(findingText.every((x) => x.startsWith(EN['rates.finding.GAP_STAY_EXCEEDS_MAX_DURATION']) && !ENGINE_WORDS.test(x)), `5 each finding in a plain sentence: "${findingText[0]}"`);
  check(Boolean(await page.$('[data-form="review-rates"]')), '5 the check page is kept');

  // ── Saved: the list shows it, who saved each ───────────────────────────
  await page.click('[data-action="confirm-rates"]');
  check(await settles(page, () => document.querySelectorAll('[data-section="later"] [data-plan="later"]').length === 3), 'saved: three sets of rates starting later');
  check(stub.ratesSaved(RIVERSIDE.id).length === 3, 'three sets of rates saved');
  await saversHold(page, 'after three saves');
  // The rates in force, priced by the calculator: the same stay, the same fee, as a real close.
  await page.click(`${calc} [data-control="calc-rates"] [data-value="force"]`);
  await set(page, `${calc} [data-field="try-entry"]`, recorded.table.added.entry);
  await set(page, `${calc} [data-field="try-exit"]`, recorded.table.added.exit);
  await page.click(`${calc} [data-action="try-stay"]`);
  check(await settles(page, () => Boolean(document.querySelector('[data-section="calculator"] [data-tried="priced"]'))), '5 the calculator, the rates in force: priced');
  const calcForce = Number(await page.getAttribute(`${calc} [data-tried="priced"]`, 'data-fee'));
  const closed = stub.recordedClose();
  check(
    calcForce === addedFee && calcCheck === addedFee && closed.same && closed.closed_fee_minor === addedFee,
    `5 one stay, one fee: the calculator on the rates in force ${calcForce}, on the rates being changed ${calcCheck}, the table ${addedFee}, a real close ${closed.closed_fee_minor} (the same weekday and times, recorded)`,
  );
  check(calcChanging === addedFee, `5 and with only the early bird added, the calculator's ${calcChanging}: the weekend is not for a Wednesday`);
  const pays = await page.textContent(`${calc} .tried-pays`).catch(() => '');
  check(/^The driver pays \$\d+\.\d\d\.$/.test(pays ?? ''), `the calculator: "${pays}"`);
  // E1: a stay the hour prices for less than the early bird: the line, in words.
  await set(page, `${calc} [data-field="try-entry"]`, recorded.table.short.entry);
  await set(page, `${calc} [data-field="try-exit"]`, recorded.table.short.exit);
  await page.click(`${calc} [data-action="try-stay"]`);
  check(await settles(page, () => document.querySelector('[data-section="calculator"] [data-tried="priced"]')?.dataset.fee === '800'), 'E1 the calculator, less by the hour: priced at $8.00');
  const lessWords = await page.textContent(`${calc} [data-special-words]`).catch(() => '');
  check((lessWords ?? '').includes(timeLess), `E1 the calculator: "${lessWords}"`);

  // ── The regular rates changed with the specials in force: kept byte for byte ──
  if ((await page.getAttribute('[data-tick="grace-on"]', 'aria-checked')) !== 'true') await page.click('[data-tick="grace-on"]');
  await set(page, '[data-field="grace-minutes"]', '15');
  await startsOn(page, REG, TWO_SAVE_DAYS.grace);
  await page.click('[data-action="save-regular"]');
  const sentGrace = await reviewPriced(page, 'the regular rates changed');
  const specialsOf = (p) => JSON.stringify({ windows: p.rules.filter((r) => r.type === 'time_window'), order: p.adjust_order });
  check(sentGrace && sameDoc(sentGrace.plan, u.grace), '4 the regular rates changed send exactly the document the page builds');
  check(sentGrace && specialsOf(sentGrace.plan) === specialsOf(stub.ratesSaved(RIVERSIDE.id)[2]), '4 the regular rates saved: the specials byte for byte as stored');
  check(sentGrace && sentGrace.stays.length === recorded.u7i.stays.grace.length, `4 the table prices the regular rates with the specials (${sentGrace?.stays.length} stays)`);
  check(writes() === 4, `12 nothing saved before Confirm (${writes() - 3} more)`);
  await page.click('[data-tick="checked-prices"]');
  await page.click('[data-action="confirm-rates"]');
  check(await settles(page, () => document.querySelectorAll('[data-section="later"] [data-plan="later"]').length === 4), 'saved: four sets of rates starting later');
  const stored = stub.ratesSaved(RIVERSIDE.id);
  check(specialsOf(stored[3]) === specialsOf(stored[2]) && stored[3].rules.find((r) => r.type === 'grace').minutes === 15, '4 stored: 15 minutes free, the specials byte for byte as before');
  await saversHold(page, 'after four saves');

  // ── Check 7: the Rates list downloaded and printed ─────────────────────
  for (const what of ['excel', 'pdf']) {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`[data-section="in-force"] [data-action="download-${what}"]`)]);
    check(download.suggestedFilename().endsWith(what === 'excel' ? '.xlsx' : '.pdf'), `7 the Rates list, Download ${what}: ${download.suggestedFilename()}`);
  }
  await page.click('[data-section="in-force"] [data-action="print"]');
  check(await settles(page, () => window.__printed === 2), '7 the Rates list prints');

  // ── A special changed: empty, its value in force beside each field ─────
  // (A press that finds no special listed goes on: the check below says so.)
  const changing = await page.click(`${SPECIALS} [data-special-in-force="1"] [data-action="change-special"]`, { timeout: 5000 }).then(() => true, () => false);
  check(changing, '8 a special listed, with Change');
  if (changing) {
    await page.waitForSelector('[data-editing="change"]');
    await nothingPrefilled(page, '[data-editing="change"]', 'en, a special being changed', EN);
    await page.click('[data-action="cancel-special"]');
  }
  // ── Check 6 (U7g): the Open button ─────────────────────────────────────
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

  // ── 360 px: the page, the regular rates, the calculator, a special, and Setup fit a phone's width ──
  await page.setViewportSize({ width: 360, height: 780 });
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const inside = (sel) => page.$eval(sel, (el) => el.getBoundingClientRect().right <= window.innerWidth + 0.5 && el.scrollWidth <= el.clientWidth + 1);
  await go(page, '#/rates', EN['page.rates.title']);
  check(await fits(), '360 px: the Rates page has no sideways scrolling');
  check((await inside(REG)) && (await inside('[data-section="calculator"]')), '360 px: the regular rates and the calculator fit the screen');
  await page.click('[data-action="add-special"]');
  await page.selectOption('[data-special-new] [data-field="special-preset"]', 'weekends');
  check(await fits(), '360 px: a special being added has no sideways scrolling');
  await page.click('[data-action="cancel-special"]');
  await go(page, '#/setup', EN['page.setup.title']);
  check(await fits(), '360 px: Setup has no sideways scrolling');
  await page.setViewportSize({ width: 1360, height: 900 });

  // ── G2 (fix 2): the calculator on the walk plan, a discount and a fee on every stay ──
  // The platform's 20 tries a minute: the minute let pass, as the recording does.
  stub.forgetTries();
  await walkTries('en', EN);

  // ── Spanish: the Rates page in the other language ──────────────────────
  await chooseOnSettings(page, 'language', 'es');
  await page.click('.nav-item[href="#/rates"]');
  check(await settles(page, (t) => document.querySelector('.page-title')?.textContent === t, ES['page.rates.title']), 'es: Tarifas');
  // The words as written (innerText follows a CSS capitalisation).
  const esText = await page.evaluate(() => document.querySelector('main').textContent);
  check(esText.includes(ES['rates.inForce']) && !ENGINE_WORDS.test(esText), `es: the Rates page in Spanish, no engine word${ENGINE_WORDS.test(esText) ? `: "${esText.match(ENGINE_WORDS)[0]}"` : ''}${esText.includes(ES['rates.inForce']) ? '' : '; no "Tarifas vigentes"'}`);
  await nothingPrefilled(page, REG, 'es, the regular rates', ES);
  await unitsHold(page, 'es, the regular rates', ES);

  // ── F2 in Spanish: the form's ticks and the confirmation, on a garage with nothing stored ──
  stub.forgetTries();
  const es = await (await browser.newContext({ locale: 'es-US', timezoneId: 'Asia/Tokyo', viewport: { width: 1360, height: 900 } })).newPage();
  await es.goto(base);
  await es.waitForSelector('.page-title');
  await es.fill('input[name="email"]', A.email);
  await es.fill('input[name="password"]', A.password);
  await es.click('button[type="submit"]');
  await es.click(`.garage-choice[data-garage="${SPANISH.id}"]`);
  await es.waitForSelector('.nav');
  await go(es, '#/rates', ES['page.rates.title']);
  await datesHold(es, 'es, no rates yet');
  await fillRegular(es, TABLE_FORM);
  await fillRegularRest(es, TABLE_FORM);
  // F7 (fix 2): today typed as the start day, and Save pressed for the FIRST time on
  // this page: the app's own sentence, in Spanish -- never the browser's bubble.
  await startsOn(es, REG, today);
  await es.click('[data-action="save-regular"]');
  check(
    (await settles(es, (w) => document.querySelector('[data-section="regular"] [data-wrong-for$="-day"]')?.textContent.includes(w), ES['rates.need.dayAfterToday'])) && !(await es.$('[data-form="review-rates"]')),
    `F7 es, a fresh page, today typed, the first press of Save: "${ES['rates.need.dayAfterToday']}"`,
  );
  await set(es, `${REG} [data-field="rates-day"]`, TWO_SAVE_DAYS.regular);
  await formTicksHold(es, 'es');
  for (const width of [1280, 360]) {
    await es.setViewportSize({ width, height: 900 });
    await framesHold(es, `es, the regular rates, ${width} px`);
  }
  await es.setViewportSize({ width: 1360, height: 900 });
  await es.click('[data-action="save-regular"]');
  await reviewPriced(es, 'es, the regular rates');
  await confirmTickHolds(es, 'es');
  await lockedHold(es, 'es, the check page before the tick');
  await es.click('[data-tick="checked-prices"]');
  await es.click('[data-action="confirm-rates"]');
  await es.waitForSelector('[data-section="later"]');
  await es.click('[data-action="add-special"]');
  await fillSpecial(es, TABLE_FORM.specials[0], ES, 1);
  await startsOn(es, '[data-special-new]', TWO_SAVE_DAYS.early);
  await es.click('[data-action="save-special"]');
  await reviewPriced(es, 'es, the early bird added');
  const esShort = await es.$$eval('[data-list="price-table"] tbody tr[data-why="specialShort"]', (rows) => rows.map((r) => r.cells[6].textContent));
  const esLess = fill(ES['rates.why.timeLess'], { name: 'Early bird', time: moneyText(800, 'USD', 'es'), special: moneyText(1500, 'USD', 'es') });
  check(esShort.some((x) => x.includes(esLess)), `E1 es: the table says "${esLess}" (${esShort.find((x) => x.startsWith('Early bird'))})`);
  stub.forgetTries();
  await walkTries('es', ES);
  // ── U7i fix 1: a change carried into rates saved to start later ───────
  stub.forgetTries();
  await carryWalk();
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
