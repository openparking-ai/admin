#!/usr/bin/env node
/* global document, window */
// A print reads right with the browser's default settings, on every page that
// prints (U4b fix round, F1).
//
// Browsers leave backgrounds out of a print unless "Background graphics" is
// turned on, and it is off by default in Chrome, Safari and Firefox. So no
// state on a printable page may be a background or a colour alone.
//
// In a real browser, signed in against the stand-in platform
// (test/stub-platform.js), in English and in Spanish, each printable page --
// Garage View, Lanes and equipment, Setup, the change log with its refused
// attempts, Alerts, and Card readers' connections (U6) -- is printed to PDF by headless Chromium with its
// defaults (backgrounds off), and the PDF is read back with pypdf. Every
// state mark the screen shows is read from the screen by what it IS (a tick's
// aria-checked, a step's data-state, a lane's data-open, the answer chosen),
// never by how it prints, and must be on paper as its word, next to what it
// belongs to:
//   ticks        each person's Text and Email tick: "Yes" or "No"
//   confirmed    each person's "Not confirmed yet"; each car's Yes or No
//   steps        each setup step's Done or Not yet
//   lanes        each lane's Open, or the reason it is closed
//   answers      the drivers question: the answer chosen, and not the other
//   connections  each card reader's "Still connected", or when it ended
//   lists        each list's own name; the refused attempts are told apart
//                from the changes made by theirs
// A mark missing from paper, or the wrong one, is named.
//
//   node scripts/check-print.js     (run `npm run build` first; FILES_PYTHON names the Python with pypdf)

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { DICTIONARIES } from '../src/i18n/index.js';
import { startStub } from '../test/stub-platform.js';
import { changesData, lanesData, refusedData } from '../test/files-fixtures.js';
import { readBack } from './files/read-back.js';
import { chooseOnSettings } from './on-settings.js';


const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIR = mkdtempSync(join(tmpdir(), 'admin-print-'));

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
// Both lists of the change log, a closed lane among open ones, and people with
// ticks on and off, a phone or an address missing.
A.lanes[HARBOR.id] = lanesData(new Date());
stub.setChanges(A, [...changesData(new Date()).changes, ...refusedData(new Date()).refused]
  .map((l) => ({ ...l, garage_id: HARBOR.id }))
  .sort((x, y) => Date.parse(x.at) - Date.parse(y.at)));
A.people[HARBOR.id].push({ id: 'pa100000-0000-4000-8000-000000000009', name: 'Weekend lead', phone: '+15550100009', email: 'weekend.lead@example.com', language: 'en', confirmed: false, by_text: ['card_payments_stopped'], by_email: ['lane_problem', 'attendant_link_dropped'] });

const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4337, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } } });
const base = server.resolvedUrls.local[0];
stub.allowOrigin(new URL(base).origin);
const browser = await chromium.launch();

/**
 * Text as paper and screen are compared: compatibility form, small letters,
 * and letters and digits only. A label drawn in spaced capitals comes back
 * from a PDF letter by letter ("C L O S E D"), so spaces cannot be compared.
 */
const squeeze = (text) => String(text).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Where `want` is on paper: after `anchor` (the first place at or after
 * `from` where it is followed by `want` within `window` characters), or
 * anywhere when there is no anchor. Returns the place after it, or -1.
 */
function find(paper, from, anchor, want, window) {
  if (!anchor) {
    const at = paper.indexOf(want, from);
    return at < 0 ? -1 : at + want.length;
  }
  for (let at = paper.indexOf(anchor, from); at >= 0; at = paper.indexOf(anchor, at + 1)) {
    const after = at + anchor.length;
    const hit = paper.indexOf(want, after);
    if (hit >= 0 && hit - after <= window) return hit + want.length;
  }
  return -1;
}

/**
 * Every state mark on the screen, read by what it is, in the page's order:
 * { what, anchor, want, not? }: the words it belongs to, and the words it
 * must print as. Read with the screen's own look, before any print.
 */
const MARKS = ({ words }) => {
  const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rowName = (el) => text(el.closest('tr')?.querySelector('td bdi'));
  const marks = [];
  // A list's name, and right after it what the list begins with: its first
  // sentence, or its first column's name. The same words can be elsewhere on
  // the page ("1,292 refused attempts in all"); the name in its place cannot.
  for (const title of document.querySelectorAll('main .section-title')) {
    if (title.closest('.no-print')) continue;
    let next = (title.closest('.list-head') ?? title).nextElementSibling;
    while (next && (next.classList.contains('no-print') || next.dataset.problem !== undefined)) next = next.nextElementSibling;
    const begins = next?.tagName === 'TABLE' ? text(next.querySelector('th .field-name')) : text(next);
    marks.push({ kind: 'list', what: `the list "${text(title)}" names itself, above "${begins}"`, anchor: '', want: `${text(title)} ${begins}` });
  }
  for (const td of document.querySelectorAll('[data-list="inside"] tbody tr td:nth-child(5)')) {
    marks.push({ kind: 'car', what: `a car let in at "${text(td.parentElement.cells[2])}": confirmed or not`, anchor: text(td.parentElement.cells[2]), want: text(td), window: 40 });
  }
  for (const td of document.querySelectorAll('td[data-open]')) {
    const closed = td.dataset.open === 'closed';
    marks.push({ kind: 'lane', what: `lane "${rowName(td)}": ${td.dataset.open}`, anchor: rowName(td), want: closed ? text(td.querySelector('.tag')) : words['lanes.isOpen'], window: 200 });
  }
  for (const step of document.querySelectorAll('[data-step]')) {
    const state = step.querySelector('[data-state]').dataset.state;
    marks.push({ kind: 'step', what: `setup step "${text(step.querySelector('.setup-step-name'))}": ${state}`, anchor: text(step.querySelector('.setup-step-name')), want: state === 'done' ? words['setup.done'] : words['setup.notYet'], window: 4 });
  }
  for (const chooser of document.querySelectorAll('main [data-chooser]')) {
    if (chooser.closest('.no-print, .topbar, .sidebar')) continue;
    const options = [...chooser.querySelectorAll('[role="radio"]')];
    const chosen = options.find((o) => o.getAttribute('aria-checked') === 'true');
    if (!chosen) continue;
    marks.push({
      kind: 'answer',
      what: `the answer to "${text(chooser.querySelector('.field-name'))}": "${text(chosen)}" chosen`,
      anchor: text(chooser.querySelector('.field-name')),
      want: text(chosen),
      not: options.filter((o) => o !== chosen).map(text),
      window: 200,
    });
  }
  // U6: each card reader connection, still connected or ended, beside the reader's name.
  for (const tr of document.querySelectorAll('[data-list="readers"] tbody tr[data-connection]')) {
    marks.push({ kind: 'connection', what: `card reader "${text(tr.cells[1])}": ${tr.dataset.connection}`, anchor: text(tr.cells[1]), want: text(tr.cells[3]), window: 40 });
  }
  for (const td of document.querySelectorAll('td[data-confirmed]')) {
    marks.push({ kind: 'person', what: `person "${rowName(td)}": confirmed ${td.dataset.confirmed}`, anchor: rowName(td), want: td.dataset.confirmed === 'yes' ? words['alerts.isConfirmed'] : words['alerts.notConfirmed'], window: 80 });
  }
  for (const tr of document.querySelectorAll('[data-list="alert-choices"] tbody tr')) {
    const cells = [...tr.cells].slice(-2);
    const said = cells.map((cell) => {
      const tick = cell.querySelector('[data-tick]');
      if (!tick) return text(cell);
      return tick.getAttribute('aria-checked') === 'true' ? words.yes : words.no;
    });
    marks.push({ kind: 'tick', what: `${tr.dataset.alert}, ${rowName(tr.cells[tr.cells.length - 3])}: by text ${said[0]}, by email ${said[1]}`, anchor: rowName(tr.cells[tr.cells.length - 3]), want: said.join(' '), window: 0 });
  }
  return marks;
};

const PAGES = [
  { id: 'inside', title: 'page.inside.title', hash: '#/garage-view', ready: '[data-list="inside"] tbody tr' },
  { id: 'lanes', title: 'page.lanes.title', hash: '#/lanes', ready: '[data-list="lanes"] td[data-open]' },
  // U7a: the drivers question is closed behind its button; opened, its answer prints as the one chosen.
  { id: 'setup', title: 'page.setup.title', hash: '#/setup', ready: '[data-step] [data-state]', open: '[data-action="open-drivers"]', opened: '[data-chooser="drivers"]' },
  { id: 'changes', title: 'page.changes.title', hash: '#/change-log', ready: '[data-list="refused"] tbody tr' },
  { id: 'alerts', title: 'page.alerts.title', hash: '#/alerts', ready: '[data-list="alert-choices"] [data-tick]' },
  { id: 'readers', title: 'page.readers.title', hash: '#/card-readers', ready: '[data-list="readers"] tbody tr[data-connection]' },
];

console.log('A print reads right with the browser\'s default settings, on every page that prints:');
const context = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo', viewport: { width: 1360, height: 860 } });
const page = await context.newPage();
await page.goto(base);
await page.waitForSelector('input[name="email"]');
await page.fill('input[name="email"]', A.email);
await page.fill('input[name="password"]', A.password);
await page.click('button[type="submit"]');
await page.waitForSelector(`.garage-choice[data-garage="${HARBOR.id}"]`);
await page.click(`.garage-choice[data-garage="${HARBOR.id}"]`);
await page.waitForSelector('.page-title');

for (const language of ['en', 'es']) {
  const words = DICTIONARIES[language];
  if (language === 'es') {
    await chooseOnSettings(page, 'language', 'es');
    await page.waitForFunction((title) => document.querySelector('.page-title')?.textContent.includes(title), words[PAGES[0].title]).catch(() => {});
  }
  for (const p of PAGES) {
    await page.evaluate((hash) => { window.location.hash = hash; }, p.hash);
    await page.waitForSelector(p.ready, { timeout: 15000 });
    if (p.open) {
      await page.click(p.open);
      await page.waitForSelector(p.opened, { timeout: 15000 });
    }
    const where = `${language} ${words[p.title]}`;
    const marks = await page.evaluate(MARKS, { words });
    // Paper: Chromium's own print, with its defaults -- backgrounds off.
    const path = join(DIR, `${p.id}-${language}.pdf`);
    await page.pdf({ path, format: 'Letter' });
    const paper = squeeze(readBack([path])[path].pages.map((x) => x.text).join('\n'));
    check(marks.length > 0, `${where}: ${marks.length} state marks read from the screen`);
    const wrong = [];
    // Marks of one kind are on paper in the screen's order: each is looked for after the one before.
    const cursor = {};
    for (const mark of marks) {
      const at = find(paper, cursor[mark.kind] ?? 0, squeeze(mark.anchor), squeeze(mark.want), mark.window ?? 0);
      if (at < 0) {
        wrong.push(`${mark.what} -- not on paper as "${mark.want}"`);
        continue;
      }
      if (mark.anchor) cursor[mark.kind] = at;
      // A choice not made must not print beside the one made: on paper the two would look alike.
      for (const other of mark.not ?? []) {
        if (find(paper, 0, squeeze(mark.anchor), squeeze(other), mark.window) >= 0) {
          wrong.push(`${mark.what} -- the answer not chosen, "${other}", is on paper beside it, unmarked`);
        }
      }
    }
    check(wrong.length === 0, `${where}: printed with backgrounds off, every state mark is on paper as on screen (${marks.length - wrong.length} of ${marks.length})${wrong.length ? `: ${wrong.slice(0, 6).join('; ')}${wrong.length > 6 ? `; and ${wrong.length - 6} more` : ''}` : ''}`);
  }
}

await browser.close();
await server.close();
await stub.close?.();
rmSync(DIR, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailed:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
