#!/usr/bin/env node
/* global document, window, getComputedStyle, NodeFilter */
// The Rates page and the Open button, in a real browser (U7g; U7i, the page
// approved on 2026-10-13, with nothing scheduled).
//
// Serves dist/ (run `npm run build` first) with /api sent to the stand-in
// platform (test/stub-platform.js), which asks the rate engine at this
// repository's pin for every judgement and every price, as the platform does.
// In Chromium, with the browser in Tokyo time and the garage in New York's:
//
//   the page   no rates: the three parts and the calculator, Add a special rate
//              locked with its reason; Current rates with who set them, in the
//              approved page's words; the title alone, no line under it;
//   2          fields missing: a red frame and a red sentence on each, each
//              named in a link by the button, the first focused, each link
//              going to its field (a new special's too, every link a field on
//              the page);
//   3          no date or time box shows digits before a pick; nothing to
//              choose a start with -- rates start when Confirm is pressed, and
//              the save says so (its start within a minute of the press);
//   4          each save sends exactly the document the page builds, the other
//              part byte for byte as stored, and names the rates it was
//              checked against (based_on);
//   5          the calculator on the current rates and on the rates being
//              changed: what the engine charged, the approved page's lines --
//              one "Max per day, 2 days at $100.00" line and "By the hour it
//              would be $1,300.00." -- and its special-rate words; an answer
//              greyed when what it priced changes;
//   6          the check page prices its table as it opens and when a stay is
//              added; its rows the approved page's; its steps, the one to do
//              marked; what changes, old then new;
//   7          a "$", "minutes" or "%" inside every number's box; the price
//              table and the Rates list downloaded and printed;
//   8          every field empty on opening with its value in force under it;
//              all left empty: "Nothing to save.", no check page;
//   9          the current rates and each earlier set say who set them, and
//              when, from their own change-log line;
//   10         no wait cursor anywhere; every locked control with its reason
//              beside it; Confirm locked until the tick, then its sentence;
//   P2         rates saved by someone else while the check page is open: the
//              Confirm refused with the sentence, the page reads and prices
//              again, what was typed kept, and the next Confirm saves;
//   F2/G4      every tick with words over nothing and inside its box, in both
//              languages, at 1280 and 360 px; the Open button as U7g left it.
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
import { EARLY_BIRD, REGULAR_FORM, STAYS } from '../test/rates-forms.js';
import { buildPlan, specialsPlan } from '../src/rates.js';
import { garageDateTime } from '../src/time.js';
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
const ZONE = 'America/New_York';
// A garage made for this check, and a second with nothing stored, for the Spanish pass.
const RIVERSIDE = stub.makeGarage(A, { name: 'Rates check garage', timezone: ZONE, currency: 'USD' });
const SPANISH = stub.makeGarage(A, { name: 'Rates check garage es', timezone: ZONE, currency: 'USD' });
const GARAGE = { timezone: ZONE, currency: 'USD' };
const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4363, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } } });
const base = server.resolvedUrls.local[0];
stub.allowOrigin(new URL(base).origin);
const browser = await chromium.launch();
const requests = [];

const settles = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 }).then(() => true, () => false);
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const ENGINE_WORDS = /GAP_|CONFLICT_|FAULT_|cheapest|QUALIFY|ACCUMULATE|increment|time_window|max_duration|plan_version|nothing prices|daily_max|weekly_max/i;

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
      for (const box of [el.closest('.special-editor, [data-special-in-force]'), el.closest('.panel')].filter(Boolean)) {
        const b = box.getBoundingClientRect();
        if (a2.r > b.right + 0.5 || a2.l < b.left - 0.5) outside.push(`${el.dataset.tick ?? el.dataset.field ?? el.dataset.action ?? el.tagName} past ${box.matches('.special-editor, [data-special-in-force]') ? 'its special' : 'the panel'} by ${Math.round(Math.max(a2.r - b.right, b.left - a2.l))} px`);
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
    const frames = [...document.querySelectorAll('main fieldset.rates-part, main .special-editor, main .special-in-force')].filter(shown);
    const bad = [];
    for (const f of frames) {
      const box = f.getBoundingClientRect();
      const cs = getComputedStyle(f);
      const top = box.top + parseFloat(cs.borderTopWidth);
      const name = f.dataset.part ?? (f.dataset.editing ? `the special being ${f.dataset.editing === 'add' ? 'added' : 'changed'}` : `special ${f.dataset.specialInForce}`);
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

/** Item 11 / check 9: each set of rates shown names who set it, and when -- its own change-log line. */
async function saversHold(page, where, garage) {
  const rows = stub.rateRows(garage.id);
  // The change log is read after the rates: wait for each set of rates to say who set it.
  await settles(page, (n) => document.querySelectorAll('[data-saved-at]').length === n, rows.length);
  const shownBy = await page.$$eval('[data-saved-by]', (els) => els.map((e) => ({ version: e.dataset.planVersion, name: e.dataset.savedBy, at: e.dataset.savedAt, text: e.textContent, bold: e.querySelector('b')?.textContent ?? null })));
  const log = stub.lines(A).filter((l) => l.action === 'rate_plan.add');
  const wrong = [];
  for (const row of rows) {
    const line = log.find((l) => l.subject.id === row.id);
    const s = shownBy.find((x) => x.version === row.plan_version);
    const want = line && fill(EN['rates.setBy'], { name: line.who.name, when: garageDateTime(line.at, ZONE, 'en') });
    if (!s || !line || s.name !== line.who.name || s.at !== line.at || s.text !== want || s.bold !== line.who.name) wrong.push(`${row.plan_version}: shows "${s?.text}", its line says "${want}"`);
  }
  check(rows.length > 0 && shownBy.length === rows.length && wrong.length === 0, `9 ${where}: each of ${rows.length} sets of rates says "Set by <owner, bold> on <when>", from its own line${wrong.length ? `: ${wrong.slice(0, 2).join('; ')}` : ''}`);
}

/** The check page open and its table priced by itself, no press: the try it sent. */
async function reviewPriced(page, what) {
  const opened = await settles(page, () => Boolean(document.querySelector('[data-form="review-rates"]')));
  const priced = await settles(page, () => document.querySelectorAll('[data-list="price-table"] tbody tr').length > 0 && !document.querySelector('[data-notice="table-pricing"]'));
  check(opened && priced, `6 ${what}: the check page prices its table as it opens, with no press`);
  const tried = requests.filter((r) => r.path.endsWith('/rate-plans/try') && JSON.parse(r.body || '{}').stays?.length > 1).at(-1);
  return tried ? JSON.parse(tried.body) : null;
}

/** The table's rows: what each is there to check, and what the engine charged. */
const tableRows = (page) => page.$$eval('[data-list="price-table"] tbody tr', (rows) => rows.map((r) => ({ why: r.dataset.why, fee: Number(r.dataset.fee), entry: r.dataset.entry, exit: r.dataset.exit, pays: r.cells[5].textContent, says: r.cells[6].textContent, checks: r.cells[7].textContent })));

/** The steps on the check page, the one to do starred: "1 2* 3". */
const steps = (page) => page.$$eval('[data-steps] li', (els) => els.map((e) => `${e.dataset.step}${e.dataset.current === 'yes' ? '*' : ''}`).join(' '));

/** The calculator's answer for a stay, by the rates chosen. */
async function calculate(page, stay, source = null) {
  const calc = '[data-section="calculator"]';
  if (source) await page.click(`${calc} [data-control="calc-rates"] [data-value="${source}"]`);
  await page.fill(`${calc} [data-field="try-entry"]`, stay.entry);
  await page.fill(`${calc} [data-field="try-exit"]`, stay.exit);
  const [res] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/rate-plans/try'), { timeout: 15000 }), page.click(`${calc} [data-action="try-stay"]`)]);
  await settles(page, () => Boolean(document.querySelector('[data-section="calculator"] [data-tried]')) && document.querySelector('[data-section="calculator"] [data-stale]')?.dataset.stale === 'no');
  return {
    status: res.status(),
    fee: Number(await page.getAttribute(`${calc} [data-tried="priced"]`, 'data-fee').catch(() => NaN)),
    pays: await page.textContent(`${calc} .tried-pays`).catch(() => null),
    lines: await page.$$eval(`${calc} .tried-lines tr`, (rows) => rows.map((r) => [r.cells[0].textContent, r.cells[1].textContent])),
    byHour: await page.textContent(`${calc} [data-by-hour]`).catch(() => null),
    says: await page.textContent(`${calc} [data-special-words]`).catch(() => null),
    nothingSaved: await page.textContent(`${calc} [data-tried="priced"] > p:first-child`).catch(() => null),
  };
}

const built = (form, name = 'x') => buildPlan(form, { garage: GARAGE, spaceClass: 'standard', start: 'x', name });
/** Two plans the same but for their names and starts. */
const sameRates = (a, b) => JSON.stringify({ ...a, plan_version: null, effective_from: null }) === JSON.stringify({ ...b, plan_version: null, effective_from: null });
const lastSave = () => JSON.parse(requests.filter((r) => r.method === 'POST' && r.path.endsWith('/rate-plans')).at(-1)?.body || '{}');

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
  const REG = '[data-section="regular"]';
  const SPECIALS = '[data-section="specials"]';
  const calc = '[data-section="calculator"]';

  // ── The Rates page, with no rates ──────────────────────────────────────
  check(await go(page, '#/rates', EN['page.rates.title']), 'Rates is in the navigation');
  check((await page.locator('.page-purpose').count()) === 0, 'the title alone: no line under "Rates"');
  check(await settles(page, (w) => document.querySelector('[data-state]')?.textContent === w, EN['rates.none']), `no rates: "${EN['rates.none']}"`);
  check((await page.$$('[data-action="download-excel"]')).length === 0, 'no rates: no Download or Print');
  check(Boolean(await page.$(REG)) && Boolean(await page.$(SPECIALS)) && Boolean(await page.$(calc)), 'the regular rates and the special rates, each with its own button, and the price calculator');
  check((await page.textContent(`${SPECIALS} [data-reason-for="add-special"]`).catch(() => '')) === EN['rates.specials.regularFirst'], `10 no rates yet: Add a special rate is locked, "${EN['rates.specials.regularFirst']}"`);
  await lockedHold(page, 'en, no rates yet', { atLeast: 2 });
  await datesHold(page, 'en, no rates yet');
  // Check 3: nothing to choose a start with, anywhere.
  check((await page.$$('[data-control="starts"], [data-field="rates-day"], [data-section="later"]')).length === 0 && !(await bodyText(page)).includes('start later'), '3 no start to choose and no rates starting later');

  // ── The regular rates, three left missing (check 2) ───────────────────
  await set(page, '[data-field="time-first-minutes"]', REGULAR_FORM.time.firstMinutes);
  await page.click('[data-action="save-regular"]');
  await missingHold(page, REG, ['time-first-price', 'time-next-minutes', 'time-next-price'], 'en, the regular rates');
  check(!(await page.$('[data-form="review-rates"]')) && writes() === 0 && tries() === 0, '2 with fields missing: no check page, nothing sent');
  check((await page.textContent(`${REG} [data-notice="form-not-ready"] p`)) === fill(EN['rates.missing.many'], { count: 3 }), `2 "${fill(EN['rates.missing.many'], { count: 3 })}"`);
  await set(page, '[data-field="time-first-price"]', REGULAR_FORM.time.firstPrice);
  await set(page, '[data-field="time-next-minutes"]', REGULAR_FORM.time.nextMinutes);
  await set(page, '[data-field="time-next-price"]', REGULAR_FORM.time.nextPrice);
  await page.click('[data-tick="day-max-on"]');
  await set(page, '[data-field="day-max-price"]', REGULAR_FORM.dayMax.price);
  await pick(page, '[data-field="day-max-kind"]', REGULAR_FORM.dayMax.kind);
  await page.click('[data-tick="grace-on"]');
  await set(page, '[data-field="grace-minutes"]', REGULAR_FORM.grace.minutes);
  check(!(await page.$('[data-field="time-rounding"]')) && !EN['rates.time.rounding'], '3 no "A period that has started" box');
  await unitsHold(page, 'en, the regular rates', EN);
  await page.click('[data-action="save-regular"]');
  const regTry = await reviewPriced(page, 'the regular rates');
  check(regTry && sameRates(regTry.plan, built(REGULAR_FORM)), '4 the regular rates: the check page prices exactly the document the page builds');
  check(regTry && regTry.plan.rules.find((r) => r.type === 'increment').rounding === 'ceil', '3 a started period charged in full, said by no box');
  check((await steps(page)) === '1 2* 3', `10 the check page's steps, the one to do marked: ${await steps(page)}`);
  check(await page.isDisabled('[data-action="confirm-rates"]'), '10 priced, not ticked: Confirm cannot be pressed');
  check((await page.textContent('[data-reason-for="confirm-rates"]').catch(() => '')) === EN['rates.review.needTick'], `10 Confirm locked: "${EN['rates.review.needTick']}"`);
  check((await page.textContent('[data-notice="takes-effect"]')) === `${EN['rates.review.noticeBold']} ${EN['rates.review.noticeRest']}` && (await page.textContent('[data-notice="takes-effect"] b', { timeout: 2000 }).catch(() => null)) === EN['rates.review.noticeBold'], '8 the notice above the tick, its first sentence bold');
  check((await page.textContent('[data-tick="checked-prices"] > span:last-child')) === EN['rates.review.tick'], `8 the tick: "${EN['rates.review.tick']}"`);
  const regRows = await tableRows(page);
  check(
    regRows.map((r) => r.why).join() === 'graceInside,graceOver,firstPeriod,nextPeriod,length,length,length,length,length,dayMax,dayAndHour,twoDays,week',
    `6 the approved page's rows: ${regRows.map((r) => r.why).join(', ')}`,
  );
  check(regRows.map((r) => r.fee).join() === '0,800,800,1200,1200,1600,2400,3000,3000,6000,6000,9000,24000', `1 the engine's prices, row for row, the approved page's: ${regRows.map((r) => r.fee).join(', ')}`);
  check(regRows.every((r) => r.pays === `$${(r.fee / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`), '1 each "Driver pays" says the engine\'s fee');
  check(writes() === 0, '10 nothing saved before Confirm');
  await lockedHold(page, 'en, the check page before the tick');
  await page.click('[data-tick="checked-prices"]');
  check((await steps(page)) === '1 2 3*' && !(await page.isDisabled('[data-action="confirm-rates"]')), `10 ticked: Confirm can be pressed, step 3 marked: ${await steps(page)}`);
  check((await page.textContent('[data-reason-for="confirm-rates"]').catch(() => '')) === EN['rates.review.confirmSays'], `10 ticked: "${EN['rates.review.confirmSays']}"`);
  const pressedAt = Date.now();
  await page.click('[data-action="confirm-rates"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-notice="saved"]'))), 'saved: back on the Rates page');
  const save1 = lastSave();
  check(save1.confirmed === true && save1.based_on === null && Math.abs(Date.parse(save1.plan.effective_from) - pressedAt) < 60_000, `3 the save starts when Confirm is pressed and was checked against no rates (${save1.plan?.effective_from}, based_on ${save1.based_on})`);
  const savedSays = await page.textContent('[data-notice="saved"]');
  check(savedSays === fill(EN['rates.saved'], { time: garageDateTime(save1.plan.effective_from, ZONE, 'en') }), `"${savedSays}"`);
  check((await page.textContent('[data-state="current"]')).startsWith(fill(EN['rates.since'], { time: garageDateTime(save1.plan.effective_from, ZONE, 'en') })), 'Current rates: "Current since …", the garage\'s time');
  const sentences = await page.$$eval('[data-sentences="current"] li', (els) => els.map((e) => e.textContent));
  check(sentences.join(' | ') === 'First hour $8.00, then $4.00 each hour. | Max $30.00 per day (a calendar day, midnight to midnight). | Free if the car leaves within 10 minutes.', `the approved page's sentences: ${sentences.join(' | ')}`);
  await saversHold(page, 'after the first save', RIVERSIDE);

  // ── Check 8: the form opens empty; all left empty, "Nothing to save." ─────
  await nothingPrefilled(page, REG, 'en, the regular rates', EN);
  const beforeNothing = tries();
  await page.click('[data-action="save-regular"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-notice="nothing-to-save"]'))), `8 every field empty: "${EN['rates.nothingToSave']}"`);
  check(!(await page.$('[data-form="review-rates"]')) && tries() === beforeNothing, '8 nothing to save: no check page, nothing priced');
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await framesHold(page, `en, the regular rates, ${width} px`);
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  await formTicksHold(page, 'en');

  // ── A special added: every field needed, then the early bird ───────────
  // The platform's 20 tries a minute: the minute let pass, as the recording does.
  stub.forgetTries();
  await page.click('[data-action="add-special"]');
  await page.waitForSelector('[data-editing="add"]');
  await page.click('[data-action="save-special"]');
  const newMissing = await page.$$eval('[data-editing="add"] [data-notice="form-not-ready"] li', (els) => els.length);
  check(newMissing === 7, `2 a new special: every field needed, ${newMissing} named by its button`);
  await linksHaveTargets(page, 'a new special, nothing picked');
  await set(page, '[data-editing="add"] [data-field="special-name"]', EARLY_BIRD.name);
  await pick(page, '[data-editing="add"] [data-field="special-preset"]', EARLY_BIRD.preset);
  const ticked = await page.$$eval('[data-editing="add"] [data-tick^="day-"][aria-checked="true"]', (els) => els.map((e) => e.dataset.tick.slice(4)));
  check(ticked.join() === 'mon,tue,wed,thu,fri', `"${EN['rates.preset.weekdays']}" ticks Monday to Friday: ${ticked.join(', ')}`);
  await set(page, '[data-editing="add"] [data-field="special-enter-from"]', EARLY_BIRD.enterFrom);
  await set(page, '[data-editing="add"] [data-field="special-enter-by"]', EARLY_BIRD.enterBy);
  await page.click('[data-editing="add"] [data-control="next-day"] [data-value="false"]');
  await page.click('[data-action="save-special"]');
  await missingHold(page, '[data-editing="add"]', ['special-leave-by', 'special-charge'], 'en, a special with two missing');
  await set(page, '[data-editing="add"] [data-field="special-leave-by"]', EARLY_BIRD.leaveBy);
  await pick(page, '[data-editing="add"] [data-field="special-charge"]', 'adjust');
  await pick(page, '[data-editing="add"] [data-field="special-amount-kind"]', 'percent');
  await unitsHold(page, 'en, a percent', EN, { 'special-amount': '%' });
  await pick(page, '[data-editing="add"] [data-field="special-charge"]', 'rate');
  await unitsHold(page, 'en, its own hourly rate', EN);
  await pick(page, '[data-editing="add"] [data-field="special-charge"]', 'flat');
  await set(page, '[data-editing="add"] [data-field="special-flat"]', EARLY_BIRD.flat);
  await ticksHold(page, 'en, a special being added, 1360 px');
  await page.setViewportSize({ width: 360, height: 900 });
  await ticksHold(page, 'en, a new special, 360 px');
  await page.setViewportSize({ width: 1360, height: 900 });
  await datesHold(page, 'en, a special being added');
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await framesHold(page, `en, a special being added, ${width} px`);
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  // Check 5 before it is saved: the calculator on the rates being changed.
  const early = await calculate(page, STAYS.early, 'changing');
  check(early.fee === STAYS.early.fee && early.says === 'Early bird applied. By the time-based rate this stay would be $30.00.', `5 the rates being changed, the early bird: ${early.fee}, "${early.says}"`);
  check(early.nothingSaved === EN['rates.calc.nothingSaved'] && early.pays === 'The driver pays $12.00.', `5 "${early.nothingSaved}" "${early.pays}"`);
  check(writes() === 1, '5 the calculator saves nothing');
  // F1: the special changed after the answer: the answer greyed, and says so.
  await set(page, '[data-editing="add"] [data-field="special-flat"]', '13');
  check(await settles(page, () => document.querySelector('[data-section="calculator"] [data-stale]')?.dataset.stale === 'yes' && Boolean(document.querySelector('[data-notice="calc-stale"]'))), 'F1 the special changed after the answer: greyed, and said');
  await set(page, '[data-editing="add"] [data-field="special-flat"]', EARLY_BIRD.flat);
  check(await settles(page, () => document.querySelector('[data-section="calculator"] [data-stale]')?.dataset.stale === 'no'), 'F1 control: typed back, the answer is for these rates again');
  await page.click('[data-action="save-special"]');
  const earlyTry = await reviewPriced(page, 'the early bird added');
  const stored1 = stub.ratesSaved(RIVERSIDE.id)[0];
  const wantEarly = specialsPlan(stored1, { kind: 'add', special: EARLY_BIRD }, { garage: GARAGE, spaceClass: 'standard', start: 'x', name: 'x' });
  check(earlyTry && sameRates(earlyTry.plan, wantEarly), '4 the early bird added: exactly the document the page builds');
  const regularOf = (p) => JSON.stringify(p.rules.filter((r) => r.type !== 'time_window'));
  check(earlyTry && regularOf(earlyTry.plan) === regularOf(stored1), '4 a special saved: the regular rates byte for byte as stored');
  check((await page.textContent('[data-notice="what-changes"]')) === fill(EN['rates.review.whatAdd'], { name: 'Early bird' }), '6 what this save does, in one sentence');
  const change1 = await page.$$eval('[data-changes] .change-row', (els) => els.map((e) => [...e.children].map((c) => c.textContent).join('|')));
  check(change1.join() === `Early bird|${EN['rates.change.none']}|→|${EN['rates.change.added']}`, `6 what changes: ${change1.join(', ')}`);
  const earlyRows = await tableRows(page);
  const byWhy = (why) => earlyRows.filter((r) => r.why === why);
  check(
    byWhy('specialFrom')[0]?.fee === 1200 && byWhy('specialBy')[0]?.fee === 1200 && byWhy('specialTooEarly')[0]?.fee === 3000 && byWhy('specialTooLate')[0]?.fee === 3000 && byWhy('specialLeftLate')[0]?.fee === 3000,
    `1 the early bird's rows: ${earlyRows.filter((r) => r.why.startsWith('special')).map((r) => `${r.why} ${r.fee}`).join(', ')}`,
  );
  check(byWhy('specialFrom')[0]?.says === 'Early bird applied. By the time-based rate this stay would be $30.00.' && byWhy('specialTooEarly')[0]?.says === 'None. Early bird: came in before Come in from. The max per day was charged.', `the approved page's words: "${byWhy('specialTooEarly')[0]?.says}"`);
  check(byWhy('length')[0]?.says === 'None. Early bird: not for a Saturday.', `"${byWhy('length')[0]?.says}"`);
  check(!ENGINE_WORDS.test(await bodyText(page)), 'no engine word on the check page');
  // Check 6: a stay added prices the table again by itself.
  const triesBefore = tries();
  await set(page, '[data-field="add-entry"]', STAYS.earlyBeaten.entry);
  await set(page, '[data-field="add-exit"]', STAYS.earlyBeaten.exit);
  await page.click('[data-action="add-stay"]');
  check(await settles(page, () => document.querySelector('[data-list="price-table"] tbody tr:last-child')?.dataset.why === 'added' && !document.querySelector('[data-notice="table-pricing"]')), '6 a stay added: the table prices again, by itself');
  const added = (await tableRows(page)).at(-1);
  check(tries() === triesBefore + 1 && added.fee === 800 && added.checks === EN['rates.test.added'] && added.says === 'None. Early bird would be $12.00; the time-based rate is cheaper.', `6 one try; the stay added: ${added.fee}, "${added.says}"`);
  // Ticked, then a stay added and priced slowly: Confirm locked while the table is priced again, the reason beside it.
  await page.click('[data-tick="checked-prices"]');
  stub.delayTries(1500);
  await set(page, '[data-field="add-entry"]', STAYS.plain.entry);
  await set(page, '[data-field="add-exit"]', STAYS.plain.exit);
  await page.click('[data-action="add-stay"]');
  const waiting = await settles(page, () => Boolean(document.querySelector('[data-notice="table-pricing"]')));
  check(
    waiting && (await page.isDisabled('[data-action="confirm-rates"]')) && (await page.textContent('[data-reason-for="confirm-rates"]').catch(() => '')) === EN['rates.table.busy'] && (await steps(page)) === '1* 2 3',
    `12 a stay added while ticked: Confirm locked until the table is priced again, "${EN['rates.table.busy']}", step 1 marked`,
  );
  stub.delayTries(0);
  check(await settles(page, () => !document.querySelector('[data-notice="table-pricing"]') && !document.querySelector('[data-action="confirm-rates"]').disabled), '12 priced again: Confirm can be pressed');
  await page.click('[data-tick="checked-prices"]');
  // Check 7: the price table downloaded and printed.
  for (const what of ['excel', 'pdf']) {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`[data-section="price-table"] [data-action="download-${what}"]`)]);
    const name = download.suggestedFilename();
    await download.saveAs(join(DIR, name));
    check(name.endsWith(what === 'excel' ? '.xlsx' : '.pdf') && name.includes(EN['page.priceTable.title'].split(' ')[0]), `7 the price table, Download ${what}: ${name}`);
  }
  await page.click('[data-section="price-table"] [data-action="print"]');
  check(await settles(page, () => window.__printed === 1), '7 the price table prints');
  await confirmTickHolds(page, 'en');
  // Findings: rates the engine finds a gap in, refused at Confirm, each in a plain sentence.
  await page.click('[data-tick="checked-prices"]');
  stub.gapNextSave();
  await page.click('[data-action="confirm-rates"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-section="confirm"] [data-problem="planFindings"]'))), 'the gap: refused, in plain words, the check page kept');
  check(await settles(page, () => document.querySelectorAll('[data-section="findings"] li').length > 0), '5 the gap: its findings are listed');
  const findingText = await page.$$eval('[data-section="findings"] li', (els) => els.map((e) => e.textContent));
  check(findingText.length > 0 && findingText.every((x) => x.startsWith(EN['rates.finding.GAP_STAY_EXCEEDS_MAX_DURATION']) && !ENGINE_WORDS.test(x)), `5 each finding in a plain sentence: "${findingText[0]}"`);
  check(!ENGINE_WORDS.test(await bodyText(page)), 'the gap: no engine word');
  // The change log read slowly (CI, 2026-10-12): the rates just saved are never said to be missing from it.
  stub.delayChanges(1500);
  await page.click('[data-action="confirm-rates"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-notice="saved"]'))), 'the early bird saved');
  let tooSoon = 0;
  for (let i = 0; i < 12; i += 1) {
    tooSoon += await page.locator('[data-saved-by="unknown"]').count();
    await page.waitForTimeout(100);
  }
  stub.delayChanges(0);
  check(tooSoon === 0, `9 a save just made, its change log still being read: no set of rates said to be missing from it (${tooSoon})`);
  const rows1 = stub.rateRows(RIVERSIDE.id);
  check(lastSave().based_on === rows1[0].id, '4 the save names the rates it was checked against (the first)');
  // ── The regular rates changed with a special in force: the specials kept byte for byte ──
  stub.forgetTries();
  await set(page, '[data-field="grace-minutes"]', '25');
  await page.click('[data-action="save-regular"]');
  const graceTry = await reviewPriced(page, 'the regular rates changed');
  const specialsOf = (p) => JSON.stringify({ windows: p.rules.filter((r) => r.type === 'time_window'), order: p.adjust_order });
  check(graceTry && specialsOf(graceTry.plan) === specialsOf(stub.ratesSaved(RIVERSIDE.id).at(-1)) && graceTry.plan.rules.find((r) => r.type === 'grace').minutes === 25, '4 the regular rates saved: the specials byte for byte as stored');
  await page.click('[data-tick="checked-prices"]');
  await page.click('[data-action="confirm-rates"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-notice="saved"]'))), 'grace 25 saved');

  // ── Check 5: the calculator on the current rates, five kinds of stay ───
  // The platform's 20 tries a minute: the minute let pass, as the recording does.
  stub.forgetTries();
  for (const [kind, stay] of Object.entries(STAYS).filter(([k]) => k !== 'maxDays')) {
    const a = await calculate(page, stay, 'force');
    check(a.status === 200 && a.fee === stay.fee, `1 the calculator, current rates, ${kind}: ${a.fee} (the approved page: ${stay.fee})${a.status === 200 ? '' : `, HTTP ${a.status}`}${Number.isNaN(a.fee) ? ` -- ${await page.textContent(calc)}` : ''}`);
  }
  const capped = await calculate(page, STAYS.dayMax, 'force');
  check(capped.lines.map((l) => l.join(' ')).join(' / ') === 'Max per day $30.00 / Total $30.00' && capped.byHour === 'By the hour it would be $52.00.', `the max per day: ${capped.lines.map((l) => l.join(' ')).join(' / ')}; "${capped.byHour}"`);
  // Check 6 of the brief: the max breakdown, on rates being changed.
  await set(page, '[data-field="time-first-price"]', '40');
  await set(page, '[data-field="time-next-minutes"]', '15');
  await set(page, '[data-field="time-next-price"]', '10');
  await set(page, '[data-field="day-max-price"]', '100');
  const max = await calculate(page, STAYS.maxDays, 'changing');
  check(max.lines.map((l) => l.join(' ')).join(' / ') === 'Max per day, 2 days at $100.00 $200.00 / Total $200.00' && max.byHour === 'By the hour it would be $1,300.00.', `5 32 h 30: ${max.lines.map((l) => l.join(' ')).join(' / ')}; "${max.byHour}"`);
  await page.click('[data-action="clear-regular"]');
  check((await page.inputValue('[data-field="time-first-price"]')) === '', 'Clear what I typed: the fields empty again');

  // ── A special changed: empty, its value in force under each field ──────
  // The platform's 20 tries a minute: the minute let pass, as the recording does.
  stub.forgetTries();
  await page.click(`${SPECIALS} [data-special-in-force="1"] [data-action="change-special"]`);
  await page.waitForSelector('[data-editing="change"]');
  await nothingPrefilled(page, '[data-editing="change"]', 'en, a special being changed', EN);
  await page.click('[data-action="save-special"]');
  check(await settles(page, (w) => document.querySelector('[data-editing="change"] [data-notice="form-not-ready"]')?.textContent.includes(w), EN['rates.nothingToSave.special']), `8 a special changed by nothing: "${EN['rates.nothingToSave.special']}"`);
  await set(page, '[data-editing="change"] [data-field="special-flat"]', '15');
  await page.click('[data-action="save-special"]');
  await reviewPriced(page, 'the early bird changed');
  const change2 = await page.$$eval('[data-changes] .change-row', (els) => els.map((e) => ({ was: e.querySelector('.change-was').textContent, is: e.querySelector('.change-is').textContent, struck: getComputedStyle(e.querySelector('.change-was')).textDecorationLine })));
  check(change2.length === 1 && change2[0].was.endsWith('$12.00 for the stay.') && change2[0].is.endsWith('$15.00 for the stay.') && change2[0].struck.includes('line-through'), `6 what changes: the old struck through, then the new (${change2[0]?.was} → ${change2[0]?.is})`);

  // ── P2: rates saved by someone else while this check page is open ──────
  const rows2 = stub.rateRows(RIVERSIDE.id);
  const other = { ...stub.ratesSaved(RIVERSIDE.id).at(-1), plan_version: 'saved-elsewhere', effective_from: new Date().toISOString() };
  other.rules = other.rules.map((r) => (r.type === 'grace' ? { ...r, minutes: 20 } : r));
  stub.storeRates(RIVERSIDE.id, other, A);
  await page.click('[data-tick="checked-prices"]');
  const before = stub.rateRows(RIVERSIDE.id).length;
  await page.click('[data-action="confirm-rates"]');
  check(await settles(page, (w) => document.querySelector('[data-form="review-rates"] [data-problem="ratesChanged"]')?.textContent === w, EN['problem.ratesChanged']), `P2 refused: "${EN['problem.ratesChanged']}"`);
  check(stub.rateRows(RIVERSIDE.id).length === before && lastSave().based_on === rows2.at(-1).id, 'P2 nothing stored by the refused Confirm');
  check(await settles(page, () => [...document.querySelectorAll('[data-sentences="draft"] li')].some((li) => li.textContent.includes('20 minutes')) && [...document.querySelectorAll('[data-sentences="draft"] li')].some((li) => li.textContent.includes('$15.00 for the stay'))), 'P2 read again: the new rates hold the other save (20 minutes) and what was typed ($15)');
  check(await settles(page, () => document.querySelector('[data-tick="checked-prices"]')?.getAttribute('aria-checked') === 'false' && Boolean(document.querySelector('[data-list="price-table"]'))), 'P2 priced again, the tick to give again');
  await page.click('[data-tick="checked-prices"]');
  await page.click('[data-action="confirm-rates"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-notice="saved"]'))), 'P2 confirmed again: saved');
  check(lastSave().based_on === stub.rateRows(RIVERSIDE.id).at(-2).id, 'P2 the save names the rates saved meanwhile');
  await saversHold(page, 'after five saves (one elsewhere)', RIVERSIDE);
  const earlier = await page.$$eval('[data-plan="earlier"] .rate-plan-when', (els) => els.map((e) => e.textContent));
  check(earlier.length === 4 && earlier.every((x) => x.startsWith('From ')), `earlier rates, newest first: ${earlier.length}`);


  // ── Remove: straight to the check page ─────────────────────────────────
  // The platform's 20 tries a minute: the minute let pass, as the recording does.
  stub.forgetTries();
  await page.click(`${SPECIALS} [data-special-in-force="1"] [data-action="remove-special"]`);
  await reviewPriced(page, 'the early bird removed');
  check((await page.textContent('[data-notice="what-changes"]')) === fill(EN['rates.review.whatRemove'], { name: 'Early bird' }), '6 removing: one sentence');
  await page.click('[data-tick="checked-prices"]');
  await page.click('[data-action="confirm-rates"]');
  check(await settles(page, (w) => document.querySelector('[data-section="specials"]')?.textContent.includes(w), EN['rates.specials.none']), 'removed: no special rates');

  // ── Check 7: the Rates list downloaded and printed ─────────────────────
  for (const what of ['excel', 'pdf']) {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`[data-section="in-force"] [data-action="download-${what}"]`)]);
    check(download.suggestedFilename().endsWith(what === 'excel' ? '.xlsx' : '.pdf'), `7 the Rates list, Download ${what}: ${download.suggestedFilename()}`);
  }
  await page.click('[data-section="in-force"] [data-action="print"]');
  check(await settles(page, () => window.__printed === 2), '7 the Rates list prints');

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
  await page.selectOption('[data-editing="add"] [data-field="special-preset"]', 'weekends');
  check(await fits(), '360 px: a special being added has no sideways scrolling');
  await page.click('[data-action="cancel-special"]');
  await go(page, '#/setup', EN['page.setup.title']);
  check(await fits(), '360 px: Setup has no sideways scrolling');
  await page.setViewportSize({ width: 1360, height: 900 });

  // ── Spanish: the Rates page in the other language ──────────────────────
  await chooseOnSettings(page, 'language', 'es');
  await page.click('.nav-item[href="#/rates"]');
  check(await settles(page, (t) => document.querySelector('.page-title')?.textContent === t, ES['page.rates.title']), 'es: Tarifas');
  // The words as written (innerText follows a CSS capitalisation).
  const esText = await page.evaluate(() => document.querySelector('main').textContent);
  check(esText.includes(ES['rates.inForce']) && !ENGINE_WORDS.test(esText), `es: the Rates page in Spanish, no engine word${ENGINE_WORDS.test(esText) ? `: "${esText.match(ENGINE_WORDS)[0]}"` : ''}`);
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
  await set(es, '[data-field="time-first-minutes"]', REGULAR_FORM.time.firstMinutes);
  await set(es, '[data-field="time-first-price"]', REGULAR_FORM.time.firstPrice);
  await set(es, '[data-field="time-next-minutes"]', REGULAR_FORM.time.nextMinutes);
  await set(es, '[data-field="time-next-price"]', REGULAR_FORM.time.nextPrice);
  await es.click('[data-tick="day-max-on"]');
  await set(es, '[data-field="day-max-price"]', REGULAR_FORM.dayMax.price);
  await pick(es, '[data-field="day-max-kind"]', REGULAR_FORM.dayMax.kind);
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
  const esSays = await es.$$eval('[data-list="price-table"] tbody tr', (rows) => rows.map((r) => r.cells[6].textContent));
  check(esSays.length > 0 && esSays.every((x) => x && !/[{}]/.test(x)) && !ENGINE_WORDS.test(esSays.join(' ')), `es: the table's special-rate words, in Spanish: "${esSays[0]}"`);
  await es.click('[data-tick="checked-prices"]');
  await es.click('[data-action="confirm-rates"]');
  check(await settles(es, () => Boolean(document.querySelector('[data-notice="saved"]'))), 'es: saved');
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
