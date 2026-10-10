#!/usr/bin/env node
/* global document, window */
// Removing a person removes their name from every view of the change log
// (U4b fix round 2, check 2).
//
// The platform keeps no name in a line about a person to tell: the change
// log's read names each person as they are named now, and a person who has
// been removed as removed, by no name. So removing a person must take their
// name out of the page, the PDF, the Excel file and the print, in both
// languages, and each line about them must say instead, in words, that it is
// about a person who was removed -- never show the id the line holds.
//
// In a real browser, signed in against the stand-in platform
// (test/stub-platform.js, which answers as test/platform-shapes.json records
// the platform does): a person is added with a number in their name, renamed,
// changed and given alerts, and someone else is added who stays; then the
// first is removed. Each view of the change log is read back -- the page from
// the screen, the files with openpyxl and pypdf, the print from Chromium's
// own PDF -- and must hold "A person who was removed" once for each of their
// five lines, the person who stays by name, and none of the removed person's
// names, numbers or id.
//
//   node scripts/check-removed-person.js     (run `npm run build` first; FILES_PYTHON names the Python with pypdf and openpyxl)

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { DICTIONARIES } from '../src/i18n/index.js';
import { startStub } from '../test/stub-platform.js';
import { readBack } from './files/read-back.js';
import { chooseOnSettings } from './on-settings.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIR = mkdtempSync(join(tmpdir(), 'admin-removed-'));

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

const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4338, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } } });
const base = server.resolvedUrls.local[0];
stub.allowOrigin(new URL(base).origin);
const browser = await chromium.launch();

/** Text as paper, file and screen are compared: compatibility form, small letters, letters and digits only. */
const squeeze = (text) => String(text).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const times = (text, part) => (part ? text.split(part).length - 1 : 0);

// Every person, number and address here is invented.
const FIRST = 'Ravi ❺❺❺⓿❶⓿⓿❶❼❼';
const RENAMED = 'Ravi five five five oh one seven seven';
const STAYS = 'Stays Named';

const context = await browser.newContext({ locale: 'en-US', timezoneId: 'America/New_York', viewport: { width: 1360, height: 860 }, acceptDownloads: true });
const page = await context.newPage();
await page.goto(base);
await page.waitForSelector('input[name="email"]');
await page.fill('input[name="email"]', A.email);
await page.fill('input[name="password"]', A.password);
await page.click('button[type="submit"]');
await page.waitForSelector(`.garage-choice[data-garage="${HARBOR.id}"]`);
await page.click(`.garage-choice[data-garage="${HARBOR.id}"]`);
await page.waitForSelector('.page-title');

/** A call as the screens make it: from the page, with its sign-in. */
const api = (method, path, body) => page.evaluate(async ([m, p, b]) => {
  const r = await fetch(`/api/v1${p}`, { method: m, headers: b === undefined ? {} : { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : null };
}, [method, path, body]);

const people = `/garages/${HARBOR.id}/alert-contacts`;
const added = await api('POST', people, { name: FIRST, phone: '555 010 0177', email: 'ravi.removed@example.com' });
check(added.status === 201, `a person with a number in their name is added (${added.status})`);
const id = added.json?.contact?.id ?? 'none';
const steps = [
  await api('PATCH', `${people}/${id}`, { name: RENAMED }),
  await api('PATCH', `${people}/${id}`, { phone: '555 010 0178', language: 'es' }),
  await api('PUT', `${people}/${id}/choices`, { by_text: ['card_payments_stopped'], by_email: ['lane_problem'] }),
  await api('POST', people, { name: STAYS, email: 'stays.named@example.com' }),
  await api('DELETE', `${people}/${id}`),
];
check(steps.every((s) => s.status < 300), `renamed, changed, given alerts, someone else added, then removed (${steps.map((s) => s.status).join(', ')})`);

const GONE = [FIRST, RENAMED, '5550100177', '5550100178', 'ravi.removed@example.com', id].map(squeeze);
const LINES = 5;

/** What one view must and must not hold, read as squeezed text. */
function judge(where, text, words) {
  const said = squeeze(words['changes.person.removed']);
  const got = times(text, said);
  check(got === LINES, `${where}: "${words['changes.person.removed']}" for each of the removed person's ${LINES} lines (${got})`);
  check(text.includes(squeeze(STAYS)), `${where}: the person who stays is named`);
  const found = GONE.filter((g) => text.includes(g));
  check(found.length === 0, `${where}: nothing of the removed person -- name, number, address or id${found.length ? `: ${found.join(', ')}` : ''}`);
}

/** One file of the change log's list, downloaded as the screen downloads it. */
async function download(what, language) {
  const button = `[data-list="changes"] [data-action="download-${what}"]`;
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click(button)]);
  const path = join(DIR, `changes-${language}.${what === 'excel' ? 'xlsx' : 'pdf'}`);
  await file.saveAs(path);
  return path;
}

const fileText = (read) => (read.kind === 'pdf'
  ? read.pages.map((p) => p.text).join('\n')
  : read.sheets.flatMap((s) => s.rows.flatMap((r) => (r ?? []).map((c) => c?.value ?? ''))).join('\n'));

console.log('Removing a person removes their name from every view of the change log:');
for (const language of ['en', 'es']) {
  const words = DICTIONARIES[language];
  await chooseOnSettings(page, 'language', language);
  await page.evaluate(() => { window.location.hash = '#/alerts'; });
  await page.evaluate(() => { window.location.hash = '#/change-log'; });
  await page.waitForFunction((title) => document.querySelector('.page-title')?.textContent.includes(title), words['page.changes.title']);
  await page.waitForSelector('[data-list="changes"] tbody tr');
  const where = (view) => `${language} ${view}`;
  judge(where('page'), squeeze(await page.textContent('[data-list="changes"]')), words);
  // Each line about the removed person still says what was done to them.
  const rows = await page.$$eval('[data-list="changes"] tbody tr', (trs) => trs.map((tr) => tr.textContent.replace(/\s+/g, ' ')));
  const theirs = rows.filter((r) => r.includes(words['changes.person.removed']));
  const kinds = ['alert_contact_add', 'alert_contact_change', 'alert_contact_choices', 'alert_contact_remove'].map((k) => words[`changes.action.${k}`]);
  check(theirs.length === LINES && theirs.every((r) => kinds.some((k) => r.includes(`${k}: ${words['changes.person.removed']}`))), `${where('page')}: each of their lines says what was done, to "${words['changes.person.removed']}"`);
  check(theirs.some((r) => r.includes(words['changes.value.name.changed'])), `${where('page')}: the name change is said as "${words['changes.value.name.changed']}", never from what to what`);
  for (const what of ['pdf', 'excel']) {
    const path = await download(what, language);
    judge(where(what === 'pdf' ? 'PDF' : 'Excel'), squeeze(fileText(readBack([path])[path])), words);
  }
  const printed = join(DIR, `print-${language}.pdf`);
  await page.pdf({ path: printed, format: 'Letter' });
  judge(where('print'), squeeze(fileText(readBack([printed])[printed])), words);
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
