#!/usr/bin/env node
/* global document, window, getComputedStyle, fetch */
// The installer drawings page, in a browser, against the stand-in platform
// (test/stub-platform.js), with the built site (run `npm run build` first).
//
//   - reached from the setup checklist's lanes step;
//   - Harbor Street (takes any driver, two ways in and two out): the page
//     lists one sheet per lane, by name, then the seven shared sheets, and
//     says every way in and out is a lane with this equipment; Download PDF
//     saves one file whose every page is 11 x 17 in landscape, read back by
//     pypdf with each lane's name on its sheet; Print reads again and prints
//     the same sheets, one SVG a sheet;
//   - Riverside Deck (no drivers answer, no lanes): no set, the page says to
//     answer first and to add lanes first;
//   - your garage only: owner B sees only Elm Court's lane (a 2B entry), the
//     page never asks for owner A's garage, and the platform answers B's
//     own request for A's lanes "not found"; B's PDF holds none of A's names;
//   - no session: the session ended, Download PDF reads, the platform answers
//     401, the sign-in screen shows, and no file is saved.
//
//   node scripts/check-drawings-browser.js     (FILES_PYTHON names the Python with pypdf)

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { DICTIONARIES } from '../src/i18n/index.js';
import { readBack } from './files/read-back.js';
import { startStub } from '../test/stub-platform.js';
import { committed } from './drawings-snapshot.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const EN = DICTIONARIES.en;
// The drawing texts this check requires, as approved (U5 fix 13): never the dictionary's, which the page shows.
const SNAPSHOT_EN = committed().snapshot.en;
const DIR = mkdtempSync(join(tmpdir(), 'admin-drawings-browser-'));
const failures = [];
let passed = 0;
const check = (ok, what) => {
  if (ok) passed += 1;
  else failures.push(what);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};

const stub = await startStub();
const A = stub.data.a;
const B = stub.data.b;
const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4327, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } } });
const base = server.resolvedUrls.local[0];
stub.allowOrigin(new URL(base).origin);
const browser = await chromium.launch();
const settles = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

async function open() {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo', viewport: { width: 1360, height: 860 }, acceptDownloads: true });
  const asked = [];
  context.on('request', (r) => asked.push(r.url()));
  await context.addInitScript(() => {
    window.__printed = 0;
    window.print = () => {
      window.__printed += 1;
    };
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForSelector('input[name="email"]');
  return { context, page, asked };
}

async function signIn(page, who, garageId) {
  await page.fill('input[name="email"]', who.email);
  await page.fill('input[name="password"]', who.password);
  await page.click('button[type="submit"]');
  if (who.garages.length > 1) {
    await page.waitForSelector(`[data-garage="${garageId}"]`);
    await page.click(`button[data-garage="${garageId}"]`);
  }
  await page.waitForSelector('.page-title');
}

const listed = (page) =>
  page.evaluate(() => [...document.querySelectorAll('.drawings-list li')].map((li) => ({ kind: li.dataset.kind, text: li.innerText })));

async function download(page) {
  const waiting = page.waitForEvent('download', { timeout: 15000 }).then((d) => d, () => null);
  await page.click('[data-list="drawings"] [data-action="download-pdf"]');
  const file = await waiting;
  if (!file) return null;
  const path = join(DIR, `${Math.random().toString(36).slice(2)}.pdf`);
  await file.saveAs(path);
  return { path, name: file.suggestedFilename() };
}

try {
  // ── Owner A, Harbor Street: takes any driver ────────────────────────────
  const harbor = A.garages[0];
  const harborLanes = A.lanes[harbor.id];
  const a = await open();
  await signIn(a.page, A, harbor.id);
  await a.page.goto(`${base}#/setup`);
  await a.page.waitForSelector('[data-step="lanes"] [data-go="drawings"]');
  await a.page.click('[data-step="lanes"] [data-go="drawings"]');
  check(await settles(a.page, (t) => document.querySelector('.page-title')?.textContent === t, EN['page.drawings.title']), 'the setup checklist\'s lanes step leads to the installer drawings');
  await a.page.waitForSelector('.drawings-list li');
  const sheets = await listed(a.page);
  const kinds = sheets.map((s) => s.kind);
  const wanted = harborLanes.map((l) => (l.direction === 'exit' ? 'exit' : '2A'));
  check(kinds.slice(0, harborLanes.length).join() === wanted.join() && sheets.length === harborLanes.length + 7, `Harbor Street: ${sheets.length} sheets, one per lane (${kinds.slice(0, harborLanes.length).join(', ')}) then 7 shared`);
  check(harborLanes.every((l, i) => sheets[i].text.includes(l.name)), 'Harbor Street: each lane\'s sheet is named as the owner named the lane');
  check((await a.page.innerText('[data-notice="every-way"]')) === SNAPSHOT_EN['drawings.everyWay'], 'the page says every way in and out is a lane with this equipment, before download');

  const file = await download(a.page);
  check(file !== null && file.name.startsWith(SNAPSHOT_EN['drawings.doc']) && file.name.endsWith('.pdf'), `Download PDF saves one file (${file?.name ?? 'none'})`);
  if (file) {
    const pdf = readBack([file.path])[file.path];
    const sizes = [...new Set(pdf.pages.map((p) => `${Math.round(p.width)} x ${Math.round(p.height)}`))];
    check(pdf.pages.length === harborLanes.length + 7 && sizes.join() === '1224 x 792', `the PDF: ${pdf.pages.length} pages, each ${sizes.join(', ')} points (11 x 17 in landscape)`);
    check(harborLanes.every((l, i) => pdf.pages[i].text.includes(l.name)), 'the PDF: each lane\'s name on its own sheet, as text');
  }
  const printedBefore = await a.page.evaluate(() => window.__printed);
  await a.page.click('[data-list="drawings"] [data-action="print"]');
  check(await settles(a.page, (n) => window.__printed === n + 1, printedBefore), 'Print reads again and prints');
  await a.page.emulateMedia({ media: 'print' });
  const printed = await a.page.evaluate(() => ({
    sheets: document.querySelectorAll('.drawings-print svg.drawing-sheet').length,
    shown: getComputedStyle(document.querySelector('.drawings-print')).display !== 'none',
    screen: [...document.querySelectorAll('.sidebar, .topbar, [data-list="drawings"]')].some((e) => getComputedStyle(e).display !== 'none'),
    first: document.querySelector('.drawings-print svg')?.textContent ?? '',
  }));
  await a.page.emulateMedia({ media: 'screen' });
  check(printed.shown && !printed.screen && printed.sheets === harborLanes.length + 7, `the printed page: ${printed.sheets} sheets and nothing of the screen around them`);
  check(printed.first.includes(harborLanes[0].name) && printed.first.includes(harbor.name), 'the printed first sheet carries its lane and garage, as the PDF does');

  // ── Riverside Deck: no drivers answer, no lanes ─────────────────────────
  await a.page.click('[data-action="change-garage"]');
  await a.page.click(`button[data-garage="${A.garages[1].id}"]`);
  await a.page.goto(`${base}#/installer-drawings`);
  check(
    await settles(a.page, () => document.querySelector('[data-notice="needs-drivers"]') && document.querySelector('[data-notice="needs-lanes"]') && !document.querySelector('[data-action="download-pdf"]')),
    'Riverside Deck (no drivers answer, no lanes): no set; the page says to answer first and to add lanes first',
  );
  await a.context.close();

  // ── Owner B: your garage only ───────────────────────────────────────────
  const b = await open();
  await signIn(b.page, B);
  await b.page.goto(`${base}#/installer-drawings`);
  await b.page.waitForSelector('.drawings-list li');
  const bSheets = await listed(b.page);
  const aNames = [...A.garages.map((g) => g.name), ...Object.values(A.lanes).flat().map((l) => l.name)];
  const bText = await b.page.evaluate(() => document.body.innerText);
  check(bSheets[0]?.kind === '2B' && bSheets.length === 1 + 7 && bText.includes(B.lanes[B.garages[0].id][0].name), `Elm Court (pass holders only): ${bSheets.map((s) => s.kind).join(', ')}`);
  check(!aNames.some((n) => bText.includes(n)), 'owner B sees none of owner A\'s garages or lanes');
  const bFile = await download(b.page);
  const bPdf = bFile ? readBack([bFile.path])[bFile.path] : null;
  check(bPdf !== null && !aNames.some((n) => bPdf.pages.some((p) => p.text.includes(n))), 'owner B\'s PDF holds none of owner A\'s names');
  const aIds = A.garages.map((g) => g.id);
  check(!b.asked.some((u) => aIds.some((id) => u.includes(id))), 'signed in as owner B, the page never asks for owner A\'s garage');
  const foreign = await b.page.evaluate(async (id) => (await fetch(`/api/v1/garages/${id}/lanes`, { credentials: 'same-origin' })).status, harbor.id);
  check(foreign === 404, `owner B asking for owner A's lanes is answered "not found" (${foreign})`);

  // ── No session ──────────────────────────────────────────────────────────
  stub.endSessions();
  const none = await download(b.page);
  check(none === null, 'session ended: Download PDF saves no file');
  check(await settles(b.page, () => Boolean(document.querySelector('input[name="email"]'))), 'session ended: the platform answers 401 and the sign-in screen shows');
  await b.context.close();
} finally {
  await browser.close();
  await server.close();
  await stub.close();
  rmSync(DIR, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\ncheck-drawings-browser — ${failures.length} failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`\ncheck-drawings-browser — all ${passed} passed.`);
