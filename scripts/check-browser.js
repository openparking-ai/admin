#!/usr/bin/env node
/* global document -- the functions passed to page.evaluate run in the browser. */
// The built site, in a real browser.
//
// Serves dist/ (run `npm run build` first), opens it in headless Chromium with
// every request recorded, and walks it as the owner would: every page from the
// side navigation in both languages, day/night/auto including a reload and the
// computer's setting changing live, the language choice and the first visit,
// and Quick Find by keyboard. Then it requires that EVERY request went to the
// site's own origin, and reports how many there were.
//
//   node scripts/check-browser.js                 the check
//   node scripts/check-browser.js --screens DIR   ...and save the screenshots

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { PAGES } from '../src/pages.js';
import { DICTIONARIES } from '../src/i18n/index.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const screensAt = process.argv.indexOf('--screens');
const SCREENS = screensAt > 0 ? process.argv[screensAt + 1] : null;

const failures = [];
let passed = 0;
const check = (ok, what) => {
  if (ok) passed += 1;
  else failures.push(what);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};

const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4317, strictPort: false, host: '127.0.0.1' } });
const base = server.resolvedUrls.local[0];
const origin = new URL(base).origin;
const browser = await chromium.launch();
const requests = [];

async function open({ locale = 'en-US', colorScheme = 'light' } = {}) {
  const context = await browser.newContext({ locale, colorScheme, viewport: { width: 1360, height: 860 } });
  context.on('request', (r) => requests.push(r.url()));
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForSelector('.page-title');
  return { context, page };
}

// The page redraws after a click, a key or a change of the computer's
// setting, not during it. Wait up to three seconds for the expected state;
// a state that never arrives is a failure, never a pass.
const settles = (page, fn, arg) =>
  page.waitForFunction(fn, arg, { timeout: 3000 }).then(() => true, () => false);
const showsHeading = (page, text) =>
  settles(page, (t) => document.querySelector('.page-title')?.textContent === t, text);
const showsLook = (page, value) =>
  settles(page, (v) => document.documentElement.dataset.theme === v, value);
const selects = (page, id) =>
  settles(page, (i) => document.querySelector('.find-option[aria-selected="true"]')?.dataset.id === i, id);

try {
  // ── English, day, every page from the navigation ─────────────────────────
  const { context, page } = await open();
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
  });
  check(fonts.includes('DM Sans'), `the text font is loaded from the site itself (loaded: ${fonts.join(', ') || 'none'})`);
  check(fonts.includes('DM Serif Display'), 'the title font is loaded from the site itself');
  check(fonts.includes('JetBrains Mono'), 'the figures and labels font is loaded from the site itself');
  check((await page.getAttribute('html', 'lang')) === 'en', 'first visit from an English browser is in English');
  if (SCREENS) {
    mkdirSync(SCREENS, { recursive: true });
    await page.screenshot({ path: join(SCREENS, 'home-english-day.png') });
  }

  for (const p of PAGES) {
    await page.click(`.nav-item[href="#${p.path}"]`);
    const title = DICTIONARIES.en[`page.${p.id}.title`];
    check(await showsHeading(page, title), `the navigation reaches "${title}"`);
    const purpose = await page.textContent('.page-purpose');
    check(purpose === DICTIONARIES.en[`page.${p.id}.purpose`], `"${title}" says what it is for`);
  }

  // ── Day / night / auto ───────────────────────────────────────────────────
  await page.click('.nav-item[href="#/"]');
  check(await showsLook(page, 'day'), 'auto on a light computer is day');
  await page.click('[data-control="theme"] [data-value="night"]');
  check(await showsLook(page, 'night'), 'choosing night turns it to night');
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'home-english-night.png') });
  await page.reload();
  await page.waitForSelector('.page-title');
  check(await showsLook(page, 'night'), 'night is still night after a reload');
  await page.emulateMedia({ colorScheme: 'light' });
  check(await showsLook(page, 'night'), 'night stays night when the computer is light');
  await page.click('[data-control="theme"] [data-value="auto"]');
  check(await showsLook(page, 'day'), 'auto on a light computer is day again');
  await page.emulateMedia({ colorScheme: 'dark' });
  check(await showsLook(page, 'night'), 'auto turns to night the moment the computer turns dark, with no reload');
  await page.emulateMedia({ colorScheme: 'light' });
  check(await showsLook(page, 'day'), 'and back to day the moment it turns light');
  await page.reload();
  await page.waitForSelector('.page-title');
  check(
    (await page.getAttribute('[data-control="theme"] [data-value="auto"]', 'aria-checked')) === 'true',
    'auto is still the choice after a reload',
  );
  await page.click('[data-control="theme"] [data-value="day"]');
  await page.emulateMedia({ colorScheme: 'dark' });
  check(await showsLook(page, 'day'), 'day stays day when the computer turns dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // ── Quick Find, by keyboard ──────────────────────────────────────────────
  await page.keyboard.press('Control+K');
  check(await page.isVisible('.find-dialog'), 'Ctrl+K opens Quick Find');
  check(await page.evaluate(() => document.activeElement?.classList.contains('find-input')), 'the typing goes straight into it');
  if (SCREENS) {
    await page.keyboard.type('ra');
    await page.screenshot({ path: join(SCREENS, 'quick-find-open-english.png') });
    await page.fill('.find-input', '');
  }
  await page.keyboard.type('tax');
  check(await selects(page, 'taxes'), '"tax" picks Taxes and fees');
  await page.keyboard.press('Enter');
  check(await showsHeading(page, DICTIONARIES.en['page.taxes.title']), 'Enter goes to Taxes and fees');
  check(!(await page.isVisible('.find-dialog')), 'and closes Quick Find');

  await page.click('.find-pill');
  check(await page.isVisible('.find-dialog'), 'a click on the pill opens it');
  // Nothing typed lists everything, Home first.
  check(await selects(page, PAGES[0].id), 'with nothing typed, the first page is picked');
  await page.keyboard.press('ArrowDown');
  check(await selects(page, PAGES[1].id), 'the down arrow moves to the next result');
  await page.keyboard.press('ArrowUp');
  check(await selects(page, PAGES[0].id), 'the up arrow moves back');
  await page.keyboard.press('Escape');
  check(!(await page.isVisible('.find-dialog')), 'Escape closes it');
  check(await showsHeading(page, DICTIONARIES.en['page.taxes.title']), 'and Escape goes nowhere');
  check(await page.evaluate(() => document.activeElement?.classList.contains('find-pill')), 'focus returns to the pill');

  await page.keyboard.press('Control+K');
  await page.keyboard.type('dark');
  await page.keyboard.press('Enter');
  check(await showsLook(page, 'night'), 'Quick Find reaches a setting too: "dark" turns it to night');
  await page.click('[data-control="theme"] [data-value="day"]');

  // ── Spanish ──────────────────────────────────────────────────────────────
  await page.click('.nav-item[href="#/"]');
  await page.click('[data-control="language"] [data-value="es"]');
  check(await showsHeading(page, DICTIONARIES.es['page.home.title']), 'choosing Español turns the page to Spanish');
  check((await page.getAttribute('html', 'lang')) === 'es', 'and tells the browser so');
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'home-spanish-day.png') });
  await page.reload();
  await page.waitForSelector('.page-title');
  check(await showsHeading(page, DICTIONARIES.es['page.home.title']), 'Spanish is still Spanish after a reload');
  for (const p of PAGES) {
    await page.click(`.nav-item[href="#${p.path}"]`);
    const title = DICTIONARIES.es[`page.${p.id}.title`];
    check(await showsHeading(page, title), `la navegación llega a "${title}"`);
  }
  await page.keyboard.press('Control+K');
  await page.keyboard.type('impuestos');
  check(await selects(page, 'taxes'), '"impuestos" picks Impuestos y cargos');
  await page.keyboard.press('Enter');
  check(await showsHeading(page, DICTIONARIES.es['page.taxes.title']), 'and Enter goes there');
  await context.close();

  // ── First visit follows the browser ──────────────────────────────────────
  const spanish = await open({ locale: 'es-US' });
  check(await showsHeading(spanish.page, DICTIONARIES.es['page.home.title']), 'first visit from a Spanish browser is in Spanish');
  await spanish.context.close();
  const french = await open({ locale: 'fr-FR' });
  check(await showsHeading(french.page, DICTIONARIES.en['page.home.title']), 'first visit from any other browser is in English');
  await french.context.close();
  const dark = await open({ colorScheme: 'dark' });
  check(await showsLook(dark.page, 'night'), 'first visit on a dark computer is night');
  await dark.context.close();
} catch (error) {
  failures.push(`the walk stopped: ${error.message.split('\n')[0]}`);
  console.error(error);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

// ── No request leaves the page ─────────────────────────────────────────────
const outside = requests.filter((u) => new URL(u).origin !== origin);
check(requests.length > 0, `requests were recorded (${requests.length})`);
check(outside.length === 0, `every request went to the site's own origin (${requests.length - outside.length} of ${requests.length})`);
for (const u of [...new Set(outside)]) console.error(`  went outside: ${u}`);

if (failures.length) {
  console.error(`\n${failures.length} failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`\nbrowser — ${passed} checks passed; ${requests.length} requests, all to ${origin}.${SCREENS ? ` Screenshots in ${SCREENS}.` : ''}`);
