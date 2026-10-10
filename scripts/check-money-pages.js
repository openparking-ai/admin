#!/usr/bin/env node
/* global document, window, localStorage, sessionStorage, getComputedStyle */
// Taxes and fees, Getting paid and Card readers, in a real browser (U6).
//
// Serves dist/ (run `npm run build` first) with /api sent to the stand-in
// platform (test/stub-platform.js), opens it in headless Chromium with the
// browser in TOKYO time while the garages are in American zones, signs in,
// and walks the three pages in English and in Spanish, by day and by night:
//
//   1  no foreign text on a screen: the stand-in answers every refusal these
//      pages can meet with the platform's own technical sentence; each page
//      shows its one plain sentence from the dictionaries, and none of the
//      platform's words, in either language;
//   2  percent and start: 18.5 is sent as 1850; "no tax" as a list with no
//      lines; "from the start of" a day across a clock change sends the
//      garage's first moment of that day (New York), never Tokyo's; "now" is
//      now;
//   3  append-only: the Taxes page sends no write but POST tax-sets;
//   4  the reader's code is kept nowhere: not in browser storage, the
//      address, a log line, the page once the panel is closed, or a file;
//      it travels once, to the platform, and in no address;
//   5  who sees what: a garage that takes pass holders only gets no setting
//      up on Getting paid and no readers; an account that cannot take cards
//      gets no reader form;
// and the rest of each page as the brief asks: every list state, the
// account's facts each with when it was checked in the garage's time, the
// readers' address entered once then shown, a reader connected and
// disconnected (confirmed on the page), the setup checklist leading to each
// page, Quick Find finding each, every field described under its name, and
// every connection printed and downloaded (read back by openpyxl and pypdf,
// and by each reader in SPREADSHEET_READERS). No request leaves the page.
//
//   node scripts/check-money-pages.js                 the check
//   node scripts/check-money-pages.js --screens DIR   ...and save the screenshots

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { DICTIONARIES } from '../src/i18n/index.js';
import { startStub } from '../test/stub-platform.js';
import { readBack, tableOf, garageClock } from './files/read-back.js';
import { READERS, readSpreadsheets } from './files/spreadsheet-readers.js';
import { chooseOnSettings } from './on-settings.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const screensAt = process.argv.indexOf('--screens');
const SCREENS = screensAt > 0 ? process.argv[screensAt + 1] : null;
if (SCREENS) mkdirSync(SCREENS, { recursive: true });
const WORDS = DICTIONARIES;
const EN = WORDS.en;
const BROWSER_ZONE = 'Asia/Tokyo';
const DIR = mkdtempSync(join(tmpdir(), 'admin-money-'));

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
const RIVERSIDE = A.garages[1];
const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4357, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } } });
const base = server.resolvedUrls.local[0];
const origin = new URL(base).origin;
stub.allowOrigin(origin);
const browser = await chromium.launch();
const requests = []; // { method, url, body }
const consoleLines = [];
const policyBroken = [];

async function open({ locale = 'en-US', colorScheme = 'light' } = {}) {
  const context = await browser.newContext({ locale, colorScheme, timezoneId: BROWSER_ZONE, acceptDownloads: true, viewport: { width: 1360, height: 900 } });
  context.on('request', (r) => requests.push({ method: r.method(), url: r.url(), body: r.postData() ?? '' }));
  context.on('console', (m) => {
    consoleLines.push(m.text());
    if (/Content Security Policy/i.test(m.text())) policyBroken.push(m.text());
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => consoleLines.push(e.message));
  await page.goto(base);
  await page.waitForSelector('.page-title');
  return { context, page };
}

// The page redraws after a click, not during it: wait up to five seconds for the state; one that never comes is a failure.
const settles = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 }).then(() => true, () => false);
const appears = (page, sel) => page.waitForSelector(sel, { timeout: 5000 }).then(() => true, () => false);
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const showsHeading = (page, text) => settles(page, (t) => document.querySelector('.page-title')?.textContent === t, text);
const plain = (text) => String(text).replace(/[\s  ]+/g, ' ').trim();
/** A date and time as the pages say it, in a zone: worked out here, not by the pages' code. */
const said = (iso, timeZone, language) =>
  new Intl.DateTimeFormat(language === 'es' ? 'es-US' : 'en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

// What a raw failure looks like on screen.
const RAW = [
  [/[{}]/, 'a brace'],
  [/\b[1-5]\d\d\b/, 'a status number'],
  [/\b[a-z]+_[a-z_]+\b/, 'a code'],
  [/JSON|Unexpected (token|end)|Failed to fetch|TypeError|NetworkError|undefined|null|\[object/i, "the browser's own error words"],
  [/(?<!\.)\.\.(?!\.)/, 'a doubled full stop'],
];
const rawIn = (text) => RAW.filter(([re]) => re.test(text)).map(([re, what]) => `${what} ("${text.match(re)[0]}")`);

/** Every field on screen described under its name, word for word, in the language on screen; `expected` of them. */
async function checkDescribed(page, where, language, expected) {
  const words = WORDS[language];
  const found = await page.evaluate(() => {
    const shown = (e) => {
      const s = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    return {
      fields: [...document.querySelectorAll('main .field-about')].map((about) => {
        const name = about.previousElementSibling;
        const n = name?.getBoundingClientRect();
        const a = about.getBoundingClientRect();
        return { key: about.dataset.about, text: about.textContent.trim(), name: name?.textContent.trim(), shown: shown(about) && Boolean(name) && shown(name), under: Boolean(n) && a.top >= n.bottom - 1 };
      }),
      bare: [...document.querySelectorAll('main th, main label')].filter((e) => !e.querySelector('.field-about')).map((e) => e.textContent.trim()),
    };
  });
  const wrong = [];
  for (const f of found.fields) {
    if (!f.shown) wrong.push(`"${f.name ?? f.key}": not shown`);
    else if (!f.under) wrong.push(`"${f.name}": not under its name`);
    if (f.text !== words[`${f.key}.about`]) wrong.push(`"${f.name ?? f.key}": says "${f.text}"`);
  }
  for (const b of found.bare) wrong.push(`"${b}": no description under it`);
  if (found.fields.length !== expected) wrong.push(`${found.fields.length} described fields, not ${expected}`);
  check(wrong.length === 0, `descriptions, ${where} (${language}): every field described under its name${wrong.length ? `; ${wrong.join('; ')}` : ` (${found.fields.length})`}`);
}

async function go(page, hash, titleKey, language = 'en') {
  await page.click(`.nav-item[href="${hash}"]`);
  return showsHeading(page, WORDS[language][titleKey]);
}
const reload = async (page, hash, titleKey, language = 'en') => {
  await page.click('.nav-item[href="#/"]');
  return go(page, hash, titleKey, language);
};
const chooseGarage = async (page, garage) => {
  await page.click('[data-action="change-garage"]');
  await page.click(`.garage-choice[data-garage="${garage.id}"]`);
};
// From the top: a page left scrolled would draw its sticky head part-way down a full-page shot.
const screenshot = async (page, name) => {
  if (!SCREENS) return;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(SCREENS, `${name}.png`), fullPage: true });
};

const PROBLEM_OF = {
  tax_set_invalid: 'taxListRefused', tax_set_effective_from_taken: 'taxStartTaken', tax_set_not_storable: 'taxNotKept', rate_engine_unavailable: 'taxNotChecked',
  garage_not_found: 'garageNotFound', connect_not_configured: 'cardsNotSetUp', bad_country: 'countryRefused', stripe_refused: 'stripeRefused',
  stripe_unreachable: 'stripeUnreachable', stripe_account_ambiguous: 'accountTwice', no_stripe_account: 'noAccount', card_payments_not_active: 'cardsNotActive',
  bad_location: 'placeRefused', no_terminal_location: 'noPlace', bad_reader: 'readerRefused', lane_has_reader: 'laneHasReader',
  reader_bound_elsewhere: 'readerElsewhere', no_reader_bound: 'noReader', lane_not_found: 'notFound',
};

/**
 * Check 1, one refusal: the stand-in answers the next write with `code`, in
 * the platform's own words; the action that sends it is done; the page shows
 * the refusal's one plain sentence, and nothing of the platform's.
 */
async function refusalSaid(page, code, language, act, where) {
  const [, body] = stub.moneyRefusals()[code];
  stub.refuseNext(code);
  await act();
  const want = WORDS[language][`problem.${PROBLEM_OF[code]}`];
  const shown = await settles(page, (w) => [...document.querySelectorAll('[data-problem]')].some((e) => e.textContent.trim() === w), want);
  const text = await bodyText(page);
  const foreign = [body.error, ...Object.values(body.details ?? {}).flatMap((v) => (typeof v === 'string' ? [v] : []))].filter((s) => s && text.includes(s));
  const platformWords = body.error.split(/[.;:]\s/).map((s) => s.trim()).filter((s) => s.length > 24 && text.includes(s));
  check(
    shown && foreign.length === 0 && platformWords.length === 0 && rawIn(text).length === 0,
    `1 no foreign text (${language}), ${where}, ${code}: "${want}"${shown ? '' : ' was not shown'}${foreign.length || platformWords.length ? `; the platform's own words on screen: "${[...foreign, ...platformWords][0]}"` : ''}${rawIn(text).length ? `; ${rawIn(text).join(', ')}` : ''}`,
  );
}

/** Check 3: every write sent since request `from` (at least `least` of them) is POST tax-sets. */
function appendOnly(from, least, who) {
  const writes = requests.slice(from).filter((r) => r.method !== 'GET' && new URL(r.url).pathname.startsWith('/api/') && !/\/auth\/language$/.test(new URL(r.url).pathname));
  const others = writes.filter((r) => !(r.method === 'POST' && new URL(r.url).pathname === `/api/v1/garages/${HARBOR.id}/tax-sets`));
  check(writes.length >= least && others.length === 0, `3 append-only: ${who} sent ${writes.length} writes, every one POST tax-sets${others.length ? `; also ${others.map((r) => `${r.method} ${new URL(r.url).pathname}`).join(', ')}` : ''}`);
}

try {
  const { context, page } = await open();
  await page.fill('input[name="email"]', A.email);
  await page.fill('input[name="password"]', A.password);
  await page.click('button[type="submit"]');
  await page.click(`.garage-choice[data-garage="${HARBOR.id}"]`);
  await page.waitForSelector('.nav');

  // ── The setup checklist leads to each page; Quick Find finds each and its settings ──
  await go(page, '#/setup', 'page.setup.title');
  await settles(page, () => document.querySelectorAll('[data-step]').length > 0);
  for (const [step, pageId] of [['taxes', 'taxes'], ['getting_paid', 'paid'], ['card_readers', 'readers']]) {
    const link = await page.textContent(`[data-step="${step}"] .setup-where`);
    check(link === EN['setup.goTo'].replace('{page}', EN[`page.${pageId}.title`]), `Setup: the ${step} step says where it is done: "${link}"`);
  }
  await page.click('[data-step="getting_paid"] .setup-where a');
  check(await showsHeading(page, EN['page.paid.title']), 'Setup: its getting-paid step leads to Getting paid');
  for (const [query, id, titleKey] of [['change taxes', 'changeTaxes', 'page.taxes.title'], ['set up getting paid', 'setUpPaid', 'page.paid.title'], ['connect a card reader', 'connectReader', 'page.readers.title']]) {
    await page.keyboard.press('Control+K');
    await page.waitForSelector('.find-dialog');
    await page.keyboard.type(query);
    const found = await settles(page, (i) => Boolean(document.querySelector(`.find-option[data-id="${i}"]`)), id);
    if (found) await page.click(`.find-option[data-id="${id}"]`);
    else await page.keyboard.press('Escape');
    check(found && (await showsHeading(page, EN[titleKey])), `Quick Find: "${query}" is found and goes to ${EN[titleKey]}`);
  }

  // ── Taxes and fees ─────────────────────────────────────────────────────
  check(await go(page, '#/taxes', 'page.taxes.title'), 'Taxes and fees is in the navigation');
  const taxRequestsFrom = requests.length;
  await appears(page, '[data-tax-list="current"]');
  const lines = await page.$$eval('[data-tax-list="current"] tbody tr', (rows) => rows.map((r) => [...r.cells].map((c) => c.textContent)));
  check(JSON.stringify(lines) === JSON.stringify([['City parking tax', '18.5%', EN['taxes.round.nearest']], ['State surcharge', '6%', EN['taxes.round.up']]]), `Taxes: each line of the list in force, its name, its percent and how it rounds, in order (${JSON.stringify(lines)})`);
  check((await page.textContent('[data-state]')) === EN['taxes.linesMany'].replace('{count}', '2'), 'Taxes: what the garage charges, in one sentence');
  const since = EN['taxes.since'].replace('{time}', said('2025-12-01T05:00:00Z', HARBOR.timezone, 'en'));
  check(plain(await page.textContent('[data-tax-list="current"] .tax-when')) === plain(since), `Taxes: when the list in force started, in the garage's time: "${since}"`);
  await checkDescribed(page, 'Taxes and fees', 'en', 3);
  await screenshot(page, 'taxes-english-day');

  // The form starts as a copy of the list in force.
  await page.click('[data-action="change-taxes"]');
  await appears(page, '[data-form="change-taxes"]');
  const copied = await page.$$eval('[data-form="change-taxes"] .tax-line', (ls) => ls.map((l) => [l.querySelector('[data-field="tax-name"]').value, l.querySelector('[data-field="tax-percent"]').value, l.querySelector('[data-field="tax-rounding"]').value]));
  check(JSON.stringify(copied) === JSON.stringify([['City parking tax', '18.5', 'nearest'], ['State surcharge', '6', 'up']]), `Taxes: "Change taxes" starts as a copy of the list in force (${JSON.stringify(copied)})`);
  check((await page.textContent('[data-notice="new-list"]')) === EN['taxes.newList'], 'Taxes: before saving, it says this starts a new list and the old one stays on record');
  await checkDescribed(page, 'Taxes and fees, changing', 'en', 3 + 1 + 3 * 2 + 1);
  await screenshot(page, 'taxes-change-english-day');
  // A percent of 0, then one with three decimals: said on the line, and nothing sent.
  const postsBefore = requests.filter((r) => r.method === 'POST').length;
  await page.fill('[data-line-at="2"] [data-field="tax-percent"]', '0');
  await page.click('[data-action="save-taxes"]');
  check(await settles(page, (w) => document.querySelector('[data-line-problem="2"]')?.textContent === w, EN['taxes.needPercent.zero']), `Taxes: a percent of 0 is said on its line: "${EN['taxes.needPercent.zero']}"`);
  await page.fill('[data-line-at="2"] [data-field="tax-percent"]', '6.125');
  check(await settles(page, (w) => document.querySelector('[data-line-problem="2"]')?.textContent === w, EN['taxes.needPercent.shape']), `Taxes: three decimals is said on its line: "${EN['taxes.needPercent.shape']}"`);
  check(requests.filter((r) => r.method === 'POST').length === postsBefore, 'Taxes: ...and nothing was sent');
  // Check 2: 18.5 and a third line moved to the top, from the start of 1 November 2026 (New York's clocks go back that night).
  await page.fill('[data-line-at="2"] [data-field="tax-percent"]', '6');
  await page.click('[data-action="add-line"]');
  await page.fill('[data-line-at="3"] [data-field="tax-name"]', 'County fee');
  await page.fill('[data-line-at="3"] [data-field="tax-percent"]', '2,25');
  await page.selectOption('[data-line-at="3"] [data-field="tax-rounding"]', 'down');
  await page.click('[data-line-at="3"] [data-action="move-up"]');
  await page.click('[data-line-at="2"] [data-action="move-up"]');
  await page.click('[data-chooser="starts"] [data-value="day"]');
  await page.fill('[data-field="tax-day"]', '2026-11-01');
  const firstSaveFrom = requests.length;
  await page.click('[data-action="save-taxes"]');
  const stated = () => stub.money(HARBOR.id).taxSets.at(-1);
  await settles(page, () => !document.querySelector('[data-form="change-taxes"]'));
  // Check 3 at the first save, before anything that follows could stop on it: one write, POST tax-sets.
  appendOnly(firstSaveFrom, 1, 'the first save');
  const fall = stated();
  check(fall.effective_from === '2026-11-01T04:00:00.000000Z', `2 from the start of a day: 1 November 2026, New York, starts at its midnight, 04:00 UTC (sent "${fall.effective_from}"; Tokyo's would be 2026-10-31T15:00Z)`);
  check(JSON.stringify(fall.rules.map((r) => [r.label, r.percent_bp, r.rounding, r.sequence])) === JSON.stringify([['County fee', 225, 'down', 1], ['City parking tax', 1850, 'nearest', 2], ['State surcharge', 600, 'up', 3]]), `2 percent: 18.5 is sent as 1850, 2,25 as 225, in the order shown (${JSON.stringify(fall.rules.map((r) => [r.label, r.percent_bp]))})`);
  check(new Set(fall.rules.map((r) => r.id)).size === 3, '2 line ids: made by the page, each once in the list');
  check(await appears(page, '[data-section="later"] [data-tax-list="later"]'), 'Taxes: the new list is shown as one that starts later');
  const startsAt = EN['taxes.startsAt'].replace('{time}', said('2026-11-01T04:00:00Z', HARBOR.timezone, 'en'));
  check(plain(await page.textContent('[data-section="later"] .tax-when')) === plain(startsAt), `Taxes: ...with when it starts, in the garage's time: "${startsAt}"`);
  // From the start of 14 March 2027 (New York's clocks go forward that night): midnight is still -05:00.
  await page.click('[data-action="change-taxes"]');
  await page.click('[data-chooser="starts"] [data-value="day"]');
  await page.fill('[data-field="tax-day"]', '2027-03-14');
  await page.click('[data-action="save-taxes"]');
  await settles(page, () => !document.querySelector('[data-form="change-taxes"]'));
  check(stated().effective_from === '2027-03-14T05:00:00.000000Z', `2 from the start of a day: 14 March 2027, New York, starts at 05:00 UTC (sent "${stated().effective_from}")`);
  // No tax, from the start of 1 June 2027.
  await page.click('[data-action="change-taxes"]');
  await page.click('[data-chooser="charges"] [data-value="none"]');
  check((await page.$$('[data-form="change-taxes"] .tax-line')).length === 0, 'Taxes: "This garage charges no tax" is a single choice: no lines on the form');
  await page.click('[data-chooser="starts"] [data-value="day"]');
  await page.fill('[data-field="tax-day"]', '2027-06-01');
  await page.click('[data-action="save-taxes"]');
  await settles(page, () => !document.querySelector('[data-form="change-taxes"]'));
  check(stated().effective_from === '2027-06-01T04:00:00.000000Z' && Array.isArray(stated().rules) && stated().rules.length === 0, `2 no tax: sent as a list with no lines, "rules": [] (sent ${JSON.stringify(stated().rules)})`);
  // Now.
  const before = Date.now();
  await page.click('[data-action="change-taxes"]');
  await page.click('[data-action="save-taxes"]');
  await settles(page, () => !document.querySelector('[data-form="change-taxes"]'));
  const nowSent = Date.parse(stated().effective_from);
  check(nowSent >= before - 2000 && nowSent <= Date.now() + 1000, `2 now: the list starts at the moment it was saved (${stated().effective_from})`);
  check(await settles(page, (at) => document.querySelector('[data-tax-list="current"]')?.dataset.starts === at, stated().effective_from), 'Taxes: the list saved "now" is the one in force');
  check(await settles(page, () => document.querySelectorAll('[data-section="earlier"] [data-tax-list="earlier"]').length === 1), 'Taxes: the list before it stays on record, under "Before"');
  // Check 1, every refusal of the tax routes, both languages.
  for (const language of ['en', 'es']) {
    if (language === 'es') await chooseOnSettings(page, 'language', 'es');
    for (const code of ['tax_set_invalid', 'tax_set_effective_from_taken', 'tax_set_not_storable', 'rate_engine_unavailable', 'garage_not_found']) {
      await refusalSaid(page, code, language, async () => {
        if (!(await page.$('[data-form="change-taxes"]'))) await page.click('[data-action="change-taxes"]');
        await page.click('[data-action="save-taxes"]');
      }, 'Taxes, saving');
    }
    await page.click('[data-form="change-taxes"] [data-action="close-panel"]');
  }
  await screenshot(page, 'taxes-spanish-day');
  // The list in force, two that start later with lines (the third charges no tax), and one before: four tables of three columns.
  await checkDescribed(page, 'Impuestos y cargos', 'es', 4 * 3);
  await chooseOnSettings(page, 'language', 'en');
  // Check 3: the only write this page sent.
  appendOnly(taxRequestsFrom, 4, 'the Taxes page');
  // The other states: no list said yet (Riverside), and a garage that charges no tax (all of Harbor's later lists aside).
  await chooseGarage(page, RIVERSIDE);
  await go(page, '#/taxes', 'page.taxes.title');
  check(await settles(page, (w) => document.querySelector('[data-state="none"]')?.textContent === w, EN['taxes.none']), `Taxes, a garage that has said nothing: "${EN['taxes.none']}"`);
  stub.money(RIVERSIDE.id).taxSets.push({ id: 'ts800000-0000-4000-8000-000000000001', garage_id: RIVERSIDE.id, effective_from: '2030-01-01T06:00:00.000000Z', rule_count: 1, created_at: new Date().toISOString(), rules: [{ id: 'tax-1', label: 'Later tax', percent_bp: 500, rounding: 'up', sequence: 1 }] });
  await reload(page, '#/taxes', 'page.taxes.title');
  const notYet = EN['taxes.notYet'].replace('{time}', said('2030-01-01T06:00:00Z', RIVERSIDE.timezone, 'en'));
  check(await settles(page, (w) => document.querySelector('[data-state="notYet"]')?.textContent.replace(/[\s ]+/g, ' ') === w, plain(notYet)), `Taxes, a list that starts later and none before it: "${notYet}"`);
  stub.money(RIVERSIDE.id).taxSets.push({ id: 'ts800000-0000-4000-8000-000000000002', garage_id: RIVERSIDE.id, effective_from: '2026-01-01T06:00:00.000000Z', rule_count: 0, created_at: new Date().toISOString(), rules: [] });
  await reload(page, '#/taxes', 'page.taxes.title');
  check(await settles(page, (w) => document.querySelector('[data-state="noTax"]')?.textContent === w && document.querySelector('[data-tax-list="current"] [data-notice="no-tax"]')?.textContent === w, EN['taxes.noTax']), `Taxes, a list with no lines in force: "${EN['taxes.noTax']}"`);

  // ── Getting paid ──────────────────────────────────────────────────────
  await chooseGarage(page, HARBOR);
  check(await go(page, '#/getting-paid', 'page.paid.title'), 'Getting paid is in the navigation');
  await appears(page, '[data-paid="account"]');
  check((await page.textContent('.paid-state')) === EN['paid.canTake'], `Getting paid, an account that can take cards: "${EN['paid.canTake']}"`);
  const facts = await page.$$eval('.paid-fact', (fs) => fs.map((f) => [f.dataset.fact, f.querySelector('.paid-value').textContent, f.querySelector('.quiet').textContent]));
  const checkedAt = EN['paid.checkedAt'].replace('{time}', said('2026-01-02T14:00:00Z', HARBOR.timezone, 'en'));
  check(JSON.stringify(facts.map(([k, v]) => [k, v])) === JSON.stringify([['cards', EN['paid.card.active']], ['charges', EN['paid.charges.yes']], ['details', EN['paid.details.yes']]]) && facts.every(([, , c]) => plain(c) === plain(checkedAt)), `Getting paid: what it can do, each fact with when it was checked, in the garage's time ("${checkedAt}")`);
  check(!(await page.$('[data-action="continue-on-stripe"]')), 'Getting paid: no "Continue on Stripe" once the details are all given');
  const paidText = await bodyText(page);
  check(!/acct_|tml_|tmr_/.test(paidText) && rawIn(paidText).length === 0, 'Getting paid: no account id or Stripe code on screen');
  await checkDescribed(page, 'Getting paid', 'en', 3);
  await screenshot(page, 'getting-paid-english-day');
  for (const language of ['en', 'es']) {
    if (language === 'es') await chooseOnSettings(page, 'language', 'es');
    for (const code of ['connect_not_configured', 'stripe_refused', 'stripe_unreachable', 'no_stripe_account', 'stripe_account_ambiguous', 'garage_not_found']) {
      await refusalSaid(page, code, language, () => page.click('[data-action="check-again"]'), 'Getting paid, checking again');
    }
  }
  await chooseOnSettings(page, 'language', 'en');
  // A garage with no account yet: a country, then "Set up getting paid", which opens Stripe's page in a new tab.
  stub.setDrivers(RIVERSIDE.id, true);
  await chooseGarage(page, RIVERSIDE);
  await go(page, '#/getting-paid', 'page.paid.title');
  await appears(page, '[data-paid="no-account"]');
  // U7a: the form is closed behind "Set up getting paid" until it is pressed.
  check(!(await page.$('[data-field="country"]')) && (await page.textContent('[data-action="open-set-up-paid"]')) === EN['paid.setUp'], `Getting paid, no account: the form is closed behind "${EN['paid.setUp']}"`);
  const openSetUp = async () => {
    if (!(await page.$('[data-form="set-up-paid"]'))) await page.click('[data-action="open-set-up-paid"]');
  };
  await openSetUp();
  check((await page.inputValue('[data-field="country"]')) === 'US', 'Getting paid, no account: the country chooser starts on the United States for a garage in US dollars');
  await checkDescribed(page, 'Getting paid, no account', 'en', 1);
  await screenshot(page, 'getting-paid-no-account-english-day');
  for (const language of ['en', 'es']) {
    if (language === 'es') await chooseOnSettings(page, 'language', 'es');
    for (const code of ['bad_country', 'stripe_unreachable']) {
      await refusalSaid(page, code, language, async () => {
        await openSetUp();
        await page.click('[data-action="set-up-paid"]');
      }, 'Getting paid, setting up');
      for (const p of context.pages().slice(1)) await p.close();
    }
  }
  await chooseOnSettings(page, 'language', 'en');
  await openSetUp();
  const opened = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await page.click('[data-action="set-up-paid"]');
  const tab = await opened;
  if (tab) await tab.waitForURL(/stripe-stand-in/, { timeout: 5000 }).catch(() => {});
  check(Boolean(tab) && tab.url().endsWith('/#/stripe-stand-in') && (await tab.evaluate(() => window.opener === null)), `Getting paid: "Set up getting paid" makes the account and opens Stripe's page in a new tab, cut off from this one (${tab?.url() ?? 'no tab'})`);
  await tab?.close();
  check(Boolean(stub.money(RIVERSIDE.id).account), 'Getting paid: ...and the account is made');
  await appears(page, '[data-paid="account"]');
  check((await page.textContent('.paid-state')) === EN['paid.cannotYet'], `Getting paid, a new account: "${EN['paid.cannotYet']}"`);
  const fresh = await page.$$eval('.paid-fact', (fs) => fs.map((f) => [f.querySelector('.paid-value').textContent, f.querySelector('.quiet').textContent]));
  check(fresh.every(([v, c]) => v === EN['paid.notCheckedYet'] && c === EN['paid.notChecked']), `Getting paid: facts never read are "${EN['paid.notCheckedYet']}", "${EN['paid.notChecked']}"`);
  check(Boolean(await page.$('[data-action="continue-on-stripe"]')), 'Getting paid: "Continue on Stripe" while the details are not finished');
  await page.click('[data-action="check-again"]');
  check(await settles(page, (w) => document.querySelector('[data-fact="cards"] .paid-value')?.textContent === w, EN['paid.card.inactive']), 'Getting paid: "Check again" reads what Stripe says now: card payments off');
  check(await settles(page, (w) => document.querySelector('[data-fact="details"] .paid-value')?.textContent === w, EN['paid.details.no']), `Getting paid: ...details "${EN['paid.details.no']}"`);
  const second = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await page.click('[data-action="continue-on-stripe"]');
  const tab2 = await second;
  check(Boolean(tab2), 'Getting paid: "Continue on Stripe" opens a fresh link in a new tab');
  await tab2?.close();
  stub.setCards(RIVERSIDE.id, { card_payments: 'pending', charges_enabled: false, details_submitted: true });
  await page.click('[data-action="check-again"]');
  check(await settles(page, (w) => document.querySelector('[data-fact="cards"] .paid-value')?.textContent === w, EN['paid.card.pending']), `Getting paid: card payments waiting: "${EN['paid.card.pending']}"`);
  check(await settles(page, () => !document.querySelector('[data-action="continue-on-stripe"]')), 'Getting paid: details all given: no "Continue on Stripe"');

  // ── Card readers ──────────────────────────────────────────────────────
  // Check 5: an account that cannot take cards gets no reader form.
  check(await go(page, '#/card-readers', 'page.readers.title'), 'Card readers is in the navigation');
  await appears(page, '[data-readers="first"]');
  const noForm = !(await page.$('[data-form="reader-place"]')) && !(await page.$('[data-action="open-place"]')) && !(await page.$('[data-action="connect-reader"]')) && !(await page.$('[data-panel]'));
  check(noForm && (await page.textContent('[data-notice="readers-first"]')) === EN['readers.cannotYet'], `5 an account that cannot take cards: no reader form, and "${EN['readers.cannotYet']}"`);
  check((await page.getAttribute('[data-readers="first"] a', 'href')) === '#/getting-paid', 'Card readers: ...with the way to Getting paid');
  await screenshot(page, 'card-readers-cannot-yet-english-day');
  // Check 5: a garage that takes pass holders only: nothing to set up on Getting paid, and no readers.
  stub.setDrivers(RIVERSIDE.id, false);
  await reload(page, '#/getting-paid', 'page.paid.title');
  check(await settles(page, (w) => document.querySelector('[data-paid="pass-only"]')?.textContent === w, EN['paid.passOnly']), `5 pass holders only, Getting paid: "${EN['paid.passOnly']}"`);
  check(!(await page.$('[data-action="open-set-up-paid"]')) && !(await page.$('[data-action="set-up-paid"]')) && !(await page.$('[data-action="check-again"]')) && !(await page.$('[data-field="country"]')), '5 pass holders only: no setting up getting paid');
  await go(page, '#/card-readers', 'page.readers.title');
  check(await settles(page, (w) => document.querySelector('[data-readers="pass-only"]')?.textContent === w, EN['readers.passOnly']), `5 pass holders only, Card readers: "${EN['readers.passOnly']}"`);
  check(!(await page.$('[data-list="ways-out"]')) && !(await page.$('[data-action="connect-reader"]')) && !(await page.$('[data-list="readers"]')), '5 pass holders only: no readers, no reader form');
  stub.setDrivers(RIVERSIDE.id, null);
  await reload(page, '#/card-readers', 'page.readers.title');
  check(await settles(page, (w) => document.querySelector('[data-readers="unanswered"] p')?.textContent === w, EN['readers.unanswered']), `Card readers, drivers not answered yet: "${EN['readers.unanswered']}"`);
  // Stripe Connect not set up on the platform: one sentence, on both pages.
  stub.setDrivers(RIVERSIDE.id, true);
  stub.setConnect(false);
  await reload(page, '#/card-readers', 'page.readers.title');
  check(await settles(page, (w) => document.querySelector('[data-readers="not-set-up"]')?.textContent === w, EN['problem.cardsNotSetUp']), `Card readers, no Stripe Connect on the platform: "${EN['problem.cardsNotSetUp']}"`);
  await go(page, '#/getting-paid', 'page.paid.title');
  check(await settles(page, (w) => document.querySelector('[data-paid="not-set-up"]')?.textContent === w, EN['problem.cardsNotSetUp']), `Getting paid, no Stripe Connect on the platform: "${EN['problem.cardsNotSetUp']}"`);
  stub.setConnect(true);

  // Harbor takes cards. Its readers' address, entered once, then shown.
  await chooseGarage(page, HARBOR);
  stub.money(HARBOR.id).place = null;
  await go(page, '#/card-readers', 'page.readers.title');
  // U7a: the address form is closed behind "Enter the address" until it is pressed.
  const openPlace = async () => {
    if (!(await page.$('[data-form="reader-place"]'))) await page.click('[data-action="open-place"]');
    await appears(page, '[data-form="reader-place"]');
  };
  check(await settles(page, (w) => document.querySelector('[data-action="open-place"]')?.textContent === w, EN['readers.placeOpen']) && !(await page.$('[data-form="reader-place"]')), `Card readers, no address yet: the form is closed behind "${EN['readers.placeOpen']}"`);
  await openPlace();
  check((await page.$$('[data-notice="place-first"]')).length === 2 && !(await page.$('[data-action="connect-reader"]')), 'Card readers, no address yet: each way out says to enter the address first, and no reader can be connected');
  await checkDescribed(page, 'Card readers, no address yet', 'en', 5 + 4 + 4);
  await screenshot(page, 'card-readers-address-english-day');
  await page.click('[data-action="save-place"]');
  const missing = [EN['readers.needStreet'], EN['readers.needCity']].join(' ');
  check(await settles(page, (w) => document.querySelector('[data-notice="place-missing"]')?.textContent === w, missing), `Card readers: an address with no street or city is said: "${missing}"`);
  for (const language of ['en', 'es']) {
    if (language === 'es') await chooseOnSettings(page, 'language', 'es');
    await openPlace();
    await page.fill('[data-field="street"]', '1 Example Street');
    await page.fill('[data-field="city"]', 'Springfield');
    await refusalSaid(page, 'bad_location', language, () => page.click('[data-action="save-place"]'), 'Card readers, the address');
  }
  await chooseOnSettings(page, 'language', 'en');
  await openPlace();
  await page.fill('[data-field="street"]', '1 Example Street');
  await page.fill('[data-field="city"]', 'Springfield');
  await page.fill('[data-field="state"]', 'IL');
  await page.fill('[data-field="zip"]', '62701');
  await page.click('[data-action="save-place"]');
  await appears(page, '[data-readers="place"]');
  const placeSent = stub.money(HARBOR.id).place;
  check(placeSent?.display_name === '1 Example Street, Springfield, IL 62701, US', `Card readers: the address sent, and as the place's name the same address on one line ("${placeSent?.display_name}")`);
  check(placeSent.display_name.length <= 1000, "Card readers: the place's name within Stripe's limit of 1000 characters");
  check((await page.textContent('.reader-place')) === placeSent.display_name, 'Card readers: ...and shown, from the platform\'s read');
  const entered = EN['readers.placeEntered'].replace('{time}', said(placeSent.created_at, HARBOR.timezone, 'en'));
  check(plain(await page.textContent('[data-readers="place"] .quiet')) === plain(entered), `Card readers: ...with when it was entered, in the garage's time: "${entered}"`);
  check(!(await page.$('[data-form="reader-place"]')), 'Card readers: entered once: no address form once it is given');
  await reload(page, '#/card-readers', 'page.readers.title');
  check((await page.textContent('.reader-place')) === placeSent.display_name, 'Card readers: the address is still shown on the next visit');
  const placeRequests = requests.filter((r) => new URL(r.url).pathname === `/api/v1/garages/${HARBOR.id}/stripe-account/location`);
  check(placeRequests.filter((r) => r.method === 'POST').length === 3 && placeRequests.some((r) => r.method === 'GET'), `Card readers: the address is read with GET, and written only when it is entered (${placeRequests.filter((r) => r.method === 'POST').length} POSTs, the two refused included)`);
  const waysOut = await page.$$eval('[data-list="ways-out"] tbody tr', (rows) => rows.map((r) => [r.cells[0].textContent, r.cells[1].textContent]));
  check(JSON.stringify(waysOut) === JSON.stringify([['North Exit', EN['readers.none']], ['South Exit', EN['readers.none']]]), `Card readers: each way out with its reader or "${EN['readers.none']}" (${JSON.stringify(waysOut)})`);
  // Check 4: a reader connected with the code its screen shows; the code kept nowhere.
  const CODE = 'simulated-wpe-u6check-7731';
  const northExit = A.lanes[HARBOR.id].find((l) => l.name === 'North Exit');
  await page.click(`tr[data-lane="${northExit.id}"] [data-action="connect-reader"]`);
  await appears(page, '[data-panel="connect-reader"]');
  check((await page.textContent('[data-panel="connect-reader"] [data-action="close-panel"]')) === EN['readers.panelCancel'], `Card readers: the connect form's own button says "${EN['readers.panelCancel']}"`);
  await checkDescribed(page, 'Card readers, connecting', 'en', 1 + 4 + 2 + 4);
  await screenshot(page, 'card-readers-connect-english-day');
  // A code Stripe does not take: said plainly; the code is let go even so.
  await page.fill('[data-field="reader-code"]', 'not-a-real-code');
  await page.fill('[data-field="reader-label"]', 'North Exit reader');
  await page.click('[data-action="connect-confirm"]');
  check(await settles(page, (w) => document.querySelector('[data-panel="connect-reader"] [data-problem]')?.textContent === w, EN['problem.stripeRefused']), `Card readers: a code Stripe does not take: "${EN['problem.stripeRefused']}"`);
  check((await page.inputValue('[data-field="reader-code"]')) === '', 'Card readers: ...and the code is gone from the form after the try');
  await page.fill('[data-field="reader-code"]', CODE);
  await page.click('[data-action="connect-confirm"]');
  check(await settles(page, () => !document.querySelector('[data-panel="connect-reader"]')), 'Card readers: a reader connected, and the form closed');
  const bound = stub.money(HARBOR.id).connections.find((c) => c.lane_id === northExit.id && !c.unbound_at);
  check(bound?.label === 'North Exit reader', 'Card readers: ...the platform holds it on North Exit, by its name');
  check(await settles(page, (id) => document.querySelector(`tr[data-lane="${id}"] td:nth-child(2)`)?.textContent === 'North Exit reader', northExit.id), 'Card readers: ...and the way out shows its reader');
  const kept = await page.evaluate((code) => {
    const values = [...document.querySelectorAll('input, textarea')].map((i) => i.value);
    const stores = [localStorage, sessionStorage].flatMap((s) => Object.keys(s).map((k) => `${k}=${s.getItem(k)}`));
    return {
      page: document.documentElement.outerHTML.includes(code) || values.some((v) => v.includes(code)),
      storage: stores.filter((s) => s.includes(code)),
      address: window.location.href.includes(code),
    };
  }, CODE);
  const sentWith = requests.filter((r) => r.body.includes(CODE) || r.url.includes(CODE));
  const logged = consoleLines.filter((l) => l.includes(CODE));
  const cookies = (await context.cookies()).filter((c) => c.value.includes(CODE));
  check(kept.storage.length === 0 && cookies.length === 0, `4 the reader's code is not in browser storage (${kept.storage.length ? kept.storage.join(', ') : 'local, session and cookies read'})`);
  check(!kept.address && !page.url().includes(CODE), `4 the reader's code is not in the address (${page.url()})`);
  check(logged.length === 0, `4 ...not in a log line (${consoleLines.length} console lines read)`);
  check(!kept.page, '4 ...not on the page once the panel is closed, not in any field');
  check(sentWith.length === 1 && sentWith[0].method === 'POST' && new URL(sentWith[0].url).pathname === `/api/v1/lanes/${northExit.id}/reader` && !sentWith[0].url.includes(CODE), `4 ...sent once, to the platform, in the body of POST /lanes/:id/reader and in no address (${sentWith.length} requests carried it)`);

  // Every connection: printed and downloaded, both languages; the code in neither file.
  const history = await page.$$eval('[data-list="readers"] tbody tr', (rows) => rows.map((r) => [...r.cells].map((c) => c.textContent)));
  const historyWant = [
    ['North Exit', 'North Exit reader', said(bound.bound_at, HARBOR.timezone, 'en'), EN['readers.stillConnected']],
    ['North Entry', 'North Entry reader', said(A.lanes[HARBOR.id][0].reader.bound_at, HARBOR.timezone, 'en'), EN['readers.stillConnected']],
    ['North Exit', 'Old exit reader', said('2026-01-10T15:00:00Z', HARBOR.timezone, 'en'), said('2026-02-01T16:30:00Z', HARBOR.timezone, 'en')],
  ];
  check(JSON.stringify(history.map((r) => r.map(plain))) === JSON.stringify(historyWant.map((r) => r.map(plain))), `Card readers: every connection, current first, when connected and when ended, in the garage's time (${JSON.stringify(history)})`);
  const files = [];
  for (const language of ['en', 'es']) {
    if (language === 'es') await chooseOnSettings(page, 'language', 'es');
    for (const what of ['excel', 'pdf']) {
      const download = page.waitForEvent('download', { timeout: 15000 });
      await page.click(`[data-list="readers"] [data-action="download-${what}"]`);
      const file = await download;
      const path = join(DIR, `${language}-${file.suggestedFilename()}`);
      await file.saveAs(path);
      files.push({ language, what, path, name: file.suggestedFilename() });
    }
  }
  await chooseOnSettings(page, 'language', 'en');
  const back = readBack(files.map((f) => f.path));
  const apps = readSpreadsheets(files.map((f) => f.path));
  for (const f of files) {
    const w = WORDS[f.language];
    const got = back[f.path];
    const columns = ['readers.histLane', 'readers.histReader', 'readers.connected', 'readers.ended'].map((k) => w[k]);
    if (f.what === 'excel') {
      const want = [
        ['North Exit', 'North Exit reader', garageClock(bound.bound_at, HARBOR.timezone), w['readers.stillConnected']],
        ['North Entry', 'North Entry reader', garageClock(A.lanes[HARBOR.id][0].reader.bound_at, HARBOR.timezone), w['readers.stillConnected']],
        ['North Exit', 'Old exit reader', garageClock('2026-01-10T15:00:00Z', HARBOR.timezone), garageClock('2026-02-01T16:30:00Z', HARBOR.timezone)],
      ];
      // openpyxl gives each time back as the garage's clock, the cell's real date and time.
      const { rows } = tableOf(got.sheets[0], columns);
      const gotRows = rows.map((r) => r.slice(0, 4).map((c) => String(c?.value ?? '').replace(/:\d\d$/, ':00')));
      check(JSON.stringify(gotRows) === JSON.stringify(want), `Card readers, ${f.language} Excel read back by openpyxl: every connection, row for row, garage time (${JSON.stringify(gotRows)})`);
      // A spreadsheet app gives each cell as it shows it: the names and words exactly, each time with the garage's minute.
      for (const [app, byPath] of Object.entries(apps)) {
        const shown = tableOf(byPath[f.path].sheets[0], columns).rows.map((r) => r.slice(0, 4).map((c) => String(c?.value ?? '')));
        const minute = (wall) => wall.slice(14, 16);
        const same = shown.length === want.length && shown.every((r, i) => r[0] === want[i][0] && r[1] === want[i][1] && r[2].includes(`:${minute(want[i][2])}`) && (want[i][3] === w['readers.stillConnected'] ? r[3] === want[i][3] : r[3].includes(`:${minute(want[i][3])}`)));
        check(same, `Card readers, ${f.language} Excel read back by ${app}: every connection, row for row (${JSON.stringify(shown)})`);
      }
    } else {
      const text = plain(got.pages.map((p) => p.text).join(' '));
      check(['North Exit reader', 'North Entry reader', 'Old exit reader', w['readers.stillConnected']].every((s) => text.includes(s)) && columns.every((c) => text.includes(c)), `Card readers, ${f.language} PDF read back by pypdf: every connection and every column`);
    }
    const all = JSON.stringify(got);
    check(!all.includes(CODE) && !f.name.includes(CODE), `4 the reader's code is not in the ${f.language} ${f.what === 'excel' ? 'Excel' : 'PDF'} file, nor its name`);
  }
  // Print: no frame, the garage's name and garage time on the page.
  await page.click('[data-list="readers"] [data-action="print"]');
  await settles(page, () => !document.querySelector('.list-actions[aria-busy="true"]'));
  await page.emulateMedia({ media: 'print' });
  const printed = await page.evaluate(() => ({
    frame: [...document.querySelectorAll('.sidebar, .topbar')].some((e) => getComputedStyle(e).display !== 'none'),
    forms: [...document.querySelectorAll('[data-list="ways-out"], [data-readers="place"]')].some((e) => getComputedStyle(e).display !== 'none'),
    head: document.querySelector('[data-list="readers"] .print-head')?.innerText ?? '',
    rows: document.querySelectorAll('[data-list="readers"] tbody tr').length,
  }));
  check(!printed.frame && printed.head.includes(HARBOR.name) && printed.rows === 3, `Card readers, print: the list of connections, with the garage's name, no frame (${printed.rows} rows)`);
  await screenshot(page, 'card-readers-print');
  await page.emulateMedia({ media: 'screen' });

  // Disconnect, confirmed on the page.
  await page.click(`tr[data-lane="${northExit.id}"] [data-action="disconnect-reader"]`);
  await appears(page, '[data-panel="disconnect-reader"]');
  const keep = await page.textContent('[data-panel="disconnect-reader"] [data-action="close-panel"]');
  check(keep === EN['readers.panelKeep'] && (await page.textContent('[data-panel="disconnect-reader"] p')) === EN['readers.disconnectAsk'], `Card readers: disconnecting asks on the page, with "${EN['readers.panelKeep']}" beside "${EN['readers.disconnectButton']}"`);
  await page.click('[data-action="disconnect-confirm"]');
  check(await settles(page, (id) => document.querySelector(`tr[data-lane="${id}"]`)?.dataset.reader === 'no', northExit.id), 'Card readers: disconnected: the way out says it has no card reader');
  check(await settles(page, () => document.querySelectorAll('[data-list="readers"] tr[data-connection="ended"]').length === 2), 'Card readers: ...and the connection stays on record, ended');
  // Check 1, every refusal of the reader routes, both languages: connecting
  // on North Exit (it has none now), and disconnecting South Exit's reader.
  const southExit = A.lanes[HARBOR.id].find((l) => l.name === 'South Exit');
  await page.click(`tr[data-lane="${southExit.id}"] [data-action="connect-reader"]`);
  await page.fill('[data-field="reader-code"]', 'simulated-wpe-south');
  await page.fill('[data-field="reader-label"]', 'South Exit reader');
  await page.click('[data-action="connect-confirm"]');
  check(await settles(page, (id) => document.querySelector(`tr[data-lane="${id}"]`)?.dataset.reader === 'yes', southExit.id), 'Card readers: a second way out given a reader');
  for (const language of ['en', 'es']) {
    if (language === 'es') await chooseOnSettings(page, 'language', 'es');
    for (const code of ['bad_reader', 'lane_has_reader', 'reader_bound_elsewhere', 'no_terminal_location', 'card_payments_not_active', 'stripe_refused', 'stripe_unreachable', 'lane_not_found', 'connect_not_configured']) {
      await refusalSaid(page, code, language, async () => {
        if (!(await page.$('[data-panel="connect-reader"]'))) await page.click(`tr[data-lane="${northExit.id}"] [data-action="connect-reader"]`);
        await page.fill('[data-field="reader-code"]', 'simulated-wpe-refused');
        await page.fill('[data-field="reader-label"]', 'North Exit reader');
        await page.click('[data-action="connect-confirm"]');
      }, 'Card readers, connecting');
    }
    await page.click('[data-panel="connect-reader"] [data-action="close-panel"]');
    await refusalSaid(page, 'no_reader_bound', language, async () => {
      if (!(await page.$('[data-panel="disconnect-reader"]'))) await page.click(`tr[data-lane="${southExit.id}"] [data-action="disconnect-reader"]`);
      await page.click('[data-action="disconnect-confirm"]');
    }, 'Card readers, disconnecting');
    await page.click('[data-panel="disconnect-reader"] [data-action="close-panel"]');
  }
  await screenshot(page, 'card-readers-spanish-day');
  await chooseOnSettings(page, 'language', 'en');
  await screenshot(page, 'card-readers-english-day');

  // ── By night, both languages ─────────────────────────────────────────
  const night = await open({ colorScheme: 'dark' });
  await night.page.fill('input[name="email"]', A.email);
  await night.page.fill('input[name="password"]', A.password);
  await night.page.click('button[type="submit"]');
  await night.page.click(`.garage-choice[data-garage="${HARBOR.id}"]`);
  for (const language of ['en', 'es']) {
    if (language === 'es') await chooseOnSettings(night.page, 'language', 'es');
    for (const [hash, key, name] of [['#/taxes', 'page.taxes.title', 'taxes'], ['#/getting-paid', 'page.paid.title', 'getting-paid'], ['#/card-readers', 'page.readers.title', 'card-readers']]) {
      const reached = await go(night.page, hash, key, language);
      await night.page.waitForTimeout(400);
      const text = await bodyText(night.page);
      check(reached && rawIn(text).length === 0 && (await night.page.evaluate(() => document.documentElement.dataset.theme)) === 'night', `by night (${language}), ${WORDS[language][key]}: shown, nothing raw${rawIn(text).length ? `: ${rawIn(text).join(', ')}` : ''}`);
      await screenshot(night.page, `${name}-${language === 'es' ? 'spanish' : 'english'}-night`);
    }
  }
  await night.context.close();
  await context.close();
} finally {
  await browser.close();
  await server.close();
  await stub.close();
  rmSync(DIR, { recursive: true, force: true });
}

check(policyBroken.length === 0, `the page policy was never broken (${policyBroken.length} violations)`);
const outside = requests.filter((r) => new URL(r.url).origin !== origin);
check(outside.length === 0, `every request went to the site's own origin (${requests.length - outside.length} of ${requests.length})`);
for (const r of outside) console.error(`  went outside: ${r.url}`);
if (failures.length) {
  console.error(`\n${failures.length} failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`\nmoney pages — ${passed} checks passed; Taxes and fees, Getting paid and Card readers, both languages, by day and by night; browser in ${BROWSER_ZONE}; ${requests.length} requests, all to ${origin}; spreadsheets read back by openpyxl${READERS.length ? ` and ${READERS.join(', ')}` : ''}.${SCREENS ? ` Screenshots in ${SCREENS}.` : ''}`);
