#!/usr/bin/env node
/* global document */
// The Exceptions page (platform 0048, #90), in a real browser, end to end.
//
// Signed in against the stand-in platform (test/stub-platform.js, which
// answers as test/platform-shapes.json records platform #90 does), with the
// browser in Tokyo and the garage in New York, at a garage where four cars
// were let out today and four yesterday -- the recording's own records
// (test/exceptions-fixtures.js): one owing, let out by the owner, with its
// pictures and the gate agent's messages and calls; a barrier opened at the
// lane with no gate agent set up; one owing, let out with the key, the gate
// agent not reached; one whose copies the retention purge blanked.
// The page must:
//
//   - be in the menu, under Setup;
//   - ask for today unnamed, and show the day the platform read: the
//     garage's own, said in words, never the browser's;
//   - list the day newest first, each with its time on the garage's clock,
//     its lane, who let it out, what it owed, and the gate agent in a line
//     from the list's own summary (no story read for it): messages, not
//     delivered, calls, answered, copied whole -- or not set up, not reached,
//     removed by the retention purge;
//   - ask for another day by its date in the path, never in a query;
//   - go to the day before and after, and to any day typed, and say a day
//     with nobody let out is empty;
//   - show one car's whole story: who, when, the reason as typed (never as
//     markup), what it owed and paid; its pictures, each from its own
//     record's picture route, shown, with when and where; every step in time
//     order; each address the gate agent sent to, with what became of it --
//     a failed delivery and an address refused among them; the calls, the
//     answered one with who was rung and who answered; and each copy of the
//     gate agent's records, or why there is none;
//   - only read: no write but sign-in, nothing sent to anything that takes money.
//
//   node scripts/check-exceptions.js     (run `npm run build` first)

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { DICTIONARIES } from '../src/i18n/index.js';
import { instantOf, moneyText, wallAt } from '../src/rates.js';
import { garageDateTime } from '../src/time.js';
import { clockSaid, dayOn, daySaid } from '../src/exceptions.js';
import { startStub } from '../test/stub-platform.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const EN = DICTIONARIES.en;
const MINUTE = 60_000;
const say = (key, values = {}) => EN[key].replace(/\{(\w+)\}/g, (whole, name) => (name in values ? values[name] : whole));

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
const ZONE = HARBOR.timezone;
// Today in the garage: three let out, the last a few minutes ago, all after its midnight.
const now = Date.now();
const today = wallAt(now, ZONE).slice(0, 10);
const midnight = instantOf(`${today}T00:00`, ZONE) ?? instantOf(`${today}T01:00`, ZONE);
const spread = Math.min(50 * MINUTE, Math.max(3_000, (now - midnight) * 0.8));
const [owing, opened, unreached, blanked] = stub.letOutStories(HARBOR.id, { at: [now - spread, now - spread * 0.6, now - spread * 0.3, now - spread * 0.1] });
// Yesterday afternoon: three more, so the day before is not empty; the day before that is.
const yesterday = dayOn(today, -1);
const afternoon = instantOf(`${yesterday}T15:00`, ZONE);
const before = stub.letOutStories(HARBOR.id, { at: [afternoon, afternoon + 20 * MINUTE, afternoon + 40 * MINUTE, afternoon + 50 * MINUTE] });
const exitLane = A.lanes[HARBOR.id].find((l) => l.direction === 'exit');

const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4378, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } } });
const base = server.resolvedUrls.local[0];
stub.allowOrigin(new URL(base).origin);
const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo', viewport: { width: 1360, height: 900 } });
const page = await context.newPage();

// Every call the page makes, as sent.
const sent = [];
page.on('request', (r) => {
  const url = new URL(r.url());
  if (url.pathname.startsWith('/api/')) sent.push({ method: r.method(), path: url.pathname, query: url.search });
});

await page.goto(base);
await page.waitForSelector('input[name="email"]');
await page.fill('input[name="email"]', A.email);
await page.fill('input[name="password"]', A.password);
await page.click('button[type="submit"]');
await page.waitForSelector(`.garage-choice[data-garage="${HARBOR.id}"]`);
await page.click(`.garage-choice[data-garage="${HARBOR.id}"]`);
await page.waitForSelector('.page-title');

console.log('The menu:');
await page.click('[data-nav-group="setup"] > .nav-group-name');
const inMenu = await page.evaluate(() => {
  const link = document.querySelector('nav a[href="#/exceptions"]');
  return link ? { text: link.textContent, group: link.closest('.nav-group')?.dataset.navGroup ?? null } : null;
});
check(inMenu?.text === EN['page.exceptions.title'] && inMenu.group === 'setup', `the menu has "${EN['page.exceptions.title']}", under Setup`);
await page.click('nav a[href="#/exceptions"]');
await page.waitForSelector('[data-list="exceptions"] [data-notice="day"]');

const listed = () => page.$$eval('[data-list="exceptions"] tbody tr[data-let-out]', (trs) => trs.map((tr) => tr.dataset.letOut));
const rowText = (id) => page.textContent(`tr[data-let-out="${id}"]`).then((t) => t.replace(/\s+/g, ' ').trim());
const settled = (want) => page.waitForFunction((ids) => JSON.stringify([...document.querySelectorAll('[data-list="exceptions"] tbody tr[data-let-out]')].map((tr) => tr.dataset.letOut)) === JSON.stringify(ids), want, { timeout: 5000 }).then(() => true, () => false);
const shows = (selector, text) => page.waitForFunction(([s, w]) => document.querySelector(s)?.textContent.includes(w), [selector, text], { timeout: 5000 }).then(() => true, () => false);
const listReads = () => sent.filter((s) => s.method === 'GET' && (s.path === `/api/v1/garages/${HARBOR.id}/exceptions` || s.path.startsWith(`/api/v1/garages/${HARBOR.id}/exceptions/day/`)));
const storyReads = () => sent.filter((s) => s.method === 'GET' && /\/exceptions\/[0-9a-f-]{36}$/.test(s.path));

console.log("Today's list:");
const firstRead = listReads()[0];
check(firstRead?.path === `/api/v1/garages/${HARBOR.id}/exceptions` && firstRead.query === '', `the first read asks for today unnamed (${firstRead ? firstRead.path + firstRead.query : 'none'}): the platform says which day that is`);
const dayShown = await page.getAttribute('[data-notice="day"]', 'data-day');
check(dayShown === today, `the garage's day, ${today}, not the browser's in Tokyo (${dayShown})`);
check(await shows('[data-notice="day"]', daySaid(today, 'en')), `said in words: "${daySaid(today, 'en')}"`);
check(await settled([blanked.id, unreached.id, opened.id, owing.id]), 'newest first');
const row = { owing: await rowText(owing.id), opened: await rowText(opened.id), unreached: await rowText(unreached.id) };
const time = clockSaid(owing.let_out_at, ZONE, 'en', today);
check(row.owing.includes(time), `when it was let out, on the garage's clock (${time})`);
check(row.owing.includes(exitLane.name), `its lane by name (${exitLane.name})`);
check(row.owing.includes(A.email) && row.owing.includes(moneyText(500, 'USD', 'en')), `let out by the owner (${A.email}), owing ${moneyText(500, 'USD', 'en')}`);
check(row.unreached.includes(say('exceptions.by.key', { name: 'desk' })), `the key by its name: "${say('exceptions.by.key', { name: 'desk' })}"`);
check(row.opened.includes(say('exceptions.by.lane', { name: exitLane.devices[0].name })) && row.opened.includes(EN['exceptions.owedNothing']), 'a person at the lane, by the lane\'s equipment; nothing owed: the barrier opened');
const gate = (id) => page.textContent(`tr[data-let-out="${id}"] td[data-gate]`);
const counted = `${say('exceptions.gate.counts', { messages: say('exceptions.gate.messagesFailed', { messages: say('exceptions.gate.messagesMany', { n: '4' }), n: '1' }), calls: say('exceptions.gate.callsAnswered', { calls: say('exceptions.gate.callsMany', { n: '3' }), n: '1' }) })} ${EN['exceptions.gate.copy.complete']}`;
check((await gate(owing.id)) === counted, `the gate agent in a line: "${counted}"`);
check((await gate(opened.id)) === EN['exceptions.gate.copy.not_configured'], `"${EN['exceptions.gate.copy.not_configured']}"`);
check((await gate(unreached.id)) === EN['exceptions.gate.copy.not_reachable'], `"${EN['exceptions.gate.copy.not_reachable']}"`);
check((await gate(blanked.id)) === EN['exceptions.gate.purged'], `copies removed by the retention purge: "${EN['exceptions.gate.purged']}"`);
check(storyReads().length === 0, `the column from the list itself: no story read before one is opened (${storyReads().length})`);
check(await shows('[data-notice="count"]', say('exceptions.countMany', { n: '4' })), 'how many, and how many still owed');

console.log('One car\'s whole story:');
await page.click(`tr[data-let-out="${owing.id}"] [data-action="open-let-out"]`);
await page.waitForSelector(`[data-story="${owing.id}"] .story-step`);
const fact = (name) => page.textContent(`[data-story] [data-fact="${name}"]`).then((t) => t.replace(/\s+/g, ' ').trim());
check((await fact('when')) === garageDateTime(owing.let_out_at, ZONE, 'en'), `let out at ${garageDateTime(owing.let_out_at, ZONE, 'en')}, the garage's time`);
check((await fact('who')) === A.email && (await fact('reason')) === owing.reason, 'who, and the reason as typed');
check((await fact('owed')) === moneyText(500, 'USD', 'en') && (await fact('paid')) === moneyText(0, 'USD', 'en'), 'what it owed and had paid, the platform\'s figures');
const pictures = await page.waitForFunction(() => {
  const imgs = [...document.querySelectorAll('[data-story] [data-picture] img')];
  return imgs.length && imgs.every((img) => img.complete && img.naturalWidth > 0)
    ? imgs.map((img) => ({ src: img.getAttribute('src'), href: img.closest('a')?.getAttribute('href'), alt: img.alt, kind: img.closest('[data-pictures]')?.dataset.pictures }))
    : null;
}, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => []);
const wantPictures = ['entry', 'exit', 'lane'].flatMap((kind) => owing.pictures[kind].map((p) => ({ kind, src: `/api/v1/garages/${HARBOR.id}/exceptions/${owing.id}/pictures/${p.id}` })));
check(JSON.stringify(pictures.map((p) => ({ kind: p.kind, src: p.src }))) === JSON.stringify(wantPictures), `its pictures, each shown, from its own record's picture route (${pictures.length})`);
check(pictures.every((p) => p.href === p.src && p.alt.length > 0), 'each a link to the whole picture, said in words');
check(await shows('[data-story] [data-pictures="lane"]', exitLane.name), 'where a lane picture was taken, by the lane\'s name');
check((await page.$$('[data-story] [data-notice="no-pictures"]')).length === 0, `"${EN['exceptions.noPictures']}" not said when there are pictures`);
const steps = await page.$$eval('[data-story] .story-step', (lis) => lis.map((li) => ({ type: li.dataset.type, at: li.dataset.at, text: li.textContent.replace(/\s+/g, ' ') })));
const times = steps.map((s) => Date.parse(s.at));
check(JSON.stringify(times) === JSON.stringify([...times].sort((a, b) => a - b)), `every step in time order (${steps.length})`);
check(steps[0]?.type === 'came-in' && steps.some((s) => s.type === 'case') && steps.some((s) => s.type === 'payment' && s.text.includes(EN['exceptions.payment.declined'])), 'came in, reached the exit, the card declined');
check(steps.some((s) => s.type === 'lane' && s.text.includes(EN['exceptions.reader.reader_offline'])), 'the reader offline');
check(steps.filter((s) => s.type === 'message').length === 4 && steps.filter((s) => s.type === 'call').length === 3, 'four messages and three calls, each once');
const letOutStep = steps.find((s) => s.type === 'let-out');
check(Boolean(letOutStep) && letOutStep.text.includes(owing.reason) && letOutStep.text.includes(A.email), 'the let-out: who and why');
const deliveries = await page.$$eval('[data-story] [data-delivery]', (lis) => lis.map((li) => ({ state: li.dataset.delivery, text: li.textContent.replace(/\s+/g, ' ') })));
check(deliveries.some((d) => d.state === 'failed' && d.text.includes('night-desk@example.com') && d.text.includes(EN['exceptions.delivery.failed'])), 'a failed delivery, to whom: night-desk@example.com, not delivered');
check(deliveries.some((d) => d.state === 'refused' && d.text.includes('gate-duty@example.com') && d.text.includes(EN['exceptions.delivery.refusedAddress'])), 'an address refused: gate-duty@example.com');
check(deliveries.some((d) => d.state === 'retrying' && d.text.includes('paging.example.com')), 'the pager trying again, and when');
check(deliveries.some((d) => d.state === 'delivered' && d.text.includes('email: Connection unexpectedly closed')), 'delivered on its second try, with why the first failed');
const answered = steps.find((s) => s.type === 'call' && s.text.includes(EN['exceptions.call.outcome.authorisation_received']));
check(Boolean(answered) && answered.text.includes('it rang sip:duty@example.com') && answered.text.includes('sip:duty@example.com answered') && answered.text.includes(EN['exceptions.call.authorisation.open_now']), 'the answered call: who was rung, who answered, what they pressed');
const copies = await page.$$eval('[data-story] [data-copies="messages"] li', (lis) => lis.map((li) => [li.dataset.copy, li.dataset.complete]));
check(JSON.stringify(copies) === JSON.stringify([['copied', 'no'], ['copied', 'yes']]), 'its messages copied at the let-out, and again whole once the window passed');
await page.click('[data-action="back-to-day"]');
check(await settled([blanked.id, unreached.id, opened.id, owing.id]), 'back to the day');

console.log('Markup in a reason:');
await page.click(`tr[data-let-out="${unreached.id}"] [data-action="open-let-out"]`);
await page.waitForSelector(`[data-story="${unreached.id}"] [data-fact="reason"]`);
check((await fact('reason')) === 'Barrier stuck open <b>again</b>' && (await page.$$('[data-story] b')).length === 0, 'the reason shown as words, never as markup');
const notReached = await page.$$eval('[data-story] [data-copies] li', (lis) => lis.map((li) => li.dataset.copy));
check(notReached.includes('not_reachable') && notReached.includes('refused') && !notReached.includes('copied'), 'each copy says why there is none: not reached, refused');
await page.click('[data-action="back-to-day"]');
await page.click(`tr[data-let-out="${opened.id}"] [data-action="open-let-out"]`);
await page.waitForSelector(`[data-story="${opened.id}"] [data-copies]`);
const unset = await page.$$eval('[data-story] [data-copies] li', (lis) => lis.map((li) => li.dataset.copy));
check(unset.length === 2 && unset.every((c) => c === 'not_configured') && (await fact('gate')) === EN['exceptions.gate.copy.not_configured'], 'no gate agent set up: said so, and by each copy');
await page.click('[data-action="back-to-day"]');

console.log('Other days:');
check(await page.isDisabled('[data-action="next-day"]'), 'no next day after today');
await page.click('[data-action="previous-day"]');
check(await settled([...before].reverse().map((x) => x.id)), `the day before (${yesterday}): its three, newest first`);
const asked = listReads().at(-1);
check(asked?.path.endsWith(`/exceptions/day/${yesterday}`) && asked.query === '', `asked for by its date in the path, no query (${asked?.path}${asked?.query})`);
await page.click('[data-action="previous-day"]');
check(await shows('[data-notice="none-let-out"]', EN['exceptions.none']), `a day with nobody let out: "${EN['exceptions.none']}"`);
check((await listed()).length === 0, 'and no rows');
await page.fill('[data-field="day"]', yesterday);
check(await settled([...before].reverse().map((x) => x.id)), 'a day typed in the box');
await page.click('[data-action="today"]');
check(await settled([blanked.id, unreached.id, opened.id, owing.id]), 'and back to today');

console.log('Only reading:');
const MONEY = /charge|capture|payment|refund|terminal|stripe|checkout|let-out/i;
const writes = sent.filter((s) => s.method !== 'GET');
check(JSON.stringify([...new Set(writes.map((s) => `${s.method} ${s.path}`))]) === JSON.stringify(['POST /api/v1/auth/sign-in']), `no write but sign-in, in ${sent.length} calls${writes.length > 1 ? `: ${writes.map((s) => `${s.method} ${s.path}`).join(', ')}` : ''}`);
check(!sent.some((s) => MONEY.test(s.path)), 'nothing sent to anything that takes money');

await browser.close();
await server.close();
await stub.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailed:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
