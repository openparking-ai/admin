#!/usr/bin/env node
/* global document, window, URL, getComputedStyle */
// Download Excel, Download PDF and Print, in a real browser, signed in
// against the stand-in platform (test/stub-platform.js), with the page policy
// in index.html enforced throughout.
//
// The browser is in TOKYO time; the garage is in New York. Both lists are
// downloaded in both formats, in English and Spanish, by day and by night,
// and every file is read back with Python openpyxl and pypdf
// (scripts/files/read-files.py). It requires:
//   1  the file is the list: every Excel row equals the row on screen, cell by
//      cell, as many rows as the screen shows; in the PDF every plate, lane
//      connection and person's name, number and address (Alerts, U4b) is on a
//      page exactly once;
//   2  garage time: time cells are the garage's clock, one stay on each side
//      of a clock change; the zone sentence names the garage's zone; the
//      "Downloaded" time is the click's, in garage time;
//   3  text stays text, and the workbook holds 0 formulas;
//   4  Spanish files in Spanish, and the garage's name back exactly;
//   5  a long list (250 stays) runs to several pages with every plate once,
//      and a list of 2,000 is made too;
//   6  fresh read: the list changed after the page loaded: the file, the
//      screen and the printed page hold the new list and the click's time;
//   7  a read that fails shows its plain sentence and makes no file; a 401
//      saves no file and shows the signed-out screen;
//   8  0 page policy violations, every request to the page's own origin,
//      and the page policy exactly as it was;
//   9  neither maker is asked for until its button is clicked;
//  10  the file name holds no character a computer refuses;
//  12  every column's description, in both files;
//   and: one click makes one file, the button says what it is doing and
//   cannot be pressed again meanwhile, and each file's address is let go;
//  F1-F3 and odd text (U3 fix round, scripts/files/odd-text-browser.js): the
//   gate's cases and the whole class of odd stored text, through the screen,
//   Print, both files, the file names and the notice, both languages, both
//   lists, each file within 5 s of the click; nothing in a name turns the
//   words around it on screen, and the notice names no invisible character.
//   U3 fix round 2: the cases come from Unicode's own tables, both files carry
//   the same text, the notice says when hidden characters were left out of
//   either file, and every category gets a line of its own.
//
//   node scripts/check-downloads.js               (run `npm run build` first)
//   node scripts/check-downloads.js --keep DIR    ...and keep the files
//   node scripts/check-downloads.js --matrix FILE ...and write every odd-text cell to FILE (JSON)
//   node scripts/check-downloads.js --without-odd-text
//        ...everything but the odd-text walk. Only scripts/fail-controls.js passes
//        it, and only for a control whose break is not in how text is shown or
//        written; CI's own run of this check never does.

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { DICTIONARIES } from '../src/i18n/index.js';
import { A_TEXT, startStub } from '../test/stub-platform.js';
import { GARAGE, LONG_NAME, TEXT_CASES, alertsData, changesData, insideData, lanesData, manyStays, refusedData } from '../test/files-fixtures.js';
import { PYTHON, count, garageClock, plain, readBack, tableOf, zoneSaid } from './files/read-back.js';
import { oddTextWalk } from './files/odd-text-browser.js';
import { PAGES, hashFor } from '../src/pages.js';
import { COLUMNS } from '../src/files/model.js';
import { CASES, CASE_COUNTS, UNICODE } from './files/odd-text.js';
import { chooseOnSettings } from './on-settings.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const keepAt = process.argv.indexOf('--keep');
const KEEP = keepAt > 0 ? process.argv[keepAt + 1] : null;
const WITHOUT_ODD_TEXT = process.argv.includes('--without-odd-text');
const BROWSER_ZONE = 'Asia/Tokyo';
const WORDS = DICTIONARIES;
// The page policy, as index.html has carried it since U2b. Not to be loosened.
export const POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'";

const failures = [];
let passed = 0;
const check = (ok, what) => {
  if (ok) passed += 1;
  else failures.push(what);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};

// ── The stand-in's lists for owner A's first garage ─────────────────────────
const stub = await startStub();
const A = stub.data.a;
const HARBOR = A.garages[0];
HARBOR.name = GARAGE.name;
HARBOR.timezone = GARAGE.timezone;
A.open[HARBOR.id] = insideData().sessions;
A.lanes[HARBOR.id] = lanesData(new Date());
// The change log (U4): the fixture's lines, on this garage, oldest first as the stand-in keeps them.
// The changes made and the refused attempts, oldest first, as the stand-in keeps one log; it reads them apart.
stub.setChanges(A, [...changesData(new Date()).changes, ...refusedData(new Date()).refused]
  .map((l) => ({ ...l, garage_id: l.garage_id === GARAGE.id ? HARBOR.id : l.garage_id }))
  .sort((x, y) => Date.parse(x.at) - Date.parse(y.at)));
// Alerts (U4b): the fixture's people, on this garage.
A.people[HARBOR.id] = structuredClone(alertsData().contacts);
const TZ = HARBOR.timezone;

const server = await preview({
  root: ROOT,
  logLevel: 'silent',
  preview: { port: 4327, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } },
});
const base = server.resolvedUrls.local[0];
const origin = new URL(base).origin;
stub.allowOrigin(origin);
const browser = await chromium.launch();
const DIR = mkdtempSync(join(tmpdir(), 'admin-downloads-'));
const requests = [];
const policyBroken = [];
const downloads = [];
let saved = 0;

const settles = (page, fn, arg, timeout = 5000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const idle = (page) => settles(page, () => !document.querySelector('.list-actions[aria-busy="true"]'), undefined, 30000);

/** "Mar 10, 3:40 PM", or "3:40 PM" on the day of `at`, in the garage's zone: as the screens say a time. */
const shortTime = (iso, language, at) => {
  const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
  const today = day(iso) === day(at);
  return new Intl.DateTimeFormat(language === 'es' ? 'es-US' : 'en-US', {
    timeZone: TZ,
    ...(today ? {} : { month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
};
const fullTime = (at, language) =>
  new Intl.DateTimeFormat(language === 'es' ? 'es-US' : 'en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(at));
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, k) => String(values[k]));

/** How a lane computer was doing at `at`, worked out here from the stand-in's list. */
function stateAt(device, language, at) {
  const w = WORDS[language];
  if (device.revoked_at) return fill(w['device.off'], { time: shortTime(device.revoked_at, language, at) });
  if (!device.last_seen_at) return w['lane.never'];
  const minutes = Math.floor((at - Date.parse(device.last_seen_at)) / 60000);
  if (minutes >= stub.quietMinutes()) return fill(w['lane.quiet'], { time: shortTime(device.last_seen_at, language, at) });
  return fill(w['file.working'], { time: shortTime(device.last_seen_at, language, at) });
}

async function open({ clock = false } = {}) {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: BROWSER_ZONE, acceptDownloads: true, viewport: { width: 1360, height: 860 } });
  context.on('request', (r) => requests.push(r.url()));
  context.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) policyBroken.push(m.text());
  });
  await context.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
    // Every file address made, and every one let go; and every print asked for.
    window.__made = [];
    window.__released = [];
    const make = URL.createObjectURL.bind(URL);
    const release = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const address = make(blob);
      window.__made.push(address);
      return address;
    };
    URL.revokeObjectURL = (address) => {
      window.__released.push(address);
      release(address);
    };
    window.__printed = 0;
    window.print = () => {
      window.__printed += 1;
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    if (/Content Security Policy|Refused to/i.test(e.message)) policyBroken.push(e.message);
  });
  page.on('download', () => {
    saved += 1;
  });
  if (clock) await page.clock.install();
  await page.goto(base);
  await page.waitForSelector('input[name="email"]');
  return { context, page };
}

async function signInAndChoose(page) {
  await page.fill('input[name="email"]', A.email);
  await page.fill('input[name="password"]', A.password);
  await page.click('button[type="submit"]');
  await page.waitForSelector(`.garage-choice[data-garage="${HARBOR.id}"]`);
  await page.click(`.garage-choice[data-garage="${HARBOR.id}"]`);
  await page.waitForSelector('.page-title');
}

async function goTo(page, list) {
  // The refused attempts are a list of the change log's page.
  const id = list === 'refused' ? 'changes' : list;
  await page.click(`.nav-item[href="${hashFor(PAGES.find((p) => p.id === id))}"]`);
  await page.waitForSelector(`[data-list="${list}"] [data-action="download-excel"]`);
}

// Chromium drops, without a word, a download that arrives when ten have in
// about a second (measured: the 11th of 14 back-to-back clicks; none with
// 300 ms between). A person cannot click that fast; the check waits as one would.
const PACE_MS = 400;

/** Click Download and save the file the browser is given. */
async function download(page, what, tag, list = null) {
  await page.waitForTimeout(PACE_MS);
  const from = new Date();
  const button = `${list ? `[data-list="${list}"] ` : ''}[data-action="download-${what}"]`;
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click(button)]).catch(async (error) => {
    const said = await page.evaluate(() => `${document.querySelector('.list-actions')?.innerText ?? ''} (file addresses made: ${window.__made.length})`).catch(() => '');
    throw new Error(`no file from Download ${what} (${tag}); the buttons say "${plain(said)}": ${error.message.split('\n')[0]}`);
  });
  const path = join(DIR, `${downloads.length + 1}-${tag}.${what === 'excel' ? 'xlsx' : 'pdf'}`);
  await file.saveAs(path);
  await idle(page);
  const to = new Date();
  const d = { what, tag, path, name: file.suggestedFilename(), from, to };
  downloads.push(d);
  return d;
}

const screenInside = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-list="inside"] tbody tr')].map((tr) => {
      const td = [...tr.cells].map((c) => c.textContent);
      return { plate: td[0], ticket: td[1], time: tr.cells[2].dataset.time, lane: td[3], confirmed: td[4] };
    }),
  );
const screenLanes = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-list="lanes"] tbody tr')].map((tr) => ({
      lane: tr.cells[0].textContent,
      direction: tr.cells[1].textContent,
      devices: [...tr.cells[2].querySelectorAll('[data-device]')].map((li) => ({ id: li.dataset.device, name: li.querySelector('.device-name').textContent })),
      none: tr.cells[2].querySelector('[data-device]') ? null : tr.cells[2].textContent,
      reader: tr.cells[3].textContent,
      open: tr.cells[4].textContent,
    })),
  );

const screenChanges = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-list="changes"] tbody tr')].map((tr) => {
      const td = [...tr.cells].map((c) => c.textContent);
      return { time: tr.cells[0].dataset.time, who: td[1], what: td[2], before: td[3], after: td[4] };
    }),
  );

const screenRefused = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-list="refused"] tbody tr')].map((tr) => {
      const td = [...tr.cells].map((c) => c.textContent);
      return { time: tr.cells[0].dataset.time, who: td[1], what: td[2], why: td[3], times: td[4], last: tr.cells[5].dataset.time };
    }),
  );

/**
 * Alerts, as the screen shows them: each person's row, and the alerts they
 * get each way read from the ticks, named as the alert cells name them.
 */
const screenAlerts = (page, language) =>
  page.evaluate((lang) => {
    const names = {};
    for (const tr of document.querySelectorAll('[data-list="alert-choices"] tr[data-alert]')) {
      const cell = tr.querySelector('.alert-name');
      if (cell) names[tr.dataset.alert] = cell.textContent;
    }
    const order = Object.keys(names);
    const list = new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' });
    const gets = (id, way) => {
      const on = order.filter((key) => document.querySelector(`[data-list="alert-choices"] tr[data-alert="${key}"][data-person="${id}"] [data-tick="${way}"]`)?.getAttribute('aria-checked') === 'true');
      return on.length ? list.format(on.map((key) => names[key])) : '–';
    };
    return [...document.querySelectorAll('[data-list="alerts"] tbody tr')].map((tr) => {
      const td = [...tr.cells].map((c) => c.textContent);
      return { name: td[0], phone: td[1], email: td[2], language: td[3], confirmed: td[4], byText: gets(tr.dataset.person, 'text'), byEmail: gets(tr.dataset.person, 'email') };
    });
  }, language);

/** A list's title: its page's, or for the refused attempts, their own section's. */
const titleOf = (w, list) => w[list === 'refused' ? 'refused.title' : `page.${list}.title`];

const chunks = () => ({
  excel: requests.some((u) => /\/assets\/excelFile-[\w-]+\.js$/.test(u)),
  pdf: requests.some((u) => /\/assets\/pdfFile-[\w-]+\.js$/.test(u)),
});
const sawNoFile = async (page, before, ms = 2500) => {
  await page.waitForTimeout(ms);
  return saved === before;
};

const made = []; // { list, language, look, excel, pdf, screen }
let fresh = null;
let printed = null;
let longFiles = null;
let hugeFile = null;
let nasty = null;
const oddCells = [];

try {
  const { context, page } = await open();
  await signInAndChoose(page);

  // ── 9: nothing of either maker before a click ─────────────────────────────
  await goTo(page, 'inside');
  const before = chunks();
  check(!before.excel && !before.pdf, `9 loaded only when asked: before any click, neither maker was asked for (${requests.length} requests so far)`);

  // ── 1-4, 12: both lists, both formats, both languages, day and night ──────
  for (const language of ['en', 'es']) {
    await chooseOnSettings(page, 'language', language);
    for (const look of ['day', 'night']) {
      await chooseOnSettings(page, 'theme', look);
      for (const list of ['inside', 'lanes', 'changes', 'refused', 'alerts']) {
        await goTo(page, list);
        const tag = `${list}-${language}-${look}`;
        const excel = await download(page, 'excel', tag, list);
        if (made.length === 0) {
          const after = chunks();
          check(after.excel && !after.pdf, `9 loaded only when asked: Download Excel asked for its maker (${after.excel}), and not the PDF one (${after.pdf})`);
        }
        const pdf = await download(page, 'pdf', tag, list);
        const screen = await { inside: screenInside, lanes: screenLanes, changes: screenChanges, refused: screenRefused, alerts: screenAlerts }[list](page, language);
        made.push({ list, language, look, excel, pdf, screen });
      }
    }
  }
  await chooseOnSettings(page, 'theme', 'day');
  await chooseOnSettings(page, 'language', 'en');

  // ── 6: a fresh read, for a file and for Print ─────────────────────────────
  await goTo(page, 'inside');
  A.open[HARBOR.id].push({ ...insideData().sessions[0], id: 'ff100000-0000-4000-8000-00000000f001', plate: 'NEW0001', plate_region: null });
  check(!(await page.evaluate(() => document.body.innerText.includes('NEW0001'))), '6 fresh read: the list changed after the page was drawn (NEW0001 not on screen yet)');
  fresh = await download(page, 'excel', 'fresh');
  fresh.screen = await screenInside(page);
  A.open[HARBOR.id].push({ ...insideData().sessions[0], id: 'ff100000-0000-4000-8000-00000000f002', plate: 'NEW0002', plate_region: null });
  const printFrom = new Date();
  const printsBefore = await page.evaluate(() => window.__printed);
  await page.click('[data-action="print"]');
  const didPrint = await settles(page, (n) => window.__printed > n, printsBefore);
  await page.emulateMedia({ media: 'print' });
  printed = {
    from: printFrom,
    to: new Date(),
    didPrint,
    text: await page.evaluate(() => document.querySelector('.print-head')?.innerText ?? ''),
    list: await page.evaluate(() => (getComputedStyle(document.querySelector('[data-list="inside"] table')).display !== 'none' ? document.querySelector('[data-list="inside"] table').innerText : '')),
  };
  await page.emulateMedia({ media: 'screen' });
  await idle(page);

  // ── One click, one file; the button says so; it cannot be pressed twice ───
  const savedBefore = saved;
  stub.slowNext(1500);
  const waiting = page.waitForEvent('download', { timeout: 30000 });
  await page.click('[data-action="download-pdf"]');
  const busyWords = await page.textContent('[data-action="download-pdf"]');
  const disabled = await page.evaluate(() => ['excel', 'pdf', 'print'].map((w) => document.querySelector(`[data-action="${w === 'print' ? 'print' : `download-${w}`}"]`).disabled));
  await page.click('[data-action="download-pdf"]', { force: true }).catch(() => {});
  await page.click('[data-action="download-excel"]', { force: true }).catch(() => {});
  await (await waiting).path();
  await idle(page);
  await page.waitForTimeout(2500);
  check(busyWords === WORDS.en['download.reading'], `while busy, the button says "${busyWords}" (want "${WORDS.en['download.reading']}")`);
  check(disabled.every(Boolean), `while busy, none of the three can be pressed (${disabled.join(', ')})`);
  check(saved - savedBefore === 1, `three clicks while one file was being made: ${saved - savedBefore} file saved`);

  // ── 7: a read that fails, and a 401 ───────────────────────────────────────
  for (const [kind, words, what] of [
    ['serverError', 'problem.unexpected', 'pdf'],
    ['gateway', 'problem.unreachable', 'excel'],
    ['nonJson', 'problem.unexpected', 'pdf'],
  ]) {
    const n = saved;
    stub.failNext(kind);
    await page.click(`[data-action="download-${what}"]`);
    const said = await settles(page, (t) => document.querySelector('.list-actions [role="alert"]')?.textContent === t, WORDS.en[words]);
    const shown = await page.evaluate(() => document.querySelector('.list-actions')?.innerText ?? '');
    const raw = /[{}]|\b[1-5]\d\d\b|[a-z]+_[a-z_]+|JSON|Unexpected|TypeError|undefined|null/.test(shown);
    check(said && !raw && (await sawNoFile(page, n)), `7 a read that fails (${kind}): "${WORDS.en[words]}", nothing raw, no file`);
  }
  const n401 = saved;
  stub.failNext('ended');
  await page.click('[data-action="download-excel"]');
  const signedOut = await settles(page, () => Boolean(document.querySelector('input[name="email"]')));
  const noFile = await sawNoFile(page, n401);
  const left = await page.evaluate(() => document.body.innerText);
  const ownerLeft = [...A_TEXT, GARAGE.name, 'HRB4410', 'NEW0001'].filter((s) => left.includes(s));
  check(noFile, `7 the read answers 401: no file saved (${saved - n401} saved)`);
  check(signedOut && ownerLeft.length === 0, `7 the read answers 401: the signed-out screen, nothing of the owner left on it${ownerLeft.length ? `; left: ${ownerLeft.join(', ')}` : ''}`);
  const released = await page.evaluate(() => window.__made.filter((a) => !window.__released.includes(a)));
  const madeCount = await page.evaluate(() => window.__made.length);
  check(madeCount > 0 && released.length === 0, `each file's address is let go after the save: ${madeCount - released.length} of ${madeCount}`);
  await context.close();

  // ── 5, 10: a long list, a huge one, and a garage name a computer refuses ──
  const longSessions = manyStays(250).sessions;
  longSessions[3].entry_lane = LONG_NAME;
  A.open[HARBOR.id] = longSessions;
  HARBOR.name = 'A/B:C*D?"E<F>|G\u0007H';
  const second = await open();
  await signInAndChoose(second.page);
  await goTo(second.page, 'inside');
  longFiles = { excel: await download(second.page, 'excel', 'long'), pdf: await download(second.page, 'pdf', 'long') };
  nasty = [longFiles.excel.name, longFiles.pdf.name];
  A.open[HARBOR.id] = manyStays(2000).sessions;
  hugeFile = { excel: await download(second.page, 'excel', 'huge'), pdf: await download(second.page, 'pdf', 'huge') };
  const violations = await second.page.evaluate(() => window.__violations);
  policyBroken.push(...violations);
  await second.context.close();

  // ── Printed from the browser's own menu: no read, so the page says how old the list is
  A.open[HARBOR.id] = insideData().sessions;
  HARBOR.name = GARAGE.name;
  const third = await open({ clock: true });
  await signInAndChoose(third.page);
  await goTo(third.page, 'inside');
  const readAt = await third.page.evaluate(() => Date.now());
  const head = async () => {
    await third.page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await third.page.emulateMedia({ media: 'print' });
    const text = await third.page.evaluate(() => document.querySelector('.print-head').innerText);
    await third.page.emulateMedia({ media: 'screen' });
    return plain(text);
  };
  const asOf = WORDS.en['print.asOf'].split('{time}')[0];
  const freshHead = await head();
  await third.page.clock.fastForward(61_000);
  const oldHead = await head();
  const says = [readAt - 1000, readAt + 1000].map((t) => plain(fill(WORDS.en['print.asOf'], { time: fullTime(t, 'en') })));
  check(!freshHead.includes(asOf), `printed from the browser's menu just after the read: no "as of" line ("${freshHead}")`);
  check(says.some((x) => oldHead.includes(x)), `printed from the browser's menu a minute after the read: "${says[0]}" (the print head says "${oldHead}")`);
  await third.context.close();

  // ── Odd stored text: the gate's cases, the class, F1 on screen ────────────
  const oddDir = join(DIR, 'odd');
  mkdirSync(oddDir);
  if (WITHOUT_ODD_TEXT) console.log('  --  odd text: not walked in this run (--without-odd-text)');
  else await oddTextWalk({ browser, base, A, dir: oddDir, check, policyBroken, cell: (text, output, id, ok, detail) => oddCells.push({ text, output, case: id, ok, detail }) });
} catch (error) {
  failures.push(`the walk stopped: ${error.message.split('\n')[0]}`);
  console.error(error);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  await stub.close();
}

// ── Reading every file back ─────────────────────────────────────────────────
try {
  const back = downloads.length ? readBack(downloads.map((d) => d.path)) : {};
  const at = (d) => [d.from, d.to];

  for (const m of made) {
    const w = WORDS[m.language];
    const where = `${m.list} (${m.language}, ${m.look})`;
    const names = {
      inside: ['inside.plate', 'inside.ticket', 'inside.letIn', 'inside.lane', 'inside.confirmed'],
      lanes: ['lanes.lane', 'lanes.direction', 'file.computer', 'file.state', 'file.lastHeard', 'lanes.reader', 'lanes.open'],
      changes: ['changes.when', 'changes.who', 'changes.what', 'changes.before', 'changes.after'],
      refused: ['refused.when', 'refused.who', 'refused.what', 'refused.why', 'refused.times', 'refused.last'],
      alerts: ['alerts.person', 'alerts.phone', 'alerts.email', 'alerts.language', 'alerts.confirmed', 'file.byText', 'file.byEmail'],
    }[m.list].map((k) => w[k]);
    const book = back[m.excel.path];
    const [sheet, meanings] = book.sheets;
    const { rows, lines, heading } = tableOf(sheet, names);
    const zone = fill(w['file.zone'], { zone: zoneSaid(TZ, m.language, m.excel.from) });

    // 1: the screen's rows, cell by cell.
    let expected;
    if (m.list === 'inside') {
      expected = m.screen.map((s) => [s.plate, s.ticket, garageClock(s.time, TZ), s.lane, s.confirmed]);
    } else if (m.list === 'changes') {
      expected = m.screen.map((s) => [garageClock(s.time, TZ), s.who, s.what, s.before, s.after]);
    } else if (m.list === 'refused') {
      expected = m.screen.map((s) => [garageClock(s.time, TZ), s.who, s.what, s.why, s.times, garageClock(s.last, TZ)]);
    } else if (m.list === 'alerts') {
      expected = m.screen.map((s) => [s.name, s.phone, s.email, s.language, s.confirmed, s.byText, s.byEmail]);
    } else {
      const devices = Object.fromEntries(A.lanes[HARBOR.id].flatMap((l) => l.devices).map((d) => [d.id, d]));
      expected = m.screen.flatMap((l) =>
        l.none !== null
          ? [[l.lane, l.direction, l.none, '–', '–', l.reader, l.open]]
          : l.devices.map((d) => [l.lane, l.direction, d.name, [m.excel.from, m.excel.to].map((t) => stateAt(devices[d.id], m.language, t)), devices[d.id].last_seen_at ? garageClock(devices[d.id].last_seen_at, TZ) : '–', l.reader, l.open]),
      );
    }
    const wrong = [];
    expected.forEach((row, i) =>
      row.forEach((want, c) => {
        const got = rows[i]?.[c]?.value;
        const ok = Array.isArray(want) ? want.some((x) => plain(x) === plain(got)) : plain(want) === plain(got);
        if (!ok) wrong.push(`row ${i + 1} column ${c + 1}: "${got}", the screen "${Array.isArray(want) ? want.join('" or "') : want}"`);
      }),
    );
    check(heading !== -1 && rows.length === expected.length && wrong.length === 0, `1 the file is the list: ${where} Excel: ${rows.length} rows of the screen's ${expected.length}, ${expected.flat().length - wrong.length} of ${expected.flat().length} cells equal${wrong.length ? `; ${wrong.slice(0, 3).join('; ')}` : ''}`);
    const pdf = back[m.pdf.path].pages;
    const pdfText = plain(pdf.map((p) => p.text).join(' '));
    // The change log names a lane or computer again in what changed: there, each at least once.
    const items = {
      inside: () => m.screen.map((s) => s.plate).filter((p) => p !== '–'),
      lanes: () => m.screen.flatMap((l) => l.devices.map((d) => d.name)),
      changes: () => [],
      refused: () => [],
      alerts: () => m.screen.flatMap((s) => [s.name, s.phone, s.email]).filter((x) => x !== w['alerts.none']),
    }[m.list]();
    const notOnce = items.filter((p) => count(pdfText, p) !== 1 && !items.some((o) => o !== p && o.includes(p)));
    if (m.list === 'changes' || m.list === 'refused') {
      const whats = m.screen.map((s) => s.what);
      const absent = whats.filter((x) => !pdfText.includes(plain(x)));
      check(absent.length === 0, `1 the file is the list: ${where} PDF: ${whats.length - absent.length} of ${whats.length} lines' "what" on a page${absent.length ? `; not found: ${absent.join(' | ')}` : ''}`);
    }
    const offPage = pdf.flatMap((p) => p.off_page);
    check(notOnce.length === 0 && offPage.length === 0, `1 the file is the list: ${where} PDF: ${items.length - notOnce.length} of ${items.length} on a page exactly once; off the page: ${offPage.length}${notOnce.length ? `; not once: ${notOnce.join(', ')}` : ''}`);

    // 2
    if (m.list === 'inside') {
      const times = rows.slice(0, 2).map((r) => r[2]?.value);
      check(times[0] === '2026-03-08 01:30:00' && times[1] === '2026-03-08 03:30:00', `2 garage time: ${where}: the two stays either side of the clock change at ${times.join(' and ')} (garage clock 01:30 and 03:30, not Tokyo's)`);
    }
    const downloadedSays = at(m.excel).map((t) => fill(w['file.downloaded'], { time: fullTime(t, m.language) }));
    check(lines.some((l) => plain(l) === plain(zone)) && pdfText.includes(plain(zone)), `2 garage time: ${where}: "${zone}" in both files`);
    check(lines.some((l) => downloadedSays.some((s) => plain(s) === plain(l))), `2 garage time: ${where}: "${downloadedSays[0]}", the click's time in garage time (the file says "${lines[2]}")`);

    // 3
    const texts = rows.flat().filter((c) => c?.kind === 'text').map((c) => c.value);
    // The change log keeps no stored text in a cell of its own: for it, the formula count alone.
    // Alerts: a name and a phone number a spreadsheet would take for a number or a formula.
    const cases = { inside: Object.values(TEXT_CASES), lanes: [TEXT_CASES.at], changes: [], refused: [], alerts: [TEXT_CASES.ticket, TEXT_CASES.formula, '+15550100001', '+442079460000123'] }[m.list];
    const lost = cases.filter((v) => !texts.includes(v));
    check(lost.length === 0 && book.formulas === 0, `3 text stays text: ${where}: ${cases.length - lost.length} of ${cases.length} back as text; formulas: ${book.formulas}`);

    // 4
    check(sheet.rows[0]?.[0]?.value === GARAGE.name && pdfText.includes(GARAGE.name), `4 every character: ${where}: "${GARAGE.name}" back exactly from both files`);
    check(sheet.name === titleOf(w, m.list) && names.every((nm) => pdfText.includes(plain(nm))), `4 the file's language: ${where}: "${sheet.name}", headings ${names.join(' · ')}`);

    // 10
    const stamp = (t) => {
      const c = garageClock(t, TZ);
      return `${c.slice(0, 10)} ${c.slice(11, 13)}${c.slice(14, 16)}`;
    };
    const wantNames = at(m.excel).map((t) => `${titleOf(w, m.list)} - ${stamp(t)} - ${GARAGE.name.replace(/[?]/g, '')}.xlsx`);
    check(wantNames.includes(m.excel.name), `10 the file name: ${where}: "${m.excel.name}"`);

    // 12
    const described = names.filter((nm, i) => {
      const key = COLUMNS[m.list][i].key;
      return meanings?.rows.some((r) => r?.[0]?.value === nm && r?.[1]?.value === w[`${key}.about`]) && plain(pdf[0].text).includes(plain(`${nm}: ${w[`${key}.about`]}`));
    });
    check(described.length === names.length, `12 descriptions: ${where}: ${described.length} of ${names.length} columns described in both files`);
  }

  // 6
  if (fresh) {
    const { rows, lines } = tableOf(back[fresh.path].sheets[0], ['inside.plate', 'inside.ticket', 'inside.letIn', 'inside.lane', 'inside.confirmed'].map((k) => WORDS.en[k]));
    const says = at(fresh).map((t) => fill(WORDS.en['file.downloaded'], { time: fullTime(t, 'en') }));
    check(rows.some((r) => r[0]?.value === 'NEW0001') && fresh.screen.some((s) => s.plate === 'NEW0001'), '6 fresh read: the file and the screen hold the list as it was at the click (NEW0001)');
    check(lines.some((l) => says.some((s) => plain(s) === plain(l))), `6 fresh read: the file says the click's time, "${says[0]}" (it says "${lines[2]}")`);
  }
  if (printed) {
    const says = [printed.from, printed.to].map((t) => fill(WORDS.en['print.printed'], { time: fullTime(t, 'en') }));
    check(printed.didPrint && printed.list.includes('NEW0002'), `6 fresh read: Print read the list again first: the printed page holds NEW0002${printed.didPrint ? '' : ' (no print was asked for)'}`);
    check(says.some((s) => plain(printed.text).includes(plain(s))), `6 fresh read: the printed page says "${says[0]}" (it says "${plain(printed.text)}")`);
  }

  // 5
  if (longFiles) {
    const pages = back[longFiles.pdf.path].pages;
    const text = plain(pages.map((p) => p.text).join(' '));
    const plates = manyStays(250).sessions.map((s) => `${s.plate} · ${s.plate_region}`);
    const notOnce = plates.filter((p) => count(text, p) !== 1);
    const offPage = pages.flatMap((p) => p.off_page);
    check(pages.length >= 3 && notOnce.length === 0 && offPage.length === 0 && text.includes(LONG_NAME), `5 a long list: 250 stays, ${pages.length} pages, ${plates.length - notOnce.length} of ${plates.length} plates once, ${offPage.length} off the page, the 60-character lane whole`);
    const rows = tableOf(back[longFiles.excel.path].sheets[0], ['inside.plate', 'inside.ticket', 'inside.letIn', 'inside.lane', 'inside.confirmed'].map((k) => WORDS.en[k])).rows;
    check(rows.length === 250, `5 a long list: the Excel file holds ${rows.length} of 250 rows`);
  }
  if (hugeFile) {
    const rows = tableOf(back[hugeFile.excel.path].sheets[0], ['inside.plate', 'inside.ticket', 'inside.letIn', 'inside.lane', 'inside.confirmed'].map((k) => WORDS.en[k])).rows;
    const pages = back[hugeFile.pdf.path].pages.length;
    check(rows.length === 2000 && pages > 30, `5 a list of 2,000: the Excel file holds ${rows.length} rows and the PDF ${pages} pages, made under the page policy`);
  }

  // 10
  if (nasty) {
    const refused = /[/\\:*?"<>|\p{Cc}\p{Cf}]/u;
    const named = new RegExp(`^${WORDS.en['page.inside.title']} - \\d{4}-\\d\\d-\\d\\d \\d{4} - ABCDEFGH\\.(xlsx|pdf)$`);
    check(nasty.every((n) => !refused.test(n) && named.test(n)), `10 a garage named A/B:C*D?"E<F>|G + a control character + H: ${nasty.map((n) => `"${n}"`).join(' and ')}`);
  }

  // The class: one line per text x output, every case in it.
  const groups = new Map();
  for (const c of oddCells) {
    const key = `${c.text} × ${c.output}`;
    const g = groups.get(key) ?? { ok: 0, bad: [] };
    if (c.ok) g.ok += 1;
    else g.bad.push(c);
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    const cases = [...new Set(g.bad.map((c) => c.case))];
    check(g.bad.length === 0, `odd text: ${key}: ${g.ok} of ${g.ok + g.bad.length} cells${g.bad.length ? `; failing cases ${cases.slice(0, 8).join(', ')}${cases.length > 8 ? ` and ${cases.length - 8} more` : ''}: ${g.bad[0].detail}` : ''}`);
  }
  // Every category of the generated case set, on a line of its own.
  const groupOf = new Map(CASES.map((c) => [c.id, c.group]));
  const byGroup = new Map();
  for (const c of oddCells) {
    const group = groupOf.get(c.case) ?? c.case;
    const g = byGroup.get(group) ?? { ok: 0, bad: [] };
    if (c.ok) g.ok += 1;
    else g.bad.push(c);
    byGroup.set(group, g);
  }
  for (const [group, g] of byGroup) {
    const cases = [...new Set(g.bad.map((c) => c.case))];
    check(g.bad.length === 0, `odd text by category: ${group}${CASE_COUNTS[group] ? ` (${CASE_COUNTS[group]} cases, Unicode ${UNICODE})` : ''}: ${g.ok} of ${g.ok + g.bad.length} cells${g.bad.length ? `; failing cases ${cases.slice(0, 6).join(', ')}${cases.length > 6 ? ` and ${cases.length - 6} more` : ''}` : ''}`);
  }
  if (!WITHOUT_ODD_TEXT) check(oddCells.length > 0, `odd text: ${oddCells.length} cells judged in the browser`);
  const matrixAt = process.argv.indexOf('--matrix');
  if (matrixAt > 0) writeFileSync(process.argv[matrixAt + 1], JSON.stringify(oddCells.map((c) => ({ ...c, group: groupOf.get(c.case) ?? c.case })), null, 1));

  if (KEEP) {
    mkdirSync(KEEP, { recursive: true });
    for (const d of downloads) copyFileSync(d.path, join(KEEP, `${d.tag} - ${d.name.replace(/[/\\]/g, '')}`));
    mkdirSync(join(KEEP, 'odd'), { recursive: true });
    for (const f of readdirSync(join(DIR, 'odd'))) copyFileSync(join(DIR, 'odd', f), join(KEEP, 'odd', f));
  }
} catch (error) {
  failures.push(`reading the files back stopped: ${error.message.split('\n')[0]}`);
  console.error(error);
} finally {
  rmSync(DIR, { recursive: true, force: true });
}

// ── 8: the page policy held, and every request stayed home ─────────────────
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const built = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');
const policyOf = (text) => /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(text)?.[1];
check(policyOf(html) === POLICY && policyOf(built) === POLICY, '8 the page policy is exactly as it was, in index.html and in the built page');
check(policyBroken.length === 0, `8 the page policy was never broken (${policyBroken.length} violations)`);
for (const v of [...new Set(policyBroken)]) console.error(`  policy violation: ${v.slice(0, 200)}`);
const outside = requests.filter((u) => !u.startsWith('blob:') && new URL(u).origin !== origin);
check(requests.length > 0 && outside.length === 0, `8 every request went to the page's own origin (${requests.length - outside.length} of ${requests.length})`);
for (const u of [...new Set(outside)]) console.error(`  went outside: ${u}`);
check(downloads.length >= 20, `files downloaded and read back: ${downloads.length}`);

if (failures.length) {
  console.error(`\n${failures.length} failed, ${passed} passed.`);
  process.exit(1);
}
console.log(
  `\ndownloads — ${passed} checks passed; ${downloads.length} files read back with ${PYTHON} (openpyxl, pypdf); ${requests.length} requests, all to ${origin}; ` +
    `browser in ${BROWSER_ZONE}, garage in ${TZ}; 0 page policy violations.${KEEP ? ` Files kept in ${KEEP}.` : ''}`,
);
