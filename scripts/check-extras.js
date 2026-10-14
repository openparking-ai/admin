#!/usr/bin/env node
/* global document */
// Extra pages from the host, in a real browser (src/extras.js).
//
// Serves dist/ (run `npm run build` first) with /api sent to the stand-in platform
// (test/stub-platform.js), and beside it a HOST of this check's own that serves
// /extra-pages.json and a made-up extra page (test/extra-page/). Signs in, and checks:
//
//   1  Setup lists the host's step, with its state read from the host's status path and
//      one line of facts; opened, its page is drawn in a frame of this origin, handed the
//      chosen garage, the language and the look;
//   2  the frame's height follows what the page says of itself; when the page says something
//      changed, the step's state is read again and its Done mark and the count follow;
//   3  Garage View holds the host's section, its name shown as text (a planted <script> is
//      text on screen and no dialog opens); an entry whose path is another host's is not
//      drawn anywhere;
//   4  the language and the look chosen on Settings reach the framed page;
//   5  the page policy holds throughout, every request went to this origin, and nothing was
//      drawn with the file absent;
//   6  the host's menu group: its name in the side menu as text, its pages under it and no
//      entry refused by the file; a page opened with no garage chosen asks for one in these
//      screens' own way and draws no frame; chosen, the page is drawn in a frame of this
//      origin handed the garage; the group closes and opens; the page's own address opens
//      it; a malformed file leaves the menu exactly as with no file.
//
//   node scripts/check-extras.js                 the check
//   node scripts/check-extras.js --screens DIR   ...and save the screenshots

import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { startStub } from '../test/stub-platform.js';
import { goNav } from './nav.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const PAGE_DIR = join(ROOT, 'test', 'extra-page');
const screensAt = process.argv.indexOf('--screens');
const SCREENS = screensAt > 0 ? process.argv[screensAt + 1] : null;
if (SCREENS) mkdirSync(SCREENS, { recursive: true });

const failures = [];
let passed = 0;
const check = (ok, what) => {
  if (ok) passed += 1;
  else failures.push(what);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};

// The host of this check: the file, the made-up page, and a status door that is "not done"
// until the page has said something changed (then done, with a line of facts).
let serveFile = true;
// When set, the host serves this text as its file instead (a malformed file).
let fileOverride = null;
let changedTimes = 0;
const host = createServer((req, res) => {
  const url = new URL(req.url, 'http://host');
  const send = (status, type, body) => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  if (url.pathname === '/extra-pages.json') {
    if (!serveFile) return send(404, 'text/plain', 'no');
    if (fileOverride !== null) return send(200, 'application/json', fileOverride);
    return send(200, 'application/json', readFileSync(join(PAGE_DIR, 'extra-pages.json')));
  }
  if (url.pathname === '/example-extra/' || url.pathname === '/example-extra/index.html') return send(200, 'text/html; charset=utf-8', readFileSync(join(PAGE_DIR, 'index.html')));
  if (url.pathname === '/example-extra/page.js') return send(200, 'text/javascript', readFileSync(join(PAGE_DIR, 'page.js')));
  const status = /^\/api\/example-extra\/garages\/([^/]+)\/status$/.exec(url.pathname);
  if (status) {
    // The status door: a read with the owner's cookie only (as a real host's door would hold it).
    if (!/op_session=/.test(req.headers.cookie ?? '')) return send(401, 'application/json', '{}');
    if (req.method === 'POST') { changedTimes += 1; return send(200, 'application/json', '{}'); }
    const done = changedTimes > 0;
    return send(200, 'application/json', JSON.stringify({ done, facts: { en: done ? '1 thing built' : 'nothing built yet', es: done ? '1 cosa construida' : 'nada construido todavía' } }));
  }
  return send(404, 'text/plain', 'no');
});
await new Promise((resolve) => host.listen(0, '127.0.0.1', resolve));
const hostUrl = `http://127.0.0.1:${host.address().port}`;

const stub = await startStub();
const A = stub.data.a;
const server = await preview({
  root: ROOT,
  logLevel: 'silent',
  preview: {
    port: 4327,
    strictPort: false,
    host: '127.0.0.1',
    proxy: { '/api/example-extra': { target: hostUrl }, '/api': { target: stub.url }, '/extra-pages.json': { target: hostUrl }, '/example-extra': { target: hostUrl } },
  },
});
const base = server.resolvedUrls.local[0];
const origin = new URL(base).origin;
stub.allowOrigin(origin);
const browser = await chromium.launch();
const requests = [];
const policyBroken = [];
const dialogs = [];

async function open() {
  const context = await browser.newContext({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1360, height: 900 } });
  context.on('request', (r) => requests.push(r.url()));
  context.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) policyBroken.push(m.text());
  });
  const page = await context.newPage();
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  page.on('pageerror', (e) => {
    if (/Content Security Policy/i.test(e.message)) policyBroken.push(e.message);
  });
  await page.goto(base);
  await page.waitForSelector('.page-title');
  return { context, page };
}
const settles = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 }).then(() => true, () => false);
async function signIn(page, who) {
  await page.fill('input[name="email"]', who.email);
  await page.fill('input[name="password"]', who.password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('.nav');
}
const shot = (page, name) => (SCREENS ? page.screenshot({ path: join(SCREENS, `${name}.png`), fullPage: true }) : Promise.resolve());
// Where the check is, for the report when it stops.
let at = 'the start';
const now = (name) => { at = name; };

try {
  const { page } = await open();
  await signIn(page, A);
  // The owner's first garage, chosen on Home.
  await page.click(`[data-garage="${A.garages[0].id}"]`);
  now('Setup');
  await goNav(page, '#/setup');
  await page.waitForSelector('[data-list="setup"]');

  // 1. The host's step: listed, read, and opened in a frame of this origin.
  const step = page.locator('[data-extra-step="example-extra"]');
  check((await step.count()) === 1, 'Setup lists the host\'s step');
  check(await settles(page, () => document.querySelector('[data-extra-step="example-extra"]')?.dataset.done === 'no'), 'the step\'s state is read from the host\'s status path: not yet');
  check((await step.locator('[data-fact="extra"]').textContent()) === 'nothing built yet', 'the step shows the host\'s one line of facts');
  const platformSteps = await page.locator('[data-list="setup"] .setup-step:not([data-extra-step])').count();
  const countWords = await page.locator('.setup-count').textContent();
  check(countWords.includes(`of ${platformSteps + 1} steps`), `the count includes the host's step (${countWords})`);
  await step.locator('[data-action="open-extra"]').click();
  const frame = step.locator('iframe[data-extra-frame="example-extra"]');
  await frame.waitFor();
  const src = await frame.getAttribute('src');
  check(src.startsWith('/example-extra/?framed=example-extra&garage=') && src.includes(`garage=${A.garages[0].id}`) && src.includes('language=en') && src.includes('look='), `the frame is this origin's page, handed the garage, the language and the look (${src})`);
  const inner = page.frameLocator('iframe[data-extra-frame="example-extra"]');
  check(await inner.locator('[data-garage]').textContent() === `garage: ${A.garages[0].id}`, 'the framed page received the chosen garage');
  await shot(page, 'setup-step-open');

  // 2. The height follows; a change re-reads the state.
  const before = await frame.evaluate((el) => el.getBoundingClientRect().height);
  await inner.locator('[data-action="grow"]').click();
  check(await settles(page, (was) => (document.querySelector('iframe[data-extra-frame="example-extra"]')?.getBoundingClientRect().height ?? 0) >= was + 500, before), `the frame grew with its page (was ${before})`);
  await inner.locator('[data-action="change"]').click();
  // The host's status door is told of the change by the page itself in life; here the check tells it.
  await page.evaluate((g) => fetch(`/api/example-extra/garages/${g}/status`, { method: 'POST', credentials: 'same-origin' }), A.garages[0].id);
  await inner.locator('[data-action="change"]').click();
  check(await settles(page, () => document.querySelector('[data-extra-step="example-extra"]')?.dataset.done === 'yes'), 'after the page said something changed, the step was read again: done');
  check(await settles(page, () => document.querySelector('[data-extra-step="example-extra"] [data-fact="extra"]')?.textContent === '1 thing built'), 'and its facts followed');
  check(await settles(page, (n) => document.querySelector('.setup-count')?.textContent.startsWith(`${n} of `), Number(countWords.split(' ')[0]) + 1), 'and the count went up by one');
  await shot(page, 'setup-step-done');

  now('Garage View');
  // 3. The section on Garage View; the planted name as text; the entry of another host not drawn.
  await goNav(page, '#/garage-view');
  await page.waitForSelector('[data-extra="example-section"]');
  const title = await page.locator('[data-extra="example-section"] .section-title').textContent();
  check(title.includes('<script>alert(1)</script>'), 'the section\'s name from the file is shown as text');
  check((await page.locator('[data-extra="refused-elsewhere"], [data-extra-frame="refused-elsewhere"]').count()) === 0, 'an entry whose path is another host\'s is not drawn');
  check((await page.locator('[data-extra="example-section"] iframe').count()) === 1, 'the section holds its frame');
  await shot(page, 'garage-view-section');

  now('the menu group');
  // 6. The host's menu group, in English and by day.
  const group = page.locator('[data-nav-group="example-group"]');
  check((await group.count()) === 1, 'the side menu holds the host\'s group');
  check((await group.locator('.nav-group-name').textContent()).includes('<img src=x onerror=alert(2)> Example group'), 'the group\'s name from the file is shown as text');
  check((await group.locator('.nav-group-name > .icon').count()) === 1 && (await group.locator('.nav-group-name .nav-group-chevron').count()) === 1, 'the host\'s group row has its own icon and its chevron, as Setup\'s');
  check((await page.locator('.sidebar img').count()) === 0, 'and nothing in it was read as markup');
  const menuIds = await page.$$eval('[data-nav-extra]', (els) => els.map((e) => e.dataset.navExtra));
  check(JSON.stringify(menuIds) === JSON.stringify(['example-menu', 'example-menu-two']), `its two pages are under it, and no page the file refused (${menuIds.join(', ')})`);
  check((await page.locator('[data-nav-group="empty-group"]').count()) === 0, 'a group with no page is not drawn');
  // No garage chosen: the page asks for one, the admin's own way, and draws no frame.
  await page.click('[data-action="change-garage"]');
  await page.click('[data-nav-extra="example-menu"]');
  await settles(page, () => document.querySelector('.page-title')?.textContent === 'An example menu page');
  check(await settles(page, (id) => Boolean(document.querySelector(`.content [data-garage="${id}"]`)), A.garages[1].id), 'with no garage chosen, the page asks for one the admin\'s own way');
  const shownTitle = await page.locator('.page-title').textContent();
  check(shownTitle === 'An example menu page', `the page's name is the title (${shownTitle})`);
  check((await page.locator('.content iframe').count()) === 0, 'with no garage chosen, no frame is drawn');
  await shot(page, 'menu-page-choose-garage');
  const chooseFirst = page.locator(`.content [data-garage="${A.garages[0].id}"]`);
  if (await chooseFirst.count()) await chooseFirst.first().click();
  else await page.click(`[data-garage="${A.garages[0].id}"]`).catch(() => {});
  const menuFrame = page.locator('iframe[data-extra-frame="example-menu"]');
  await menuFrame.waitFor();
  const menuSrc = await menuFrame.getAttribute('src');
  check(menuSrc.startsWith('/example-extra/?framed=example-menu&garage=') && menuSrc.includes(`garage=${A.garages[0].id}`) && menuSrc.includes('language=en'), `chosen, the page is drawn in a frame of this origin, handed the garage (${menuSrc})`);
  check(await page.frameLocator('iframe[data-extra-frame="example-menu"]').locator('[data-garage]').textContent() === `garage: ${A.garages[0].id}`, 'the framed page received the chosen garage');
  check((await page.locator('[data-nav-extra="example-menu"][aria-current="page"]').count()) === 1 && (await page.locator('.nav-item[aria-current="page"]').count()) === 1, 'the menu marks that page, and only it');
  check((await page.title()).startsWith('An example menu page'), 'the window\'s title names the page');
  await shot(page, 'menu-page');
  await page.click('[data-nav-extra="example-menu-two"]');
  const twoSrc = await page.locator('iframe[data-extra-frame="example-menu-two"]').getAttribute('src');
  check(twoSrc.startsWith('/example-extra/?framed=example-menu-two&') && twoSrc.endsWith('#/two'), `the second page opens in its own frame (${twoSrc})`);
  await group.locator('.nav-group-name').click();
  check((await group.locator('.nav-group-name').getAttribute('aria-expanded')) === 'false' && (await page.locator('[data-nav-extra]').count()) === 0, 'the group closes');
  await group.locator('.nav-group-name').click();
  check((await page.locator('[data-nav-extra]').count()) === 2, 'and opens again');
  // The page's own address opens it, once the host's file is read.
  await page.goto(`${base}#/extra/example-menu`);
  await page.waitForSelector('.page-title');
  check(await settles(page, () => document.querySelector('.page-title')?.textContent === 'An example menu page'), 'the page\'s own address opens it');
  // Back to where the checks below start: the first garage chosen.
  const again = page.locator(`.content [data-garage="${A.garages[0].id}"]`);
  if (await again.count()) await again.first().click();
  await goNav(page, '#/garage-view');
  await page.waitForSelector('[data-extra="example-section"]');

  now('Settings, then Garage View again');
  // 4. The language and the look chosen on Settings reach the framed page.
  await goNav(page, '#/settings');
  await page.click('[data-control="language"] [data-value="es"]');
  await page.click('[data-control="theme"] [data-value="night"]');
  await goNav(page, '#/garage-view');
  await page.waitForSelector('[data-extra="example-section"] iframe');
  const section = page.frameLocator('[data-extra="example-section"] iframe');
  check(await settles(page, () => document.querySelector('[data-extra="example-section"] iframe')?.contentDocument?.querySelector('[data-language]')?.textContent === 'language: es'), 'the framed page speaks the language chosen on Settings');
  check(await settles(page, () => document.querySelector('[data-extra="example-section"] iframe')?.contentDocument?.querySelector('[data-look]')?.textContent === 'look: night'), 'and wears the look chosen there');
  check((await section.locator('[data-garage]').count()) === 1, 'the framed page is there in Spanish and at night');
  await shot(page, 'garage-view-section-night-es');

  now('a malformed file');
  // 6, the end. A malformed file: the menu is exactly as with no file (compared below).
  fileOverride = JSON.stringify({ groups: 5, pages: [{ id: 'example-menu', prefixes: ['/example-extra/'], page: '/example-extra/', title: { en: 'x', es: 'x' }, purpose: { en: 'x', es: 'x' }, menu: { group: 'example-group' } }] });
  await page.reload();
  await page.waitForSelector('.nav');
  const menuMalformed = await page.locator('.nav').first().innerHTML();
  check((await page.locator('[data-nav-group]:not([data-own-group]), [data-nav-extra]').count()) === 0, 'with a malformed file, the menu holds nothing of the host');
  fileOverride = '{"groups": [';
  await page.reload();
  await page.waitForSelector('.nav');
  const menuNotJson = await page.locator('.nav').first().innerHTML();
  fileOverride = null;

  now('the file absent');
  // 5. The file absent: nothing of the host anywhere.
  serveFile = false;
  await page.reload();
  await page.waitForSelector('.page-title');
  const menuAbsent = await page.locator('.nav').first().innerHTML();
  check(menuMalformed === menuAbsent && menuNotJson === menuAbsent, 'a malformed file, or one that is not JSON, leaves the menu exactly as with no file');
  // Reloaded, the garage is chosen again (the choice is not kept across a reload).
  const picker = page.locator(`[data-garage="${A.garages[0].id}"]`);
  if (await picker.count()) await picker.first().click();
  await goNav(page, '#/setup');
  await page.waitForSelector('[data-list="setup"]');
  check((await page.locator('[data-extra-step]').count()) === 0, 'with no file from the host, Setup lists no extra step');
  await goNav(page, '#/garage-view');
  await page.waitForSelector('[data-list="inside"]');
  check((await page.locator('[data-extra]').count()) === 0, 'and Garage View holds no section');
} catch (err) {
  failures.push(`the check stopped at "${at}": ${err.message.split('\n')[0]}`);
}

check(dialogs.length === 0, `no dialog opened (${dialogs.length})`);
check(policyBroken.length === 0, `the page policy held (${policyBroken.length} broken)`);
const elsewhere = requests.filter((u) => !u.startsWith(`${origin}/`));
check(elsewhere.length === 0, `every request went to this origin (${elsewhere.slice(0, 3).join(', ')})`);

await browser.close();
await server.close();
await stub.close();
await new Promise((resolve) => host.close(resolve));
if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`\nextra pages — ${passed} checks passed`);
