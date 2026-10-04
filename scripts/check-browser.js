#!/usr/bin/env node
/* global document, window, localStorage, sessionStorage, MutationObserver, Node, getComputedStyle */
// The built site, in a real browser, signed in against the stand-in platform
// in test/stub-platform.js.
//
// Serves dist/ (run `npm run build` first) with /api sent to the stand-in,
// opens it in headless Chromium with the browser in TOKYO time while the
// garages are in American zones, and walks it as an owner would: the sign-in
// screen, a wrong password, signing in, picking a garage, Home, both lists
// and their print view, every page from the side navigation in both
// languages, day/night/auto, Quick Find, every failure the screens can meet,
// sign-out, a 401 from a read, the next owner signing in, every other
// answer sign-in can give, in both languages, and the platform stopped
// behind the development proxy. Then the language: English on a first
// visit whatever the browser asks for, kept on the owner's profile across
// browsers, a choice made on the sign-in screen kept, and a save that fails
// said in one plain sentence. Every field's description is checked visible
// under its name, on screen and on the print view. The page policy
// in index.html is enforced throughout.
//
// Then it requires that every request went to the site's own origin and
// carried no credential in its address, and that the page policy was never
// broken.
//
//   node scripts/check-browser.js                 the check
//   node scripts/check-browser.js --screens DIR   ...and save the screenshots

import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer as listen } from 'node:net';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { PAGES } from '../src/pages.js';
import { DICTIONARIES } from '../src/i18n/index.js';
import { THEME_KEY } from '../src/theme.js';
import { LANGUAGE_KEY } from '../src/i18n/index.js';
import { A_TEXT, startStub } from '../test/stub-platform.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const screensAt = process.argv.indexOf('--screens');
const SCREENS = screensAt > 0 ? process.argv[screensAt + 1] : null;
const EN = DICTIONARIES.en;
const ES = DICTIONARIES.es;
const BROWSER_ZONE = 'Asia/Tokyo';

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
const server = await preview({
  root: ROOT,
  logLevel: 'silent',
  preview: { port: 4317, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } },
});
const base = server.resolvedUrls.local[0];
const origin = new URL(base).origin;
// The site's own origins: this one, and the one with the platform stopped.
const origins = new Set([origin]);
let stopped = null;
stub.allowOrigin(origin);
const browser = await chromium.launch();
const requests = [];
const policyBroken = [];

const builtPage = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');
check(/http-equiv="Content-Security-Policy"/.test(builtPage), 'the built page carries its page policy');

async function open({ locale = 'en-US', colorScheme = 'light', at = base } = {}) {
  const context = await browser.newContext({ locale, colorScheme, timezoneId: BROWSER_ZONE, viewport: { width: 1360, height: 860 } });
  context.on('request', (r) => requests.push(r.url()));
  context.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) policyBroken.push(m.text());
  });
  // Every piece of text ever put on the page, from the first moment, so a
  // frame that showed the last owner's data for an instant is still seen.
  await context.addInitScript(() => {
    window.__seen = [];
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') window.__seen.push(r.target.data);
        for (const n of r.addedNodes ?? []) window.__seen.push(n.nodeType === Node.TEXT_NODE ? n.data : n.textContent);
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    if (/Content Security Policy/i.test(e.message)) policyBroken.push(e.message);
  });
  await page.goto(at);
  await page.waitForSelector('.page-title');
  return { context, page };
}

// The page redraws after a click, a key or a change of the computer's
// setting, not during it. Wait up to five seconds for the expected state;
// a state that never arrives is a failure, never a pass.
const settles = (page, fn, arg) =>
  page.waitForFunction(fn, arg, { timeout: 5000 }).then(() => true, () => false);
const showsHeading = (page, text) =>
  settles(page, (t) => document.querySelector('.page-title')?.textContent === t, text);
const showsLook = (page, value) =>
  settles(page, (v) => document.documentElement.dataset.theme === v, value);
const selects = (page, id) =>
  settles(page, (i) => document.querySelector('.find-option[aria-selected="true"]')?.dataset.id === i, id);
// innerText is what is on screen, after text-transform: compared without case.
const showsText = (page, text) =>
  settles(page, (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), text);
const bodyText = (page) => page.evaluate(() => document.body.innerText);

async function signIn(page, who, { password = who.password } = {}) {
  await page.fill('input[name="email"]', who.email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

/** In the garage's own zone, worked out here, not by the screens' code. */
const inZone = (iso, timeZone, language, withDay = true) =>
  new Intl.DateTimeFormat(language === 'es' ? 'es-US' : 'en-US', {
    timeZone,
    ...(withDay ? { month: 'short', day: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

/** "Oct 3, 2026, 9:04 AM", as a printed page says it, in a zone. Spaces made plain. */
const printedIn = (when, timeZone) =>
  plain(new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(when));
const plain = (text) => text.replace(/[\s\u202f\u00a0]+/g, ' ');

/**
 * The print view of the list on screen: no frame, black on white, the
 * garage's name, and the time it was printed in the GARAGE'S zone, never the
 * browser's. The minute may turn while it prints: either side of it will do.
 */
async function checkPrint(page, list, garage) {
  await page.emulateMedia({ media: 'print' });
  const from = new Date();
  await page.click('[data-action="print"]').catch(() => {});
  const printed = await page.evaluate(() => ({
    frame: [...document.querySelectorAll('.sidebar, .topbar')].some((e) => getComputedStyle(e).display !== 'none'),
    head: getComputedStyle(document.querySelector('.print-head')).display !== 'none',
    text: document.querySelector('.print-head')?.innerText ?? '',
    ink: getComputedStyle(document.body).color,
  }));
  const to = new Date();
  const text = plain(printed.text);
  const garageTimes = [...new Set([printedIn(from, garage.timezone), printedIn(to, garage.timezone)])];
  const browserTimes = [...new Set([printedIn(from, BROWSER_ZONE), printedIn(to, BROWSER_ZONE)])];
  check(!printed.frame, `print (${list}): no frame`);
  check(printed.head && printed.text.includes(garage.name), `print (${list}): the garage name`);
  check(
    garageTimes.some((t) => text.includes(t)),
    `print (${list}): the time it was printed is garage time, ${garageTimes.join(' or ')} (the print head says "${text}")`,
  );
  check(
    !browserTimes.some((t) => text.includes(t)),
    `print (${list}): the time it was printed is not browser time, ${browserTimes.join(' or ')} (Tokyo)`,
  );
  check(printed.ink === 'rgb(0, 0, 0)', `print (${list}): black text (${printed.ink})`);
  await checkDescribed(page, `print (${list})`, 'en', list === 'Cars inside' ? 5 : 4);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, `print-${list.toLowerCase().replace(/ /g, '-')}.png`), fullPage: true });
  await page.emulateMedia({ media: 'screen' });
}

/** An address on this computer that nothing is listening on. */
async function nobodyThere() {
  const s = listen();
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  const { port } = s.address();
  await new Promise((resolve) => s.close(resolve));
  return `http://127.0.0.1:${port}`;
}

// What a raw failure looks like on screen: a code, a status number, a brace,
// or the browser's own words for a broken answer.
const RAW = [
  [/[{}]/, 'a brace'],
  [/\b[1-5]\d\d\b/, 'a status number'],
  [/\b[a-z]+_[a-z_]+\b/, 'a code'],
  [/JSON|Unexpected (token|end)|Failed to fetch|TypeError|NetworkError|undefined|null|\[object/i, "the browser's own error words"],
];
function rawIn(text) {
  return RAW.filter(([re]) => re.test(text)).map(([re, what]) => `${what} ("${text.match(re)[0]}")`);
}

const storageKeys = (page) =>
  page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
const onlyTheTwoKeys = ({ local, session }) =>
  session.length === 0 && local.every((k) => k === THEME_KEY || k === LANGUAGE_KEY);

const aTextIn = (text) => A_TEXT.filter((s) => text.includes(s));
const LANES_TITLE = EN['page.lanes.title'];

/** Wait, in this process, for the stand-in to hold what a check expects: up to five seconds. */
async function until(fn) {
  for (let i = 0; i < 50; i += 1) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/**
 * Every field on screen has its description directly under its name: shown
 * (not hidden, not empty, not behind a pointer), in the language on screen,
 * word for word from the dictionary. `expected` is how many fields the page
 * has; every list column and form field on it must be one of them.
 */
async function checkDescribed(page, where, language, expected) {
  const words = language === 'es' ? ES : EN;
  const found = await page.evaluate(() => {
    const shown = (e) => {
      const s = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && r.width > 0 && r.height > 0;
    };
    return {
      fields: [...document.querySelectorAll('.field-about')].map((about) => {
        const name = about.previousElementSibling;
        const n = name?.getBoundingClientRect();
        const a = about.getBoundingClientRect();
        return {
          key: about.dataset.about,
          text: about.textContent.trim(),
          name: name?.classList.contains('field-name') ? name.textContent.trim() : null,
          shown: shown(about) && Boolean(name) && shown(name),
          under: Boolean(n) && a.top >= n.bottom - 1 && a.left < n.right && n.left < a.right,
        };
      }),
      // textContent, not innerText: a column's name is drawn in capitals, and the check names it as written.
      bare: [...document.querySelectorAll('th, label')].filter((e) => !e.querySelector('.field-about')).map((e) => e.textContent.trim()),
    };
  });
  const wrong = [];
  for (const f of found.fields) {
    const want = words[`${f.key}.about`];
    if (!f.shown) wrong.push(`"${f.name ?? f.key}": its description is not shown`);
    else if (!f.under) wrong.push(`"${f.name}": its description is not under its name`);
    if (f.text !== want) wrong.push(`"${f.name ?? f.key}": says "${f.text}", not "${want}"`);
  }
  for (const b of found.bare) wrong.push(`"${b}": no description under it`);
  if (found.fields.length !== expected) wrong.push(`${found.fields.length} described fields, not ${expected}`);
  check(wrong.length === 0, `descriptions, ${where} (${language}): every field described under its name${wrong.length ? `; ${wrong.join('; ')}` : ` (${found.fields.length})`}`);
}

try {
  // ── Signed out: the sign-in screen ───────────────────────────────────────
  const { context, page } = await open();
  check(await showsHeading(page, EN['signIn.title']), 'signed out, the sign-in screen is shown');
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
  });
  check(fonts.includes('DM Sans'), `the text font is loaded from the site itself (loaded: ${fonts.join(', ') || 'none'})`);
  check(fonts.includes('DM Serif Display'), 'the title font is loaded from the site itself');
  check(fonts.includes('JetBrains Mono'), 'the figures and labels font is loaded from the site itself');
  check((await page.getAttribute('html', 'lang')) === 'en', 'first visit from an English browser is in English');
  await checkDescribed(page, 'sign-in', 'en', 2);
  await page.click('[data-control="language"] [data-value="es"]');
  await showsHeading(page, ES['signIn.title']);
  await checkDescribed(page, 'sign-in', 'es', 2);
  await page.click('[data-control="language"] [data-value="en"]');
  await showsHeading(page, EN['signIn.title']);
  if (SCREENS) {
    mkdirSync(SCREENS, { recursive: true });
    await page.screenshot({ path: join(SCREENS, 'sign-in-english.png') });
    await page.click('[data-control="language"] [data-value="es"]');
    await showsHeading(page, ES['signIn.title']);
    await page.screenshot({ path: join(SCREENS, 'sign-in-spanish.png') });
    await page.click('[data-control="language"] [data-value="en"]');
    await showsHeading(page, EN['signIn.title']);
  }

  // ── A wrong password ────────────────────────────────────────────────────
  await signIn(page, A, { password: 'not-the-password' });
  check(await showsText(page, EN['problem.refused']), 'a wrong password: the one refusal message');
  check((await page.inputValue('input[name="password"]')) === '', 'the password field is empty after the attempt');
  check(rawIn(await bodyText(page)).length === 0, `refusal: nothing raw on screen ${rawIn(await bodyText(page)).join(', ')}`);
  await signIn(page, { email: 'nobody@example.com', password: 'whatever-it-is' });
  check(await showsText(page, EN['problem.refused']), 'an unknown email: the same refusal message');

  // ── Signing in, picking a garage, Home ──────────────────────────────────
  await signIn(page, A);
  check(await showsText(page, EN['garage.choose']), 'an owner with two garages is asked which one');
  check((await page.inputValue('input[name="password"]').catch(() => '')) === '', 'and the password is gone with the form');
  await page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);
  check(await showsText(page, EN['inside.countMany'].replace('{count}', '2')), 'Home: the cars-inside count the platform returned (2)');
  const home = await bodyText(page);
  check(home.includes(EN['inside.unconfirmedOne']), 'Home: the one it could not confirm, in words');
  check(home.includes(EN['lane.workingOne']), 'Home: "Working, heard from a minute ago"');
  const quiet = EN['lane.quiet'].replace('{time}', inZone('2026-03-10T19:40:00Z', 'America/New_York', 'en'));
  check(home.includes(quiet), `Home: "${quiet}", in the garage's time`);
  check(home.includes(EN['lane.noComputer']), 'Home: a lane with no lane computer says so');
  const homeLower = home.toLowerCase();
  check(homeLower.includes(EN['lane.in'].toLowerCase()) && homeLower.includes(EN['lane.out'].toLowerCase()), 'Home: each lane is in or out');
  const kinds = ['garage pass', 'monthly', 'transient'];
  check(kinds.every((k) => !home.toLowerCase().includes(k)), 'Home: no breakdown by kind of customer, since the platform returns none');
  await checkDescribed(page, 'Home', 'en', 2);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'home-english-day.png') });

  // ── Garage time, not browser time ───────────────────────────────────────
  await page.click('.nav-item[href="#/cars-inside"]');
  await showsText(page, 'HRB4410');
  const inside = await bodyText(page);
  const garageClock = inZone('2026-03-10T15:05:00Z', 'America/New_York', 'en', false);
  const garageDay = inZone('2026-03-10T15:05:00Z', 'America/New_York', 'en');
  const tokyoClock = inZone('2026-03-10T15:05:00Z', BROWSER_ZONE, 'en', false);
  check(inside.includes(garageDay) || inside.includes(garageClock), `Cars inside: came in at ${garageDay}, garage time`);
  check(!inside.includes(tokyoClock), `garage time, not browser time: ${tokyoClock} (Tokyo) is not shown`);
  check(inside.includes('HT-0042') && inside.includes('HRB7731'), 'Cars inside: every open stay is listed');
  await checkDescribed(page, 'Cars inside', 'en', 5);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'cars-inside-english.png'), fullPage: true });
  await checkPrint(page, 'Cars inside', A.garages[0]);

  await page.click('.nav-item[href="#/lanes"]');
  await showsText(page, 'Harbor exit computer');
  const lanes = await bodyText(page);
  check(lanes.includes(quiet), `${LANES_TITLE}: the quiet lane computer, in garage time`);
  const cancelled = EN['device.off'].replace('{time}', inZone('2026-01-05T13:55:00Z', 'America/New_York', 'en'));
  check(lanes.includes(cancelled), `${LANES_TITLE}: "${cancelled}", a lane computer whose access was cancelled, in garage time`);
  check(lanes.includes(EN['lanes.readerYes']) && lanes.includes(EN['lanes.readerNo']), `${LANES_TITLE}: which lanes have a card reader`);
  await checkDescribed(page, LANES_TITLE, 'en', 4);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'lanes-english.png'), fullPage: true });
  await checkPrint(page, LANES_TITLE, A.garages[0]);

  // ── Every page from the navigation, English ─────────────────────────────
  for (const p of PAGES) {
    await page.click(`.nav-item[href="#${p.path}"]`);
    const title = EN[`page.${p.id}.title`];
    check(await showsHeading(page, title), `the navigation reaches "${title}"`);
    const purpose = await page.textContent('.page-purpose');
    check(purpose === EN[`page.${p.id}.purpose`], `"${title}" says what it is for`);
  }

  // ── Day / night / auto ───────────────────────────────────────────────────
  await page.click('.nav-item[href="#/"]');
  check(await showsLook(page, 'day'), 'auto on a light computer is day');
  await page.click('[data-control="theme"] [data-value="night"]');
  check(await showsLook(page, 'night'), 'choosing night turns it to night');
  if (SCREENS) {
    await showsText(page, EN['home.inside']);
    await page.screenshot({ path: join(SCREENS, 'home-english-night.png') });
  }
  await page.reload();
  await page.waitForSelector('.page-title');
  check(await showsLook(page, 'night'), 'night is still night after a reload');
  check(await showsText(page, EN['garage.choose']), 'after a reload the owner is still signed in');
  await page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);
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
  await page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);
  await page.click('[data-control="theme"] [data-value="day"]');
  await page.emulateMedia({ colorScheme: 'dark' });
  check(await showsLook(page, 'day'), 'day stays day when the computer turns dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // ── The garage can be changed from the frame ────────────────────────────
  await page.click('[data-action="change-garage"]');
  check(await showsText(page, EN['garage.choose']), 'the garage can be changed from the frame');
  await page.click(`.garage-choice[data-garage="${A.garages[1].id}"]`);
  check(await settles(page, (n) => document.querySelector('.garage-current')?.textContent === n, A.garages[1].name), 'and the frame shows the one chosen');
  await page.click('[data-action="change-garage"]');
  await page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);

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
  check(await showsHeading(page, EN['page.taxes.title']), 'Enter goes to Taxes and fees');
  check(!(await page.isVisible('.find-dialog')), 'and closes Quick Find');

  await page.click('.find-pill');
  check(await page.isVisible('.find-dialog'), 'a click on the pill opens it');
  check(await selects(page, PAGES[0].id), 'with nothing typed, the first page is picked');
  await page.keyboard.press('ArrowDown');
  check(await selects(page, PAGES[1].id), 'the down arrow moves to the next result');
  await page.keyboard.press('ArrowUp');
  check(await selects(page, PAGES[0].id), 'the up arrow moves back');
  await page.keyboard.press('Escape');
  check(!(await page.isVisible('.find-dialog')), 'Escape closes it');
  check(await showsHeading(page, EN['page.taxes.title']), 'and Escape goes nowhere');
  check(await page.evaluate(() => document.activeElement?.classList.contains('find-pill')), 'focus returns to the pill');

  await page.keyboard.press('Control+K');
  await page.keyboard.type('dark');
  await page.keyboard.press('Enter');
  check(await showsLook(page, 'night'), 'Quick Find reaches a setting too: "dark" turns it to night');
  await page.click('[data-control="theme"] [data-value="day"]');

  // ── Spanish ──────────────────────────────────────────────────────────────
  await page.click('.nav-item[href="#/"]');
  await page.click('[data-control="language"] [data-value="es"]');
  check(await showsHeading(page, ES['page.home.title']), 'choosing Español turns the page to Spanish');
  check((await page.getAttribute('html', 'lang')) === 'es', 'and tells the browser so');
  check(await showsText(page, ES['inside.countMany'].replace('{count}', '2')), 'Home in Spanish: the count');
  const homeEs = (await bodyText(page)).toLowerCase();
  check(['pase de garaje', 'mensual', 'visitante'].every((k) => !homeEs.includes(k)), 'Home in Spanish: no breakdown by kind of customer');
  check(homeEs.includes(ES['lane.quiet'].replace('{time}', inZone('2026-03-10T19:40:00Z', 'America/New_York', 'es')).toLowerCase()), 'Home in Spanish: the quiet lane, in garage time');
  check(await until(() => A.language === 'es'), `choosing Español while signed in keeps it on the owner's profile (the stand-in holds "${A.language}")`);
  await checkDescribed(page, 'Home', 'es', 2);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'home-spanish.png') });
  await page.click('.nav-item[href="#/lanes"]');
  await showsText(page, 'Harbor exit computer');
  await checkDescribed(page, ES['page.lanes.title'], 'es', 4);
  check((await bodyText(page)).includes(ES['device.off'].replace('{time}', inZone('2026-01-05T13:55:00Z', 'America/New_York', 'es'))), 'Carriles y equipos: the cancelled computer, in Spanish');
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'lanes-spanish.png'), fullPage: true });
  await page.click('.nav-item[href="#/cars-inside"]');
  await showsText(page, 'HRB4410');
  await checkDescribed(page, ES['page.inside.title'], 'es', 5);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'cars-inside-spanish.png'), fullPage: true });
  await page.click('.nav-item[href="#/"]');
  await page.reload();
  await page.waitForSelector('.page-title');
  await page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);
  check(await showsHeading(page, ES['page.home.title']), 'Spanish is still Spanish after a reload');
  for (const p of PAGES) {
    await page.click(`.nav-item[href="#${p.path}"]`);
    const title = ES[`page.${p.id}.title`];
    check(await showsHeading(page, title), `la navegación llega a "${title}"`);
  }
  await page.keyboard.press('Control+K');
  await page.keyboard.type('impuestos');
  check(await selects(page, 'taxes'), '"impuestos" picks Impuestos y cargos');
  await page.keyboard.press('Enter');
  check(await showsHeading(page, ES['page.taxes.title']), 'and Enter goes there');
  // A Quick Find that found nothing stays open over the page; close it, so one
  // failure above does not stop the walk before the checks below are run.
  if (await page.isVisible('.find-dialog')) await page.keyboard.press('Escape');
  await page.click('[data-control="language"] [data-value="en"]');
  // The save of English lands before a failure is asked of the stand-in, or the save would meet it.
  check(await until(() => A.language === 'en'), 'and English chosen again is kept on the profile');

  // ── Nothing raw reaches the screen ──────────────────────────────────────
  // Each failure is met by a read: the Cars inside page asks again on arrival.
  const failuresMet = [
    ['nonJson', 'a body that is not JSON', 'problem.unexpected'],
    ['gateway', 'a gateway answering 502 with a page of its own', 'problem.unreachable'],
    ['unknownCode', 'a code the screens do not know', 'problem.unexpected'],
    ['serverError', 'a 500', 'problem.unexpected'],
    ['drop', 'a dropped connection', 'problem.unreachable'],
  ];
  for (const [kind, what, key] of failuresMet) {
    await page.click('.nav-item[href="#/"]');
    await showsText(page, EN['inside.countMany'].replace('{count}', '2'));
    await showsText(page, 'North Exit');
    if (kind === 'drop') {
      await page.route('**/api/v1/garages/*/sessions/open', (route) => route.abort('connectionreset'), { times: 1 });
    } else stub.failNext(kind);
    await page.click('.nav-item[href="#/cars-inside"]');
    const shown = await showsText(page, EN[key]);
    const raw = rawIn(await bodyText(page));
    check(shown && raw.length === 0, `${what}: the screen says "${EN[key]}"${raw.length ? `; RAW on screen: ${raw.join(', ')}` : ''}`);
    await page.click('.problem-note .link-button');
    check(await showsText(page, 'HRB4410'), `${what}: "${EN.retry}" brings the list back`);
  }

  // ── A session that ended ────────────────────────────────────────────────
  stub.failNext('ended');
  await page.click('.nav-item[href="#/lanes"]');
  check(await showsHeading(page, EN['signIn.title']), 'session ended: the sign-in screen');
  check(await showsText(page, EN['problem.ended']), 'session ended: the plain message');
  let text = await bodyText(page);
  check(rawIn(text).length === 0, `session ended: nothing raw on screen ${rawIn(text).join(', ')}`);
  check(aTextIn(text).length === 0, `session ended: nothing of owner A left on the page ${aTextIn(text).join(', ')}`);
  check(onlyTheTwoKeys(await storageKeys(page)), `session ended: browser storage holds only the two keys (${JSON.stringify(await storageKeys(page))})`);

  // ── Sign-out clears everything ──────────────────────────────────────────
  await signIn(page, A);
  await page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);
  await showsText(page, 'North Exit');
  await page.click('[data-action="sign-out"]');
  check(await showsHeading(page, EN['signIn.title']), 'sign-out: the sign-in screen');
  text = await page.evaluate(() => document.documentElement.innerText + document.documentElement.innerHTML);
  check(aTextIn(text).length === 0, `sign-out: nothing of owner A left in the page ${aTextIn(text).join(', ')}`);
  check(onlyTheTwoKeys(await storageKeys(page)), 'sign-out: browser storage holds only the two keys');
  check(!(await bodyText(page)).includes(EN['problem.ended']), 'sign-out: no "signed out" warning for a sign-out the owner chose');
  const meAfter = await page.evaluate(() => fetch('/api/v1/auth/me', { credentials: 'same-origin' }).then((r) => r.status));
  check(meAfter === 401, `sign-out: the platform no longer knows the session (${meAfter === 401 ? 'turned away' : 'still accepted'})`);

  // ── Any 401 from a read clears everything ──────────────────────────────
  await signIn(page, A);
  await page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);
  await showsText(page, 'North Exit');
  stub.failNext('plain401');
  await page.click('.nav-item[href="#/cars-inside"]');
  check(await showsHeading(page, EN['signIn.title']), 'a 401 from a read: the sign-in screen');
  check(await showsText(page, EN['problem.ended']), 'a 401 from a read: the signed-out message');
  text = await page.evaluate(() => document.documentElement.innerText + document.documentElement.innerHTML);
  check(aTextIn(text).length === 0, `a 401 from a read: nothing of owner A left in the page ${aTextIn(text).join(', ')}`);
  check(onlyTheTwoKeys(await storageKeys(page)), 'a 401 from a read: browser storage holds only the two keys');

  // ── The next owner sees nothing of the last, not for one frame ──────────
  await page.evaluate(() => {
    window.__seen.length = 0;
  });
  await signIn(page, B);
  check(await showsText(page, B.garages[0].name), "owner B signs in and sees B's garage");
  check(await showsText(page, EN['inside.empty']), "and B's own figures, loaded");
  const seen = await page.evaluate(() => window.__seen.join('\n'));
  check(aTextIn(seen).length === 0, `owner B: nothing of owner A was ever drawn ${aTextIn(seen).join(', ')}`);
  check(!(await page.isVisible('[data-action="change-garage"]')), 'an owner with one garage goes straight in');
  await context.close();

  // ── English by default: the browser's own language decides nothing ──────
  const spanish = await open({ locale: 'es-US' });
  check(await showsHeading(spanish.page, EN['signIn.title']), 'English by default: a first visit from a browser set to Spanish is in English');
  check((await spanish.page.getAttribute('html', 'lang')) === 'en', 'English by default: and tells the browser so');
  await spanish.context.close();
  const french = await open({ locale: 'fr-FR' });
  check(await showsHeading(french.page, EN['signIn.title']), 'English by default: a first visit from any other browser is in English');
  await french.context.close();

  // ── Kept on the profile: Spanish follows the owner to another browser ──
  // Signed-in words that differ between the languages: none may be drawn,
  // not for one frame, before the Spanish ones.
  const englishSignedIn = [EN['garage.choose'], EN.signOut, ...PAGES.map((p) => EN[`page.${p.id}.title`])].filter(
    (w) => !Object.values(ES).includes(w),
  );
  A.language = 'en';
  const first = await open();
  await signIn(first.page, A);
  await first.page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);
  await first.page.click('[data-control="language"] [data-value="es"]');
  await showsHeading(first.page, ES['page.home.title']);
  check(await until(() => A.language === 'es'), `kept on the profile: Español chosen while signed in is saved to the profile (the stand-in holds "${A.language}")`);
  await first.page.click('[data-action="sign-out"]');
  await showsHeading(first.page, ES['signIn.title']);
  await first.context.close();
  const second = await open();
  check(await showsHeading(second.page, EN['signIn.title']), 'kept on the profile: a different, fresh browser opens in English before anyone signs in');
  await second.page.evaluate(() => {
    window.__seen.length = 0;
  });
  await signIn(second.page, A);
  check(await showsText(second.page, ES['garage.choose']), 'kept on the profile: signed in on a different browser, the owner sees Spanish');
  check((await second.page.getAttribute('html', 'lang')) === 'es', 'kept on the profile: and the page says it is Spanish');
  const seenOnSecond = await second.page.evaluate(() => window.__seen.join('\n'));
  const englishFrames = englishSignedIn.filter((w) => seenOnSecond.includes(w));
  check(englishFrames.length === 0, `kept on the profile: no English frame before the Spanish one${englishFrames.length ? ` (drawn: ${englishFrames.join(', ')})` : ''}`);
  check((await second.page.evaluate((k) => localStorage.getItem(k), LANGUAGE_KEY)) === 'es', "kept on the profile: this computer's copy now says Spanish too");
  await second.page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);
  await second.page.click('[data-action="sign-out"]');
  check(await showsHeading(second.page, ES['signIn.title']), 'kept on the profile: so the next sign-in screen on this computer is in Spanish');
  await second.context.close();
  A.language = 'en';

  // ── Chosen at sign-in is kept ───────────────────────────────────────────
  B.language = 'en';
  const atSignIn = await open();
  await atSignIn.page.click('[data-control="language"] [data-value="es"]');
  await showsHeading(atSignIn.page, ES['signIn.title']);
  await signIn(atSignIn.page, B);
  check(await showsHeading(atSignIn.page, ES['page.home.title']), 'chosen at sign-in: Español picked on the sign-in screen stays on after signing in');
  check(await until(() => B.language === 'es'), `chosen at sign-in: and is saved to the profile, which said English (the stand-in holds "${B.language}")`);
  await atSignIn.context.close();
  // Not picked on the sign-in screen: the profile's language is taken, and this computer's copy follows it.
  const adopted = await open();
  await signIn(adopted.page, B);
  check(await showsHeading(adopted.page, ES['page.home.title']), "chosen at sign-in: nothing picked there, the profile's language is shown");
  check((await adopted.page.evaluate((k) => localStorage.getItem(k), LANGUAGE_KEY)) === 'es', "chosen at sign-in: and this computer's copy is set to match");
  await adopted.context.close();
  B.language = 'en';

  // ── A save that fails says so, in plain words ──────────────────────────
  A.language = 'en';
  const failing = await open();
  await signIn(failing.page, A);
  await failing.page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);
  await showsText(failing.page, 'North Exit');
  const saveFailures = [
    ['the platform stopped', 'es', () => failing.page.route('**/api/v1/auth/language', (r) => r.abort('connectionrefused'), { times: 1 })],
    ['a gateway answering for it', 'en', () => stub.failNext('gateway')],
    ['a 500', 'es', () => stub.failNext('serverError')],
  ];
  for (const [what, next, fail] of saveFailures) {
    const words = next === 'es' ? ES : EN;
    await fail();
    await failing.page.click(`[data-control="language"] [data-value="${next}"]`);
    const said = await showsText(failing.page, words['language.notKept']);
    const raw = rawIn(await bodyText(failing.page));
    check(
      said && raw.length === 0 && (await showsHeading(failing.page, words['page.home.title'])),
      `a failed save, ${what}: the screen changed language and says "${words['language.notKept']}"${raw.length ? `; RAW on screen: ${raw.join(', ')}` : ''}`,
    );
    check(A.language === 'en', `a failed save, ${what}: the profile was not changed (the stand-in holds "${A.language}")`);
  }
  await failing.page.click('[data-control="language"] [data-value="en"]');
  check(await settles(failing.page, () => !document.querySelector('[data-notice="language-not-kept"]')), 'a save that works takes the sentence away');
  check(await until(() => A.language === 'en'), 'and that save reached the profile');
  stub.failNext('ended');
  await failing.page.click('[data-control="language"] [data-value="es"]');
  check(await showsText(failing.page, ES['problem.ended']), 'a 401 during the save: the signed-out screen, in plain words');
  const afterEnded = await bodyText(failing.page);
  check(rawIn(afterEnded).length === 0 && aTextIn(afterEnded).length === 0, `a 401 during the save: nothing raw and nothing of the owner left ${[...rawIn(afterEnded), ...aTextIn(afterEnded)].join(', ')}`);
  check(onlyTheTwoKeys(await storageKeys(failing.page)), 'a 401 during the save: browser storage holds only the two keys');
  await failing.context.close();
  A.language = 'en';
  const dark = await open({ colorScheme: 'dark' });
  check(await showsLook(dark.page, 'night'), 'first visit on a dark computer is night');
  await dark.context.close();

  // ── Every other answer the sign-in route gives, each in its own words ───
  // As the platform gives them (test/platform-shapes.json): the stand-in is
  // asked for the ones only a platform set up for them gives; an empty
  // password is sent as typed. Last, in a window of its own, so the waits
  // here never move the clock the walk above reads its "a minute ago" by.
  const answering = await open();
  const signInAnswers = [
    ['tooMany', 'too many tries from here'],
    ['busy', 'sign-in busy'],
    ['notSetUp', 'sign-in not set up'],
    ['wrongPlace', 'a page at another address'],
    ['incomplete', 'the password left empty'],
  ];
  for (const [language, words] of [['en', EN], ['es', ES]]) {
    await answering.page.click(`[data-control="language"] [data-value="${language}"]`);
    await showsHeading(answering.page, words['signIn.title']);
    for (const [kind, what] of signInAnswers) {
      if (kind === 'incomplete') await signIn(answering.page, A, { password: '' });
      else {
        stub.failSignIn(kind);
        await signIn(answering.page, A);
      }
      const shown = await showsText(answering.page, words[`problem.${kind}`]);
      const raw = rawIn(await bodyText(answering.page));
      check(shown && raw.length === 0, `sign-in, ${what} (${language}): the screen says "${words[`problem.${kind}`]}"${raw.length ? `; RAW on screen: ${raw.join(', ')}` : ''}`);
    }
  }
  await answering.page.click('[data-control="language"] [data-value="en"]');
  await answering.context.close();

  // ── The platform stopped behind the development proxy ──────────────────
  // This repository's own vite.config.js, its proxy sent to an address
  // nothing answers: the platform cannot be reached, in its own words.
  process.env.OPENPARKING_PLATFORM = await nobodyThere();
  stopped = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4318, strictPort: false, host: '127.0.0.1' } });
  const stoppedBase = stopped.resolvedUrls.local[0];
  origins.add(new URL(stoppedBase).origin);
  const down = await open({ at: stoppedBase });
  for (const [language, words] of [['en', EN], ['es', ES]]) {
    await down.page.click(`[data-control="language"] [data-value="${language}"]`);
    await showsHeading(down.page, words['signIn.title']);
    await signIn(down.page, A);
    const shown = await showsText(down.page, words['problem.unreachable']);
    const raw = rawIn(await bodyText(down.page));
    check(
      shown && raw.length === 0,
      `sign-in, the platform stopped behind the development proxy (${language}): the screen says "${words['problem.unreachable']}"` +
        `${shown ? '' : `; it says "${(await down.page.textContent('[role="alert"]').catch(() => '')) || 'nothing'}"`}${raw.length ? `; RAW on screen: ${raw.join(', ')}` : ''}`,
    );
  }
  await down.page.click('[data-control="language"] [data-value="en"]');
  await down.context.close();
} catch (error) {
  failures.push(`the walk stopped: ${error.message.split('\n')[0]}`);
  console.error(error);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  if (stopped) await new Promise((resolve) => stopped.httpServer.close(resolve));
  await stub.close();
}

// ── The page policy held ───────────────────────────────────────────────────
check(policyBroken.length === 0, `the page policy was never broken (${policyBroken.length} violations)`);
for (const v of [...new Set(policyBroken)]) console.error(`  policy violation: ${v.slice(0, 200)}`);

// ── No request leaves the page, and none carries a credential in its address
const outside = requests.filter((u) => !origins.has(new URL(u).origin));
const secrets = [A.password, B.password, A.email, B.email, encodeURIComponent(A.email), encodeURIComponent(B.email), ...stub.issued];
const carrying = requests.filter((u) => secrets.some((s) => u.includes(s)) || (new URL(u).pathname.startsWith('/api/') && new URL(u).search !== ''));
const apiCount = requests.filter((u) => new URL(u).pathname.startsWith('/api/')).length;
check(requests.length > 0 && apiCount > 0, `requests were recorded (${requests.length}, ${apiCount} to the platform)`);
check(outside.length === 0, `every request went to the site's own origin (${requests.length - outside.length} of ${requests.length})`);
check(carrying.length === 0, `no request carried a credential in its address (${requests.length - carrying.length} of ${requests.length} clean)`);
for (const u of [...new Set(outside)]) console.error(`  went outside: ${u}`);
for (const u of [...new Set(carrying)]) console.error(`  credential in an address: ${u.replace(/[?].*/, '?…')}`);

if (failures.length) {
  console.error(`\n${failures.length} failed, ${passed} passed.`);
  process.exit(1);
}
console.log(
  `\nbrowser — ${passed} checks passed; ${requests.length} requests, all to ${[...origins].join(' and ')}, ${apiCount} of them to the platform; ` +
    `browser in ${BROWSER_ZONE}; 0 page policy violations.${SCREENS ? ` Screenshots in ${SCREENS}.` : ''}`,
);
