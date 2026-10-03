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
// sign-out, a 401 from a read, the next owner signing in, and every other
// answer sign-in can give, in both languages. The page policy
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
stub.allowOrigin(origin);
const browser = await chromium.launch();
const requests = [];
const policyBroken = [];

const builtPage = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');
check(/http-equiv="Content-Security-Policy"/.test(builtPage), 'the built page carries its page policy');

async function open({ locale = 'en-US', colorScheme = 'light' } = {}) {
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
  await page.goto(base);
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
  // Print view.
  await page.emulateMedia({ media: 'print' });
  await page.click('[data-action="print"]').catch(() => {});
  const printed = await page.evaluate(() => ({
    frame: [...document.querySelectorAll('.sidebar, .topbar')].some((e) => getComputedStyle(e).display !== 'none'),
    head: getComputedStyle(document.querySelector('.print-head')).display !== 'none',
    text: document.querySelector('.print-head')?.innerText ?? '',
    ink: getComputedStyle(document.body).color,
  }));
  check(!printed.frame, 'print: no frame');
  check(printed.head && printed.text.includes(A.garages[0].name), 'print: the garage name');
  check(printed.text.includes(EN['print.printed'].split('{time}')[0].trim()), 'print: the time it was printed');
  check(printed.ink === 'rgb(0, 0, 0)', `print: black text (${printed.ink})`);
  if (SCREENS) await page.screenshot({ path: join(SCREENS, 'print-cars-inside.png'), fullPage: true });
  await page.emulateMedia({ media: 'screen' });

  await page.click('.nav-item[href="#/lanes"]');
  await showsText(page, 'Harbor exit computer');
  const lanes = await bodyText(page);
  check(lanes.includes(quiet), 'Lanes and devices: the quiet lane computer, in garage time');
  check(lanes.includes(EN['device.off'].replace('{time}', inZone('2026-01-05T13:55:00Z', 'America/New_York', 'en'))), 'Lanes and devices: a disconnected computer, in garage time');
  check(lanes.includes(EN['lanes.readerYes']) && lanes.includes(EN['lanes.readerNo']), 'Lanes and devices: which lanes have a card reader');

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
  await page.click('[data-control="language"] [data-value="en"]');

  // ── Nothing raw reaches the screen ──────────────────────────────────────
  // Each failure is met by a read: the Cars inside page asks again on arrival.
  const failuresMet = [
    ['nonJson', 'a body that is not JSON', 'problem.unexpected'],
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

  // ── First visit follows the browser ──────────────────────────────────────
  const spanish = await open({ locale: 'es-US' });
  check(await showsHeading(spanish.page, ES['signIn.title']), 'first visit from a Spanish browser is in Spanish');
  await spanish.context.close();
  const french = await open({ locale: 'fr-FR' });
  check(await showsHeading(french.page, EN['signIn.title']), 'first visit from any other browser is in English');
  await french.context.close();
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
} catch (error) {
  failures.push(`the walk stopped: ${error.message.split('\n')[0]}`);
  console.error(error);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  await stub.close();
}

// ── The page policy held ───────────────────────────────────────────────────
check(policyBroken.length === 0, `the page policy was never broken (${policyBroken.length} violations)`);
for (const v of [...new Set(policyBroken)]) console.error(`  policy violation: ${v.slice(0, 200)}`);

// ── No request leaves the page, and none carries a credential in its address
const outside = requests.filter((u) => new URL(u).origin !== origin);
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
  `\nbrowser — ${passed} checks passed; ${requests.length} requests, all to ${origin}, ${apiCount} of them to the platform; ` +
    `browser in ${BROWSER_ZONE}; 0 page policy violations.${SCREENS ? ` Screenshots in ${SCREENS}.` : ''}`,
);
