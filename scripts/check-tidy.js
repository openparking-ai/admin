#!/usr/bin/env node
/* global document, window, getComputedStyle */
// The owner's screens, tidied (U7a), in a real browser.
//
// Serves dist/ (run `npm run build` first) with /api sent to the stand-in
// platform (test/stub-platform.js), opens it in headless Chromium with the
// browser in TOKYO time, signs in as an owner with two garages, and checks:
//
//   1  the language and the look: no Language or Look chooser on any page
//      but Settings (and the sign-in screen), both languages;
//   2  Garage View: no "Cars inside", nor "Carros adentro", on any page, in
//      Quick Find, the window's title, a print or a file, both languages;
//      nor in any shown entry of the dictionaries;
//   3  paging: a list of 312 shows 20 at a time, and pages through all 312
//      with none missed or repeated, saying where it is ("21–40 of 312");
//      its Download Excel, Download PDF and Print each hold all 312 -- for
//      Garage View, the change log (312, read across the platform's pages of
//      50) and its refused attempts (45), and Alerts (25 people; who gets
//      which alert, 125 rows, prints whole);
//   4  an empty list shows no Download and no Print: Garage View, Lanes, the
//      change log and its refused attempts, Alerts, Card readers;
//   5  Confirm email: under every email typed on these screens (adding a
//      person, and changing one's address); a mismatch never saves, said in
//      plain words, both languages. The sign-in screen's email signs in and
//      saves nothing: it is not held to this;
//   6  Home lists the owner's garages first, each with one line on its lanes
//      and cars; each, chosen, shows its own garage below the list.
// No request leaves the page.
//
//   node scripts/check-tidy.js                 the check
//   node scripts/check-tidy.js --screens DIR   ...and save the screenshots

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
const EN = WORDS.en;
const DIR = mkdtempSync(join(tmpdir(), 'admin-tidy-'));
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
const B = stub.data.b;
const HARBOR = A.garages[0];
const RIVERSIDE = A.garages[1];
const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4367, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } } });
const base = server.resolvedUrls.local[0];
const origin = new URL(base).origin;
stub.allowOrigin(origin);
const browser = await chromium.launch();
const requests = []; // { method, url }

async function open() {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo', acceptDownloads: true, viewport: { width: 1360, height: 900 } });
  context.on('request', (r) => requests.push({ method: r.method(), url: r.url() }));
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForSelector('.page-title');
  return { context, page };
}
async function signIn(page, who) {
  await page.fill('input[name="email"]', who.email);
  await page.fill('input[name="password"]', who.password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('.nav');
}

const settles = (page, fn, arg, timeout = 5000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const showsHeading = (page, text) => settles(page, (t) => document.querySelector('.page-title')?.textContent === t, text);
const go = async (page, id) => {
  const p = PAGES.find((x) => x.id === id);
  await page.click(`.nav-item[href="${hashFor(p)}"]`);
};
const plain = (text) => String(text).replace(/[\s  ]+/g, ' ').trim();
const n = (x, language) => x.toLocaleString(language === 'es' ? 'es-US' : 'en-US');
const where = (language, from, to, count) => WORDS[language]['pager.where'].replace('{from}', n(from, language)).replace('{to}', n(to, language)).replace('{count}', n(count, language));
const screenshot = async (page, name) => {
  if (!SCREENS) return;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(SCREENS, `${name}.png`), fullPage: true });
};

/** The rows of a list's table drawn on screen (not left off this page), as text. */
const shownRows = (page, list) =>
  page.evaluate((l) => [...document.querySelectorAll(`[data-list="${l}"] tbody tr`)].filter((tr) => getComputedStyle(tr).display !== 'none').map((tr) => tr.textContent), list);

/** Download one file of a list, as the screen does. */
async function download(page, list, what, tag) {
  const got = page.waitForEvent('download', { timeout: 30000 });
  await page.click(`[data-list="${list}"] [data-action="download-${what}"]`);
  const file = await got;
  const path = join(DIR, `${tag}-${file.suggestedFilename()}`);
  await file.saveAs(path);
  return { path, name: file.suggestedFilename() };
}

/**
 * Check 3, one list: 20 rows a page, Next through every page with the place
 * said each time, every key seen once and none missed, Previous back; then
 * Excel, PDF and Print, each holding every key.
 */
async function pagesThrough(page, { list, keys, columns, language, label }) {
  const words = WORDS[language];
  const count = keys.length;
  const pages = Math.ceil(count / PER_PAGE);
  await settles(page, (l) => document.querySelectorAll(`[data-list="${l}"] tbody tr`).length > 0, list);
  const seen = [];
  const wrongPages = [];
  for (let i = 0; i < pages; i += 1) {
    const from = i * PER_PAGE + 1;
    const to = Math.min(count, from + PER_PAGE - 1);
    const says = await settles(page, ([l, w]) => document.querySelector(`[data-pager="${l}"] .pager-where`)?.textContent === w, [list, where(language, from, to, count)]);
    const rows = await shownRows(page, list);
    if (!says || rows.length !== to - from + 1) wrongPages.push(`page ${i + 1}: ${rows.length} rows, says "${await page.textContent(`[data-pager="${list}"] .pager-where`).catch(() => 'nothing')}"`);
    for (const row of rows) seen.push(keys.find((k) => row.includes(k)) ?? `(a row holding none: ${row.slice(0, 40)})`);
    if (i < pages - 1) {
      // A list shorter than it should be ends early: its Next is off, and the rows it lacks are reported below.
      const next = `[data-pager="${list}"] [data-action="next"]`;
      if (!(await page.$(next)) || (await page.$eval(next, (b) => b.disabled))) {
        wrongPages.push(`no page after page ${i + 1}`);
        break;
      }
      await page.click(next);
    }
  }
  const missed = keys.filter((k) => !seen.includes(k));
  const twice = seen.filter((k, i) => seen.indexOf(k) !== i);
  const stray = seen.filter((k) => !keys.includes(k));
  check(wrongPages.length === 0 && seen.length === count && missed.length === 0 && twice.length === 0 && stray.length === 0,
    `3 ${label} (${language}): ${count} rows, ${PER_PAGE} a page over ${pages} pages, each saying where it is; ${seen.length} seen, none missed, none twice` +
      `${wrongPages.length ? `; ${wrongPages.slice(0, 3).join('; ')}` : ''}${missed.length ? `; missed ${missed.slice(0, 3).join(', ')}` : ''}${twice.length ? `; twice ${twice.slice(0, 3).join(', ')}` : ''}${stray.length ? `; ${stray[0]}` : ''}`);
  const nextOff = await page.$eval(`[data-pager="${list}"] [data-action="next"]`, (b) => b.disabled).catch(() => false);
  await page.click(`[data-pager="${list}"] [data-action="previous"]`, { timeout: 5000 }).catch(() => {});
  const back = await settles(page, ([l, w]) => document.querySelector(`[data-pager="${l}"] .pager-where`)?.textContent === w, [list, where(language, (pages - 2) * PER_PAGE + 1, (pages - 1) * PER_PAGE, count)]);
  check(nextOff && back, `3 ${label} (${language}): Next stops at the last page, and Previous goes back one`);

  // Excel and PDF: every key, whatever page is on screen.
  const excel = await download(page, list, 'excel', `${list}-${language}`);
  const pdf = await download(page, list, 'pdf', `${list}-${language}`);
  const read = readBack([excel.path, pdf.path]);
  const { rows } = tableOf(read[excel.path].sheets[0], columns.map((k) => words[k]));
  const inExcel = rows.map((r) => r.map((c) => String(c?.value ?? '')).join(' '));
  const excelMissed = keys.filter((k) => !inExcel.some((r) => r.includes(k)));
  check(rows.length === count && excelMissed.length === 0, `3 ${label} (${language}): Download Excel holds all ${count}, not the page on screen (${rows.length} rows${excelMissed.length ? `; missing ${excelMissed.slice(0, 3).join(', ')}` : ''})`);
  const pdfText = plain(read[pdf.path].pages.map((p) => p.text).join(' '));
  const pdfMissed = keys.filter((k) => !pdfText.includes(k));
  check(pdfMissed.length === 0, `3 ${label} (${language}): Download PDF holds all ${count} (${count - pdfMissed.length} found${pdfMissed.length ? `; missing ${pdfMissed.slice(0, 3).join(', ')}` : ''})`);
  // Print: the Print button, then the page as printed.
  await page.click(`[data-list="${list}"] [data-action="print"]`);
  await settles(page, () => !document.querySelector('.list-actions[aria-busy="true"]'));
  await page.emulateMedia({ media: 'print' });
  const printed = await shownRows(page, list);
  const pager = await page.$eval(`[data-pager="${list}"]`, (e) => getComputedStyle(e).display);
  await page.emulateMedia({ media: 'screen' });
  const printMissed = keys.filter((k) => !printed.some((r) => r.includes(k)));
  check(printed.length === count && printMissed.length === 0 && pager === 'none', `3 ${label} (${language}): Print holds all ${count}, and not the page's Previous and Next (${printed.length} rows printed${printMissed.length ? `; missing ${printMissed.slice(0, 3).join(', ')}` : ''})`);
  return { excel, pdf };
}

// What may never be said again (check 2): the page's old name, in either
// language, in capitals or not (a list's name is drawn in capitals). A count
// of cars says the same words after a number (or its {count}) or "No" ("2
// cars inside", "No hay carros adentro"): that is a count, not the name.
const OLD_NAMES = [/(?<!(\d|\}|\bno|\bhay)[\s\u00a0\u202f])(?<!\p{L})cars inside(?!\p{L})/iu, /(?<!(\d|\}|\bno|\bhay)[\s\u00a0\u202f])(?<!\p{L})carros adentro(?!\p{L})/iu];
const oldNameIn = (text) => OLD_NAMES.filter((re) => re.test(text)).map((re) => text.match(re)[0].trim());

// A chooser of the language or the look, anywhere in the page (check 1).
const CHOOSERS = '[data-chooser="language"], [data-chooser="theme"], [data-control="language"], [data-control="theme"]';

try {
  // ── 2, the words themselves: no shown entry holds the old name ──────────
  const inWords = Object.entries(WORDS).flatMap(([language, dict]) => Object.entries(dict).filter(([k, v]) => !k.endsWith('.words') && oldNameIn(String(v)).length).map(([k]) => `${language} ${k}`));
  check(inWords.length === 0, `2 no shown entry of either dictionary says "Cars inside" or "Carros adentro"${inWords.length ? `: ${inWords.join(', ')}` : ''}`);

  const { context, page } = await open();
  // ── 1, the sign-in screen keeps its language choice ─────────────────────
  check(Boolean(await page.$('[data-control="language"]')), '1 the sign-in screen keeps its language choice');
  await signIn(page, A);

  // ── 6: Home lists the garages first; each opens its own ─────────────────
  check(await settles(page, () => document.querySelectorAll('.garage-choice[data-garage] [data-read="read"]').length === 4), '6 Home lists both garages, each with its line read from the platform');
  const listed = await page.$$eval('[data-list="garages"] .garage-choice', (bs) => bs.map((b) => b.dataset.garage));
  check(JSON.stringify(listed) === JSON.stringify(A.garages.map((g) => g.id)), `6 Home: the owner's two garages, in the platform's order (${listed.length})`);
  check((await page.$('[data-detail]')) === null, '6 Home: no garage shown below the list before one is chosen');
  await screenshot(page, 'home-garages');
  const platformLanes = (id) => page.evaluate(async (g) => (await (await fetch(`/api/v1/garages/${g}/lanes`)).json()).lanes.map((l) => l.name), id);
  const platformInside = (id) => page.evaluate(async (g) => (await (await fetch(`/api/v1/garages/${g}/sessions/open`)).json()).inside_count, id);
  for (const g of [HARBOR, RIVERSIDE, HARBOR]) {
    await page.click(`.garage-choice[data-garage="${g.id}"]`);
    // Its count and its lanes both read: they come from two reads, either one first.
    const shown = await settles(
      page,
      ([id, loading]) => {
        const detail = document.querySelector('[data-detail]');
        return detail?.dataset.detail === id && Boolean(detail.querySelector('[data-figure="inside"]')) && !detail.querySelector('[data-section="lanes"]').textContent.includes(loading);
      },
      [g.id, EN.loading],
    );
    const detail = await page.evaluate(() => ({
      title: document.querySelector('.home-detail-title')?.textContent ?? '',
      lanes: [...document.querySelectorAll('[data-detail] .lane-name')].map((e) => e.textContent),
      working: document.querySelectorAll('[data-detail] .lane-row[data-state="working"]').length,
      figure: document.querySelector('[data-figure="inside"]')?.textContent ?? '',
      current: [...document.querySelectorAll('.garage-choice[aria-current="true"]')].map((b) => b.dataset.garage),
      frame: document.querySelector('.garage-current')?.textContent ?? '',
    }));
    const lanes = await platformLanes(g.id);
    const inside = await platformInside(g.id);
    const figure = inside === 0 ? EN['inside.countNone'] : inside === 1 ? EN['inside.countOne'] : EN['inside.countMany'].replace('{count}', String(inside));
    check(shown && detail.title === g.name && JSON.stringify(detail.lanes) === JSON.stringify(lanes) && (detail.figure === figure || (inside === 0 && detail.figure === EN['inside.countNoneConfirmed'])) && JSON.stringify(detail.current) === JSON.stringify([g.id]) && detail.frame === g.name,
      `6 Home, ${g.name} chosen: its own garage below the list -- its name, its ${lanes.length} lanes, "${figure}" -- marked in the list and named in the frame (shows "${detail.title}", ${JSON.stringify(detail.lanes)}, "${detail.figure}")`);
    // Its one line in the list agrees with the garage shown.
    const line = await page.evaluate((id) => document.querySelector(`.garage-choice[data-garage="${id}"] .garage-line`)?.textContent ?? '', g.id);
    const lanesLine = lanes.length === 0 ? EN['home.lanesNone'] : lanes.length === 1 ? EN[detail.working ? 'home.laneWorking' : 'home.laneNotWorking'] : EN['home.lanesWorking'].replace('{working}', String(detail.working)).replace('{lanes}', String(lanes.length));
    check(plain(line) === plain(`${lanesLine} · ${detail.figure}`), `6 Home, ${g.name}'s line: "${lanesLine} · ${detail.figure}" (it says "${plain(line)}")`);
    if (g === RIVERSIDE) await screenshot(page, 'home-riverside');
  }
  // One garage is a list of one.
  {
    const solo = await open();
    await signIn(solo.page, B);
    const one = await settles(solo.page, (id) => document.querySelectorAll('[data-list="garages"] .garage-choice').length === 1 && document.querySelector('[data-detail]')?.dataset.detail === id, B.garages[0].id);
    check(one, '6 an owner with one garage: Home lists it, a list of one, and shows it below');
    await solo.context.close();
  }

  // ── 4: an empty list shows no Download and no Print ─────────────────────
  // Riverside has no lanes, no car inside, nobody to tell and no reader; the
  // log has nothing in it yet. Harbor's lists, each holding rows, show them.
  stub.setDrivers(RIVERSIDE.id, true);
  const EMPTY = [
    ['inside', 'inside'],
    ['lanes', 'lanes'],
    ['changes', 'changes'],
    ['changes', 'refused'],
    ['alerts', 'alerts'],
    ['readers', 'readers'],
  ];
  const actionsOf = (list) => page.evaluate((l) => {
    const box = document.querySelector(`[data-list="${l}"]`);
    if (!box) return null;
    return [...box.querySelectorAll('[data-action^="download-"], [data-action="print"]')].map((b) => b.dataset.action);
  }, list);
  await go(page, 'home');
  await page.click(`.garage-choice[data-garage="${RIVERSIDE.id}"]`);
  for (const [pageId, list] of EMPTY) {
    await go(page, pageId);
    const there = await settles(page, (l) => Boolean(document.querySelector(`[data-list="${l}"]`)), list);
    const empty = await page.evaluate((l) => document.querySelectorAll(`[data-list="${l}"] tbody tr`).length === 0, list);
    const actions = await actionsOf(list);
    check(there && empty && actions?.length === 0, `4 an empty list shows no Download or Print: ${list}, empty (${actions === null ? 'no list' : actions.length ? actions.join(', ') : 'none shown'})`);
  }
  // The same lists holding rows do show all three (the change log's, once something is in it).
  await chooseOnSettings(page, 'language', 'en');
  await go(page, 'home');
  await page.click(`.garage-choice[data-garage="${HARBOR.id}"]`);
  // (The change log's, holding rows, are pressed in check 3 below.)
  for (const [pageId, list] of [['inside', 'inside'], ['lanes', 'lanes'], ['alerts', 'alerts'], ['readers', 'readers']]) {
    await go(page, pageId);
    const shown = await settles(page, (l) => document.querySelectorAll(`[data-list="${l}"] [data-action^="download-"], [data-list="${l}"] [data-action="print"]`).length === 3, list);
    check(shown, `4 control: ${list}, holding rows, shows Download Excel, Download PDF and Print`);
  }

  // ── 1 and 2, every page, both languages ─────────────────────────────────
  for (const language of ['en', 'es']) {
    const words = WORDS[language];
    await chooseOnSettings(page, 'language', language);
    for (const p of PAGES) {
      await go(page, p.id);
      await showsHeading(page, words[`page.${p.id}.title`]);
      await page.waitForTimeout(300);
      const found = await page.evaluate((sel) => ({
        choosers: [...document.querySelectorAll(sel)].map((e) => e.dataset.chooser ?? e.dataset.control),
        top: document.querySelectorAll(`.topbar :is(${sel})`).length,
        text: `${document.body.innerText}\n${document.title}`,
      }), CHOOSERS);
      const want = p.id === 'settings' ? ['language', 'language', 'theme', 'theme'] : [];
      check(JSON.stringify(found.choosers.sort()) === JSON.stringify(want) && found.top === 0,
        `1 ${words[`page.${p.id}.title`]} (${language}): ${p.id === 'settings' ? 'the Language and Look choosers, and only here' : 'no Language or Look chooser'}${found.choosers.length !== want.length || found.top ? ` (found ${found.choosers.join(', ') || 'none'}; ${found.top} in the top bar)` : ''}`);
      const old = oldNameIn(found.text);
      check(old.length === 0, `2 ${words[`page.${p.id}.title`]} (${language}): never "Cars inside" nor "Carros adentro", on the page or its window's title${old.length ? ` (says "${old.join('", "')}")` : ''}`);
    }
    // Quick Find, everything it lists.
    await page.keyboard.press('Control+K');
    await page.waitForSelector('.find-dialog');
    const finds = await page.innerText('.find-dialog');
    await page.keyboard.press('Escape');
    check(oldNameIn(finds).length === 0 && finds.includes(words['page.inside.title']), `2 Quick Find (${language}): finds "${words['page.inside.title']}", never the old name`);
    // Garage View, printed and downloaded.
    await go(page, 'inside');
    await settles(page, () => document.querySelectorAll('[data-list="inside"] tbody tr').length > 0);
    await page.emulateMedia({ media: 'print' });
    const printed = await page.evaluate(() => document.body.innerText);
    await page.emulateMedia({ media: 'screen' });
    check(oldNameIn(printed).length === 0 && printed.toLowerCase().includes(words['page.inside.title'].toLowerCase()), `2 Garage View printed (${language}): its name, never the old one`);
    const files = [await download(page, 'inside', 'excel', `name-${language}`), await download(page, 'inside', 'pdf', `name-${language}`)];
    const read = readBack(files.map((f) => f.path));
    for (const f of files) {
      const text = JSON.stringify(read[f.path]);
      check(oldNameIn(text).length === 0 && oldNameIn(f.name).length === 0 && f.name.startsWith(words['page.inside.title']) && text.includes(words['page.inside.title']),
        `2 Garage View's ${f.path.endsWith('.pdf') ? 'PDF' : 'Excel'} file (${language}): named and titled "${words['page.inside.title']}", never the old name ("${f.name}")`);
    }
  }
  await chooseOnSettings(page, 'language', 'en');
  // The old address still opens it, and is put right.
  await page.evaluate(() => { window.location.hash = '#/cars-inside'; });
  check(await showsHeading(page, EN['page.inside.title']) && (await page.evaluate(() => window.location.hash)) === hashFor(PAGES.find((p) => p.id === 'inside')), `2 the old address opens ${EN['page.inside.title']}, at its own address`);

  // ── 3: long lists ─────────────────────────────────────────────────────
  const stays = A.open[HARBOR.id];
  const first = stays[0];
  for (let i = stays.length; i < 312; i += 1) {
    stays.push({ ...first, id: `ss900000-0000-4000-8000-${String(i).padStart(12, '0')}`, plate: `PG${String(i).padStart(4, '0')}`, ticket_ref: null, entry_at: new Date(Date.parse(first.entry_at) - i * 60_000).toISOString() });
  }
  const plates = stays.map((s) => s.plate ?? s.ticket_ref);
  const line = (i, outcome) => ({
    id: `${outcome === 'done' ? 'c' : 'd'}9000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    garage_id: HARBOR.id,
    at: new Date(Date.parse('2026-03-01T12:00:00Z') + i * 3_600_000).toISOString(),
    outcome,
    who: { kind: 'owner', name: A.email },
    action: 'lane.rename',
    subject: { kind: 'lane', id: 'la900000-0000-4000-8000-000000000001', name: `Gate${outcome === 'done' ? 'C' : 'R'}${String(i).padStart(4, '0')}` },
    before: outcome === 'done' ? { name: 'Before' } : null,
    after: outcome === 'done' ? { name: 'After' } : null,
    refusal: outcome === 'done' ? null : 'lane_name_refused',
    attempts: 1,
  });
  const madeLines = Array.from({ length: 312 }, (_, i) => line(i, 'done'));
  const refusedLines = Array.from({ length: 45 }, (_, i) => line(i, 'refused'));
  // Put back after each change of language, which is itself a line in the log.
  const logOf312 = () => stub.setChanges(A, [...madeLines, ...refusedLines].sort((x, y) => Date.parse(x.at) - Date.parse(y.at)));
  const people = A.people[HARBOR.id];
  for (let i = people.length; i < 25; i += 1) people.push({ id: `pa900000-0000-4000-8000-${String(i).padStart(12, '0')}`, name: `Person${String(i).padStart(3, '0')}`, phone: null, email: `person${i}@example.com`, language: 'en', confirmed: false, by_text: [], by_email: ['lane_problem'] });
  const names = people.map((p) => p.name);

  for (const language of ['en', 'es']) {
    await chooseOnSettings(page, 'language', language);
    logOf312();
    await go(page, 'inside');
    await pagesThrough(page, { list: 'inside', keys: plates, columns: ['inside.plate', 'inside.ticket', 'inside.letIn', 'inside.lane', 'inside.confirmed'], language, label: 'Garage View' });
    if (language === 'en') await screenshot(page, 'garage-view-312');
    await go(page, 'changes');
    await settles(page, () => document.querySelectorAll('[data-list="changes"] tbody tr').length >= 312, null, 15000);
    await pagesThrough(page, { list: 'changes', keys: madeLines.map((l) => l.subject.name), columns: ['changes.when', 'changes.who', 'changes.what', 'changes.before', 'changes.after'], language, label: 'the change log' });
    await pagesThrough(page, { list: 'refused', keys: refusedLines.map((l) => l.subject.name), columns: ['refused.when', 'refused.who', 'refused.what', 'refused.why', 'refused.times', 'refused.last'], language, label: 'the refused attempts' });
    if (language === 'en') await screenshot(page, 'change-log-312');
  }
  await chooseOnSettings(page, 'language', 'en');
  await go(page, 'alerts');
  await pagesThrough(page, { list: 'alerts', keys: names, columns: ['alerts.person', 'alerts.phone', 'alerts.email', 'alerts.language', 'alerts.confirmed', 'file.byText', 'file.byEmail'], language: 'en', label: 'Alerts, the people' });
  // Who gets which alert: 20 people at a time under each alert on screen; every person under each, printed.
  {
    const alertsCount = (await page.evaluate(async (g) => (await (await fetch(`/api/v1/garages/${g}/alerts`)).json()).alerts.length, HARBOR.id));
    const rowsOn = () => page.evaluate(() => [...document.querySelectorAll('[data-list="alert-choices"] tbody')].filter((b) => getComputedStyle(b).display !== 'none').flatMap((b) => [...b.rows]).map((r) => r.dataset.person));
    await page.click('[data-pager="alert-choices"] [data-action="previous"]').catch(() => {});
    const first20 = await rowsOn();
    await page.click('[data-pager="alert-choices"] [data-action="next"]');
    await settles(page, (w) => document.querySelector('[data-pager="alert-choices"] .pager-where')?.textContent === w, where('en', 21, 25, 25));
    const last5 = await rowsOn();
    await page.emulateMedia({ media: 'print' });
    const onPaper = await rowsOn();
    await page.emulateMedia({ media: 'screen' });
    const everyone = new Set([...first20, ...last5]);
    check(first20.length === 20 * alertsCount && last5.length === 5 * alertsCount && everyone.size === 25 && onPaper.length === 25 * alertsCount && new Set(onPaper).size === 25,
      `3 Alerts, who gets which alert: ${first20.length / alertsCount} people under each alert, then ${last5.length / alertsCount}; ${everyone.size} people in all, none twice; printed, all ${onPaper.length / alertsCount} under each of the ${alertsCount} alerts`);
  }
  await screenshot(page, 'alerts-25');

  // ── 5: Confirm email, under every email typed ───────────────────────────
  const contactWrites = (from) => requests.slice(from).filter((r) => r.method !== 'GET' && /\/alert-contacts/.test(new URL(r.url).pathname));
  const platformPeople = () => page.evaluate(async (g) => (await (await fetch(`/api/v1/garages/${g}/alerts`)).json()).contacts, HARBOR.id);
  // Make room: the garage holds at most 25.
  A.people[HARBOR.id].splice(2);
  for (const language of ['en', 'es']) {
    const words = WORDS[language];
    await chooseOnSettings(page, 'language', language);
    await go(page, 'alerts');
    await page.click('[data-action="open-add-person"]');
    const form = '[data-form="add-person"]';
    const pairs = await page.$$eval(`${form} input[inputmode="email"], ${form} input[type="email"]`, (inputs) => inputs.map((i) => i.dataset.field));
    check(JSON.stringify(pairs) === JSON.stringify(['email', 'confirm-email']), `5 adding a person (${language}): the email, and Confirm email under it (${pairs.join(', ')})`);
    const from = requests.length;
    const name = `Confirm ${language}`;
    await page.fill(`${form} label:has([data-about="alerts.person"]) input`, name);
    await page.fill(`${form} [data-field="email"]`, `confirm.${language}@example.com`);
    const confirmAdd = `${form} [data-field="confirm-email"]`;
    if (await page.$(confirmAdd)) await page.fill(confirmAdd, `confirm.${language}@example.org`);
    await page.click(`${form} button[type="submit"]`);
    const said = await settles(page, (w) => document.querySelector('[data-form="add-person"] [data-notice="emails-differ"]')?.textContent === w, words['alerts.emailsDiffer']);
    await page.waitForTimeout(500);
    check(said && contactWrites(from).length === 0 && !(await platformPeople()).some((p) => p.name === name), `5 adding a person (${language}): two different addresses are not saved, and it says "${words['alerts.emailsDiffer']}"`);
    if (await page.$(confirmAdd)) await page.fill(confirmAdd, `confirm.${language}@example.com`);
    if (await page.$(form)) await page.click(`${form} button[type="submit"]`);
    check(await settles(page, (nm) => [...document.querySelectorAll('[data-list="alerts"] tbody bdi')].some((b) => b.textContent === nm), name), `5 control (${language}): the same address twice is saved`);
    // Changing a person's address: a new one is typed twice too.
    const row = `[data-list="alerts"] tbody tr:has(td:first-child bdi:text-is("${name}"))`;
    await page.click(`${row} [data-action="change-person"]`);
    const panel = '[data-panel="change-person"]';
    check((await page.$(`${panel} [data-field="confirm-email"]`)) === null, `5 changing a person (${language}): no Confirm email while the address is as it was`);
    await page.fill(`${panel} [data-field="email"]`, `new.${language}@example.com`);
    const changeFields = await page.$$eval(`${panel} input[inputmode="email"], ${panel} input[type="email"]`, (inputs) => inputs.map((i) => i.dataset.field));
    check(JSON.stringify(changeFields) === JSON.stringify(['email', 'confirm-email']), `5 changing a person's address (${language}): Confirm email under the new one (${changeFields.join(', ')})`);
    const changeFrom = requests.length;
    // With no Confirm email to type in, it is sent as it is: the check below then sees what is saved.
    const confirmField = `${panel} [data-field="confirm-email"]`;
    if (await page.$(confirmField)) await page.fill(confirmField, `new.${language}@example.net`);
    await page.click(`${panel} button[type="submit"]`);
    const saidChange = await settles(page, (w) => document.querySelector('[data-panel="change-person"] [data-notice="emails-differ"]')?.textContent === w, words['alerts.emailsDiffer']);
    await page.waitForTimeout(500);
    check(saidChange && contactWrites(changeFrom).length === 0 && (await platformPeople()).find((p) => p.name === name)?.email === `confirm.${language}@example.com`, `5 changing a person's address (${language}): two different addresses are not saved, and it says so`);
    if (await page.$(confirmField)) await page.fill(confirmField, `new.${language}@example.com`);
    if (await page.$(panel)) await page.click(`${panel} button[type="submit"]`);
    check(await settles(page, () => !document.querySelector('[data-panel="change-person"]')) && (await platformPeople()).find((p) => p.name === name)?.email === `new.${language}@example.com`, `5 control (${language}): the new address typed twice the same is saved`);
    if (language === 'en') await screenshot(page, 'alerts-confirm');
  }
  await chooseOnSettings(page, 'language', 'en');
  // Every email typed on these screens: each page, every form opened, holds none without its Confirm email.
  {
    const unconfirmed = [];
    for (const p of PAGES) {
      await go(page, p.id);
      await page.waitForTimeout(300);
      for (const opener of await page.$$('[data-action^="open-"]')) await opener.click().catch(() => {});
      const lone = await page.evaluate(() => [...document.querySelectorAll('main input[inputmode="email"], main input[type="email"]')].filter((i) => i.dataset.field !== 'confirm-email' && i.closest('form')?.querySelector('[data-field="confirm-email"]') === null).map((i) => i.dataset.field ?? i.name));
      if (lone.length) unconfirmed.push(`${EN[`page.${p.id}.title`]}: ${lone.join(', ')}`);
    }
    check(unconfirmed.length === 0, `5 every page, every form opened: no email without its Confirm email${unconfirmed.length ? ` (${unconfirmed.join('; ')})` : ''}`);
  }
  await context.close();
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
console.log(`\ntidy — ${passed} checks passed: the choosers on Settings only, Garage View's name everywhere, lists of 312 paged and printed and downloaded whole, no Download or Print on an empty list, Confirm email, Home's garages; both languages.${SCREENS ? ` Screenshots in ${SCREENS}.` : ''}`);
