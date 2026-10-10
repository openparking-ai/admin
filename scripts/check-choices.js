#!/usr/bin/env node
/* global document, window, getComputedStyle */
// The change log sorted and chosen from, one drawing at a time, and U7a's
// three loose ends (U7b), in a real browser.
//
// Serves dist/ (run `npm run build` first) with /api sent to the stand-in
// platform (test/stub-platform.js), opens it in headless Chromium with the
// browser in TOKYO time, signs in as owner A at Harbor Street, puts a log of
// 312 changes and 57 refused attempts in it -- of many kinds, by several
// people and keys, refused for several reasons -- and 25 people to tell, and
// checks:
//
//   1  sorting: the change log sorted each way -- When, newest first and
//      oldest first; Who; What -- shows its 312 lines in that order across
//      every page, none missed or repeated; the refused attempts too; and
//      Download Excel, Download PDF and Print each hold every line, in that
//      same order;
//   2  choosing what: ticks only for the kinds of thing the log holds; two
//      ticked, every line shown is one of them, the count says so ("1–20 of
//      N, of 312 in all"), and Excel, PDF and Print each hold exactly those
//      lines and name the choice in their head; "Show everything" puts every
//      line back, and the head says "Everything";
//   3  choosing why: the same on the refused attempts, by the reasons they
//      were refused for, listed only for reasons that appear;
//   4  one drawing: for each sheet, View, Download PDF and Print hold that
//      sheet only, the same as that sheet in the whole set; each file named
//      for its sheet and lane; the whole set's PDF and Print as before;
//   5  the refused attempts one line a row at 1280 px wide: who, what and
//      why cut short with "…", shown whole while pointed at and with the
//      keyboard's focus, and whole in print;
//   6  who gets which alert: at most 20 rows a page, every row once over its
//      pages, printed whole; Alerts' Excel and PDF hold every person and the
//      alerts each gets;
//   7  Getting paid's Cancel at the right of its form, as Change taxes' is.
// Where words are read, both languages. No request leaves the page.
//
//   node scripts/check-choices.js                 the check
//   node scripts/check-choices.js --screens DIR   ...and save the screenshots, by day and by night

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { DICTIONARIES } from '../src/i18n/index.js';
import { PAGES, hashFor } from '../src/pages.js';
import { startStub } from '../test/stub-platform.js';
import { readBack, tableOf } from './files/read-back.js';
import { chooseOnSettings } from './on-settings.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const screensAt = process.argv.indexOf('--screens');
const SCREENS = screensAt > 0 ? process.argv[screensAt + 1] : null;
if (SCREENS) mkdirSync(SCREENS, { recursive: true });
const WORDS = DICTIONARIES;
const DIR = mkdtempSync(join(tmpdir(), 'admin-choices-'));
const PER_PAGE = 20;

const failures = [];
let passed = 0;
const check = (ok, what) => {
  if (ok) passed += 1;
  else failures.push(what);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};

const stub = await startStub();
const A = stub.data.a;
const HARBOR = A.garages[0];
const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4377, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } } });
const base = server.resolvedUrls.local[0];
const origin = new URL(base).origin;
stub.allowOrigin(origin);
const browser = await chromium.launch();
const requests = [];

async function open(width = 1360) {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo', acceptDownloads: true, viewport: { width, height: 900 } });
  context.on('request', (r) => requests.push({ method: r.method(), url: r.url() }));
  await context.addInitScript(() => {
    window.__printed = 0;
    window.print = () => {
      window.__printed += 1;
    };
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.fill('input[name="email"]', A.email);
  await page.fill('input[name="password"]', A.password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('.nav');
  await page.click(`.garage-choice[data-garage="${HARBOR.id}"]`);
  return { context, page };
}

const settles = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const go = async (page, id) => {
  await page.click(`.nav-item[href="${hashFor(PAGES.find((x) => x.id === id))}"]`);
};
const plain = (text) => String(text ?? '').replace(/[\s  ]+/g, ' ').trim();
const n = (x, language) => x.toLocaleString(language === 'es' ? 'es-US' : 'en-US');
const fill = (text, values) => Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), text);
const locale = (language) => (language === 'es' ? 'es-US' : 'en-US');
const lower = (text, language) => text.charAt(0).toLocaleLowerCase(locale(language)) + text.slice(1);
const upper = (text, language) => text.charAt(0).toLocaleUpperCase(locale(language)) + text.slice(1);
/** A screenshot: of `selector` alone when given (the pages scroll inside their own frame), else of the window. */
const screenshot = async (page, name, selector = null) => {
  if (!SCREENS) return;
  const path = join(SCREENS, `${name}.png`);
  if (selector) await page.locator(selector).first().screenshot({ path });
  else await page.screenshot({ path, fullPage: true });
};

async function download(page, selector, tag) {
  const got = page.waitForEvent('download', { timeout: 30000 }).then((d) => d, () => null);
  await page.click(selector);
  const file = await got;
  if (!file) return null;
  const path = join(DIR, `${tag}-${Math.random().toString(36).slice(2)}-${file.suggestedFilename()}`);
  await file.saveAs(path);
  return { path, name: file.suggestedFilename() };
}

// ── The log: 312 changes and 57 refused attempts ───────────────────────────
// Each line at its own minute, so its time tells it apart in every view; a
// few changes share a minute, which sorting must keep in the platform's order.
const START = Date.parse('2026-02-01T14:00:00Z');
const PEOPLE_WHO = [
  { kind: 'owner', name: A.email },
  { kind: 'key', name: 'Booth key' },
  { kind: 'outside', name: null },
  { kind: 'key', name: 'Desk key 2' },
  { kind: 'owner', name: 'manager@example.com' },
  { kind: 'key', name: 'Desk key 10' },
];
// The kinds of thing changed, as the brief names them, each with an action of it the log holds.
// Getting paid and keys are in no change: their ticks must not be offered on the change log.
const DONE = [
  { action: 'lane.rename', subject: (i) => ({ kind: 'lane', name: `Gate ${i}` }), kind: 'choose.kind.lanes' },
  { action: 'tax_set.add', subject: (i) => ({ kind: 'tax_set', name: `Tax list ${i}` }), kind: 'choose.kind.taxes' },
  { action: 'garage.update', subject: () => ({ kind: 'garage', name: HARBOR.name }), kind: 'choose.kind.garage' },
  { action: 'board_message.add', subject: (i) => ({ kind: 'board_message', name: `Message ${i}` }), kind: 'choose.kind.screens' },
  { action: 'lane.close', subject: (i) => ({ kind: 'lane', name: `Gate ${i}` }), kind: 'choose.kind.lanes' },
  { action: 'computer.connect', subject: (i) => ({ kind: 'lane', name: `Gate ${i}` }), kind: 'choose.kind.connections' },
  { action: 'rate_plan.add', subject: (i) => ({ kind: 'rate_plan', name: `Rate ${i}` }), kind: 'choose.kind.rates' },
  { action: 'lane.card_reader_connect', subject: (i) => ({ kind: 'lane', name: `Gate ${i}` }), kind: 'choose.kind.readers' },
  { action: 'alert_contact.add', subject: (i) => ({ kind: 'alert_contact', id: `pa999999-0000-4000-8000-${String(i).padStart(12, '0')}`, name: null }), kind: 'choose.kind.people' },
  { action: 'language.change', subject: () => ({ kind: 'owner', name: null }), kind: 'choose.kind.language' },
];
// Each refused attempt's reason, as the list words it: a "not found" from another account is "not theirs".
const REFUSED = [
  { action: 'lane.rename', refusal: 'lane_name_refused', why: 'lane_name_refused', kind: 'choose.kind.lanes' },
  { action: 'lane.close', refusal: 'last_open_lane', why: 'last_open_lane', kind: 'choose.kind.lanes' },
  { action: 'garage.pass_links', refusal: 'session_ended', why: 'session_ended', who: { kind: 'owner', name: A.email }, kind: 'choose.kind.garage' },
  { action: 'lane.remove', refusal: 'lane_not_found', why: 'notTheirs', who: { kind: 'outside', name: null }, kind: 'choose.kind.lanes' },
  { action: 'alert_contact.change', refusal: 'alert_contact_email_refused', why: 'alert_contact_email_refused', kind: 'choose.kind.people' },
  { action: 'refused.many', refusal: 'too_many_refused', why: 'too_many_refused', who: { kind: 'outside', name: null }, attempts: 40, kind: 'choose.kind.many' },
  { action: 'payment_account.create', refusal: 'connect_not_configured', why: 'connect_not_configured', kind: 'choose.kind.paid' },
  { action: 'tax_set.add', refusal: 'tax_set_effective_from_taken', why: 'tax_set_effective_from_taken', kind: 'choose.kind.taxes' },
];
const made = Array.from({ length: 312 }, (_, i) => {
  const d = DONE[i % DONE.length];
  // Every 25th change at the same minute as the one before it.
  const minute = i - (i % 25 === 24 ? 1 : 0);
  return {
    id: `c7000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    garage_id: HARBOR.id,
    at: new Date(START + minute * 37 * 60_000).toISOString(),
    outcome: 'done',
    who: PEOPLE_WHO[(i * 7) % PEOPLE_WHO.length],
    action: d.action,
    subject: { id: null, ...d.subject(i) },
    before: { name: 'Before' },
    after: { name: 'After' },
    refusal: null,
    attempts: 1,
    last_at: null,
    kind: d.kind,
  };
});
// The newest three in December, whose dates are the longest to write ("Dec 12, 2026, 12:56 PM").
const DECEMBER = Date.parse('2026-12-12T17:56:00Z');
const refused = Array.from({ length: 57 }, (_, i) => {
  const r = REFUSED[i % REFUSED.length];
  const at = i >= 54 ? DECEMBER + (i - 54) * 61 * 60_000 : START + (i * 53 + 11) * 60_000;
  const many = r.refusal === 'too_many_refused';
  return {
    id: `d7000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    garage_id: HARBOR.id,
    at: new Date(at).toISOString(),
    outcome: 'refused',
    who: r.who ?? PEOPLE_WHO[(i * 5) % PEOPLE_WHO.length],
    action: r.action,
    subject: many ? { kind: 'unknown', id: null, name: null } : { kind: 'lane', id: null, name: r.action === 'garage.pass_links' ? HARBOR.name : `Gate ${i}` },
    before: null,
    after: null,
    refusal: r.refusal,
    attempts: r.attempts ?? 1,
    last_at: new Date(at + 7 * 60_000).toISOString(),
    kind: r.kind,
    why: r.why,
  };
});
const byId = new Map([...made, ...refused].map((l) => [l.id, l]));
// Put back after each change of language, which is itself a line in the log.
const putLog = () => stub.setChanges(A, [...made, ...refused].map(({ kind: _k, why: _w, ...line }) => line).sort((x, y) => Date.parse(x.at) - Date.parse(y.at)));

const LIST = {
  changes: { columns: ['changes.when', 'changes.who', 'changes.what', 'changes.before', 'changes.after'], lines: made },
  refused: { columns: ['refused.when', 'refused.who', 'refused.what', 'refused.why', 'refused.times', 'refused.last'], lines: refused },
};

/** The rows of a list drawn on screen now: { id, when, who, what, why }. */
const shownRows = (page, list) =>
  page.evaluate((l) => [...document.querySelectorAll(`[data-list="${l}"] tbody tr`)].filter((tr) => getComputedStyle(tr).display !== 'none').map((tr) => {
    const cells = [...tr.cells].map((td) => td.textContent);
    return { id: tr.dataset.change, when: cells[0], who: cells[1], what: cells[2], why: cells[3] };
  }), list);

// Each line's time as the screen says it, by language: what tells a line apart in a PDF.
const WHEN = { en: new Map(), es: new Map() };

/** Every page of a list, Next to the end: the rows in order, and what was wrong on the way. */
async function readPages(page, list, language, total) {
  const wrong = [];
  const seen = [];
  await page.click(`[data-pager="${list}"] [data-action="previous"]`, { timeout: 1000 }).catch(() => {});
  for (let i = 0; i < 40; i += 1) {
    const rows = await shownRows(page, list);
    if (rows.length > PER_PAGE) wrong.push(`page ${i + 1}: ${rows.length} rows`);
    seen.push(...rows);
    for (const r of rows) WHEN[language].set(r.id, plain(r.when));
    const next = `[data-pager="${list}"] [data-action="next"]`;
    if (!(await page.$(next)) || (await page.$eval(next, (b) => b.disabled))) break;
    const where = await page.textContent(`[data-pager="${list}"] .pager-where`);
    await page.click(next);
    await settles(page, ([l, w]) => document.querySelector(`[data-pager="${l}"] .pager-where`)?.textContent !== w, [list, where]);
  }
  const count = seen.length;
  if (total !== undefined) {
    const says = await page.textContent(`[data-pager="${list}"] .pager-where`).catch(() => null);
    const last = Math.max(1, count - ((count - 1) % PER_PAGE));
    const want = total === count
      ? fill(WORDS[language]['pager.where'], { from: n(last, language), to: n(count, language), count: n(count, language) })
      : fill(WORDS[language]['pager.whereOf'], { from: n(last, language), to: n(count, language), count: n(count, language), total: n(total, language) });
    if (count > 0 && says !== want) wrong.push(`the last page says "${says}", not "${want}"`);
  }
  return { rows: seen, wrong };
}

const whyWords = (line, language) => upper(WORDS[language][`changes.refusal.${line.why}`], language);

/** Is `rows` in the order `sort` asks? Ties keep the newest first. */
function outOfOrder(rows, sort, language) {
  const compare = new Intl.Collator(locale(language), { sensitivity: 'base', numeric: true }).compare;
  const at = (r) => Date.parse(byId.get(r.id).at);
  for (let i = 1; i < rows.length; i += 1) {
    const [a, b] = [rows[i - 1], rows[i]];
    const ok = {
      newest: at(a) >= at(b),
      oldest: at(a) <= at(b),
      who: compare(plain(a.who), plain(b.who)) < 0 || (compare(plain(a.who), plain(b.who)) === 0 && at(a) >= at(b)),
      what: compare(plain(a.what), plain(b.what)) < 0 || (compare(plain(a.what), plain(b.what)) === 0 && at(a) >= at(b)),
    }[sort];
    if (!ok) return `row ${i} ("${plain(a[sort === 'what' ? 'what' : 'who'])}", ${byId.get(a.id).at}) before row ${i + 1} ("${plain(b[sort === 'what' ? 'what' : 'who'])}", ${byId.get(b.id).at})`;
  }
  return null;
}

async function sortBy(page, list, sort) {
  await page.selectOption(`[data-choose="${list}"] select[data-control="sort"]`, sort);
}

/**
 * Download Excel, Download PDF and Print of a list as it stands: each
 * compared with `rows` (the lines shown, in order, across every page) and
 * required to name `chosen` in its head.
 */
async function filesHold(page, list, rows, { language, label, chosen, order }) {
  const words = WORDS[language];
  const excel = await download(page, `[data-list="${list}"] [data-action="download-excel"]`, list);
  const pdf = await download(page, `[data-list="${list}"] [data-action="download-pdf"]`, list);
  if (!excel || !pdf) {
    check(false, `${label}: Download Excel and Download PDF each save a file`);
    return;
  }
  const read = readBack([excel.path, pdf.path]);
  const table = tableOf(read[excel.path].sheets[0], LIST[list].columns.map((k) => words[k]));
  const inExcel = table.rows.map((r) => ({ who: plain(r[1]?.value), what: plain(r[2]?.value) }));
  const sameRows = inExcel.length === rows.length && inExcel.every((r, i) => (order ? r.who === plain(rows[i].who) && r.what === plain(rows[i].what) : true));
  const wanted = new Set(rows.map((r) => `${plain(r.who)}|${plain(r.what)}`));
  const strays = inExcel.filter((r) => !wanted.has(`${r.who}|${r.what}`));
  check(sameRows && strays.length === 0 && table.lines.includes(chosen),
    `${label}: Download Excel holds exactly the ${rows.length} lines${order ? ', in the order on screen' : ''}, and its head says "${chosen}" (${inExcel.length} rows${strays.length ? `; ${strays.length} not shown on screen` : ''}; head: ${table.lines.slice(4).join(' | ') || 'nothing more'})`);
  const text = plain(read[pdf.path].pages.map((p) => p.text).join(' '));
  const times = rows.map((r) => plain(r.when));
  // The lines not shown, by the time the screen gave each when it showed every line (check 1 read them all);
  // a line at the same minute as one shown cannot be told apart by its time, and is left aside.
  const others = LIST[list].lines.filter((l) => !rows.some((r) => r.id === l.id));
  const unknown = others.filter((l) => !WHEN[language].has(l.id)).length;
  const otherTimes = others.map((l) => WHEN[language].get(l.id)).filter((x) => x && !times.includes(x));
  const absent = times.filter((x) => !text.includes(x));
  const present = otherTimes.filter((x) => text.includes(x));
  let inOrder = true;
  if (order) {
    let from = -1;
    for (const x of times) {
      const at = text.indexOf(x, from + 1);
      if (at <= from) {
        inOrder = false;
        break;
      }
      from = at;
    }
  }
  check(absent.length === 0 && present.length === 0 && unknown === 0 && inOrder && text.includes(plain(chosen)),
    `${label}: Download PDF holds exactly the ${rows.length} lines${order ? ', in the order on screen' : ''}, and says "${chosen}" (${rows.length - absent.length} found, none of ${otherTimes.length} others${absent.length ? `; missing ${absent.slice(0, 2).join(', ')}` : ''}${present.length ? `; ${present.length} lines not chosen` : ''}${unknown ? `; ${unknown} lines never seen on screen` : ''}${inOrder ? '' : '; out of order'})`);
  // Print: read again, then the page as printed.
  await page.click(`[data-list="${list}"] [data-action="print"]`);
  await settles(page, () => !document.querySelector('.list-actions[aria-busy="true"]'));
  await page.emulateMedia({ media: 'print' });
  const printed = await shownRows(page, list);
  const head = await page.evaluate((l) => document.querySelector(`[data-list="${l}"] .print-head [data-chosen]`)?.textContent ?? '', list);
  await page.emulateMedia({ media: 'screen' });
  const printOrder = printed.map((r) => r.id).join() === rows.map((r) => r.id).join();
  const printSet = printed.length === rows.length && rows.every((r) => printed.some((p) => p.id === r.id));
  check((order ? printOrder : printSet) && head === chosen,
    `${label}: Print holds exactly the ${rows.length} lines${order ? ', in the order on screen' : ''}, and its head says "${chosen}" (${printed.length} printed; head "${head}")`);
}

/**
 * The choices in words, as the brief has them: "Only: lanes, taxes and fees ·
 * oldest first", or "Everything". Kinds and reasons are named in the order
 * their ticks list them (`ticks`, read from the page).
 */
function chosenWords(language, { kinds = [], whys = [], sort = 'newest', ticks = {} }) {
  const w = WORDS[language];
  const parts = [];
  const inTicks = (keys, said, list = []) => [...keys].sort((a, b) => list.indexOf(said(a)) - list.indexOf(said(b)));
  if (kinds.length) parts.push(fill(w['choose.only'], { list: inTicks(kinds, (k) => w[k], ticks.what).map((k) => lower(w[k], language)).join(', ') }));
  if (whys.length) parts.push(fill(w['choose.onlyWhy'], { list: inTicks(whys, (k) => upper(w[`changes.refusal.${k}`], language), ticks.why).map((k) => w[`changes.refusal.${k}`]).join('; ') }));
  if (!parts.length) parts.push(w['choose.everything']);
  if (sort !== 'newest') parts.push(w[`choose.sorted.${sort}`]);
  return parts.join(' · ');
}

/** The ticks a field offers, in words: opened, read, and closed again. */
async function offered(page, list, control) {
  await page.click(`[data-choose="${list}"] [data-action="choose-${control}"]`);
  await page.waitForSelector(`[data-choose="${list}"] [data-ticks="${control}"]`);
  const texts = await page.$$eval(`[data-choose="${list}"] [data-ticks="${control}"] .choose-tick`, (bs) => bs.map((b) => b.textContent));
  await page.keyboard.press('Escape');
  return texts;
}

/** Tick each of `texts` (by its words) in a field's ticks, then close them. */
async function tick(page, list, control, texts) {
  await page.click(`[data-choose="${list}"] [data-action="choose-${control}"]`);
  for (const text of texts) {
    const at = await page.$$eval(`[data-choose="${list}"] [data-ticks="${control}"] .choose-tick`, (bs, t) => bs.findIndex((b) => b.textContent === t), text);
    if (at === -1) throw new Error(`no tick "${text}" in ${list}'s ${control}`);
    await page.click(`[data-choose="${list}"] [data-ticks="${control}"] .choose-tick >> nth=${at}`);
  }
  if (SCREENS) await screenshot(page, `ticks-${list}-${control}`, `[data-list="${list}"]`);
  await page.keyboard.press('Escape');
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

try {
  const { context, page } = await open();
  putLog();
  await go(page, 'changes');
  check(await settles(page, () => document.querySelectorAll('[data-list="changes"] tbody tr').length === 312 && document.querySelectorAll('[data-list="refused"] tbody tr').length === 57, null, 15000), 'the change log reads all 312 changes and 57 refused attempts');

  // ── 1: sorting ──────────────────────────────────────────────────────────
  for (const language of ['en', 'es']) {
    if (language === 'es') {
      await chooseOnSettings(page, 'language', 'es');
      putLog();
      await go(page, 'home');
      await go(page, 'changes');
      await settles(page, () => document.querySelectorAll('[data-list="changes"] tbody tr').length === 312, null, 15000);
    }
    const sorts = language === 'en' ? ['newest', 'oldest', 'who', 'what'] : ['who', 'what'];
    for (const sort of sorts) {
      for (const list of ['changes', 'refused']) {
        if (list === 'refused' && language === 'es' && sort === 'what') continue;
        await sortBy(page, list, sort);
        const { rows, wrong } = await readPages(page, list, language, LIST[list].lines.length);
        const ids = rows.map((r) => r.id);
        const missed = LIST[list].lines.filter((l) => !ids.includes(l.id)).length;
        const twice = ids.filter((id, i) => ids.indexOf(id) !== i).length;
        const order = outOfOrder(rows, sort, language);
        check(wrong.length === 0 && missed === 0 && twice === 0 && order === null,
          `1 ${list} sorted by ${sort} (${language}): all ${LIST[list].lines.length} in that order across every page, none missed or repeated (${rows.length} seen${missed ? `, ${missed} missed` : ''}${twice ? `, ${twice} twice` : ''}${order ? `; ${order}` : ''}${wrong.length ? `; ${wrong.join('; ')}` : ''})`);
        if ((language === 'en' && (sort === 'oldest' || sort === 'who')) || (language === 'es' && sort === 'what' && list === 'changes')) {
          await filesHold(page, list, rows, { language, label: `1 ${list} sorted by ${sort} (${language})`, chosen: chosenWords(language, { sort }), order: true });
        }
      }
    }
    await sortBy(page, 'changes', 'newest');
    await sortBy(page, 'refused', 'newest');
  }
  await chooseOnSettings(page, 'language', 'en');
  putLog();
  await go(page, 'home');
  await go(page, 'changes');
  await settles(page, () => document.querySelectorAll('[data-list="changes"] tbody tr').length === 312, null, 15000);

  // ── 2 and 3: choosing ───────────────────────────────────────────────────
  for (const language of ['en', 'es']) {
    const w = WORDS[language];
    if (language === 'es') {
      await chooseOnSettings(page, 'language', 'es');
      putLog();
      await go(page, 'home');
      await go(page, 'changes');
      await settles(page, () => document.querySelectorAll('[data-list="changes"] tbody tr').length === 312, null, 15000);
    }
    // What: the kinds in the log, and no other.
    const kindsMade = [...new Set(made.map((l) => w[l.kind]))];
    const whatOffered = await offered(page, 'changes', 'what');
    check(sameSet(whatOffered, kindsMade) && new Set(whatOffered).size === whatOffered.length,
      `2 changes (${language}): a tick for each kind of thing the log holds, and no other (${whatOffered.length}: ${whatOffered.join(', ')})`);
    const kindsRefused = [...new Set(refused.map((l) => w[l.kind]))];
    const refusedOffered = await offered(page, 'refused', 'what');
    check(sameSet(refusedOffered, kindsRefused), `2 refused attempts (${language}): a tick for each kind of thing tried, and no other (${refusedOffered.join(', ')})`);

    const two = ['choose.kind.lanes', 'choose.kind.taxes'];
    await tick(page, 'changes', 'what', two.map((k) => w[k]));
    const chosenLines = made.filter((l) => two.includes(l.kind));
    const { rows, wrong } = await readPages(page, 'changes', language, 312);
    const strays = rows.filter((r) => !two.includes(byId.get(r.id)?.kind));
    check(wrong.length === 0 && strays.length === 0 && sameSet(rows.map((r) => r.id), chosenLines.map((l) => l.id)),
      `2 changes, ${two.map((k) => w[k]).join(' and ')} ticked (${language}): every line shown is one of them, all ${chosenLines.length} of them, the count says "of ${chosenLines.length}, of 312" (${rows.length} shown${strays.length ? `, ${strays.length} of another kind` : ''}${wrong.length ? `; ${wrong.join('; ')}` : ''})`);
    if (language === 'en') await screenshot(page, 'changes-chosen');
    await filesHold(page, 'changes', rows, { language, label: `2 changes, two kinds ticked (${language})`, chosen: chosenWords(language, { kinds: two, ticks: { what: whatOffered } }), order: false });
    // With a sort too: the head says both.
    await sortBy(page, 'changes', 'oldest');
    const oldest = await readPages(page, 'changes', language, 312);
    await filesHold(page, 'changes', oldest.rows, { language, label: `2 changes, two kinds ticked, oldest first (${language})`, chosen: chosenWords(language, { kinds: two, sort: 'oldest', ticks: { what: whatOffered } }), order: true });
    // Show everything: every line back, and the head says "Everything".
    await page.click('[data-choose="changes"] [data-action="show-everything"]');
    const all = await readPages(page, 'changes', language, 312);
    const button = await page.$('[data-choose="changes"] [data-action="show-everything"]');
    check(all.rows.length === 312 && all.wrong.length === 0 && button === null && (await page.$eval('[data-choose="changes"] [data-action="choose-what"]', (b) => b.textContent)) === w['choose.everything'],
      `2 changes (${language}): "${w['choose.showEverything']}" puts all 312 back, newest first, with nothing ticked (${all.rows.length})`);
    check(outOfOrder(all.rows, 'newest', language) === null, `2 changes (${language}): after "${w['choose.showEverything']}", newest first again`);
    if (language === 'en') await filesHold(page, 'changes', all.rows, { language, label: '2 changes, nothing chosen (en)', chosen: w['choose.everything'], order: true });

    // 3, Why: the reasons that appear, and no other.
    const whys = [...new Set(refused.map((l) => whyWords(l, language)))];
    const whyOffered = await offered(page, 'refused', 'why');
    check(sameSet(whyOffered, whys) && new Set(whyOffered).size === whyOffered.length,
      `3 refused attempts (${language}): a tick for each reason the attempts were refused for, and no other (${whyOffered.length} of ${whys.length})`);
    const twoWhys = ['lane_name_refused', 'too_many_refused'];
    await tick(page, 'refused', 'why', twoWhys.map((k) => upper(w[`changes.refusal.${k}`], language)));
    const chosenRefused = refused.filter((l) => twoWhys.includes(l.why));
    const why = await readPages(page, 'refused', language, 57);
    const whyStrays = why.rows.filter((r) => !twoWhys.includes(byId.get(r.id)?.why));
    const shownWhy = new Set(why.rows.map((r) => plain(r.why)));
    check(why.wrong.length === 0 && whyStrays.length === 0 && sameSet(why.rows.map((r) => r.id), chosenRefused.map((l) => l.id)) && [...shownWhy].every((x) => twoWhys.some((k) => plain(upper(w[`changes.refusal.${k}`], language)) === x)),
      `3 refused attempts, two reasons ticked (${language}): every line shown was refused for one of them, all ${chosenRefused.length} of them (${why.rows.length} shown${whyStrays.length ? `, ${whyStrays.length} for another reason` : ''}${why.wrong.length ? `; ${why.wrong.join('; ')}` : ''})`);
    if (language === 'en') await screenshot(page, 'refused-chosen', '[data-list="refused"]');
    await filesHold(page, 'refused', why.rows, { language, label: `3 refused attempts, two reasons ticked (${language})`, chosen: chosenWords(language, { whys: twoWhys, ticks: { why: whyOffered } }), order: false });
    // A kind of thing tried too: both choices, and the head names both.
    await tick(page, 'refused', 'what', [w['choose.kind.lanes']]);
    const both = await readPages(page, 'refused', language, 57);
    const bothWant = refused.filter((l) => twoWhys.includes(l.why) && l.kind === 'choose.kind.lanes');
    check(sameSet(both.rows.map((r) => r.id), bothWant.map((l) => l.id)) && both.wrong.length === 0, `3 refused attempts, two reasons and lanes ticked (${language}): only lines that are both (${both.rows.length} of ${bothWant.length})`);
    if (language === 'es') await filesHold(page, 'refused', both.rows, { language, label: '3 refused attempts, reasons and a kind ticked (es)', chosen: chosenWords(language, { kinds: ['choose.kind.lanes'], whys: twoWhys, ticks: { what: refusedOffered, why: whyOffered } }), order: false });
    await page.click('[data-choose="refused"] [data-action="show-everything"]');
  }
  await chooseOnSettings(page, 'language', 'en');
  putLog();
  await context.close();

  // ── 5: the refused attempts, one line a row at 1280 px ──────────────────
  {
    const narrow = await open(1280);
    const p = narrow.page;
    for (const language of ['en', 'es']) {
      await chooseOnSettings(p, 'language', language);
      putLog();
      await go(p, 'home');
      await go(p, 'changes');
      await settles(p, () => document.querySelectorAll('[data-list="refused"] tbody tr').length === 57, null, 15000);
      for (const at of ['first', 'last']) {
        if (at === 'last') {
          while (await p.$eval('[data-pager="refused"] [data-action="next"]', (b) => !b.disabled).catch(() => false)) await p.click('[data-pager="refused"] [data-action="next"]');
        }
        const rows = await p.evaluate(() => [...document.querySelectorAll('[data-list="refused"] tbody tr')].filter((tr) => getComputedStyle(tr).display !== 'none').map((tr) => {
          const cell = tr.cells[0];
          const style = getComputedStyle(cell);
          const line = parseFloat(style.lineHeight);
          const inner = (td) => td.getBoundingClientRect().height - parseFloat(getComputedStyle(td).paddingTop) - parseFloat(getComputedStyle(td).paddingBottom);
          const cut = [...tr.querySelectorAll('.cut')];
          const table = tr.closest('table').getBoundingClientRect();
          return {
            id: tr.dataset.change,
            line,
            tallest: Math.max(...[...tr.cells].map(inner)),
            // A cell whose words run past its own edge, or past the list's.
            spills: [...tr.cells].filter((td) => td.scrollWidth > td.clientWidth + 1 || td.getBoundingClientRect().right > table.right + 1).map((td) => td.textContent),
            cut: cut.map((td) => {
              const text = td.querySelector('.cut-text');
              return { full: td.textContent, cut: text.scrollWidth > text.clientWidth + 1, ellipsis: getComputedStyle(text).textOverflow === 'ellipsis' && getComputedStyle(text).whiteSpace === 'nowrap' };
            }),
          };
        }));
        const tall = rows.filter((r) => r.tallest > r.line * 1.5);
        const anyCut = rows.flatMap((r) => r.cut).filter((c) => c.cut).length;
        const uncut = rows.flatMap((r) => r.cut).filter((c) => !c.ellipsis).length;
        const spills = rows.flatMap((r) => r.spills);
        check(rows.length > 0 && tall.length === 0 && uncut === 0 && anyCut > 0 && spills.length === 0,
          `5 refused attempts at 1280 px (${language}, ${at} page): each of ${rows.length} rows one line high, nothing running past its column; who, what and why cut with "…" (${anyCut} cut${tall.length ? `; ${tall.length} rows taller, the tallest ${Math.round(Math.max(...tall.map((r) => r.tallest)))} px for a ${Math.round(rows[0].line)} px line` : ''}${uncut ? `; ${uncut} cells that wrap` : ''}${spills.length ? `; past its column: "${spills.slice(0, 2).join('", "')}"` : ''})`);
        // The whole text: in the cell as it is stored, and shown whole while pointed at, and with the keyboard's focus.
        const target = await p.evaluateHandle(() => [...document.querySelectorAll('[data-list="refused"] tbody tr')].filter((tr) => getComputedStyle(tr).display !== 'none').flatMap((tr) => [...tr.querySelectorAll('.cut-text')]).find((x) => x.scrollWidth > x.clientWidth + 1));
        const cell = await target.evaluateHandle((x) => x.parentElement);
        const whole = (x) => x.scrollWidth <= x.clientWidth + 1 && getComputedStyle(x).whiteSpace !== 'nowrap';
        await cell.hover();
        const hovered = await target.evaluate(whole);
        if (language === 'en' && at === 'first') await screenshot(p, 'refused-hover', '[data-list="refused"]');
        await p.mouse.move(2, 2);
        const away = await target.evaluate(whole);
        await cell.evaluate((td) => td.focus());
        const focused = await target.evaluate(whole);
        const focusable = await cell.evaluate((td) => td.tabIndex === 0 && document.activeElement === td);
        await cell.evaluate((td) => td.blur());
        check(hovered && !away && focused && focusable, `5 refused attempts (${language}, ${at} page): a cut cell is shown whole while pointed at, and with the keyboard's focus (pointed ${hovered}, focused ${focused}, cut again after ${!away})`);
      }
      // In print: whole, every row.
      await p.emulateMedia({ media: 'print' });
      const printed = await p.evaluate(() => [...document.querySelectorAll('[data-list="refused"] .cut-text')].map((x) => ({ whole: x.scrollWidth <= x.clientWidth + 1 && getComputedStyle(x).whiteSpace !== 'nowrap', shown: getComputedStyle(x.closest('tr')).display !== 'none' })));
      await p.emulateMedia({ media: 'screen' });
      const cutOnPaper = printed.filter((x) => !x.whole || !x.shown).length;
      check(printed.length === 57 * 3 && cutOnPaper === 0, `5 refused attempts printed (${language}): who, what and why whole, in all 57 rows (${printed.length / 3} rows${cutOnPaper ? `; ${cutOnPaper} cells cut or left out` : ''})`);
      if (SCREENS) {
        for (const theme of ['day', 'night']) {
          await chooseOnSettings(p, 'theme', theme);
          await p.waitForSelector('[data-list="refused"] tbody tr');
          await screenshot(p, `refused-1280-${language}-${theme}`, '[data-list="refused"]');
        }
        await chooseOnSettings(p, 'theme', 'day');
      }
    }
    await narrow.context.close();
  }

  // ── 4: one drawing at a time ────────────────────────────────────────────
  {
    const d = await open();
    const p = d.page;
    for (const language of ['en', 'es']) {
      const w = WORDS[language];
      await chooseOnSettings(p, 'language', language);
      await go(p, 'drawings');
      await p.waitForSelector('.drawings-list li');
      const lines = await p.$$eval('.drawings-list li', (lis) => lis.map((li) => ({ key: li.dataset.key, name: li.querySelector('.drawing-name').textContent, lane: li.querySelector('.drawing-name bdi')?.textContent ?? null })));
      // The whole set, as before: its PDF and its Print.
      const wholePdf = await download(p, '[data-list="drawings"] [data-action="download-pdf"]', 'set');
      const set = wholePdf ? readBack([wholePdf.path])[wholePdf.path] : null;
      const printedBefore = await p.evaluate(() => window.__printed);
      await p.click('[data-list="drawings"] [data-action="print"]');
      await settles(p, (k) => window.__printed === k + 1, printedBefore);
      const wholePrint = await p.$$eval('.drawings-print svg.drawing-sheet', (svgs) => svgs.map((s) => s.innerHTML));
      check(set?.pages.length === lines.length && wholePrint.length === lines.length, `4 the whole set (${language}): Download PDF and Print each hold all ${lines.length} sheets, as before (PDF ${set?.pages.length}, print ${wholePrint.length})`);
      const doc = w['drawings.doc'];
      const names = [];
      for (const [i, line] of lines.entries()) {
        if (language === 'es' && i > 1 && i < lines.length - 1) continue;
        const li = `.drawings-list li[data-key="${line.key}"]`;
        if (await p.$eval(li, (x) => getComputedStyle(x).display === 'none')) {
          await p.click('[data-pager="drawings"] [data-action="next"]');
        }
        // View: the one sheet, over the page, drawn as it prints; Close.
        await p.click(`${li} [data-action="sheet-view"]`);
        const viewed = await settles(p, () => document.querySelectorAll('.sheet-view svg').length === 1);
        const view = await p.evaluate(() => ({ sheets: document.querySelectorAll('.sheet-view svg').length, inner: document.querySelector('.sheet-view svg')?.innerHTML ?? '', focus: document.activeElement?.dataset.action }));
        if (i % 2) await p.keyboard.press('Escape');
        else await p.click('[data-action="close-sheet"]');
        const closed = await settles(p, () => !document.querySelector('.sheet-view'));
        check(viewed && view.sheets === 1 && view.inner === wholePrint[i] && closed && view.focus === 'close-sheet',
          `4 ${line.name} (${language}): View shows that sheet only, drawn as it is in the whole set, and ${i % 2 ? 'Escape' : w['drawings.sheet.close']} closes it (${view.sheets} sheets${view.inner === wholePrint[i] ? '' : ', not the same sheet'})`);
        // Download PDF: one page, that sheet's, named for it.
        const one = await download(p, `${li} [data-action="sheet-pdf"]`, `sheet-${i}`);
        const back = one ? readBack([one.path])[one.path] : null;
        const sameText = back?.pages.length === 1 && set && plain(back.pages[0].text) === plain(set.pages[i].text);
        const named = one && one.name.startsWith(`${doc} - `) && (line.lane === null || one.name.includes(line.lane)) && one.name.includes(plain(line.name.split(' · ')[0]).replace(/[:]/g, '').slice(0, 12));
        names.push(one?.name);
        check(sameText && named, `4 ${line.name} (${language}): Download PDF holds that sheet only, the same as in the whole set, named for it ("${one?.name}", ${back?.pages.length} pages)`);
        // Print: that sheet only.
        const before = await p.evaluate(() => window.__printed);
        await p.click(`${li} [data-action="sheet-print"]`);
        await settles(p, (k) => window.__printed === k + 1, before);
        await p.emulateMedia({ media: 'print' });
        const printed = await p.$$eval('.drawings-print svg.drawing-sheet', (svgs) => svgs.map((s) => s.innerHTML));
        await p.emulateMedia({ media: 'screen' });
        check(printed.length === 1 && printed[0] === wholePrint[i], `4 ${line.name} (${language}): Print holds that sheet only, the same as in the whole set (${printed.length} printed)`);
      }
      check(new Set(names).size === names.length, `4 (${language}): each sheet's file has a name of its own (${names.length})`);
      if (SCREENS) {
        for (const theme of ['day', 'night']) {
          await chooseOnSettings(p, 'theme', theme);
          await p.click('[data-pager="drawings"] [data-action="previous"]', { timeout: 1000 }).catch(() => {});
          await screenshot(p, `drawings-${language}-${theme}`);
          await p.click(`.drawings-list li[data-key="${lines[0].key}"] [data-action="sheet-view"]`);
          await p.waitForSelector('.sheet-view svg');
          await screenshot(p, `drawing-view-${language}-${theme}`);
          await p.click('[data-action="close-sheet"]');
        }
        await chooseOnSettings(p, 'theme', 'day');
      }
    }
    await chooseOnSettings(p, 'language', 'en');
    await d.context.close();
  }

  // ── 6: who gets which alert, twenty rows a page ─────────────────────────
  {
    const al = await open();
    const p = al.page;
    const people = A.people[HARBOR.id];
    const ALERT_KEYS = ['lane_problem', 'lane_not_answering', 'garage_not_answering', 'card_payments_stopped'];
    for (let i = people.length; i < 25; i += 1) {
      people.push({ id: `pb900000-0000-4000-8000-${String(i).padStart(12, '0')}`, name: `Teller${String(i).padStart(3, '0')}`, phone: i % 2 ? '+15550100099' : null, email: `teller${i}@example.com`, language: 'en', confirmed: false, by_text: i % 2 ? [ALERT_KEYS[i % 3]] : [], by_email: [ALERT_KEYS[i % 4]] });
    }
    await go(p, 'alerts');
    await settles(p, () => document.querySelectorAll('[data-list="alert-choices"] tbody tr').length > 0);
    const alerts = await p.evaluate(async (g) => (await (await fetch(`/api/v1/garages/${g}/alerts`)).json()).alerts.map((a) => a.key), HARBOR.id);
    const pairs = alerts.flatMap((a) => people.map((q) => `${a}|${q.id}`));
    const rowsOn = () => p.evaluate(() => [...document.querySelectorAll('[data-list="alert-choices"] tbody')].filter((b) => getComputedStyle(b).display !== 'none').flatMap((b) => [...b.rows]).map((r) => `${r.dataset.alert}|${r.dataset.person}`));
    const seen = [];
    const big = [];
    let named = true;
    for (let i = 0; i < 20; i += 1) {
      const rows = await rowsOn();
      if (rows.length > PER_PAGE) big.push(`page ${i + 1}: ${rows.length} rows`);
      seen.push(...rows);
      // Each alert on the page is named once, at the first of its rows there.
      named &&= await p.evaluate(() => [...document.querySelectorAll('[data-list="alert-choices"] tbody.no-print, [data-list="alert-choices"] tbody:only-of-type')].filter((b) => getComputedStyle(b).display !== 'none').every((b) => {
        const names = [...b.querySelectorAll('.alert-cell')];
        const alertsHere = new Set([...b.rows].map((r) => r.dataset.alert));
        return names.length === alertsHere.size;
      }));
      if (i === 0) await screenshot(p, 'alert-grid');
      const next = '[data-pager="alert-choices"] [data-action="next"]';
      if (!(await p.$(next)) || (await p.$eval(next, (b) => b.disabled))) break;
      await p.click(next);
    }
    const twice = seen.filter((x, i) => seen.indexOf(x) !== i).length;
    const missed = pairs.filter((x) => !seen.includes(x)).length;
    check(big.length === 0 && twice === 0 && missed === 0 && seen.length === pairs.length && named,
      `6 who gets which alert: at most ${PER_PAGE} rows a page, all ${pairs.length} rows (${alerts.length} alerts x ${people.length} people) once over the pages, each alert named on each page it is on (${seen.length} seen${twice ? `, ${twice} twice` : ''}${missed ? `, ${missed} missed` : ''}${big.length ? `; ${big.join('; ')}` : ''})`);
    await p.emulateMedia({ media: 'print' });
    const onPaper = await rowsOn();
    await p.emulateMedia({ media: 'screen' });
    check(sameSet(onPaper, pairs), `6 who gets which alert, printed: all ${pairs.length} rows (${onPaper.length})`);
    // Its downloads: every person, with the alerts each gets.
    const excel = await download(p, '[data-list="alerts"] [data-action="download-excel"]', 'alerts');
    const pdf = await download(p, '[data-list="alerts"] [data-action="download-pdf"]', 'alerts');
    const read = readBack([excel.path, pdf.path]);
    const names = ['alerts.person', 'alerts.phone', 'alerts.email', 'alerts.language', 'alerts.confirmed', 'file.byText', 'file.byEmail'].map((k) => WORDS.en[k]);
    const { rows } = tableOf(read[excel.path].sheets[0], names);
    const alertName = (key) => WORDS.en[`alerts.alert.${key}`];
    const wrongPeople = people.filter((q) => {
      const row = rows.find((r) => r[0]?.value === q.name);
      if (!row) return true;
      const gets = (cell, keys) => keys.every((k) => String(cell?.value ?? '').includes(alertName(k)));
      return !gets(row[5], q.by_text) || !gets(row[6], q.by_email);
    });
    const pdfText = plain(read[pdf.path].pages.map((x) => x.text).join(' '));
    const pdfMissed = people.filter((q) => !pdfText.includes(q.name));
    check(rows.length === people.length && wrongPeople.length === 0 && pdfMissed.length === 0,
      `6 Alerts' downloads: Excel holds all ${people.length} people, each with the alerts they get by text and by email; the PDF names all ${people.length} (${rows.length} rows${wrongPeople.length ? `; wrong for ${wrongPeople.map((q) => q.name).slice(0, 3).join(', ')}` : ''}${pdfMissed.length ? `; PDF misses ${pdfMissed.length}` : ''})`);
    await al.context.close();
  }

  // ── 7: Getting paid's Cancel, at the right of its form ──────────────────
  {
    const g = await open();
    const p = g.page;
    const RIVERSIDE = A.garages[1];
    stub.setDrivers(RIVERSIDE.id, true);
    await p.click('[data-action="change-garage"]').catch(() => go(p, 'home'));
    await go(p, 'home');
    await p.click(`.garage-choice[data-garage="${RIVERSIDE.id}"]`);
    const edges = async (form) => p.evaluate((f) => {
      const box = document.querySelector(f);
      const cancel = box?.querySelector('[data-action="close-panel"]');
      if (!box || !cancel) return null;
      const panel = box.closest('.panel') ?? box;
      const style = getComputedStyle(panel);
      return { right: panel.getBoundingClientRect().right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth), cancel: cancel.getBoundingClientRect().right, title: box.querySelector('.section-title').getBoundingClientRect().right };
    }, form);
    for (const language of ['en', 'es']) {
      await chooseOnSettings(p, 'language', language);
      await go(p, 'paid');
      await p.click('[data-action="open-set-up-paid"]');
      const paid = await edges('[data-form="set-up-paid"]');
      if (language === 'en') await screenshot(p, 'getting-paid-form');
      await go(p, 'taxes');
      await p.click('[data-action="change-taxes"]');
      const taxes = await edges('[data-form="change-taxes"]');
      const at = (e) => (e ? Math.abs(e.right - e.cancel) : Infinity);
      check(paid && taxes && at(paid) <= 2 && at(taxes) <= 2 && paid.cancel - paid.title > 40,
        `7 Getting paid (${language}): Cancel at the right of its form, as Change taxes' is (${paid ? Math.round(at(paid)) : 'no form'} px from the right; Change taxes ${taxes ? Math.round(at(taxes)) : 'no form'} px)`);
    }
    await g.context.close();
  }
} catch (error) {
  failures.push(`the walk stopped: ${error.message.split('\n')[0]}`);
  console.error(error);
} finally {
  await browser.close();
  await server.close();
  await stub.close();
  rmSync(DIR, { recursive: true, force: true });
}

const outside = requests.filter((r) => new URL(r.url).origin !== origin);
check(outside.length === 0, `every request went to the site's own origin (${requests.length - outside.length} of ${requests.length})`);
if (failures.length) {
  console.error(`\n${failures.length} failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`\nchoices — ${passed} checks passed: the change log sorted and chosen from on every page and in every file and print, one drawing at a time, refused attempts one line a row, who gets which alert twenty rows a page, Getting paid's Cancel; both languages.${SCREENS ? ` Screenshots in ${SCREENS}.` : ''}`);
