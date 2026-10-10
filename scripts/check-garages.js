#!/usr/bin/env node
/* global document, window, getComputedStyle */
// The Garages page and adding a garage (U7c), in a real browser.
//
// Serves dist/ (run `npm run build` first) with /api sent to the stand-in
// platform (test/stub-platform.js), opens it in headless Chromium with the
// browser in TOKYO time, and checks, in English and in Spanish:
//
//   1  the Garages page lists the account's garages: each row its name, its
//      time zone and money in words, open or not, and how many of its Setup
//      steps are done as the platform's setup read counts them; each row,
//      pressed, chooses that garage and opens its Setup. With 45 garages it
//      shows 20 a page, and pages through all 45 with none missed or repeated;
//   2  Add a garage: nothing picked until the owner picks, the United States'
//      time zones first and US dollars first; the check step shows the three
//      answers and that they cannot be changed after; Create garage, pressed
//      twice quickly, sends exactly ONE POST /garages holding exactly name,
//      timezone and currency; the new garage is chosen, its Setup shown, and
//      its "Garage details" step done -- from a new account's Home and from
//      the Garages page;
//   3  a blank field (a name of only spaces too) sends nothing, and says why
//      in plain words;
//   4  a refusal (the stand-in answers 400) is said in plain words; no garage
//      is chosen and the list is unchanged;
//   5  an account with no garage: every page offers Add a garage;
//   6  the refused attempts' count follows the choices: "24 of 120 refused
//      attempts" with some ticked, and as before with none (or only sorted);
//   and Quick Find finds Add a garage and the Garages page, and every new
//   field shows its description under its name.
// No request leaves the page.
//
//   node scripts/check-garages.js                 the check
//   node scripts/check-garages.js --screens DIR   ...and save the screenshots

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { DICTIONARIES } from '../src/i18n/index.js';
import { PAGES, hashFor } from '../src/pages.js';
import { US_ZONES } from '../src/garages.js';
import { startStub } from '../test/stub-platform.js';
import { chooseOnSettings } from './on-settings.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const screensAt = process.argv.indexOf('--screens');
const SCREENS = screensAt > 0 ? process.argv[screensAt + 1] : null;
if (SCREENS) mkdirSync(SCREENS, { recursive: true });
const WORDS = DICTIONARIES;
const LANGUAGES = ['en', 'es'];

const failures = [];
let passed = 0;
const check = (ok, what) => {
  if (ok) passed += 1;
  else failures.push(what);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};

const stub = await startStub();
const A = stub.data.a;
const C = stub.data.c;
const HARBOR = A.garages[0];
const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4387, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } } });
const base = server.resolvedUrls.local[0];
const origin = new URL(base).origin;
stub.allowOrigin(origin);
const browser = await chromium.launch();
const requests = []; // { method, url, body }

const n = (x, language) => x.toLocaleString(language === 'es' ? 'es-US' : 'en-US');
const fill = (text, values) => Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), text);
const settles = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const showsHeading = (page, text) => settles(page, (t) => document.querySelector('.page-title')?.textContent === t, text);
const go = (page, id) => page.click(`.nav-item[href="${hashFor(PAGES.find((x) => x.id === id))}"]`);
const posts = () => requests.filter((r) => r.method === 'POST' && new URL(r.url).pathname === '/api/v1/garages');
const screenshot = async (page, name) => {
  if (!SCREENS) return;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(SCREENS, `${name}.png`), fullPage: true });
};

async function open(who) {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo', viewport: { width: 1360, height: 900 } });
  context.on('request', (r) => requests.push({ method: r.method(), url: r.url(), body: r.postData() }));
  const page = await context.newPage();
  await page.goto(base);
  await page.fill('input[name="email"]', who.email);
  await page.fill('input[name="password"]', who.password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('.nav');
  return { context, page };
}
const speak = (page, language) => chooseOnSettings(page, 'language', language);
const look = (page, theme) => chooseOnSettings(page, 'theme', theme);

/** The setup read of a garage, as the platform gives it: how many of its steps are done, of how many. */
const platformSetup = (page, id) =>
  page.evaluate(async (g) => {
    const { setup } = await (await fetch(`/api/v1/garages/${g}/setup`)).json();
    return { done: setup.steps.filter((s) => s.done).length, steps: setup.steps.length, details: setup.steps.find((s) => s.key === 'garage_details')?.done };
  }, id);

/** Each description under its name, on screen, in `language`. */
async function described(page, keys, language, label) {
  const wrong = [];
  for (const key of keys) {
    const shown = await page.$eval(`[data-about="${key}"]`, (e) => (getComputedStyle(e).display === 'none' ? null : e.textContent)).catch(() => null);
    if (shown !== WORDS[language][`${key}.about`]) wrong.push(`${key}: ${shown === null ? 'not shown' : `"${shown}"`}`);
  }
  check(wrong.length === 0, `descriptions (${language}): ${label}, each under its name${wrong.length ? `; ${wrong.join('; ')}` : ''}`);
}

/** The rows of the Garages page shown now: { id, name, zone, money, live, setup }. */
const garageRows = (page) =>
  page.$$eval('[data-list="garages-page"] tbody tr', (trs) =>
    trs.map((tr) => {
      const td = [...tr.querySelectorAll('td')].map((c) => c.textContent);
      return { id: tr.dataset.garageRow, name: td[0], zone: td[1], money: td[2], live: td[3], setup: td[4], read: tr.querySelector('[data-read]')?.dataset.read };
    }),
  );

/** What a time zone and a currency of the stand-in's garages are said as. */
const ZONE_KEY = Object.fromEntries(US_ZONES.map((z) => [z.id, `zone.${z.key}`]));
const MONEY_KEY = { USD: 'money.usd' };

/** Open Add a garage, wherever its button is. */
async function openForm(page) {
  await page.click('[data-action="add-garage"]');
  await page.waitForSelector('[data-form="add-garage"] [data-step="form"]');
}
async function answer(page, { name = '', zone = '', money = '' }) {
  await page.fill('[data-form="add-garage"] [data-field="name"]', name);
  await page.selectOption('[data-form="add-garage"] [data-field="zone"]', zone);
  await page.selectOption('[data-form="add-garage"] [data-field="money"]', money);
}

try {
  // ── 5: an account with no garage starts by adding one, on every page ──────
  {
    const { context, page } = await open(C);
    for (const language of LANGUAGES) {
      await speak(page, language);
      const w = WORDS[language];
      const without = [];
      for (const p of PAGES.filter((x) => x.id !== 'settings')) {
        await go(page, p.id);
        await showsHeading(page, w[`page.${p.id}.title`]);
        const offered = await settles(page, (t) => {
          const b = document.querySelector('[data-action="add-garage"]');
          return b && b.offsetParent !== null && b.textContent === t;
        }, w['garages.add'], 4000);
        if (!offered) without.push(w[`page.${p.id}.title`]);
      }
      check(without.length === 0, `5 no garages (${language}): every page offers "${w['garages.add']}"${without.length ? `; not on ${without.join(', ')}` : ''}`);
      await go(page, 'home');
      await screenshot(page, `no-garages-${language}`);
      // ── 3: a blank field sends nothing, and says why ───────────────────────
      const sentBefore = posts().length;
      const receivedBefore = stub.garageBodies().length;
      await openForm(page);
      await described(page, ['garages.form.name', 'garages.form.zone', 'garages.form.money'], language, 'Add a garage');
      const blanks = [
        { what: 'no name', answers: { zone: 'America/Chicago', money: 'USD' }, notices: ['need-name'] },
        { what: 'a name of only spaces', answers: { name: '   ', zone: 'America/Chicago', money: 'USD' }, notices: ['need-name'] },
        { what: 'no time zone', answers: { name: 'Blank Zone Garage', money: 'USD' }, notices: ['need-zone'] },
        { what: 'no money', answers: { name: 'Blank Money Garage', zone: 'America/Chicago' }, notices: ['need-money'] },
        { what: 'nothing at all', answers: {}, notices: ['need-name', 'need-zone', 'need-money'] },
      ];
      const said = { 'need-name': 'garages.needName', 'need-zone': 'garages.needZone', 'need-money': 'garages.needMoney' };
      for (const b of blanks) {
        const before = posts().length;
        await answer(page, b.answers);
        await page.click('[data-action="check-garage"]');
        // Were the check step to come up anyway, press Create too: what matters is what is sent.
        if (await settles(page, () => Boolean(document.querySelector('[data-form="add-garage"] [data-step="check"]')), undefined, 1500)) {
          await page.click('[data-action="create-garage"]');
          await page.waitForTimeout(1000);
          await page.click('[data-action="change-answers"]').catch(() => {});
        }
        const notices = await page.$$eval('[data-form="add-garage"] .warning[data-notice]', (ps) => ps.map((p) => [p.dataset.notice, p.textContent]));
        const right = b.notices.every((k) => notices.some(([nk, text]) => nk === k && text === w[said[k]])) && notices.length === b.notices.length;
        check(posts().length === before && right, `3 ${b.what} (${language}): nothing sent, and it says "${b.notices.map((k) => w[said[k]]).join(' ')}"${right ? '' : ` (it says ${JSON.stringify(notices)})`}${posts().length === before ? '' : `; ${posts().length - before} sent: ${posts().at(-1).body}`}`);
      }
      check(stub.garageBodies().length === receivedBefore && posts().length === sentBefore, `3 blank fields (${language}): the platform received no garage`);
      await page.click('[data-form="add-garage"] [data-action="close-panel"]');
      // ── 4: a refusal says so, chooses nothing and changes no list ─────────
      await openForm(page);
      await answer(page, { name: `Refused Garage ${language}`, zone: 'America/New_York', money: 'USD' });
      await page.click('[data-action="check-garage"]');
      const sent = posts().length;
      stub.refuseNextGarage();
      await page.click('[data-action="create-garage"]');
      const refusedSaid = await settles(page, (t) => document.querySelector('[data-form="add-garage"] [data-problem="garageRefused"]')?.textContent.includes(t), w['problem.garageRefused']);
      await page.waitForTimeout(500);
      const chosen = await page.$('.garage-current');
      const stillHere = await page.evaluate(() => window.location.hash);
      check(refusedSaid && posts().length === sent + 1, `4 refused (${language}): one attempt, and it says "${w['problem.garageRefused']}"`);
      check(!chosen && C.garages.length === 0 && ['', '#/'].includes(stillHere) && Boolean(await page.$('[data-start="no-garages"]')),
        `4 refused (${language}): no garage chosen, still on Home, and the account still has none (${C.garages.length} garages${chosen ? '; one is chosen' : ''}; at "${stillHere}")`);
      await screenshot(page, `refused-${language}`);
      await page.click('[data-form="add-garage"] [data-action="close-panel"]');
    }
    // ── 2, from a new account's Home: fill, check, create, once ──────────────
    await speak(page, 'en');
    const w = WORDS.en;
    await go(page, 'home');
    await openForm(page);
    const firstPicked = await page.$$eval('[data-form="add-garage"] select', (ss) => ss.map((s) => s.value));
    check(firstPicked.every((v) => v === ''), `2 nothing picked until the owner picks: time zone "${firstPicked[0]}", money "${firstPicked[1]}"`);
    const usGroup = await page.$$eval('[data-field="zone"] optgroup:first-of-type option', (os) => os.map((o) => [o.value, o.textContent]));
    check(JSON.stringify(usGroup) === JSON.stringify(US_ZONES.map((z) => [z.id, w[`zone.${z.key}`]])), `2 the United States' time zones first, in plain words ("${w['zone.eastern']}" …)`);
    const otherZones = await page.$$eval('[data-field="zone"] optgroup:last-of-type option', (os) => os.map((o) => o.textContent));
    check(otherZones.length > 300 && otherZones.every((z) => /\S — \S/.test(z) && !/\//.test(z)), `2 then every other time zone, in words with its place, never as the platform keeps it (${otherZones.length})`);
    const moneys = await page.$$eval('[data-field="money"] option', (os) => os.map((o) => [o.value, o.textContent]));
    check(moneys[1]?.[0] === 'USD' && moneys[1]?.[1] === w['money.usd'] && moneys.slice(1).every(([code, text]) => text && text !== code), `2 US dollars first, then every other money, in words (${moneys.length - 1})`);
    await answer(page, { name: 'Maple Avenue Garage', zone: 'America/Chicago', money: 'USD' });
    await page.click('[data-action="check-garage"]');
    await page.waitForSelector('[data-step="check"]');
    const shown = await page.$$eval('[data-step="check"] [data-answer]', (dds) => dds.map((d) => d.textContent));
    const cannot = await page.textContent('[data-notice="cannot-change"]');
    check(JSON.stringify(shown) === JSON.stringify(['Maple Avenue Garage', w['zone.central'], w['money.usd']]) && cannot === w['garages.cannotChange'],
      `2 the check step shows the three answers and "${w['garages.cannotChange']}" (${JSON.stringify(shown)})`);
    await described(page, ['garages.form.name', 'garages.form.zone', 'garages.form.money'], 'en', 'the check step');
    await screenshot(page, 'check-step-en');
    const before = posts().length;
    await page.dblclick('[data-action="create-garage"]');
    const landed = await showsHeading(page, w['page.setup.title']);
    await page.waitForTimeout(800);
    const sent = posts().slice(before);
    const body = sent.length === 1 ? JSON.parse(sent[0].body) : null;
    check(sent.length === 1 && stub.garageBodies().filter((x) => x.name === 'Maple Avenue Garage').length === 1, `2 Create garage pressed twice: exactly one POST /garages (${sent.length} sent)`);
    check(body && JSON.stringify(Object.keys(body).sort()) === '["currency","name","timezone"]' && body.name === 'Maple Avenue Garage' && body.timezone === 'America/Chicago' && body.currency === 'USD',
      `2 it holds exactly name, timezone and currency, as chosen (${sent[0]?.body ?? 'nothing'})`);
    const made = C.garages.find((g) => g.name === 'Maple Avenue Garage');
    const current = await page.$eval('.garage-current', (e) => e.dataset.garage).catch(() => null);
    const details = await settles(page, () => document.querySelector('[data-step="garage_details"]')?.dataset.done === 'yes');
    check(landed && made && current === made.id && details, `2 from Home: the new garage is chosen, its Setup shown, and "${w['setup.step.garage_details']}" done`);
    await screenshot(page, 'created-setup-en');
    await context.close();
  }

  // ── 1: the Garages page, two garages ─────────────────────────────────────
  {
    const { context, page } = await open(A);
    for (const language of LANGUAGES) {
      await speak(page, language);
      const w = WORDS[language];
      await go(page, 'garages');
      await showsHeading(page, w['page.garages.title']);
      await settles(page, () => document.querySelectorAll('[data-list="garages-page"] [data-read="read"]').length === 2);
      const rows = await garageRows(page);
      const wrong = [];
      for (const g of A.garages) {
        const row = rows.find((r) => r.id === g.id);
        const truth = await platformSetup(page, g.id);
        const want = { name: g.name, zone: w[ZONE_KEY[g.timezone]], money: w[MONEY_KEY[g.currency]], live: g.live ? w['garage.live'] : w['garage.notLive'], setup: fill(w['setup.count'], { done: truth.done, steps: truth.steps }) };
        for (const [k, v] of Object.entries(want)) if (row?.[k] !== v) wrong.push(`${g.name} ${k}: "${row?.[k]}", not "${v}"`);
      }
      check(rows.length === 2 && wrong.length === 0, `1 two garages (${language}): both listed, each with its name, time zone, money, open or not, and its Setup steps done${wrong.length ? `; ${wrong.join('; ')}` : ''}`);
      await described(page, ['garages.name', 'garages.zone', 'garages.money', 'garages.open', 'garages.setup'], language, 'the Garages list');
      await screenshot(page, `garages-two-${language}`);
      for (const g of [...A.garages].reverse()) {
        await go(page, 'garages');
        await page.waitForSelector(`[data-garage-row="${g.id}"]`);
        // Pressed on the row, not its name: the row is what is pressed.
        await page.click(`[data-garage-row="${g.id}"] td:nth-child(3)`);
        const setupShown = await showsHeading(page, w['page.setup.title']);
        const current = await page.$eval('.garage-current', (e) => e.dataset.garage).catch(() => null);
        const truth = await platformSetup(page, g.id);
        const count = await settles(page, (c) => document.querySelector('.setup-count')?.dataset.count === String(c), truth.done);
        check(setupShown && current === g.id && count, `1 ${g.name} (${language}): pressed, it is chosen and its own Setup opens (chosen: ${A.garages.find((x) => x.id === current)?.name ?? current})`);
      }
    }

    // ── 6: the refused attempts' count follows the choices ─────────────────
    // 60 refused lines of 120 attempts: 12 about lanes (24 attempts), 48 about people to tell (96).
    const START = Date.parse('2026-03-01T14:00:00Z');
    const refusedLines = Array.from({ length: 60 }, (_, i) => {
      const lane = i % 5 === 0;
      return {
        id: `d8000000-0000-4000-8000-${String(i).padStart(12, '0')}`, garage_id: HARBOR.id, at: new Date(START + i * 41 * 60_000).toISOString(), outcome: 'refused',
        who: { kind: 'owner', name: A.email }, action: lane ? 'lane.rename' : 'alert_contact.change',
        subject: lane ? { kind: 'lane', id: null, name: `Gate ${i}` } : { kind: 'alert_contact', id: `pa888888-0000-4000-8000-${String(i).padStart(12, '0')}`, name: null },
        before: null, after: null, refusal: lane ? 'lane_name_refused' : 'alert_contact_email_refused', attempts: 2, last_at: new Date(START + i * 41 * 60_000 + 60_000).toISOString(),
      };
    });
    await page.click(`.garage-choice[data-garage="${HARBOR.id}"]`).catch(() => {});
    for (const language of LANGUAGES) {
      await speak(page, language);
      const w = WORDS[language];
      stub.setChanges(A, refusedLines);
      await go(page, 'garages');
      await page.click(`[data-garage-row="${HARBOR.id}"]`);
      await go(page, 'changes');
      await page.waitForSelector('[data-choose="refused"]');
      const count = () => page.$eval('[data-list="refused"] [data-count]', (p) => p.textContent).catch(() => null);
      const all = fill(w['refused.countMany'], { attempts: n(120, language) });
      check((await count()) === all, `6 nothing chosen (${language}): "${all}" (it says "${await count()}")`);
      await page.click('[data-choose="refused"] [data-action="choose-what"]');
      await page.click('[data-choose="refused"] [data-ticks="what"] .choose-tick[data-value="lanes"]');
      const chosen = fill(w['refused.countChosen'], { shown: n(24, language), attempts: n(120, language) });
      const saysChosen = await settles(page, (t) => document.querySelector('[data-list="refused"] [data-count]')?.textContent === t, chosen, 4000);
      check(saysChosen, `6 lanes ticked (${language}): "${chosen}" (it says "${await count()}")`);
      await screenshot(page, `refused-chosen-${language}`);
      await page.click('[data-choose="refused"] [data-action="show-everything"]');
      await page.selectOption('[data-choose="refused"] select[data-control="sort"]', 'oldest');
      const sorted = await settles(page, (t) => document.querySelector('[data-list="refused"] [data-count]')?.textContent === t, all, 4000);
      check(sorted, `6 only sorted (${language}): reads as before, "${all}" (it says "${await count()}")`);
    }

    // ── Quick Find: Add a garage, and the Garages page ────────────────────
    for (const language of LANGUAGES) {
      await speak(page, language);
      const w = WORDS[language];
      for (const typed of [w['feature.addGarage.title'], w['page.garages.title']]) {
        await go(page, 'home');
        await page.keyboard.press('Control+K');
        await page.waitForSelector('.find-dialog');
        await page.keyboard.type(typed);
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');
        check(await showsHeading(page, w['page.garages.title']), `Quick Find (${language}): "${typed}" goes to ${w['page.garages.title']}`);
      }
    }

    // ── 2, from the Garages page, in Spanish ───────────────────────────────
    await speak(page, 'es');
    const w = WORDS.es;
    await go(page, 'garages');
    await page.waitForSelector('[data-list="garages-page"]');
    check(!(await page.$('[data-form="add-garage"]')), `2 (es): "${w['garages.add']}" is closed until pressed`);
    await openForm(page);
    await answer(page, { name: 'Estacionamiento Calle Ocho', zone: 'America/New_York', money: 'USD' });
    await page.click('[data-action="check-garage"]');
    await page.waitForSelector('[data-step="check"]');
    const shown = await page.$$eval('[data-step="check"] [data-answer]', (dds) => dds.map((d) => d.textContent));
    check(JSON.stringify(shown) === JSON.stringify(['Estacionamiento Calle Ocho', w['zone.eastern'], w['money.usd']]) && (await page.textContent('[data-notice="cannot-change"]')) === w['garages.cannotChange'],
      `2 (es) the check step shows the three answers and "${w['garages.cannotChange']}"`);
    await screenshot(page, 'check-step-es');
    const before = posts().length;
    const had = A.garages.length;
    await page.dblclick('[data-action="create-garage"]');
    const landed = await showsHeading(page, w['page.setup.title']);
    await page.waitForTimeout(800);
    const sent = posts().slice(before);
    const body = sent.length === 1 ? JSON.parse(sent[0].body) : null;
    check(sent.length === 1 && A.garages.length === had + 1, `2 (es) Create pressed twice: exactly one POST /garages (${sent.length} sent), one garage more`);
    check(body && JSON.stringify(Object.keys(body).sort()) === '["currency","name","timezone"]', `2 (es) it holds exactly name, timezone and currency (${sent[0]?.body ?? 'nothing'})`);
    const made = A.garages.at(-1);
    const current = await page.$eval('.garage-current', (e) => e.dataset.garage).catch(() => null);
    const details = await settles(page, () => document.querySelector('[data-step="garage_details"]')?.dataset.done === 'yes');
    check(landed && current === made.id && details, `2 (es) from Garages: the new garage is chosen, its Setup shown, and "${w['setup.step.garage_details']}" done`);
    await go(page, 'garages');
    check(await settles(page, (id) => Boolean(document.querySelector(`[data-garage-row="${id}"]`)), made.id), '2 (es) and the Garages page lists it');

    // ── 1: 45 garages, 20 a page ─────────────────────────────────────────
    const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/Madrid'];
    for (let i = A.garages.length; i < 45; i += 1) {
      stub.addGarage(A, { name: `Lot ${String(i + 1).padStart(2, '0')}`, timezone: ZONES[i % ZONES.length], currency: i % 7 === 0 ? 'EUR' : 'USD', live: i % 3 === 0 });
    }
    for (const language of LANGUAGES) {
      await speak(page, language);
      const lw = WORDS[language];
      await page.reload();
      await page.waitForSelector('.nav');
      await go(page, 'garages');
      await page.waitForSelector('[data-list="garages-page"] tbody tr');
      const seen = [];
      const wrongPages = [];
      for (let p = 0; p < 3; p += 1) {
        const from = p * 20 + 1;
        const to = Math.min(45, from + 19);
        const where = fill(lw['pager.where'], { from: n(from, language), to: n(to, language), count: n(45, language) });
        const says = await settles(page, (t) => document.querySelector('[data-pager="garages-page"] .pager-where')?.textContent === t, where);
        const rows = await garageRows(page);
        if (!says || rows.length !== to - from + 1) wrongPages.push(`page ${p + 1}: ${rows.length} rows`);
        seen.push(...rows.map((r) => r.id));
        if (p < 2) await page.click('[data-pager="garages-page"] [data-action="next"]');
      }
      const ids = A.garages.map((g) => g.id);
      const missed = ids.filter((id) => !seen.includes(id));
      const twice = seen.filter((id, i) => seen.indexOf(id) !== i);
      check(wrongPages.length === 0 && seen.length === 45 && missed.length === 0 && twice.length === 0,
        `1 45 garages (${language}): 20 a page over 3 pages, each saying where it is; ${seen.length} seen, none missed, none twice${wrongPages.length ? `; ${wrongPages.join('; ')}` : ''}${missed.length ? `; missed ${missed.length}` : ''}`);
      await settles(page, () => [...document.querySelectorAll('[data-list="garages-page"] [data-read]')].every((c) => c.dataset.read === 'read'));
      await screenshot(page, `garages-45-last-page-${language}`);
      const last = A.garages[43];
      await page.click(`[data-garage-row="${last.id}"]`);
      const current = await settles(page, (id) => document.querySelector('.garage-current')?.dataset.garage === id, last.id);
      check((await showsHeading(page, lw['page.setup.title'])) && current, `1 45 garages (${language}): ${last.name}, on the last page, opens its own Setup`);
    }
    await context.close();
  }

  // ── Day and night, for the eye (--screens) ─────────────────────────────
  if (SCREENS) {
    const { context, page } = await open(A);
    for (const language of LANGUAGES) {
      await speak(page, language);
      for (const theme of ['day', 'night']) {
        await look(page, theme);
        await go(page, 'garages');
        await page.waitForSelector('[data-list="garages-page"] tbody tr');
        await screenshot(page, `garages-${language}-${theme}`);
        await openForm(page);
        await page.click('[data-action="check-garage"]');
        await screenshot(page, `form-blank-${language}-${theme}`);
        await answer(page, { name: 'Harbor Annex', zone: 'America/Phoenix', money: 'USD' });
        await page.click('[data-action="check-garage"]');
        await screenshot(page, `check-${language}-${theme}`);
        await page.click('[data-form="add-garage"] [data-action="close-panel"]');
      }
    }
    await context.close();
  }

  // ── No request leaves the page ──────────────────────────────────────────
  const away = requests.filter((r) => new URL(r.url).origin !== origin && !r.url.startsWith('data:'));
  check(away.length === 0, `no request left the page${away.length ? `: ${away.slice(0, 3).map((r) => r.url).join(', ')}` : ''}`);
} catch (error) {
  failures.push(`the check stopped: ${error.message}`);
  console.log(`  FAIL the check stopped: ${error.stack}`);
} finally {
  await browser.close();
  await server.close();
  await stub.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`\ngarages — ${passed} checks passed: the Garages page listed and paged, each row opening its own Setup; Add a garage sending exactly name, time zone and currency, once; blank fields and a refusal said plainly; an account with no garage starting there; the refused attempts counted as chosen; both languages.${SCREENS ? ` Screenshots in ${SCREENS}.` : ''}`);
