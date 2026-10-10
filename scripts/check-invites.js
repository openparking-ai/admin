#!/usr/bin/env node
/* global document, window, getComputedStyle, location, Intl */
// Accepting an invite, a forgotten password, a new one chosen (U7d-2), in a
// real browser.
//
// Serves dist/ (run `npm run build` first) with /api sent to the stand-in
// platform (test/stub-platform.js, its four doors recorded from the platform
// at 130d38d), opens it in headless Chromium with the browser in TOKYO time,
// and checks, in English and in Spanish:
//
//   1  an invite end to end: a ready one shows the email it was sent to (read
//      only), a password typed twice and the language, the invite's own to
//      start with; accepted with a matching password, the owner is signed in
//      and on the Garages page, ready to add a garage, the account in the
//      language picked. A used, expired, replaced or invalid one (an empty
//      link too, and one that ended while it was open) shows its sentence and
//      the one thing to do, and no form;
//   2  the token never stays in the address after it is read -- opened as the
//      page starts, and opened into a page already open, back and forward
//      too, and never in the page's title -- and is sent only in a POST body:
//      no request the page makes holds it in its address or a query;
//   3  a password typed twice is sent only when the two match and it meets
//      the rule (at least 12 characters): a mismatch, a short one or none
//      sends nothing and says why, on the invite and on a reset;
//   4  Forgot your password?: the same sentence for an email that has an
//      account and one that has none, the screen otherwise the same too; a
//      blank one sends nothing and says so;
//   5  a reset: the new password typed twice; changed, the sign-in screen
//      says so, the new password signs in and the old session is ended; a
//      used, expired, replaced or invalid link says so and offers "Forgot
//      your password?" again;
//   6  time zones: America/Detroit and America/Indiana/Indianapolis are in
//      the United States' group, and nowhere else; a zone the browser gives
//      by an old name ("Asia/Calcutta") is shown by today's (Kolkata), once,
//      with the browser's own list and with one holding both names; no two
//      zones say the same words; a garage kept under an old name is shown by
//      today's;
//   7  Setup's "Garage details" says the details were set when the garage was
//      created and can't be changed; in Spanish, "garaje";
//   8  the Garages page in Spanish at 1280 px beside a long zone: a garage's
//      name of two words stays on one line;
//   9  the 8 link-status screens (an invite or a reset link used, expired,
//      replaced or invalid): the title as far from its box as Forgot's title
//      from its next line;
//  10  a phone, 360 and 390 px: no signed-out screen is wider than the screen,
//      and nothing on it runs off either edge;
//   and, in 1, an invite opened while an owner is signed in and left: the
//   owner's pages in the account's language again, the way out named Home;
//   in 7, every Setup line in Spanish says "garaje", on screen and in print;
//   and every new field shows its description under its name; no request
//   leaves the page.
//
//   node scripts/check-invites.js                 the check
//   node scripts/check-invites.js --screens DIR   ...and save the screenshots

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { DICTIONARIES, LANGUAGE_KEY } from '../src/i18n/index.js';
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
const GOOD = 'harbor-lights-at-night';
const GOOD_TOO = 'river-deck-in-the-morning';

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
const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4391, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } } });
const base = server.resolvedUrls.local[0];
const origin = new URL(base).origin;
stub.allowOrigin(origin);
const browser = await chromium.launch();
const requests = []; // { method, url, body }, every request of every page

const settles = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const heading = (page) => page.$eval('.page-title', (h) => h.textContent).catch(() => null);
const showsHeading = (page, text) => settles(page, (t) => document.querySelector('.page-title')?.textContent === t, text);
const go = (page, id) => page.click(`.nav-item[href="${hashFor(PAGES.find((x) => x.id === id))}"]`);
const posts = (path) => requests.filter((r) => r.method === 'POST' && new URL(r.url).pathname === `/api/v1${path}`);
const textOf = (page, selector) => page.$eval(selector, (e) => e.textContent).catch(() => null);
const screenshot = async (page, name) => {
  if (!SCREENS) return;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(SCREENS, `${name}.png`), fullPage: true });
};
let nth = 0;
const fresh = (who) => `${who}-${(nth += 1)}@example.com`;
// A token of an invite's shape that the stand-in never made.
const NEVER_MADE = `opi_${'Q'.repeat(43)}`;
const NEVER_MADE_RESET = `opr_${'Q'.repeat(43)}`;

/** A new browser, nobody signed in, at `hash`; Spanish on this computer when asked (the sign-in screen's own choice, kept). */
async function openAt(hash = '', { language = 'en', width = 1360, init = null } = {}) {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo', viewport: { width, height: 900 } });
  context.on('request', (r) => requests.push({ method: r.method(), url: r.url(), body: r.postData() }));
  // A break planted by a control fails at once, not after a long wait for something that is not there.
  context.setDefaultTimeout(8000);
  if (init) await context.addInitScript(init);
  if (language === 'es') await context.addInitScript((key) => window.localStorage.setItem(key, 'es'), LANGUAGE_KEY);
  const page = await context.newPage();
  await page.goto(`${base}${hash}`);
  return { context, page };
}
async function signIn(page, who, password = who.password) {
  await page.fill('input[name="email"]', who.email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}
const speak = (page, language) => chooseOnSettings(page, 'language', language);

/** Each description under its name, on screen, in `language`. */
async function described(page, keys, language, label) {
  const wrong = [];
  for (const key of keys) {
    const shown = await page.$eval(`[data-about="${key}"]`, (e) => (getComputedStyle(e).display === 'none' ? null : e.textContent)).catch(() => null);
    if (shown !== WORDS[language][`${key}.about`]) wrong.push(`${key}: ${shown === null ? 'not shown' : `"${shown}"`}`);
  }
  check(wrong.length === 0, `descriptions (${language}): ${label}, each under its name${wrong.length ? `; ${wrong.join('; ')}` : ''}`);
}

/** What the screen shows of a link: its status, the sentence, the thing to do, and whether any form is there. */
const linkShown = (page) =>
  page.evaluate(() => ({
    status: document.querySelector('.link-status')?.dataset.status ?? null,
    said: document.querySelector('.link-status [data-notice]')?.textContent ?? null,
    todo: document.querySelector('.link-status .link-do')?.textContent ?? null,
    forms: document.querySelectorAll('form').length,
    passwords: document.querySelectorAll('input[type="password"]').length,
    address: location.href,
  }));

/** The space between a screen's title and the line under it, in px (`under` names that line). */
const titleGap = (page, under) =>
  page.evaluate((sel) => {
    const title = document.querySelector('.signin-card .page-title');
    const next = document.querySelector(sel);
    return title && next ? Math.round(next.getBoundingClientRect().top - title.getBoundingClientRect().bottom) : null;
  }, under);
const gaps = []; // [screen, px] for every link-status screen (9)

async function fillPasswords(page, first, second) {
  await page.fill('[data-field="new-password"]', first);
  await page.fill('[data-field="new-password-again"]', second);
}

/** The address, the history around it and the title hold none of `token`. */
async function addressClean(page, token) {
  return page.evaluate((tk) => !location.href.includes(tk) && !location.hash.includes('=') && !document.title.includes(tk), token);
}

try {
  // ── 1, 2, 3: an invite ──────────────────────────────────────────────────
  // The language the computer last used is English; the invite's is the one shown first.
  const accepted = {}; // language -> { email, token }
  for (const language of LANGUAGES) {
    const w = WORDS[language];
    const email = fresh(`invited-${language}`);
    const token = stub.invite(email, { language, company: `Invited ${language}` });
    const before = requests.length;
    const { context, page } = await openAt(`#invite=${token}`);
    const ready = await settles(page, () => Boolean(document.querySelector('[data-form="accept-invite"]')));
    const clean = await addressClean(page, token);
    check(ready && (await heading(page)) === w['invite.title'], `1 ready (${language}): "${w['invite.title']}", with its form`);
    // 2: out of the address before anything else, and only ever in a POST body.
    check(clean, `2 ready (${language}): the address holds no token once it is read (${await page.evaluate(() => location.href)})`);
    const shownEmail = await page.$eval('[data-form="accept-invite"] [data-field="email"]', (i) => ({ value: i.value, readOnly: i.readOnly })).catch(() => null);
    check(shownEmail?.value === email && shownEmail.readOnly, `1 ready (${language}): the email the invite was sent to, read only (${JSON.stringify(shownEmail)})`);
    const picked = await page.$eval('[data-control="account-language"] [aria-checked="true"]', (b) => b.dataset.value).catch(() => null);
    check(picked === language && (await page.evaluate(() => document.documentElement.lang)) === language, `1 ready (${language}): the language is the invite's to start with, and the screen speaks it`);
    await described(page, ['invite.email', 'invite.language', 'password.new', 'password.again'], language, 'Accept your invite');
    if (language === 'en') await screenshot(page, 'invite-ready-en-day');
    // 3: nothing is sent until the two match and meet the rule.
    for (const [what, first, second, says] of [
      ['nothing typed', '', '', ['password.short']],
      ['two that differ', GOOD, GOOD_TOO, ['password.differ']],
      ['11 characters, twice', 'eleven-char', 'eleven-char', ['password.short']],
      ['11 characters, then another', 'eleven-char', 'twelve-chars', ['password.short', 'password.differ']],
    ]) {
      const sent = posts('/auth/invite/accept').length;
      await fillPasswords(page, first, second);
      await page.click('[data-action="accept-invite"]');
      await page.waitForTimeout(400);
      const notices = await page.$$eval('[data-form="accept-invite"] .warning[data-notice]', (ps) => ps.map((p) => [p.dataset.notice, p.textContent]));
      const right = notices.length === says.length && says.every((k) => notices.some(([nk, text]) => nk === k && text === w[k]));
      check(posts('/auth/invite/accept').length === sent && right, `3 invite, ${what} (${language}): nothing sent, and it says "${says.map((k) => w[k]).join(' ')}"${right ? '' : ` (it says ${JSON.stringify(notices)})`}`);
    }
    if (language === 'es') await screenshot(page, 'invite-mismatch-es-day');
    await fillPasswords(page, GOOD, GOOD);
    await page.click('[data-action="accept-invite"]');
    const landed = await showsHeading(page, w['page.garages.title']);
    const ready2 = await settles(page, () => Boolean(document.querySelector('[data-start="no-garages"] [data-action="add-garage"]')));
    const me = await page.evaluate(async () => (await fetch('/api/v1/auth/me')).json()).catch(() => null);
    check(landed && ready2 && me?.email === email && me?.language === language && page.url().endsWith('#/garages'),
      `1 accepted (${language}): signed in as the invited email, on the Garages page with "${w['garages.add']}", the account in ${language}${me ? '' : ' (not signed in)'}`);
    const accepts = posts('/auth/invite/accept').filter((r) => requests.indexOf(r) >= before);
    check(accepts.length === 1 && JSON.parse(accepts[0].body).token === token && JSON.parse(accepts[0].body).password === GOOD && JSON.parse(accepts[0].body).language === language,
      `1 accepted (${language}): one POST /auth/invite/accept, of the token, the password typed twice and the language`);
    if (language === 'en') await screenshot(page, 'invite-accepted-garages-en');
    accepted[language] = { email, token };
    await context.close();
  }

  // 1: the language picked in the form is the account's, and the screen's.
  {
    const email = fresh('picks-english');
    const token = stub.invite(email, { language: 'es' });
    const { context, page } = await openAt(`#invite=${token}`);
    await settles(page, () => Boolean(document.querySelector('[data-form="accept-invite"]')));
    await page.click('[data-control="account-language"] [data-value="en"]');
    const english = await showsHeading(page, WORDS.en['invite.title']);
    await fillPasswords(page, GOOD, GOOD);
    await page.click('[data-action="accept-invite"]');
    await showsHeading(page, WORDS.en['page.garages.title']);
    const me = await page.evaluate(async () => (await fetch('/api/v1/auth/me')).json()).catch(() => null);
    check(english && me?.language === 'en', `1 an invite in Spanish, English picked: the screen changes to English, and the account is made in English`);
    await context.close();
  }

  // 1: an invite opened while an owner is signed in, in the other language, and left without accepting:
  // the owner's pages speak the account's language again, and the way out is named for where it goes, Home.
  for (const [label, who, own, other] of [
    ['an English owner, a Spanish invite', { email: A.email, password: A.password }, 'en', 'es'],
    ['a Spanish owner, an English invite', { email: accepted.es.email, password: GOOD }, 'es', 'en'],
  ]) {
    const mine = WORDS[own];
    const theirs = WORDS[other];
    const { context, page } = await openAt('', { language: own });
    await signIn(page, who);
    await page.waitForSelector('.nav');
    const token = stub.invite(fresh(`left-by-${own}`), { language: other });
    await page.evaluate((tk) => (window.location.hash = `invite=${tk}`), token);
    const opened = await settles(page, () => Boolean(document.querySelector('[data-form="accept-invite"]')));
    const inTheirs = (await heading(page)) === theirs['invite.title'];
    const way = await page.$$eval('.signin-card button[data-action^="back"], .signin-card button[data-action^="go-"]', (bs) => bs.map((b) => [b.dataset.action, b.textContent]));
    check(opened && inTheirs && JSON.stringify(way) === JSON.stringify([['back-home', theirs['links.backHome']]]),
      `1 signed in, ${label}: the invite in its own language, and its way out "${theirs['links.backHome']}" (${JSON.stringify(way)})`);
    if (SCREENS) await screenshot(page, `invite-signed-in-${other}`);
    await page.click('[data-action="back-home"]');
    const home = await showsHeading(page, mine['page.home.title']);
    const lang = await page.evaluate(() => document.documentElement.lang);
    const nav = await textOf(page, '.nav-item[href="#/settings"]');
    await go(page, 'settings');
    await showsHeading(page, mine['page.settings.title']);
    const settings = await page.$eval('[data-control="language"] [aria-checked="true"]', (b) => b.dataset.value).catch(() => null);
    const me = await page.evaluate(async () => (await fetch('/api/v1/auth/me')).json()).catch(() => null);
    const kept = await page.evaluate((key) => window.localStorage.getItem(key), LANGUAGE_KEY);
    check(home && lang === own && nav === mine['page.settings.title'] && settings === own && me?.language === own && kept === own,
      `1 signed in, ${label}, left: Home in the account's language ("${mine['page.home.title']}"), Settings "${mine[`language.${own}`]}", the account and this computer still ${own} (home ${home}, lang ${lang}, Settings ${settings}, account ${me?.language}, kept ${kept})`);
    // A used one too: its one thing to do, for a signed-in owner, is Home.
    await page.evaluate((tk) => (window.location.hash = `invite=${tk}`), accepted[other].token);
    await settles(page, () => document.querySelector('.link-status')?.dataset.status === 'used');
    const button = await textOf(page, '.link-status [data-action="go-home"]');
    if (button !== null) await page.click('.link-status [data-action="go-home"]');
    check(button === mine['links.backHome'] && (await showsHeading(page, mine['page.home.title'])), `1 signed in, ${label}: a used invite's button says "${mine['links.backHome']}" and goes there (${JSON.stringify(button)})`);
    await context.close();
  }

  // 1: a link that is not ready shows its sentence, the one thing to do, and no form.
  const usedToken = accepted.en.token;
  const expiredEmail = fresh('expired');
  const expiredToken = stub.invite(expiredEmail);
  stub.expireLink(expiredToken);
  const replacedEmail = fresh('replaced');
  const replacedToken = stub.invite(replacedEmail);
  stub.resendInvite(replacedEmail);
  const cases = [
    ['used', usedToken, 'used'],
    ['expired', expiredToken, 'expired'],
    ['replaced', replacedToken, 'replaced'],
    ['invalid', NEVER_MADE, 'invalid'],
    ['empty (no token at all)', '', 'invalid'],
  ];
  for (const language of LANGUAGES) {
    const w = WORDS[language];
    for (const [what, token, status] of cases) {
      const before = posts('/auth/invite/status').length;
      const { context, page } = await openAt(`#invite=${token}`, { language });
      await settles(page, () => Boolean(document.querySelector('.link-status')));
      const shown = await linkShown(page);
      const right = shown.status === status && shown.said === w[`invite.${status}`] && shown.todo === w[`invite.${status}.do`] && shown.forms === 0 && shown.passwords === 0;
      check(right, `1 ${what} (${language}): "${w[`invite.${status}`]} ${w[`invite.${status}.do`]}", and no form${right ? '' : ` (shown: ${JSON.stringify(shown)})`}`);
      if (token !== '') gaps.push([`invite ${status} (${language})`, await titleGap(page, '.link-status .signin-problem')]);
      if (token === '') check(posts('/auth/invite/status').length === before, `1 empty (${language}): nothing is asked of the platform for a link with no token`);
      else check(await addressClean(page, token), `2 ${what} (${language}): the address holds no token once it is read`);
      if (status === 'used') {
        const button = await page.$('[data-action="go-sign-in"]');
        if (button) await button.click();
        check(Boolean(button) && (await showsHeading(page, w['signIn.title'])), `1 used (${language}): "${w['links.signIn']}" opens the sign-in screen`);
      }
      if (SCREENS && (status === 'expired' || status === 'used')) await screenshot(page, `invite-${status}-${language}-day`);
      await context.close();
    }
  }
  // 1: an invite that ends while its form is open: the press says so, and the form goes.
  {
    const email = fresh('ends-while-open');
    const token = stub.invite(email);
    const { context, page } = await openAt(`#invite=${token}`);
    await settles(page, () => Boolean(document.querySelector('[data-form="accept-invite"]')));
    stub.expireLink(token);
    await fillPasswords(page, GOOD, GOOD);
    await page.click('[data-action="accept-invite"]');
    await settles(page, () => Boolean(document.querySelector('.link-status')));
    const shown = await linkShown(page);
    check(shown.status === 'expired' && shown.forms === 0, `1 an invite that ended while its form was open: "${WORDS.en['invite.expired']}", and the form is gone (${JSON.stringify(shown)})`);
    await context.close();
  }

  // 2: a link opened into a page that is already open: taken out of the address too, back and forward.
  {
    const email = fresh('opened-later');
    const token = stub.invite(email);
    const { context, page } = await openAt('');
    await showsHeading(page, WORDS.en['signIn.title']);
    await page.evaluate((tk) => (window.location.hash = `invite=${tk}`), token);
    const shown = await settles(page, () => Boolean(document.querySelector('[data-form="accept-invite"]')));
    const now = await addressClean(page, token);
    await page.goBack().catch(() => {});
    const back = await addressClean(page, token);
    await page.goForward().catch(() => {});
    const forward = await addressClean(page, token);
    check(shown && now && back && forward, `2 a link opened into an open page: its screen shown, and no token in the address, nor back, nor forward (${shown}, ${now}, ${back}, ${forward})`);
    await context.close();
  }

  // ── 4: Forgot your password? ─────────────────────────────────────────────
  for (const language of LANGUAGES) {
    const w = WORDS[language];
    const seen = {};
    for (const [what, email] of [['an email with an account', A.email], ['an email with none', 'nobody-at-all@example.com']]) {
      const { context, page } = await openAt('', { language });
      await showsHeading(page, w['signIn.title']);
      await page.click('[data-action="forgot"]');
      const opened = await showsHeading(page, w['forgot.title']);
      if (what.includes('account')) {
        await described(page, ['forgot.email'], language, 'Forgot your password?');
        const sent = posts('/auth/forgot').length;
        await page.click('[data-action="send-link"]');
        await page.waitForTimeout(400);
        check(posts('/auth/forgot').length === sent && (await textOf(page, '[data-notice="need-email"]')) === w['forgot.needEmail'], `4 blank (${language}): nothing sent, and it says "${w['forgot.needEmail']}"`);
        if (language === 'en') await screenshot(page, 'forgot-en-day');
        gaps.forgot ??= await titleGap(page, '.signin-card .page-purpose');
      }
      const resetsBefore = stub.sent().filter((m) => m.kind === 'reset').length;
      await page.fill('[data-form="forgot"] [data-field="email"]', email);
      await page.click('[data-action="send-link"]');
      await settles(page, () => Boolean(document.querySelector('[data-notice="forgot-sent"]')));
      seen[what] = { said: await textOf(page, '[data-notice="forgot-sent"]'), card: await page.$eval('.signin-card', (c) => c.innerText), resets: stub.sent().filter((m) => m.kind === 'reset').length - resetsBefore };
      check(opened && seen[what].said === w['forgot.sent'], `4 ${what} (${language}): "${w['forgot.sent']}"`);
      if (language === 'es' && what.includes('none')) await screenshot(page, 'forgot-sent-es-day');
      await context.close();
    }
    const [known, unknown] = Object.values(seen);
    check(known.card === unknown.card && known.resets === 1 && unknown.resets === 0, `4 (${language}): the screen is the same for an email with an account and one with none (a link went to the one only)${known.card === unknown.card ? '' : `; ${JSON.stringify(known.card)} / ${JSON.stringify(unknown.card)}`}`);
  }

  // ── 5: a reset ───────────────────────────────────────────────────────────
  const forgotFor = async (who) => {
    const res = await fetch(`${stub.url}/api/v1/auth/forgot`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: who.email }) });
    if (res.status !== 200) throw new Error(`forgot: ${res.status}`);
    return stub.sent().filter((m) => m.kind === 'reset' && m.to === who.email).at(-1).token;
  };
  for (const language of LANGUAGES) {
    const w = WORDS[language];
    const who = language === 'en' ? B : A;
    // Signed in elsewhere before the reset: that session ends with it.
    const elsewhere = await openAt('', { language });
    await signIn(elsewhere.page, who);
    await elsewhere.page.waitForSelector('.nav');
    const token = await forgotFor(who);
    const { context, page } = await openAt(`#reset=${token}`, { language });
    const opened = await settles(page, () => Boolean(document.querySelector('[data-form="reset"]')));
    check(opened && (await heading(page)) === w['reset.title'] && (await addressClean(page, token)), `5 a reset link (${language}): "${w['reset.title']}", and no token in the address`);
    await described(page, ['password.new', 'password.again'], language, 'Choose a new password');
    for (const [what, first, second, says] of [
      ['two that differ', GOOD, GOOD_TOO, ['password.differ']],
      ['11 characters, twice', 'eleven-char', 'eleven-char', ['password.short']],
    ]) {
      const sent = posts('/auth/reset').length;
      await fillPasswords(page, first, second);
      await page.click('[data-action="change-password"]');
      await page.waitForTimeout(400);
      const notices = await page.$$eval('[data-form="reset"] .warning[data-notice]', (ps) => ps.map((p) => p.dataset.notice));
      check(posts('/auth/reset').length === sent && JSON.stringify(notices) === JSON.stringify(says), `3 reset, ${what} (${language}): nothing sent, and it says "${says.map((k) => w[k]).join(' ')}"`);
    }
    if (language === 'en') await screenshot(page, 'reset-en-day');
    const newPassword = `${GOOD}-${language}`;
    await fillPasswords(page, newPassword, newPassword);
    await page.click('[data-action="change-password"]');
    const atSignIn = await showsHeading(page, w['signIn.title']);
    const said = await textOf(page, '[data-notice="password-changed"]');
    check(atSignIn && said === w['signIn.passwordChanged'], `5 changed (${language}): the sign-in screen, saying "${w['signIn.passwordChanged']}"${said === null ? ' (it says nothing)' : ''}`);
    const resets = posts('/auth/reset').filter((r) => JSON.parse(r.body).token === token);
    check(resets.length === 1 && JSON.parse(resets[0].body).password === newPassword, `5 changed (${language}): one POST /auth/reset, of the token and the password typed twice`);
    if (language === 'es') await screenshot(page, 'reset-done-sign-in-es-day');
    await signIn(page, who, newPassword);
    // Signed in, the pages speak the owner's own language, kept on the account.
    check(await showsHeading(page, WORDS[who.language]['page.home.title']), `5 changed (${language}): the new password signs in`);
    await elsewhere.page.reload();
    check(await showsHeading(elsewhere.page, w['signIn.title']), `5 changed (${language}): the session signed in before the reset has ended`);
    await elsewhere.context.close();
    who.password = newPassword;
    await context.close();

    // A reset link opened into the very page where "Forgot your password?" was asked (pasted, not a new tab).
    {
      const { context: c, page: p } = await openAt('', { language });
      await p.click('[data-action="forgot"]');
      await p.fill('[data-form="forgot"] [data-field="email"]', who.email);
      await p.click('[data-action="send-link"]');
      await settles(p, () => Boolean(document.querySelector('[data-notice="forgot-sent"]')));
      const link = stub.sent().filter((m) => m.kind === 'reset' && m.to === who.email).at(-1).token;
      await p.evaluate((tk) => (window.location.hash = `reset=${tk}`), link);
      await settles(p, () => Boolean(document.querySelector('[data-form="reset"]')));
      const pasted = `${newPassword}-2`;
      await fillPasswords(p, pasted, pasted);
      await p.click('[data-action="change-password"]');
      const there = await showsHeading(p, w['signIn.title']);
      check(there && (await textOf(p, '[data-notice="password-changed"]')) === w['signIn.passwordChanged'] && (await addressClean(p, link)),
        `5 changed, the link opened where Forgot was asked (${language}): the sign-in screen, saying so (on: "${await heading(p)}")`);
      who.password = pasted;
      await c.close();
    }

    // The same link again, one that ended, one replaced, one that never was.
    // Asked for again, a link still waiting is replaced -- an ended one too, as on the platform -- so the one ended is the newest.
    const replaced = await forgotFor(who);
    const ended = await forgotFor(who);
    stub.expireLink(ended);
    for (const [status, link] of [['used', token], ['expired', ended], ['replaced', replaced], ['invalid', NEVER_MADE_RESET]]) {
      const { context: c, page: p } = await openAt(`#reset=${link}`, { language });
      await settles(p, () => Boolean(document.querySelector('[data-form="reset"]')));
      await fillPasswords(p, `${GOOD}-again`, `${GOOD}-again`);
      await p.click('[data-action="change-password"]');
      await settles(p, () => Boolean(document.querySelector('.link-status')));
      const shown = await linkShown(p);
      const offers = await textOf(p, '.link-status [data-action="forgot"]');
      check(shown.status === status && shown.said === w[`reset.${status}`] && shown.forms === 0 && offers === w['signIn.forgot'],
        `5 ${status} (${language}): "${w[`reset.${status}`]}", no form, and "${w['signIn.forgot']}" offered${shown.status === status ? '' : ` (shown: ${JSON.stringify(shown)})`}`);
      gaps.push([`reset ${status} (${language})`, await titleGap(p, '.link-status .signin-problem')]);
      if (status === 'used') {
        if (language === 'en') await screenshot(p, 'reset-used-en-day');
        await p.click('.link-status [data-action="forgot"]');
        check(await showsHeading(p, w['forgot.title']), `5 used (${language}): "${w['signIn.forgot']}" opens it`);
      }
      await c.close();
    }
    const { context: e, page: ep } = await openAt('#reset=', { language });
    const shown = await settles(ep, () => document.querySelector('.link-status')?.dataset.status === 'invalid');
    check(shown, `5 empty (${language}): a reset link with no token says "${w['reset.invalid']}" without asking`);
    await e.close();
  }

  // ── 2: every request, every page: the tokens in no address and no query ──
  {
    const tokens = [...stub.sent().map((m) => m.token), NEVER_MADE, NEVER_MADE_RESET];
    const inAddress = requests.filter((r) => tokens.some((tk) => r.url.includes(tk)));
    const doors = stub.doorRequests();
    const notPost = doors.filter((d) => d.method !== 'POST' || d.url.includes('?') || tokens.some((tk) => d.url.includes(tk)));
    const inBodies = doors.filter((d) => tokens.some((tk) => d.body.includes(tk))).length;
    check(inAddress.length === 0 && notPost.length === 0 && inBodies > 0,
      `2 every request of the run (${requests.length}): no token in any address or query; every door asked by POST, the token in its body (${inBodies})${inAddress.length ? `; in an address: ${inAddress[0].url}` : ''}${notPost.length ? `; ${notPost[0].method} ${notPost[0].url}` : ''}`);
  }

  // ── 9: the link-status screens: the title's gap to its box, as Forgot's to its next line ──
  {
    const off = gaps.filter(([, px]) => px !== gaps.forgot);
    const screens = new Set(gaps.map(([what]) => what.replace(/ \((en|es)\)$/, '')));
    check(gaps.forgot >= 8 && screens.size === 8 && off.length === 0,
      `9 the 8 link-status screens (${gaps.length} in en and es): the title ${gaps.forgot} px from its box, as Forgot's title from its next line${off.length ? `; not so: ${off.map(([what, px]) => `${what} ${px} px`).join(', ')}` : ''}`);
  }

  // ── 10: a phone: no sideways scroll on any signed-out screen at 360 and 390 px ──
  {
    const readyEmail = fresh('on-a-phone');
    const readyToken = stub.invite(readyEmail);
    const screens = [
      ['Sign-in', '', '[data-action="forgot"]'],
      ['Forgot', '', '[data-form="forgot"]', '[data-action="forgot"]'],
      ['the invite, ready', `#invite=${readyToken}`, '[data-form="accept-invite"]'],
      ['the invite, used', `#invite=${usedToken}`, '.link-status'],
      ['the invite, expired', `#invite=${expiredToken}`, '.link-status'],
      ['a reset', `#reset=${NEVER_MADE_RESET}`, '[data-form="reset"]'],
      ['a reset link that does not work', '#reset=', '.link-status'],
    ];
    const wide = [];
    let seen = 0;
    for (const width of [360, 390]) {
      for (const language of LANGUAGES) {
        for (const [what, hash, ready, press] of screens) {
          const { context, page } = await openAt(hash, { language, width });
          if (press) await page.click(press);
          const there = await settles(page, (sel) => Boolean(document.querySelector(sel)), ready);
          // Off either edge: a row pushed off the left scrolls nowhere, so the document's width alone does not show it.
          const size = await page.evaluate(() => ({
            doc: document.documentElement.scrollWidth,
            screen: window.innerWidth,
            card: Math.round(document.querySelector('.signin-card')?.getBoundingClientRect().width ?? 0),
            off: [...document.body.querySelectorAll('*')]
              .filter((e) => {
                const r = e.getBoundingClientRect();
                return r.width > 0 && (r.left < -0.5 || r.right > window.innerWidth + 0.5);
              })
              .map((e) => e.dataset.control ?? e.dataset.chooser ?? e.className ?? e.tagName)
              .slice(0, 3),
          }));
          if (there) seen += 1;
          if (!there || size.doc > size.screen || size.off.length) wide.push(`${what} (${language}, ${width} px): ${there ? `${size.doc} px wide, the card ${size.card}${size.off.length ? `, off the edge: ${size.off.join(', ')}` : ''}` : 'not shown'}`);
          if (SCREENS && width === 360 && ['Sign-in', 'the invite, ready', 'the invite, used'].includes(what)) await screenshot(page, `phone-360-${what.replace(/[^a-z]+/gi, '-')}-${language}`);
          await context.close();
        }
      }
    }
    check(wide.length === 0 && seen === screens.length * 4, `10 a phone, 360 and 390 px, en and es: the page no wider than the screen, and nothing off its edges, on Sign-in, Forgot, the invite and the reset screens (${seen})${wide.length ? `; wider: ${wide.join('; ')}` : ''}`);
  }

  // ── 6: time zones ────────────────────────────────────────────────────────
  {
    const both = () => {
      const own = Intl.supportedValuesOf.bind(Intl);
      Intl.supportedValuesOf = (what) => (what === 'timeZone' ? [...own(what), 'Asia/Kolkata', 'Europe/Kyiv', 'America/Indiana/Indianapolis', 'America/Kentucky/Louisville'] : own(what));
    };
    const usIds = US_ZONES.map((z) => z.id);
    for (const [label, init] of [["the browser's own list", null], ['a list holding the old and the new names', both]]) {
      for (const language of LANGUAGES) {
        const w = WORDS[language];
        const { context, page } = await openAt('', { language, init });
        await signIn(page, A);
        await page.waitForSelector('.nav');
        await go(page, 'garages');
        await page.click('[data-action="add-garage"]');
        await page.waitForSelector('[data-form="add-garage"] [data-field="zone"]');
        const zones = await page.$$eval('[data-field="zone"] optgroup', (gs) => gs.map((g) => [...g.querySelectorAll('option')].map((o) => [o.value, o.textContent])));
        const browserSays = await page.evaluate(() => Intl.supportedValuesOf('timeZone').filter((z) => ['Asia/Calcutta', 'Asia/Kolkata', 'America/Indianapolis'].includes(z)));
        const [us, others] = zones;
        const usValues = us.map(([v]) => v);
        const otherValues = others.map(([v]) => v);
        check(JSON.stringify(usValues) === JSON.stringify(usIds) && usValues.includes('America/Detroit') && usValues.includes('America/Indiana/Indianapolis'),
          `6 ${label} (${language}): the United States' group is tzdata's ${usIds.length}, America/Detroit and America/Indiana/Indianapolis among them`);
        const usElsewhere = otherValues.filter((v) => usIds.includes(v) || ['America/Indianapolis', 'America/Louisville', 'America/Fort_Wayne'].includes(v));
        const indy = [...us, ...others].filter(([, words]) => /Indian[aá]polis/.test(words));
        check(usElsewhere.length === 0 && indy.length === 1, `6 ${label} (${language}): no US zone under "${w['garages.zonesOther']}", and Indianapolis once${usElsewhere.length ? `; there: ${usElsewhere.join(', ')}` : ''}${indy.length === 1 ? '' : `; Indianapolis ${indy.length} times: ${JSON.stringify(indy)}`}`);
        const kolkata = others.filter(([, words]) => words.includes('Kolkata'));
        const calcutta = others.filter(([v, words]) => words.includes('Calcutta') || v === 'Asia/Calcutta');
        const kyiv = others.filter(([, words]) => /Kyiv|Kiev/.test(words));
        check(kolkata.length === 1 && kolkata[0][0] === 'Asia/Kolkata' && calcutta.length === 0 && kyiv.length === 1 && kyiv[0][1].includes('Kyiv'),
          `6 ${label} (${language}): the browser gives ${JSON.stringify(browserSays)}; shown as Kolkata once (${JSON.stringify(kolkata)}), never Calcutta, and Kyiv once`);
        const words = [...us, ...others].map(([, x]) => x);
        const twice = words.filter((x, i) => words.indexOf(x) !== i);
        check(twice.length === 0, `6 ${label} (${language}): no two zones say the same words (${words.length})${twice.length ? `; twice: ${twice.slice(0, 3).join(' | ')}` : ''}`);
        await context.close();
      }
    }
    // A garage kept under an old name is shown by today's.
    const kept = stub.addGarage(A, { name: 'Calcutta Annex', timezone: 'Asia/Calcutta', currency: 'INR' });
    const { context, page } = await openAt('');
    await signIn(page, A);
    await page.waitForSelector('.nav');
    await go(page, 'garages');
    // The Garages page's own row: Home's list of garages carries the same mark, and is on screen until the page changes.
    const cell = `[data-list="garages-page"] [data-garage-row="${kept.id}"] td[data-zone]`;
    await page.waitForSelector(cell);
    const zone = await textOf(page, cell);
    check(/Kolkata/.test(zone ?? '') && !/Calcutta/.test(zone ?? ''), `6 a garage kept as Asia/Calcutta: shown as "${zone}"`);
    await context.close();
  }

  // ── 7: Setup's "Garage details" ──────────────────────────────────────────
  {
    const { context, page } = await openAt('');
    await signIn(page, A);
    await page.waitForSelector('.nav');
    await go(page, 'garages');
    await page.click(`[data-list="garages-page"] [data-garage-row="${A.garages[0].id}"]`);
    for (const language of LANGUAGES) {
      const w = WORDS[language];
      await speak(page, language);
      await go(page, 'setup');
      await settles(page, () => Boolean(document.querySelector('[data-step="garage_details"]')));
      const step = await page.$eval('[data-step="garage_details"]', (li) => ({
        text: li.innerText,
        set: li.querySelector('[data-notice="set-at-creation"]')?.textContent ?? null,
        notYet: Boolean(li.querySelector('[data-notice="not-from-here"]')),
      })).catch(() => null);
      check(step?.set === w['setup.setAtCreation'] && !step.notYet && step.text.includes(w['setup.step.garage_details']),
        `7 Setup (${language}): "${w['setup.step.garage_details']}" says "${w['setup.setAtCreation']}"${step?.notYet ? ', and still "can\'t be set from here yet"' : ''}`);
      if (language === 'es') check(!/estacionamiento/i.test(step?.text ?? ''), `7 Setup (es): the step says "garaje", never "estacionamiento" (${JSON.stringify(step?.text)})`);
      await screenshot(page, `setup-garage-details-${language}`);
    }
    // In Spanish, every Setup line that means this garage says "garaje": an open garage and one not open, on screen and in print.
    // An alert's name is not the garage: "el servicio de estacionamiento con acomodador" is the kind of service, and stays.
    const aboutGarage = (line) => /estacionamiento/i.test(line.replaceAll('servicio de estacionamiento con acomodador', ''));
    const said = [];
    for (const g of A.garages) {
      await go(page, 'garages');
      await page.click(`[data-list="garages-page"] [data-garage-row="${g.id}"]`);
      await settles(page, () => Boolean(document.querySelector('[data-step="open"]')));
      for (const media of ['screen', 'print']) {
        await page.emulateMedia({ media });
        const text = await page.evaluate(() => document.body.innerText);
        for (const line of text.split('\n').filter(aboutGarage)) said.push(`${g.name}, ${media}: "${line}"`);
      }
      await page.emulateMedia({ media: 'screen' });
    }
    const keys = Object.entries(WORDS.es).filter(([k, v]) => /^(page\.setup\.(title|purpose)|setup\.)/.test(k) && aboutGarage(v)).map(([k]) => k);
    check(said.length === 0 && keys.length === 0, `7 Setup (es), an open garage and one not, on screen and in print: "garaje", never "estacionamiento"${said.length ? `; ${said.join('; ')}` : ''}${keys.length ? `; in the dictionary: ${keys.join(', ')}` : ''}`);
    await context.close();
  }

  // ── 8: Spanish garage names on one line beside a long zone, at 1280 px ──
  {
    for (const [name, timezone, currency] of [
      ['Plaza Norte', 'America/Argentina/Buenos_Aires', 'ARS'],
      ['Centro Sur', 'America/Mexico_City', 'MXN'],
      ['Lot Madrid', 'Europe/Madrid', 'EUR'],
      ['Puerto Viejo', 'America/Puerto_Rico', 'USD'],
    ]) stub.addGarage(A, { name, timezone, currency });
    const { context, page } = await openAt('', { language: 'es', width: 1280 });
    await signIn(page, A);
    await page.waitForSelector('.nav');
    await go(page, 'garages');
    await page.waitForSelector('[data-list="garages-page"] tbody tr');
    const rows = await page.$$eval('[data-list="garages-page"] tbody tr', (trs) =>
      trs.map((tr) => ({ name: tr.querySelector('bdi')?.textContent, lines: tr.querySelector('td:first-child bdi')?.getClientRects().length, zone: tr.querySelector('td[data-zone]')?.textContent })),
    );
    const long = rows.some((r) => /Buenos Aires/.test(r.zone));
    const wrapped = rows.filter((r) => r.name.split(' ').length <= 3 && r.name.length <= 24 && r.lines !== 1);
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    check(long && wrapped.length === 0 && fits, `8 Garages (es, 1280 px), beside "${rows.find((r) => /Buenos Aires/.test(r.zone))?.zone}": every name of two or three words on one line, and no sideways scroll${wrapped.length ? `; wrapped: ${wrapped.map((r) => `${r.name} (${r.lines} lines)`).join(', ')}` : ''}`);
    await screenshot(page, 'garages-es-1280');
    await context.close();
  }

  // ── Day and night, for the eye (--screens) ─────────────────────────────
  if (SCREENS) {
    for (const language of LANGUAGES) {
      const email = fresh(`look-${language}`);
      const token = stub.invite(email, { language });
      const { context, page } = await openAt(`#invite=${token}`, { language });
      await settles(page, () => Boolean(document.querySelector('[data-form="accept-invite"]')));
      await page.click('[data-control="theme"] [data-value="night"]');
      await screenshot(page, `invite-ready-${language}-night`);
      await page.click('[data-action="back-to-sign-in"]');
      await showsHeading(page, WORDS[language]['signIn.title']);
      await screenshot(page, `sign-in-${language}-night`);
      await page.click('[data-action="forgot"]');
      await showsHeading(page, WORDS[language]['forgot.title']);
      await screenshot(page, `forgot-${language}-night`);
      await context.close();
      const reset = await openAt(`#reset=${NEVER_MADE_RESET}`, { language });
      await reset.page.click('[data-control="theme"] [data-value="night"]');
      await settles(reset.page, () => Boolean(document.querySelector('[data-form="reset"]')));
      await screenshot(reset.page, `reset-${language}-night`);
      await reset.context.close();
      const used = await openAt(`#invite=${usedToken}`, { language });
      await used.page.click('[data-control="theme"] [data-value="night"]');
      await settles(used.page, () => Boolean(document.querySelector('.link-status')));
      await screenshot(used.page, `invite-used-${language}-night`);
      await used.context.close();
    }
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
console.log(`\ninvites — ${passed} checks passed: an invite accepted end to end and every other status said with no form; the token out of the address and only in a POST body; passwords typed twice, sent only when they match and meet the rule; Forgot the same for any email; a reset said and signed out; time zones by today's names, the United States' whole; Setup's garage details, and "garaje" on Setup in Spanish; Spanish names on one line; a signed-in owner's language back after an invite; the link-status title's gap; no sideways scroll on a phone; both languages.${SCREENS ? ` Screenshots in ${SCREENS}.` : ''}`);
