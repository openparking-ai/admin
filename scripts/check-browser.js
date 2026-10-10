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

// Requests to the platform sent and not yet answered, for each browser context.
const inFlight = new WeakMap();
const toPlatform = (r) => new URL(r.url()).pathname.startsWith('/api/');

/**
 * Wait, up to five seconds, until the page has no request to the platform
 * still unanswered. A failure the stand-in is told to give next then goes to
 * the request the check makes, never to one of the page's own reads still on
 * its way (U7a: Home reads every garage's line at once).
 */
async function noneInFlight(page) {
  const context = page.context();
  for (let i = 0; i < 100 && inFlight.get(context) > 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
}

async function open({ locale = 'en-US', colorScheme = 'light', at = base } = {}) {
  const context = await browser.newContext({ locale, colorScheme, timezoneId: BROWSER_ZONE, viewport: { width: 1360, height: 860 } });
  inFlight.set(context, 0);
  context.on('request', (r) => {
    requests.push(r.url());
    if (toPlatform(r)) inFlight.set(context, inFlight.get(context) + 1);
  });
  const answered = (r) => {
    if (toPlatform(r)) inFlight.set(context, inFlight.get(context) - 1);
  };
  context.on('requestfinished', answered);
  context.on('requestfailed', answered);
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
  const from = new Date();
  // Print reads the list again, then prints: clicked on screen (in the print
  // view the button is not shown), then the print view is read once it has.
  await page.click('[data-action="print"]');
  check(await settles(page, () => !document.querySelector('.list-actions[aria-busy="true"]')), `print (${list}): the Print button read the list and printed`);
  await page.emulateMedia({ media: 'print' });
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
  // The change log prints both its lists: the changes made (5 columns) and the refused attempts (6).
  // Alerts prints its people (5 columns: changing them is not printed) and who gets which alert (4).
  await checkDescribed(page, `print (${list})`, 'en', { [INSIDE_TITLE]: 5, [EN['page.changes.title']]: 11, [EN['page.alerts.title']]: 9 }[list] ?? 5);
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
/** "Lane computer" in either language: there is none, and no page may say there is (U4b). */
const LANE_COMPUTER = /lane'?s? computers?|computers? (at|of) the lane|computadoras? (de|del|en el) carril/i;

const RAW = [
  [/[{}]/, 'a brace'],
  [/\b[1-5]\d\d\b/, 'a status number'],
  [/\b[a-z]+_[a-z_]+\b/, 'a code'],
  [/JSON|Unexpected (token|end)|Failed to fetch|TypeError|NetworkError|undefined|null|\[object/i, "the browser's own error words"],
  // U4 fix 6: a sentence ends once -- never "a.m.." -- in either language. An ellipsis is not one.
  [/(?<!\.)\.\.(?!\.)/, 'a doubled full stop'],
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

/**
 * U7a: Home's garage below the list, read: its count and its lanes. The
 * garage's own line in the list says the same count, so a wait for the
 * count's words alone can end before the garage below has its lanes.
 */
const detailRead = (page, loading) =>
  settles(page, (words) => {
    const detail = document.querySelector('[data-detail]');
    return Boolean(detail?.querySelector('[data-figure="inside"]')) && !detail.querySelector('[data-section="lanes"]').textContent.includes(words);
  }, loading);
/** Every read on the page answered: nothing on it still says it is loading. */
const allRead = (page, loading) => settles(page, (words) => !document.body.innerText.includes(words), loading);
const detailCount = (page) => page.evaluate(() => document.querySelector('[data-detail] [data-figure="inside"]')?.textContent ?? '');
const LANES_TITLE = EN['page.lanes.title'];
// U7a: "Cars inside" is Garage View, at its own address.
const INSIDE_TITLE = EN['page.inside.title'];
const INSIDE_NAV = `.nav-item[href="#${PAGES.find((p) => p.id === 'inside').path}"]`;

/** U7a: the language and the look are chosen on the Settings page, and nowhere else once signed in. */
async function onSettings(page, control, value) {
  await page.click('.nav-item[href="#/settings"]');
  await page.click(`[data-control="${control}"] [data-value="${value}"]`);
}

/** Wait, in this process, for the stand-in to hold what a check expects: up to five seconds. */
async function until(fn) {
  for (let i = 0; i < 50; i += 1) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/** `until`, for a question that is answered asynchronously: a read of the platform. */
async function untilRead(fn) {
  for (let i = 0; i < 50; i += 1) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/**
 * The two choosers at the top, Language and Look: each shows its name, its
 * description directly under the name, word for word, and its choices under
 * that; and no chooser on the page is without them.
 */
async function checkChoosers(page, where, language) {
  const words = language === 'es' ? ES : EN;
  const found = await page.evaluate(() => {
    const shown = (e) => {
      const s = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return Boolean(e) && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && r.width > 0 && r.height > 0;
    };
    return {
      choosers: ['language', 'theme'].map((c) => {
        const box = document.querySelector(`[data-chooser="${c}"]`);
        const name = box?.querySelector(':scope > .field-name');
        const about = box?.querySelector(':scope > .field-about');
        const choices = box?.querySelector(':scope > [role="radiogroup"]');
        if (!name || !about || !choices) return { c, missing: true };
        const [n, a, k] = [name, about, choices].map((e) => e.getBoundingClientRect());
        return { c, name: name.textContent.trim(), about: about.textContent.trim(), shown: shown(name) && shown(about), under: a.top >= n.bottom - 1 && k.top >= a.bottom - 1 };
      }),
      loose: [...document.querySelectorAll('[role="radiogroup"]')].filter((g) => !g.parentElement?.matches('.chooser')).length,
    };
  });
  const wrong = [];
  for (const f of found.choosers) {
    const key = `${f.c}.label`;
    if (f.missing) {
      wrong.push(`${f.c}: no name, description or choices in its place`);
      continue;
    }
    if (f.name !== words[key]) wrong.push(`${f.c}: named "${f.name}", not "${words[key]}"`);
    if (!f.shown) wrong.push(`"${f.name}": its description is not shown`);
    else if (!f.under) wrong.push(`"${f.name}": its description is not under its name, above its choices`);
    if (f.about !== words[`${key}.about`]) wrong.push(`"${f.name}": says "${f.about}", not "${words[`${key}.about`]}"`);
  }
  if (found.loose) wrong.push(`${found.loose} chooser(s) with no name or description`);
  check(wrong.length === 0, `descriptions, the choosers, ${where} (${language}): Language and Look each described under its name${wrong.length ? `; ${wrong.join('; ')}` : ''}`);
}

// A line that says every car on Garage View is parked, or came in. The list
// holds every car a lane let in that has not left, some of them not
// confirmed inside, so no line may say that of all of them. A line that
// itself says some are not confirmed is not such a claim. (No \b after an
// accented letter: in JavaScript \b is ASCII only.)
const EVERY_CAR_CLAIM = {
  en: /\bparked\b|\bcame in\b|\bcome in\b|\bdrove in\b|\bentered\b/i,
  es: /estacionad|\bentr(?:ó|aron)(?!\p{L})/iu,
};
const SAYS_NOT_ALL_CONFIRMED = {
  en: /not confirmed|could not confirm|could not check/i,
  es: /no confirmad|no pudo confirmar|no pudo comprobar/i,
};

/**
 * Garage View, with a car on it the lane let in but could not confirm: every
 * line on the page, and its entry in Quick Find, read as an owner reads
 * them. Fails any line that says every car listed is parked or came in.
 */
async function checkNoEveryCarClaim(page, language) {
  const words = language === 'es' ? ES : EN;
  const where = `${INSIDE_TITLE}, with a car not confirmed (${language})`;
  await page.waitForSelector('.content [data-list="inside"] tbody tr');
  const notConfirmed = await page.$$eval('.content [data-list="inside"] tbody tr', (rows, no) => rows.filter((r) => r.lastElementChild?.textContent === no).length, words.no);
  const onPage = (await page.innerText('.content')).split('\n');
  await page.keyboard.press('Control+K');
  await page.waitForSelector('.find-dialog');
  await page.keyboard.type(words['page.inside.title']);
  const entry = await settles(page, () => !!document.querySelector('.find-option[data-id="inside"]'));
  const inFind = entry ? (await page.innerText('.find-option[data-id="inside"]')).split('\n') : [];
  await page.keyboard.press('Escape');
  await page.waitForSelector('.find-dialog', { state: 'detached' });
  const lines = [...onPage, ...inFind].map((l) => l.trim()).filter(Boolean);
  const claims = lines.filter((l) => EVERY_CAR_CLAIM[language].test(l) && !SAYS_NOT_ALL_CONFIRMED[language].test(l));
  const wrong = [
    notConfirmed === 0 && 'no car on it is marked not confirmed, so the check saw nothing',
    !entry && 'its Quick Find entry was not found',
    !lines.includes(words['page.inside.title']) && 'the page title was not read',
    ...claims.map((l) => `"${l}"`),
  ].filter(Boolean);
  check(wrong.length === 0, `${where}: no line, on the page or in Quick Find, says every car listed is parked or came in (${lines.length} lines read)${wrong.length ? `; ${wrong.join('; ')}` : ''}`);
}

/** Quick Find, open: its description inside the box, under the typing line, word for word. */
async function checkQuickFindDescribed(page, language) {
  const words = language === 'es' ? ES : EN;
  const found = await page.evaluate(() => {
    const about = document.querySelector('.find-dialog [data-about="quickFind.label"]');
    const row = document.querySelector('.find-dialog .find-input-row');
    const box = document.querySelector('.find-dialog');
    if (!about || !row || !box) return null;
    const s = getComputedStyle(about);
    const [a, r, b] = [about, row, box].map((e) => e.getBoundingClientRect());
    return {
      text: about.textContent.trim(),
      shown: s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && a.width > 0 && a.height > 0,
      under: a.top >= r.bottom - 1 && a.bottom <= b.bottom && a.left >= b.left && a.right <= b.right,
    };
  });
  const want = words['quickFind.label.about'];
  const wrong = !found
    ? ['no description in the box']
    : [!found.shown && 'it is not shown', found.shown && !found.under && 'it is not under the typing line, inside the box', found.text !== want && `it says "${found.text}", not "${want}"`].filter(Boolean);
  check(wrong.length === 0, `descriptions, Quick Find (${language}): "${want}" under the typing line${wrong.length ? `; ${wrong.join('; ')}` : ''}`);
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
      // Printing, the setup controls are left out on purpose (.no-print): only what prints is read.
      fields: [...document.querySelectorAll('main .field-about')].filter((about) => !(window.matchMedia('print').matches && about.closest('.no-print'))).map((about) => {
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
      bare: [...document.querySelectorAll('main th, main label')]
        .filter((e) => !(window.matchMedia('print').matches && e.closest('.no-print')))
        .filter((e) => !e.querySelector('.field-about'))
        .map((e) => e.textContent.trim()),
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
  await checkChoosers(page, 'sign-in', 'en');
  await page.click('[data-control="language"] [data-value="es"]');
  await showsHeading(page, ES['signIn.title']);
  await checkDescribed(page, 'sign-in', 'es', 2);
  await checkChoosers(page, 'sign-in', 'es');
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
  // U7a: Home lists the owner's garages first, each with its one line, and shows none below until one is chosen.
  check(await showsText(page, EN['home.garages']), 'an owner with two garages: Home lists them first');
  check(await settles(page, () => document.querySelectorAll('.garage-choice[data-garage] [data-read="read"]').length === 4), 'Home: each garage\'s line read from the platform');
  check((await page.$('[data-detail]')) === null, 'Home: no garage shown below the list until one is chosen');
  await checkDescribed(page, 'Home, the garages', 'en', 1);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'home-garages-english.png') });
  check((await page.inputValue('input[name="password"]').catch(() => '')) === '', 'and the password is gone with the form');
  await page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);
  check(await settles(page, (id) => document.querySelector('[data-detail]')?.dataset.detail === id, A.garages[0].id), 'Home: the garage chosen is shown below the list');
  check((await detailRead(page, EN.loading)) && (await detailCount(page)) === EN['inside.countMany'].replace('{count}', '2'), 'Home: the cars-inside count the platform returned (2)');
  const home = await bodyText(page);
  check(home.includes(EN['inside.unconfirmedOne']), 'Home: the one it could not confirm, in words');
  check(home.includes(EN['lane.workingOne']), 'Home: "Working, heard from a minute ago"');
  const quiet = EN['lane.quiet'].replace('{time}', inZone('2026-03-10T19:40:00Z', 'America/New_York', 'en'));
  check(home.includes(quiet), `Home: "${quiet}", in the garage's time`);
  check(home.includes(EN['lane.noComputer']), 'Home: a lane with no lane computer says so');
  const laneSays = (p, name) =>
    p.evaluate((n) => [...document.querySelectorAll('.lane-row')].find((r) => r.querySelector('.lane-name')?.textContent === n)?.querySelector('.lane-state')?.textContent ?? null, name);
  const southEn = EN['lane.cancelledOne'].replace('{time}', inZone('2026-03-10T14:30:00Z', 'America/New_York', 'en'));
  const southSaysEn = await laneSays(page, 'South Exit');
  check(southSaysEn === southEn, `Home: a lane whose only computer had its access cancelled says "${southEn}" (it says "${southSaysEn}")`);
  check(await laneSays(page, 'Service Lane') === EN['lane.noComputer'], `Home: "${EN['lane.noComputer']}" only for the lane that never had one`);
  // U7a: the language and the look are on Settings, described as before; Home has neither.
  check((await page.$$('[data-chooser="language"], [data-chooser="theme"]')).length === 0, 'Home: no Language or Look chooser (they are on Settings)');
  await page.click('.nav-item[href="#/settings"]');
  check(await showsHeading(page, EN['page.settings.title']), 'Settings is in the navigation');
  await checkChoosers(page, 'Settings', 'en');
  await checkDescribed(page, 'Settings', 'en', 2);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'settings-english.png') });
  await page.click('.nav-item[href="#/"]');
  await settles(page, () => document.querySelectorAll('.lane-row').length > 0);
  const homeLower = home.toLowerCase();
  check(homeLower.includes(EN['lane.in'].toLowerCase()) && homeLower.includes(EN['lane.out'].toLowerCase()), 'Home: each lane is in or out');
  const kinds = ['garage pass', 'monthly', 'transient'];
  check(kinds.every((k) => !home.toLowerCase().includes(k)), 'Home: no breakdown by kind of customer, since the platform returns none');
  await checkDescribed(page, 'Home', 'en', 3);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'home-english-day.png') });

  // ── Garage time, not browser time ───────────────────────────────────────
  await page.click(INSIDE_NAV);
  await showsText(page, 'HRB4410');
  const inside = await bodyText(page);
  const garageClock = inZone('2026-03-10T15:05:00Z', 'America/New_York', 'en', false);
  const garageDay = inZone('2026-03-10T15:05:00Z', 'America/New_York', 'en');
  const tokyoClock = inZone('2026-03-10T15:05:00Z', BROWSER_ZONE, 'en', false);
  check(inside.includes(garageDay) || inside.includes(garageClock), `${INSIDE_TITLE}: came in at ${garageDay}, garage time`);
  check(!inside.includes(tokyoClock), `garage time, not browser time: ${tokyoClock} (Tokyo) is not shown`);
  check(inside.includes('HT-0042') && inside.includes('HRB7731'), `${INSIDE_TITLE}: every open stay is listed`);
  await checkDescribed(page, INSIDE_TITLE, 'en', 5);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'garage-view-english.png'), fullPage: true });
  await checkPrint(page, INSIDE_TITLE, A.garages[0]);
  await checkNoEveryCarClaim(page, 'en');

  await page.click('.nav-item[href="#/lanes"]');
  await showsText(page, 'Harbor exit computer');
  const lanes = await bodyText(page);
  check(lanes.includes(quiet), `${LANES_TITLE}: the quiet lane computer, in garage time`);
  const cancelled = EN['device.off'].replace('{time}', inZone('2026-01-05T13:55:00Z', 'America/New_York', 'en'));
  check(lanes.includes(cancelled), `${LANES_TITLE}: "${cancelled}", a lane computer whose access was cancelled, in garage time`);
  check(lanes.includes(EN['lanes.readerYes']) && lanes.includes(EN['lanes.readerNo']), `${LANES_TITLE}: which lanes have a card reader`);
  const southCancelled = EN['device.off'].replace('{time}', inZone('2026-03-10T14:30:00Z', 'America/New_York', 'en'));
  check(lanes.includes('Harbor south exit computer') && lanes.includes(southCancelled), `${LANES_TITLE}: the lane whose only computer was cancelled lists it, "${southCancelled}"`);
  // The lanes, and under them what their screens show (U4c): five more described fields.
  await settles(page, () => Boolean(document.querySelector('[data-form="board"]')));
  // The lanes (6), and the price switch of what their screens show (1); every form is closed behind its button (U7a).
  await checkDescribed(page, LANES_TITLE, 'en', 7);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'lanes-english.png'), fullPage: true });
  await checkPrint(page, LANES_TITLE, A.garages[0]);

  // ── Every page from the navigation, English ─────────────────────────────
  for (const p of PAGES) {
    await page.click(`.nav-item[href="#${p.path}"]`);
    const title = EN[`page.${p.id}.title`];
    check(await showsHeading(page, title), `the navigation reaches "${title}"`);
    const purpose = await page.textContent('.page-purpose');
    check(purpose === EN[`page.${p.id}.purpose`], `"${title}" says what it is for`);
    // U4b: there is no computer at a lane, and no page says so. Read once the page holds what it reads
    // (U7a: Home reads every garage's line besides the garage below).
    await allRead(page, EN.loading);
    const said = await bodyText(page);
    check(!LANE_COMPUTER.test(said), `"${title}": never "lane computer"${LANE_COMPUTER.test(said) ? ` (it says "${said.match(LANE_COMPUTER)[0]}")` : ''}`);
    if (!['home', 'setup', 'garages', 'lanes', 'inside', 'changes', 'alerts', 'drawings', 'taxes', 'paid', 'readers', 'settings'].includes(p.id)) {
      // Nothing under the title but its line: the page says so, so the line is not read as a list gone missing.
      const notYet = await settles(page, (t) => document.querySelector('[data-notice="not-yet"]')?.textContent === t, EN['page.notYet']);
      check(notYet, `"${title}": nothing on it yet, and it says "${EN['page.notYet']}"`);
    }
  }

  // ── U4: Setup, from the platform's one read ─────────────────────────────
  const SETUP_TITLE = EN['page.setup.title'];
  const HARBOR = A.garages[0];
  const platformSetup = (p, garageId) =>
    p.evaluate(async (id) => (await (await fetch(`/api/v1/garages/${id}/setup`, { credentials: 'same-origin' })).json()).setup, garageId);
  const shownSteps = (p) =>
    p.evaluate(() => [...document.querySelectorAll('[data-step]')].map((li) => ({ key: li.dataset.step, done: li.dataset.done === 'yes', state: li.querySelector('[data-state]')?.dataset.state })));
  const stepsAgree = async (p, label) => {
    await settles(p, () => document.querySelectorAll('[data-step]').length > 0);
    const truth = await platformSetup(p, HARBOR.id);
    const shown = await shownSteps(p);
    const wrong = truth.steps.filter((st, i) => shown[i]?.key !== st.key || shown[i]?.done !== st.done || shown[i]?.state !== (st.done ? 'done' : 'not-yet'));
    check(shown.length === truth.steps.length && wrong.length === 0, `Setup: the page shows each step done as the platform says (${label}): ${shown.length} steps${wrong.length ? `; differs at ${wrong.map((w) => w.key).join(', ')}` : ''}`);
  };
  await page.click('.nav-item[href="#/setup"]');
  check(await showsHeading(page, SETUP_TITLE), 'Setup is in the navigation, first after Home');
  check((await page.evaluate(() => [...document.querySelectorAll('.nav-item')].map((a) => a.getAttribute('href')).slice(0, 2).join(' '))) === '#/ #/setup', 'Setup: second in the navigation, after Home');
  await stepsAgree(page, 'as worked out');
  const setupText = await bodyText(page);
  check(setupText.includes(EN['setup.isOpen']), `Setup: an open garage says so at the top: "${EN['setup.isOpen']}"`);
  check(setupText.includes(EN['setup.notFromHere']) && setupText.includes(EN['setup.goTo'].replace('{page}', LANES_TITLE)), 'Setup: where each step is done, or that it cannot be set from here yet');
  check(setupText.includes('Service Lane') && setupText.includes(EN['setup.fact.noComputer']), 'Setup: the facts in plain words, naming the lane with no computer');
  check(rawIn(setupText).length === 0, `Setup: nothing raw on screen${rawIn(setupText).length ? `: ${rawIn(setupText).join(', ')}` : ''}`);
  // The ten steps; the drivers question is closed behind its button (U7a).
  await checkDescribed(page, SETUP_TITLE, 'en', 10);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'setup-english.png'), fullPage: true });
  // A platform whose answer contradicts its own facts: the page follows the answer.
  stub.flipSetup(true);
  await page.click('.nav-item[href="#/lanes"]');
  await page.click('.nav-item[href="#/setup"]');
  await stepsAgree(page, 'every done reversed by the platform');
  stub.flipSetup(false);
  await page.click('.nav-item[href="#/lanes"]');
  await page.click('.nav-item[href="#/setup"]');
  await settles(page, () => document.querySelectorAll('[data-step]').length > 0);

  // The drivers answer: changed and saved; never offered back to unanswered. Its button says what it does (U7a).
  check((await page.$('[data-chooser="drivers"]')) === null && (await page.textContent('[data-action="open-drivers"]')) === EN['setup.drivers.change'], `Setup: the answered question is closed behind "${EN['setup.drivers.change']}"`);
  await page.click('[data-action="open-drivers"]');
  check((await page.$$('[data-chooser="drivers"] [role="radio"]')).length === 2, 'Setup: the drivers question offers yes, any driver, and no, pass holders only -- and no "unanswered"');
  check((await page.$('[data-notice="drivers-once"]')) === null, 'Setup: an answered question does not say "once you answer" again');
  await page.click('[data-chooser="drivers"] [data-value="false"]');
  await page.click('[data-question="drivers"] button[type="submit"]');
  check(await settles(page, () => !document.querySelector('[data-step="getting_paid"]') && document.querySelector('[data-step="drivers"]')), 'Setup: answered "no, pass holders only": saved, and getting paid and card readers are no longer steps');
  await page.click('[data-action="open-drivers"]');
  await page.click('[data-chooser="drivers"] [data-value="true"]');
  await page.click('[data-question="drivers"] button[type="submit"]');
  check(await settles(page, () => Boolean(document.querySelector('[data-step="getting_paid"]'))), 'Setup: changed back to "yes, any driver", and getting paid is a step again');
  await page.click('[data-action="change-garage"]');
  await page.click(`.garage-choice[data-garage="${A.garages[1].id}"]`);
  await page.click('.nav-item[href="#/setup"]');
  check(await settles(page, (t) => document.querySelector('[data-action="open-drivers"]')?.textContent === t, EN['setup.drivers.answer']), `Setup, a garage not answered yet: the question is behind "${EN['setup.drivers.answer']}"`);
  await page.click('[data-action="open-drivers"]');
  check(await settles(page, (t) => document.querySelector('[data-notice="drivers-once"]')?.textContent === t, EN['setup.drivers.once']), `Setup, a garage not answered yet: "${EN['setup.drivers.once']}" before the first save`);
  await page.click('[data-action="change-garage"]');
  await page.click(`.garage-choice[data-garage="${HARBOR.id}"]`);

  // ── U4 fix: one quiet setting, the platform's ──────────────────────────
  // A lane computer heard from 10 minutes ago: not heard from lately at the
  // platform's 5, working at 30. Home, Lanes and the checklist move together.
  const entryComputer = A.lanes[HARBOR.id][0].devices[0];
  const heardBefore = entryComputer.last_seen_at;
  entryComputer.last_seen_at = new Date(Date.now() - 10 * 60_000).toISOString();
  const quietNow = async (minutes) => {
    stub.setQuietMinutes(minutes);
    await page.click('.nav-item[href="#/"]');
    await settles(page, () => document.querySelectorAll('.lane-row').length > 0);
    const home = await page.evaluate(() => [...document.querySelectorAll('.lane-row')].find((r) => r.querySelector('.lane-name')?.textContent === 'North Entry')?.dataset.state ?? null);
    await page.click('.nav-item[href="#/lanes"]');
    await showsText(page, 'Harbor entry computer');
    const lanesSays = await page.evaluate(() => document.querySelector('[data-device]')?.textContent ?? '');
    await page.click('.nav-item[href="#/setup"]');
    await settles(page, () => document.querySelectorAll('[data-step]').length > 0);
    const setupSays = await page.evaluate(() => document.querySelector('[data-step="lane_computers"]')?.textContent ?? '');
    return { home, lanesSays, setupSays };
  };
  const at5 = await quietNow(5);
  const at30 = await quietNow(30);
  const working10 = EN['lane.workingMany'].replace('{minutes}', '10');
  check(at5.home === 'quiet' && at5.lanesSays.includes('Not heard from since') && at5.setupSays.includes(EN['setup.fact.quiet'].replace('{minutes}', '5')),
    `ONE SETTING: at the platform's 5 minutes, North Entry is not heard from lately on Home (${at5.home}), Lanes and the checklist`);
  check(at30.home === 'working' && at30.lanesSays.includes(working10) && !at30.setupSays.includes('North Entry') && at30.setupSays.includes('30'),
    `ONE SETTING: set to 30 on the platform, Home (${at30.home}), Lanes ("${working10}") and the checklist all call it working`);
  stub.setQuietMinutes(5);
  entryComputer.last_seen_at = heardBefore;

  // ── U4: lane setup ─────────────────────────────────────────────────────
  const consoleSaid = [];
  page.on('console', (m) => consoleSaid.push(m.text()));
  // A browser dialog is dismissed and counted: every confirmation belongs on the page.
  let dialogs = 0;
  page.on('dialog', (d) => {
    dialogs += 1;
    d.dismiss().catch(() => {});
  });
  const sent = [];
  page.on('request', (r) => sent.push(`${r.url()} ${r.postData() ?? ''} ${JSON.stringify(r.headers())}`));
  const addresses = [];
  page.on('framenavigated', (f) => addresses.push(f.url()));
  await page.click('.nav-item[href="#/lanes"]');
  await showsText(page, 'Harbor exit computer');
  await settles(page, () => Boolean(document.querySelector('[data-form="board"]')));
  await checkDescribed(page, LANES_TITLE, 'en', 7);
  check(!(await bodyText(page)).includes('does not act on it yet'), `${LANES_TITLE}: no longer says the lane does not act on a closing (U4c: it does)`);
  const laneRow = (name) => `[data-list="lanes"] tbody tr:has(td:first-child bdi:text-is("${name}"))`;
  // Add, rename. U7a: the form is closed behind "Add a lane", and has the lane's two fields when open.
  check((await page.$('[data-form="add-lane"]')) === null && (await page.textContent('[data-action="open-add-lane"]')) === EN['lanes.add'], `${LANES_TITLE}: the form to add a lane is closed behind "${EN['lanes.add']}"`);
  await page.click('[data-action="open-add-lane"]');
  await checkDescribed(page, `${LANES_TITLE}, adding a lane`, 'en', 9);
  await page.fill('[data-form="add-lane"] input[type="text"]', 'West Gate');
  await page.click('[data-form="add-lane"] [data-chooser="direction"] [data-value="entry"]');
  await page.click('[data-form="add-lane"] button[type="submit"]');
  check(await settles(page, () => [...document.querySelectorAll('[data-list="lanes"] tbody tr')].some((tr) => tr.cells[0].textContent === 'West Gate')), `${LANES_TITLE}: a lane added, in place`);
  await page.click(`${laneRow('West Gate')} [data-action="rename"]`);
  await page.fill('[data-panel="rename"] input[type="text"]', 'West Gate 2');
  await page.click('[data-panel="rename"] button[type="submit"]');
  check(await settles(page, () => [...document.querySelectorAll('[data-list="lanes"] tbody tr')].some((tr) => tr.cells[0].textContent === 'West Gate 2')), `${LANES_TITLE}: renamed, in place`);
  // A lane with history is kept, with the plain reason.
  await page.click(`${laneRow('North Entry')} [data-action="remove"]`);
  await page.click('[data-panel="remove"] [data-action="remove-confirm"]');
  check(await showsText(page, EN['problem.laneHasHistory']), `${LANES_TITLE}: a used lane is not removed: "${EN['problem.laneHasHistory']}"`);
  {
    const said = (await page.textContent('[data-panel="remove"] [data-action="close-panel"]')).trim();
    check(said === EN['lanes.panelKeep'], `${LANES_TITLE}: the button beside "${EN['lanes.removeButton']}" says what it does, "${EN['lanes.panelKeep']}", never "Done" (it says "${said}")`);
  }
  await page.click('[data-action="close-panel"]');
  // Closing: both reasons; the last way in warns, and closes only on purpose.
  for (const [name, reason] of [['West Gate 2', 'full'], ['Service Lane', 'everyone']]) {
    await page.click(`${laneRow(name)} [data-action="close"]`);
    await page.click(`[data-panel="close"] [data-chooser="reason"] [data-value="${reason}"]`);
    const sample = await page.evaluate(() => document.querySelector('[data-panel="close"] select option:nth-child(2)')?.value ?? document.querySelector('[data-panel="close"] select optgroup option')?.value);
    await page.selectOption('[data-panel="close"] select', { index: 1 });
    await page.click('[data-panel="close"] button[type="submit"]');
    check(await settles(page, (n) => [...document.querySelectorAll('[data-list="lanes"] tbody tr')].find((tr) => tr.cells[0].textContent === n)?.querySelector('[data-open]')?.dataset.open === 'closed', name), `${LANES_TITLE}: "${name}" closed (${reason}), with a sample message ("${sample}")`);
  }
  const closedLine = await page.evaluate(() => [...document.querySelectorAll('[data-list="lanes"] tbody tr')].find((tr) => tr.cells[0].textContent === 'Service Lane')?.cells[4].textContent ?? '');
  check(closedLine.includes(EN['lanes.closedEveryone']) && closedLine.includes(A.email), `${LANES_TITLE}: a closed lane says why, its message and who closed it ("${closedLine}")`);
  await page.click(`${laneRow('North Entry')} [data-action="close"]`);
  await page.fill('[data-panel="close"] textarea', 'Closed tonight.');
  await page.click('[data-panel="close"] button[type="submit"]');
  check(await settles(page, (t) => document.querySelector('[data-notice="last-open-lane"] p')?.textContent === t, EN['lanes.lastIn']), `${LANES_TITLE}: the last open way in warns: "${EN['lanes.lastIn']}"`);
  check(await page.evaluate(() => [...document.querySelectorAll('[data-list="lanes"] tbody tr')].find((tr) => tr.cells[0].textContent === 'North Entry')?.querySelector('[data-open]')?.dataset.open === 'open'), `${LANES_TITLE}: ...and it is still open until the second press`);
  await page.click('[data-action="close-anyway"]');
  check(await settles(page, () => [...document.querySelectorAll('[data-list="lanes"] tbody tr')].find((tr) => tr.cells[0].textContent === 'North Entry')?.querySelector('[data-open]')?.dataset.open === 'closed'), `${LANES_TITLE}: closed on the second, deliberate press`);
  for (const name of ['North Entry', 'Service Lane', 'West Gate 2']) {
    await page.click(`${laneRow(name)} [data-action="reopen"]`);
    await page.click('[data-panel="reopen"] [data-action="reopen-confirm"]');
    check(await settles(page, (n) => [...document.querySelectorAll('[data-list="lanes"] tbody tr')].find((tr) => tr.cells[0].textContent === n)?.querySelector('[data-open]')?.dataset.open === 'open', name), `${LANES_TITLE}: "${name}" reopened`);
  }
  // ── U4c: a way out is closed to everyone only; the screen's characters ──
  const reasonsOffered = () => page.evaluate(() => [...document.querySelectorAll('[data-panel="close"] [data-chooser="reason"] [data-value]')].map((b) => b.dataset.value));
  await page.click(`${laneRow('North Exit')} [data-action="close"]`);
  {
    const offered = await reasonsOffered();
    const said = await page.evaluate(() => document.querySelector('[data-notice="out-lane-everyone"]')?.textContent ?? '');
    check(JSON.stringify(offered) === '["everyone"]' && said === EN['lanes.reasonOut'], `${LANES_TITLE}: a way out offers only "${EN['lanes.reason.everyone']}" (it offers ${JSON.stringify(offered)}), and says why`);
  }
  await page.click('[data-action="close-panel"]');
  await page.click(`${laneRow('West Gate 2')} [data-action="close"]`);
  {
    const offered = await reasonsOffered();
    check(JSON.stringify(offered) === '["full","everyone"]', `${LANES_TITLE}: a way in offers both reasons (it offers ${JSON.stringify(offered)})`);
    await page.fill('[data-panel="close"] textarea', 'Closed — sorry, € 5 (cash)');
    const want = EN['screen.cannotShow'].replace('{characters}', '“—”, “€”, “(”, “)”');
    const notice = await page.evaluate(() => document.querySelector('[data-panel="close"] [data-notice="screen-characters"]')?.textContent ?? '');
    const blocked = await page.evaluate(() => document.querySelector('[data-panel="close"] button[type="submit"]')?.disabled === true);
    check(notice === want && blocked, `${LANES_TITLE}: a closing message names each character the screen cannot show, as it is typed, and is not sent ("${notice}")`);
    await page.fill('[data-panel="close"] textarea', 'Garage is full. Monthly parkers only.');
    const preview = await page.evaluate(() => [...document.querySelectorAll('[data-panel="close"] [data-preview="screen"] .screen-line')].map((l) => l.textContent));
    check(preview.join(' ') === 'GARAGE IS FULL. MONTHLY PARKERS ONLY.' && preview.every((l) => l.length <= 24) && !(await page.$('[data-panel="close"] [data-notice="screen-characters"]')),
      `${LANES_TITLE}: the closing message previewed as the screen shows it, in capitals and whole (${JSON.stringify(preview)})`);
  }
  await page.click('[data-action="close-panel"]');

  // ── U4c: what the lanes' screens show ──────────────────────────────────
  const boardRead = () => page.evaluate(async (id) => (await fetch(`/api/v1/garages/${id}/board`, { credentials: 'same-origin' })).json(), HARBOR.id);
  // U7a: the form is closed behind "Add a message"; how messages work is said in it.
  const openMessageForm = async () => {
    if (!(await page.$('[data-panel="add-message"]'))) await page.click('[data-action="open-add-message"]');
    return settles(page, () => Boolean(document.querySelector('[data-panel="add-message"]')));
  };
  check((await page.$('[data-panel="add-message"]')) === null, 'Lane screens: the form to add a message is closed behind its button');
  await openMessageForm();
  check((await page.textContent('[data-panel="add-message"] [data-notice="board-form"]')) === EN['board.formNote'], `Lane screens: how messages work is said in the form: "${EN['board.formNote']}"`);
  await page.fill('[data-panel="add-message"] textarea', 'Event tonight € 20');
  {
    const notice = await page.evaluate(() => document.querySelector('[data-panel="add-message"] [data-notice="screen-characters"]')?.textContent ?? '');
    check(notice === EN['screen.cannotShow'].replace('{characters}', '“€”'), `Lane screens: a message names the character the screen cannot show ("${notice}")`);
  }
  await page.fill('[data-panel="add-message"] textarea', 'Event tonight: 20.00 flat');
  const northEntry = A.lanes[HARBOR.id].find((l) => l.name === 'North Entry');
  const northExit = A.lanes[HARBOR.id].find((l) => l.name === 'North Exit');
  check(await page.evaluate(() => document.querySelector('[data-panel="add-message"] button[type="submit"]').disabled), 'Lane screens: a message with no lane chosen is not sent');
  await page.click(`[data-panel="add-message"] [data-pick="${northEntry.id}"]`);
  await page.click(`[data-panel="add-message"] [data-pick="${northExit.id}"]`);
  await page.fill('[data-panel="add-message"] [data-field="board-starts"]', '2030-01-01T08:00');
  await page.fill('[data-panel="add-message"] [data-field="board-ends"]', '2030-01-01T23:30');
  await page.click('[data-panel="add-message"] button[type="submit"]');
  check(await settles(page, () => document.querySelectorAll('[data-list="board"] tbody tr').length === 1), 'Lane screens: a message added, in place');
  {
    const row = await page.evaluate(() => document.querySelector('[data-list="board"] tbody tr')?.textContent ?? '');
    const kept = (await boardRead()).messages[0];
    check(row.includes('Event tonight: 20.00 flat') && row.includes('North Entry') && row.includes('North Exit') && row.includes('Jan 1, 2030') && kept.starts === '2030-01-01T08:00' && kept.ends === '2030-01-01T23:30' && JSON.stringify(kept.lanes) === JSON.stringify([northEntry.id, northExit.id]),
      `Lane screens: the message, its lanes and its times in the garage's own time, as kept ("${row}")`);
  }
  await page.click(`[data-list="board-prices"] [data-lane="${northEntry.id}"] [data-tick="prices"]`);
  check(await untilRead(async () => (await boardRead()).lanes.find((l) => l.id === northEntry.id)?.prices === true), 'Lane screens: the price switched on for one lane');
  check((await boardRead()).lanes.filter((l) => l.prices).length === 1, 'Lane screens: ...and for that lane only');
  await page.click('[data-list="board"] [data-action="change-message"]');
  await page.fill('[data-panel="change-message"] textarea', 'Event tomorrow');
  await page.click('[data-panel="change-message"] button[type="submit"]');
  check(await settles(page, () => (document.querySelector('[data-list="board"] tbody tr')?.textContent ?? '').includes('Event tomorrow')), 'Lane screens: a message changed, in place');
  await page.click('[data-list="board"] [data-action="remove-message"]');
  check(await settles(page, (t) => document.querySelector('[data-panel="remove-message"] p')?.textContent === t, EN['board.removeAsk']), 'Lane screens: removing asks on the page first');
  await page.click('[data-action="remove-message-confirm"]');
  check(await settles(page, () => document.querySelectorAll('[data-list="board"] tbody tr').length === 0), 'Lane screens: a message removed, in place');
  await page.click(`[data-list="board-prices"] [data-lane="${northEntry.id}"] [data-tick="prices"]`);
  await untilRead(async () => (await boardRead()).lanes.every((l) => !l.prices));
  // F1: nothing on the board outlives its lane. A message on a lane alone goes with the lane; one on two loses only it.
  {
    await page.click('[data-action="open-add-lane"]');
    await page.fill('[data-form="add-lane"] input[type="text"]', 'Spare Gate');
    await page.click('[data-form="add-lane"] [data-chooser="direction"] [data-value="entry"]');
    await page.click('[data-form="add-lane"] button[type="submit"]');
    await settles(page, () => [...document.querySelectorAll('[data-list="lanes"] tbody tr')].some((tr) => tr.cells[0].textContent === 'Spare Gate'));
    const spare = (await boardRead()).lanes.find((l) => l.name === 'Spare Gate');
    await openMessageForm();
    const offered = await settles(page, (id) => Boolean(document.querySelector(`[data-panel="add-message"] [data-pick="${id}"]`)), spare.id);
    check(offered, 'Lane screens: a lane added is offered for a message at once (the board read again)');
    for (const [text, ids] of offered ? [['Spare only', [spare.id]], ['Both doors', [northEntry.id, spare.id]]] : []) {
      await openMessageForm();
      await page.fill('[data-panel="add-message"] textarea', text);
      for (const id of ids) await page.click(`[data-panel="add-message"] [data-pick="${id}"]`);
      await page.click('[data-panel="add-message"] button[type="submit"]');
      await settles(page, (n) => document.querySelectorAll('[data-list="board"] tbody tr').length === n, ids.length);
    }
    await page.click(`${laneRow('Spare Gate')} [data-action="remove"]`);
    await page.click('[data-panel="remove"] [data-action="remove-confirm"]');
    const shownNow = () => page.evaluate(() => [...document.querySelectorAll('[data-list="board"] tbody tr')].map((tr) => `${tr.cells[0].textContent} @ ${[...tr.cells[1].querySelectorAll('bdi')].map((b) => `[${b.textContent}]`).join('')}`));
    const settled = await settles(page, () => {
      const rows = [...document.querySelectorAll('[data-list="board"] tbody tr')];
      return rows.length === 1 && rows[0].cells[0].textContent === 'Both doors' && [...rows[0].cells[1].querySelectorAll('bdi')].map((b) => b.textContent).join('|') === 'North Entry';
    });
    check(settled, `Lane screens: a lane removed takes its lone message with it and comes off the other; every lane named, none empty (${JSON.stringify(await shownNow())})`);
    const kept = (await boardRead()).messages;
    check(kept.length === 1 && kept[0].lanes.length === 1 && kept[0].lanes[0] === northEntry.id, 'Lane screens: ...and the platform keeps the same');
    await page.click('[data-list="board"] [data-action="remove-message"]');
    await page.click('[data-action="remove-message-confirm"]');
    await settles(page, () => document.querySelectorAll('[data-list="board"] tbody tr').length === 0);
  }
  check(dialogs === 0 && (await page.evaluate(() => document.querySelectorAll('dialog').length)) === 0, `${LANES_TITLE}: every confirmation was on the page, none in a browser dialog (${dialogs} dialogs)`);

  // The connection code: shown once, kept nowhere.
  await page.click(`${laneRow('West Gate 2')} [data-action="connect"]`);
  await page.fill('[data-panel="connect"] input[type="text"]', 'West Gate computer');
  const issuedBefore = stub.issued.length;
  await page.click('[data-panel="connect"] button[type="submit"]');
  check(await settles(page, () => Boolean(document.querySelector('.connection-code'))), `${LANES_TITLE}: a lane computer connected, its connection code shown`);
  const code = stub.issued[issuedBefore];
  const shownCode = await page.textContent('.connection-code');
  check(Boolean(code) && shownCode === code, 'connection code: the code the platform gave, shown once');
  check((await page.textContent('[data-notice="code-once"]')) === EN['lanes.codeOnce'] && Boolean(await page.$('[data-action="copy-code"]')), 'connection code: with a copy button and the plain warning that it will not be shown again');
  check(onlyTheTwoKeys(await storageKeys(page)) && !(await page.evaluate((c) => Object.values(localStorage).some((v) => v.includes(c)), code)), `connection code: browser storage holds only the two keys (${JSON.stringify(await storageKeys(page))})`);
  check(addresses.every((u) => !u.includes(code)) && !(await page.evaluate((c) => window.location.href.includes(c), code)), 'connection code: the address never held it');
  const sentBefore = sent.length;
  {
    const said = (await page.textContent('[data-panel="connect"] [data-action="close-panel"]')).trim();
    check(said === EN['lanes.panelDone'], `connection code: once shown, the panel's own button says "${EN['lanes.panelDone']}" (it says "${said}")`);
  }
  await page.click('[data-action="close-panel"]');
  check(await settles(page, (c) => !document.body.innerHTML.includes(c), code), 'connection code: gone from the page when the panel closes');
  await page.click('.nav-item[href="#/setup"]');
  await page.click('.nav-item[href="#/lanes"]');
  await showsText(page, 'West Gate computer');
  check(sent.slice(sentBefore).every((r) => !r.includes(code)), `connection code: no later request carries it (${sent.length - sentBefore} requests)`);
  check(consoleSaid.every((m) => !m.includes(code)), 'connection code: never in a log line');
  // Cancel its access, on the page.
  await page.click(`${laneRow('West Gate 2')} [data-action="cancel-computer"]`);
  await page.click('[data-panel="cancel"] [data-action="cancel-confirm"]');
  check(await settles(page, () => /Access cancelled/.test([...document.querySelectorAll('[data-list="lanes"] tbody tr')].find((tr) => tr.cells[0].textContent === 'West Gate 2')?.cells[2].textContent ?? '')), `${LANES_TITLE}: a lane computer's access cancelled, in place`);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'lanes-setup-english.png'), fullPage: true });

  // ── U4: the change log ─────────────────────────────────────────────────
  const CHANGES_TITLE = EN['page.changes.title'];
  await page.click('.nav-item[href="#/change-log"]');
  check(await showsHeading(page, CHANGES_TITLE), 'the Change log is in the navigation');
  await settles(page, () => document.querySelectorAll('[data-list="changes"] tbody tr').length > 0);
  await settles(page, () => document.querySelectorAll('[data-list="refused"] tbody tr').length > 0);
  const log = await bodyText(page);
  const madeText = await page.textContent('[data-list="changes"]');
  const refusedText = await page.textContent('[data-list="refused"]');
  const sentence = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  for (const [what, words, where] of [
    ['an added lane', `${EN['changes.action.lane_add']}: West Gate`, madeText],
    ['a closing', EN['changes.action.lane_close'], madeText],
    ['a connected computer', `${EN['changes.action.computer_connect']}: West Gate computer`, madeText],
    ['who', A.email, madeText],
    ['a refused last-lane closing, as tried', EN['changes.tried.lane_close'], refusedText],
    ['a refused last-lane closing, why', sentence(EN['changes.refusal.last_open_lane']), refusedText],
    ['a refused removal, as tried', EN['changes.tried.lane_remove'], refusedText],
    ['a refused removal, why', sentence(EN['changes.refusal.lane_has_history']), refusedText],
  ]) check(where.includes(words), `${CHANGES_TITLE}: ${what}, in plain words ("${words}")`);
  check((await page.$$('[data-list="changes"] tr[data-outcome="refused"]')).length === 0, `${CHANGES_TITLE}: no refused attempt among the changes made`);
  check((await page.$$('[data-list="refused"] tr[data-outcome="refused"]')).length >= 2, `${CHANGES_TITLE}: refused attempts listed apart, under "${EN['refused.title']}"`);
  check(!refusedText.includes(EN['changes.action.lane_close']), `${CHANGES_TITLE}: a refused attempt never says it was done ("${EN['changes.action.lane_close']}")`);
  check(rawIn(log).length === 0 && !/lane\.close|last_open_lane|lane_has_history/.test(log), `${CHANGES_TITLE}: nothing raw on screen${rawIn(log).length ? `: ${rawIn(log).join(', ')}` : ''}`);
  // The two lists' columns (11), and the choices above them (U7b): Sort by and What, then Sort by, What and Why.
  await checkDescribed(page, CHANGES_TITLE, 'en', 16);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'change-log-english.png'), fullPage: true });
  await checkPrint(page, CHANGES_TITLE, HARBOR);

  // ── U4b: Alerts, who gets which alert ───────────────────────────────────
  const ALERTS_TITLE = EN['page.alerts.title'];
  const platformAlerts = (p, garageId) =>
    p.evaluate(async (id) => (await fetch(`/api/v1/garages/${id}/alerts`, { credentials: 'same-origin' })).json(), garageId);
  const personRow = (name) => `[data-list="alerts"] tbody tr:has(td:first-child bdi:text-is("${name}"))`;
  const tickOf = (alert, name, way) => `[data-list="alert-choices"] tr[data-alert="${alert}"]:has(bdi:text-is("${name}")) [data-tick="${way}"]`;
  const missingOf = (alert, name, way) => `[data-list="alert-choices"] tr[data-alert="${alert}"]:has(bdi:text-is("${name}")) [data-missing="${way}"]`;
  await page.click('.nav-item[href="#/alerts"]');
  check(await showsHeading(page, ALERTS_TITLE), 'Alerts is in the navigation');
  await settles(page, () => document.querySelectorAll('[data-list="alerts"] tbody tr').length > 0);
  const top = await page.evaluate(() => document.querySelector('main section.panel')?.querySelector('[data-notice]')?.textContent);
  check(top === EN['alerts.notSentYet'], `Alerts: the first thing it says is "${EN['alerts.notSentYet']}" (it says "${top}")`);
  // U7a: one line at the top; how adding a person works is said in the form, closed behind "Add a person".
  check((await page.$$('main [data-notice]')).length === 1 && (await page.$('[data-form="add-person"]')) === null, 'Alerts: one notice at the top, and the form to add a person closed');
  await page.click('[data-action="open-add-person"]');
  check((await page.textContent('[data-form="add-person"] [data-notice="confirm-first"]')) === EN['alerts.confirmFirst'], 'Alerts: before the first alert, each person is asked to confirm, and the form to add one says so');
  const people = await page.evaluate(() => [...document.querySelectorAll('[data-list="alerts"] tbody tr')].map((tr) => [...tr.cells].slice(0, 5).map((c) => c.textContent)));
  check(JSON.stringify(people) === JSON.stringify([
    ['Night manager', '+15550100001', EN['alerts.none'], EN['language.en'], EN['alerts.notConfirmed']],
    ['Office', EN['alerts.none'], 'office@example.com', EN['language.es'], EN['alerts.notConfirmed']],
  ]), `Alerts: each person's name, phone, email, language and "${EN['alerts.notConfirmed']}" (${JSON.stringify(people)})`);
  const truthA = await platformAlerts(page, HARBOR.id);
  const shownAlerts = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-list="alert-choices"] tr[data-alert]')].map((tr) => tr.dataset.alert))]);
  check(JSON.stringify(shownAlerts) === JSON.stringify(truthA.alerts.map((a) => a.key)), `Alerts: the platform's alerts, in its order (${shownAlerts.join(', ')})`);
  const quietSays = EN['alerts.alert.lane_not_answering.says'].replace('{minutes}', String(truthA.quiet_minutes));
  check((await bodyText(page)).includes(quietSays), `Alerts: "A lane stopped answering" says the platform's quiet setting: "${quietSays}"`);
  check((await page.$(tickOf('lane_problem', 'Office', 'text'))) === null && (await page.textContent(missingOf('lane_problem', 'Office', 'phone'))) === EN['alerts.needsPhone'], `Alerts: no text offered to someone with no phone number; the cell says "${EN['alerts.needsPhone']}"`);
  check((await page.$(tickOf('lane_problem', 'Night manager', 'email'))) === null && (await page.textContent(missingOf('lane_problem', 'Night manager', 'email'))) === EN['alerts.needsEmail'], `Alerts: no email offered to someone with no address; the cell says "${EN['alerts.needsEmail']}"`);
  check((await page.getAttribute(tickOf('lane_problem', 'Night manager', 'text'), 'aria-checked')) === 'true' && (await page.getAttribute(tickOf('card_payments_stopped', 'Night manager', 'text'), 'aria-checked')) === 'false', 'Alerts: each tick as the platform holds it');
  const alertsText = await bodyText(page);
  check(rawIn(alertsText).length === 0, `Alerts: nothing raw on screen${rawIn(alertsText).length ? `: ${rawIn(alertsText).join(', ')}` : ''}`);
  // The people (6), the form to add one, Confirm email under the email (5), who gets which alert (4).
  await checkDescribed(page, ALERTS_TITLE, 'en', 15);
  // A bad phone number: refused in plain words, and nobody added.
  const addForm = '[data-form="add-person"]';
  await page.fill(`${addForm} label:has([data-about="alerts.person"]) input`, 'Weekend lead');
  await page.fill(`${addForm} [data-field="phone"]`, '555-CALL-NOW');
  await page.click(`${addForm} button[type="submit"]`);
  check(await settles(page, (t) => document.querySelector('[data-form="add-person"] [data-problem]')?.textContent === t, EN['problem.phoneLetters']), `Alerts: a phone with letters is refused: "${EN['problem.phoneLetters']}"`);
  await page.fill(`${addForm} [data-field="phone"]`, '555-0101');
  await page.click(`${addForm} button[type="submit"]`);
  check(await settles(page, (t) => document.querySelector('[data-form="add-person"] [data-problem]')?.textContent === t, EN['problem.phoneShort']), `Alerts: a phone too short is refused: "${EN['problem.phoneShort']}"`);
  await page.fill(`${addForm} [data-field="phone"]`, '');
  await page.fill(`${addForm} [data-field="email"]`, 'weekend@@example.com');
  await page.fill(`${addForm} [data-field="confirm-email"]`, 'weekend@@example.com');
  await page.click(`${addForm} button[type="submit"]`);
  check(await settles(page, (t) => document.querySelector('[data-form="add-person"] [data-problem]')?.textContent === t, EN['problem.emailAt']), `Alerts: an address with two @ is refused: "${EN['problem.emailAt']}"`);
  // U4b fix round 2: what a name holds is the owner's; it is never written into a log (scripts/check-removed-person.js).
  await page.fill(`${addForm} [data-field="email"]`, '');
  await page.fill(`${addForm} [data-field="confirm-email"]`, '');
  check((await platformAlerts(page, HARBOR.id)).contacts.length === 2, 'Alerts: ...and nobody was added');
  await page.fill(`${addForm} [data-field="phone"]`, '(555) 010-0144');
  await page.fill(`${addForm} [data-field="email"]`, 'weekend.lead@example.com');
  await page.fill(`${addForm} [data-field="confirm-email"]`, 'weekend.lead@example.com');
  await page.click(`${addForm} button[type="submit"]`);
  const appears = (sel) => page.waitForSelector(sel, { timeout: 5000 }).then(() => true, () => false);
  const goes = (sel) => page.waitForSelector(sel, { state: 'detached', timeout: 5000 }).then(() => true, () => false);
  check(await appears(personRow('Weekend lead')), 'Alerts: a person added, in place');
  check((await page.textContent(`${personRow('Weekend lead')} td:nth-child(2)`)) === '+15550100144', 'Alerts: the phone number as the platform keeps it (+1 and the ten digits)');
  // Ticks: saved when pressed, as the platform then holds them.
  await page.click(tickOf('lane_problem', 'Weekend lead', 'text'));
  check(await appears(`${tickOf('lane_problem', 'Weekend lead', 'text')}[aria-checked="true"]`), 'Alerts: a text tick saved');
  await page.click(tickOf('card_payments_stopped', 'Weekend lead', 'email'));
  check(await appears(`${tickOf('card_payments_stopped', 'Weekend lead', 'email')}[aria-checked="true"]`), 'Alerts: an email tick saved');
  const weekend = (await platformAlerts(page, HARBOR.id)).contacts.find((c) => c.name === 'Weekend lead');
  check(JSON.stringify([weekend?.by_text, weekend?.by_email]) === JSON.stringify([['lane_problem'], ['card_payments_stopped']]), 'Alerts: ...and the platform holds exactly those');
  // The phone taken away: said before the save, and what stopped said after.
  await page.click(`${personRow('Weekend lead')} [data-action="change-person"]`);
  await page.fill('[data-panel="change-person"] [data-field="phone"]', '');
  check(await settles(page, (t) => document.querySelector('[data-notice="phone-goes"]')?.textContent === t, EN['alerts.phoneGoes']), `Alerts: emptying the phone says first: "${EN['alerts.phoneGoes']}"`);
  await page.click('[data-panel="change-person"] button[type="submit"]');
  const offSaid = `${EN['alerts.turnedOffText']} ${EN['alerts.alert.lane_problem']}`;
  check(await settles(page, (t) => document.querySelector('[data-notice="turned-off"]')?.textContent.includes(t), offSaid), `Alerts: after the save, "${offSaid}"`);
  check(await appears(missingOf('lane_problem', 'Weekend lead', 'phone')), 'Alerts: ...and their text ticks are no longer offered');
  // Remove: a question on the page, "No, keep them" beside it; then gone.
  await page.click(`${personRow('Office')} [data-action="remove-person"]`);
  const keep = await page.textContent('[data-panel="remove-person"] [data-action="close-panel"]');
  check(keep === EN['alerts.panelKeep'], `Alerts: removing asks on the page, with "${EN['alerts.panelKeep']}" beside "${EN['alerts.removeButton']}" (it says "${keep}")`);
  await page.click('[data-action="remove-person-confirm"]');
  check(await goes(personRow('Office')), 'Alerts: a person removed, in place');
  // The Setup step: the platform's, and it leads here.
  await page.click('.nav-item[href="#/setup"]');
  await stepsAgree(page, 'with the alerts changed');
  check((await page.textContent('[data-step="alerts"] .setup-where')) === EN['setup.goTo'].replace('{page}', ALERTS_TITLE), `Setup: the alerts step says where it is done: "${EN['setup.goTo'].replace('{page}', ALERTS_TITLE)}"`);
  const alertsStep = await page.textContent('[data-step="alerts"]');
  check(alertsStep.includes(EN['setup.fact.alertsNobody']) && alertsStep.includes(EN['alerts.alert.attendant_link_dropped']), 'Setup: the alerts step names, in words, the alerts nobody is told about');
  await page.click('[data-step="alerts"] .setup-where a');
  check(await showsHeading(page, ALERTS_TITLE), 'Setup: its alerts step leads to Alerts');
  await settles(page, () => document.querySelectorAll('[data-list="alerts"] tbody tr').length > 0);
  await checkPrint(page, ALERTS_TITLE, HARBOR);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'alerts-english.png'), fullPage: true });
  // The change log: each change said in words, and never the number or the address.
  await page.click('.nav-item[href="#/change-log"]');
  await settles(page, () => document.querySelectorAll('[data-list="changes"] tbody tr').length > 0);
  const logText = await page.textContent('[data-list="changes"]');
  check([EN['changes.action.alert_contact_add'], EN['changes.action.alert_contact_choices'], EN['changes.action.alert_contact_change'], EN['changes.action.alert_contact_remove'], EN['changes.value.phone.given']].every((w) => logText.includes(w)), `${CHANGES_TITLE}: each change to a person, in words`);
  check(!['+15550100144', '0100144', 'weekend.lead@example.com', 'office@example.com'].some((d) => logText.includes(d)), `${CHANGES_TITLE}: no phone number or email address in any line`);
  check(rawIn(logText).length === 0, `${CHANGES_TITLE}: nothing raw after the alerts changes${rawIn(logText).length ? `: ${rawIn(logText).join(', ')}` : ''}`);

  // ── U4, in Spanish ─────────────────────────────────────────────────────
  await onSettings(page, 'language', 'es');
  for (const [hash, key, expect] of [['#/setup', 'page.setup.title', 10], ['#/change-log', 'page.changes.title', 16], ['#/alerts', 'page.alerts.title', 10], ['#/lanes', 'page.lanes.title', 7]]) {
    await page.click(`.nav-item[href="${hash}"]`);
    check(await showsHeading(page, ES[key]), `en español: "${ES[key]}"`);
    await page.waitForTimeout(300);
    if (hash === '#/lanes') await settles(page, () => Boolean(document.querySelector('[data-form="board"]')));
    const text = await bodyText(page);
    check(rawIn(text).length === 0, `en español, ${ES[key]}: nothing raw on screen${rawIn(text).length ? `: ${rawIn(text).join(', ')}` : ''}`);
    await checkDescribed(page, ES[key], 'es', expect);
    if (SCREENS) await page.screenshot({ path: join(SCREENS, `${hash.slice(2)}-spanish.png`), fullPage: true });
  }
  check((await page.textContent('[data-form="board"] .section-title')) === ES['board.title'] && !(await bodyText(page)).includes('todavía no actúa'), `en español: what the lane screens show ("${ES['board.title']}"), and no word that the lane does not act on a closing`);
  await onSettings(page, 'language', 'en');

  // ── Day / night / auto ───────────────────────────────────────────────────
  await page.click('.nav-item[href="#/"]');
  check(await showsLook(page, 'day'), 'auto on a light computer is day');
  await onSettings(page, 'theme', 'night');
  check(await showsLook(page, 'night'), 'choosing night turns it to night');
  if (SCREENS) {
    await page.click('.nav-item[href="#/"]');
    await showsText(page, EN['home.inside']);
    await page.screenshot({ path: join(SCREENS, 'home-english-night.png') });
  }
  await page.reload();
  await page.waitForSelector('.page-title');
  check(await showsLook(page, 'night'), 'night is still night after a reload');
  check(await showsText(page, EN['signOut']), 'after a reload the owner is still signed in');
  await page.click('.nav-item[href="#/"]');
  await page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);
  await page.emulateMedia({ colorScheme: 'light' });
  check(await showsLook(page, 'night'), 'night stays night when the computer is light');
  await onSettings(page, 'theme', 'auto');
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
  await page.click('.nav-item[href="#/"]');
  await page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);
  await onSettings(page, 'theme', 'day');
  await page.emulateMedia({ colorScheme: 'dark' });
  check(await showsLook(page, 'day'), 'day stays day when the computer turns dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // ── The garage can be changed from the frame ────────────────────────────
  await page.click('.nav-item[href="#/lanes"]');
  await page.click('[data-action="change-garage"]');
  check(await showsText(page, EN['garage.choose']), 'the garage can be changed from the frame');
  await page.click(`.garage-choice[data-garage="${A.garages[1].id}"]`);
  check(await settles(page, (n) => document.querySelector('.garage-current')?.textContent === n, A.garages[1].name), 'and the frame shows the one chosen');
  await page.click('[data-action="change-garage"]');
  await page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);

  // ── No car confirmed inside, but one let in: never "no cars" ────────────
  // The platform's answer for that state, once, from the stand-in's own stay.
  const letInOnly = A.open[A.garages[0].id].filter((s) => s.entry_confirmation !== 'confirmed');
  await page.click(INSIDE_NAV);
  await showsText(page, 'HRB4410');
  // Home reads it twice for this garage: its line in the list, and the garage shown below (U7a).
  await page.route(
    `**/api/v1/garages/${A.garages[0].id}/sessions/open`,
    (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inside_count: 0, unconfirmable_count: letInOnly.length, open_count: letInOnly.length, sessions: letInOnly }) }),
    { times: 2 },
  );
  await page.click('.nav-item[href="#/"]');
  const noneConfirmed = await settles(
    page,
    ([figure, more]) => document.querySelector('[data-figure="inside"]')?.textContent === figure && document.querySelector('[data-figure="unconfirmed"]')?.textContent === more,
    [EN['inside.countNoneConfirmed'], EN['inside.unconfirmedOne']],
  );
  check(noneConfirmed, `Home: none confirmed but one let in says "${EN['inside.countNoneConfirmed']}", then "${EN['inside.unconfirmedOne']}" (it says "${await page.textContent('[data-figure="inside"]').catch(() => '')}")`);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'home-none-confirmed-english.png') });

  // ── Quick Find, by keyboard ──────────────────────────────────────────────
  await page.keyboard.press('Control+K');
  check(await page.isVisible('.find-dialog'), 'Ctrl+K opens Quick Find');
  check(await page.evaluate(() => document.activeElement?.classList.contains('find-input')), 'the typing goes straight into it');
  await checkQuickFindDescribed(page, 'en');
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
  await onSettings(page, 'theme', 'day');

  // ── Spanish ──────────────────────────────────────────────────────────────
  await onSettings(page, 'language', 'es');
  check(await showsHeading(page, ES['page.settings.title']), 'choosing Español turns the page to Spanish');
  await checkChoosers(page, 'Settings', 'es');
  await checkDescribed(page, ES['page.settings.title'], 'es', 2);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'settings-spanish.png') });
  await page.click('.nav-item[href="#/"]');
  check(await showsHeading(page, ES['page.home.title']), 'Home in Spanish');
  check((await page.getAttribute('html', 'lang')) === 'es', 'and tells the browser so');
  check((await detailRead(page, ES.loading)) && (await detailCount(page)) === ES['inside.countMany'].replace('{count}', '2'), 'Home in Spanish: the count');
  const homeEs = (await bodyText(page)).toLowerCase();
  check(['pase de garaje', 'mensual', 'visitante'].every((k) => !homeEs.includes(k)), 'Home in Spanish: no breakdown by kind of customer');
  check(homeEs.includes(ES['lane.quiet'].replace('{time}', inZone('2026-03-10T19:40:00Z', 'America/New_York', 'es')).toLowerCase()), 'Home in Spanish: the quiet lane, in garage time');
  check(await until(() => A.language === 'es'), `choosing Español while signed in keeps it on the owner's profile (the stand-in holds "${A.language}")`);
  await checkDescribed(page, 'Home', 'es', 3);
  const southEs = ES['lane.cancelledOne'].replace('{time}', inZone('2026-03-10T14:30:00Z', 'America/New_York', 'es'));
  const southSaysEs = await laneSays(page, 'South Exit');
  check(southSaysEs === southEs, `Home in Spanish: the lane whose only computer was cancelled says "${southEs}" (it says "${southSaysEs}")`);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'home-spanish.png') });
  await page.keyboard.press('Control+K');
  await checkQuickFindDescribed(page, 'es');
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'quick-find-spanish.png') });
  await page.keyboard.press('Escape');
  await page.click('.nav-item[href="#/lanes"]');
  await showsText(page, 'Harbor exit computer');
  await settles(page, () => Boolean(document.querySelector('[data-form="board"]')));
  await checkDescribed(page, ES['page.lanes.title'], 'es', 7);
  check((await bodyText(page)).includes(ES['device.off'].replace('{time}', inZone('2026-01-05T13:55:00Z', 'America/New_York', 'es'))), 'Carriles y equipos: the cancelled computer, in Spanish');
  check((await bodyText(page)).includes(ES['device.off'].replace('{time}', inZone('2026-03-10T14:30:00Z', 'America/New_York', 'es'))), "Carriles y equipos: the lane whose only computer was cancelled, in Spanish");
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'lanes-spanish.png'), fullPage: true });
  await page.click(INSIDE_NAV);
  await showsText(page, 'HRB4410');
  await checkDescribed(page, ES['page.inside.title'], 'es', 5);
  await checkNoEveryCarClaim(page, 'es');
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'garage-view-spanish.png'), fullPage: true });
  await page.click('.nav-item[href="#/"]');
  await page.reload();
  await page.waitForSelector('.page-title');
  await page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);
  check(await showsHeading(page, ES['page.home.title']), 'Spanish is still Spanish after a reload');
  for (const p of PAGES) {
    await page.click(`.nav-item[href="#${p.path}"]`);
    const title = ES[`page.${p.id}.title`];
    check(await showsHeading(page, title), `la navegación llega a "${title}"`);
    await allRead(page, ES.loading);
    const dice = await bodyText(page);
    check(!LANE_COMPUTER.test(dice), `"${title}": nunca "computadora de carril"${LANE_COMPUTER.test(dice) ? ` (dice "${dice.match(LANE_COMPUTER)[0]}")` : ''}`);
  }
  await page.keyboard.press('Control+K');
  await page.keyboard.type('impuestos');
  check(await selects(page, 'taxes'), '"impuestos" picks Impuestos y cargos');
  await page.keyboard.press('Enter');
  check(await showsHeading(page, ES['page.taxes.title']), 'and Enter goes there');
  // A Quick Find that found nothing stays open over the page; close it, so one
  // failure above does not stop the walk before the checks below are run.
  if (await page.isVisible('.find-dialog')) await page.keyboard.press('Escape');
  await onSettings(page, 'language', 'en');
  // The save of English lands before a failure is asked of the stand-in, or the save would meet it.
  check(await until(() => A.language === 'en'), 'and English chosen again is kept on the profile');

  // ── Nothing raw reaches the screen ──────────────────────────────────────
  // Each failure is met by a read: Garage View asks again on arrival.
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
    await noneInFlight(page);
    if (kind === 'drop') {
      await page.route('**/api/v1/garages/*/sessions/open', (route) => route.abort('connectionreset'), { times: 1 });
    } else stub.failNext(kind);
    await page.click(INSIDE_NAV);
    const shown = await showsText(page, EN[key]);
    const raw = rawIn(await bodyText(page));
    check(shown && raw.length === 0, `${what}: the screen says "${EN[key]}"${raw.length ? `; RAW on screen: ${raw.join(', ')}` : ''}`);
    await page.click('.problem-note .link-button');
    check(await showsText(page, 'HRB4410'), `${what}: "${EN.retry}" brings the list back`);
  }

  // ── A session that ended ────────────────────────────────────────────────
  await noneInFlight(page);
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
  await noneInFlight(page);
  stub.failNext('plain401');
  await page.click(INSIDE_NAV);
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
  const englishSignedIn = [EN['home.garages'], EN.signOut, ...PAGES.map((p) => EN[`page.${p.id}.title`])].filter(
    (w) => !Object.values(ES).includes(w),
  );
  A.language = 'en';
  const first = await open();
  await signIn(first.page, A);
  await first.page.click(`.garage-choice[data-garage="${A.garages[0].id}"]`);
  await onSettings(first.page, 'language', 'es');
  await showsHeading(first.page, ES['page.settings.title']);
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
  check(await showsText(second.page, ES['home.garages']), 'kept on the profile: signed in on a different browser, the owner sees Spanish');
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
    await noneInFlight(failing.page);
    await fail();
    await onSettings(failing.page, 'language', next);
    const said = await showsText(failing.page, words['language.notKept']);
    const raw = rawIn(await bodyText(failing.page));
    check(
      said && raw.length === 0 && (await showsHeading(failing.page, words['page.settings.title'])),
      `a failed save, ${what}: the screen changed language and says "${words['language.notKept']}"${raw.length ? `; RAW on screen: ${raw.join(', ')}` : ''}`,
    );
    check(A.language === 'en', `a failed save, ${what}: the profile was not changed (the stand-in holds "${A.language}")`);
  }
  await failing.page.click('[data-control="language"] [data-value="en"]');
  check(await settles(failing.page, () => !document.querySelector('[data-notice="language-not-kept"]')), 'a save that works takes the sentence away');
  check(await until(() => A.language === 'en'), 'and that save reached the profile');
  await noneInFlight(failing.page);
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
