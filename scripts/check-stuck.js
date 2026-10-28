#!/usr/bin/env node
/* global document, window */
// Stuck stays (platform 0043), in a real browser, end to end.
//
// Signed in against the stand-in platform (test/stub-platform.js, which
// answers as test/platform-shapes.json records the platform does), at a
// garage with rates in force and three cars let in by its entry lane -- 30,
// 26 and 1 hour ago, each with one picture -- beside its own three old stays,
// one of them with a car at an exit lane now. The page must:
//
//   - list the stays older than the garage's hours, oldest first, each with
//     when it came in (the garage's clock), the plate read, the lane and its
//     picture; not the car that came in an hour ago;
//   - change the garage's hours only to a whole number, sending exactly that;
//   - end a stay only with a reason, at the time the person types on the
//     garage's clock, and say what it owes -- never charging a card: no call
//     to anything that takes money, from the first page to the last;
//   - write a stay off with a reason and no time;
//   - offer no End on a stay a car is at an exit lane on;
//   - say so, and read the list again, for a stay ended elsewhere meanwhile;
//   - show each ending in the change log, the reason as typed: never as markup.
//
//   node scripts/check-stuck.js     (run `npm run build` first)

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { DICTIONARIES } from '../src/i18n/index.js';
import { instantOf, moneyText, wallAt } from '../src/rates.js';
import { garageDateTime, garageTime } from '../src/time.js';
import { STUCK_LET_IN, startStub } from '../test/stub-platform.js';
import { recordedPlans } from '../test/rates-forms.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const EN = DICTIONARIES.en;
const HOUR = 3600_000;

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
stub.storeRates(HARBOR.id, recordedPlans('2020-01-01T00:00:00.000Z').regular);
const [ownA, ownB, ownC] = A.open[HARBOR.id];
const [old30, old26, new1] = STUCK_LET_IN.map((car) => stub.letIn(HARBOR.id, car));
stub.carAtExit(ownC.id);

const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4377, strictPort: false, host: '127.0.0.1', proxy: { '/api': { target: stub.url } } } });
const base = server.resolvedUrls.local[0];
stub.allowOrigin(new URL(base).origin);
const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo', viewport: { width: 1360, height: 900 } });
const page = await context.newPage();

// Every call the page makes, as sent.
const sent = [];
page.on('request', (r) => {
  const url = new URL(r.url());
  if (url.pathname.startsWith('/api/')) sent.push({ method: r.method(), path: url.pathname, body: r.postData() });
});
const sentTo = (method, tail) => sent.filter((s) => s.method === method && s.path.endsWith(tail));
const bodyOf = (s) => (s?.body ? JSON.parse(s.body) : null);

await page.goto(base);
await page.waitForSelector('input[name="email"]');
await page.fill('input[name="email"]', A.email);
await page.fill('input[name="password"]', A.password);
await page.click('button[type="submit"]');
await page.waitForSelector(`.garage-choice[data-garage="${HARBOR.id}"]`);
await page.click(`.garage-choice[data-garage="${HARBOR.id}"]`);
await page.waitForSelector('.page-title');
await page.evaluate(() => { window.location.hash = '#/stuck-stays'; });
await page.waitForSelector('[data-list="stuck"] tbody tr[data-stay]');

const listed = () => page.$$eval('[data-list="stuck"] tbody tr[data-stay]', (trs) => trs.map((tr) => tr.dataset.stay));
const rowText = (id) => page.textContent(`tr[data-stay="${id}"]`).then((t) => t.replace(/\s+/g, ' '));
const shows = (selector, text) => page.waitForFunction(([s, w]) => document.querySelector(s)?.textContent.includes(w), [selector, text], { timeout: 5000 }).then(() => true, () => false);
const settled = (want) => page.waitForFunction((ids) => JSON.stringify([...document.querySelectorAll('[data-list="stuck"] tbody tr[data-stay]')].map((tr) => tr.dataset.stay)) === JSON.stringify(ids), want, { timeout: 5000 }).then(() => true, () => false);

console.log('The list:');
const all = [ownA, ownB, ownC, old30, old26];
check(JSON.stringify(await listed()) === JSON.stringify(all.map((s) => s.id)), 'every stay older than 24 hours, oldest first, and not the car that came in an hour ago');
check(!(await listed()).includes(new1.id), `${new1.plate}, in an hour ago, is not listed`);
const first = await rowText(old30.id);
check(first.includes(old30.plate), `${old30.plate}: the plate the entry lane read`);
check(first.includes(garageTime(old30.entry_at, HARBOR.timezone, 'en')), `${old30.plate}: when it came in, on the garage's clock (${garageTime(old30.entry_at, HARBOR.timezone, 'en')}), not the browser's`);
check(first.includes('North Entry'), `${old30.plate}: the lane that let it in`);
check(first.includes(EN['stuck.whyOld'].replace('{hours}', '24')), `${old30.plate}: why it is listed`);
const picture = await page.waitForFunction((id) => {
  const img = document.querySelector(`tr[data-stay="${id}"] img`);
  return img && img.complete && img.naturalWidth > 0 ? img.getAttribute('src') : null;
}, old30.id, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
check(Boolean(picture?.includes(`/garages/${HARBOR.id}/stays/${old30.id}/pictures/`)), `${old30.plate}: its entry picture, shown, from its own stay at its own garage`);
check((await rowText(ownB.id)).includes(EN['stuck.ticket']), 'a ticket-only stay says no plate was read');
const atExit = await rowText(ownC.id);
check(atExit.includes(EN['stuck.atExit']) && (await page.$$(`tr[data-stay="${ownC.id}"] [data-action="end-stay"], tr[data-stay="${ownC.id}"] [data-action="abandon-stay"]`)).length === 0, 'a stay with a car at an exit lane: said so, and no End or Write off');
check(await shows('[data-notice="never-charged"]', EN['stuck.neverCharged']), 'the page says ending a stay never charges a card');

console.log('The garage\'s hours:');
await page.click('[data-action="change-hours"]');
await page.fill('[data-field="stuck-hours"]', 'abc');
await page.click('[data-action="save-hours"]');
check(await shows('.stuck-hours [data-problem]', EN['problem.stuckHoursRefused']), `hours that are not a number: "${EN['problem.stuckHoursRefused']}"`);
check(sentTo('PATCH', `/garages/${HARBOR.id}`).length === 0, 'and nothing sent');
await page.fill('[data-field="stuck-hours"]', '28');
await page.click('[data-action="save-hours"]');
check(await settled([ownA, ownB, ownC, old30].map((s) => s.id)), `28 hours: the list read again, and ${old26.plate} (26 hours) no longer on it`);
check(JSON.stringify(sentTo('PATCH', `/garages/${HARBOR.id}`).map(bodyOf)) === JSON.stringify([{ stuck_after_hours: 28 }]), 'exactly { stuck_after_hours: 28 } sent, once');
check(await shows('[data-fact="hours"]', EN['stuck.hoursMany'].replace('{hours}', '28')), 'the hours read back from the platform: 28');
await page.click('[data-action="change-hours"]');
await page.fill('[data-field="stuck-hours"]', '24');
await page.click('[data-action="save-hours"]');
check(await settled(all.map((s) => s.id)), 'back to 24 hours: every stay listed again');

console.log('A stay ended -- the car left:');
const endsSent = () => sent.filter((s) => s.method === 'POST' && s.path.includes('/stays/') && s.path.endsWith('/end'));
await page.click(`tr[data-stay="${old30.id}"] [data-action="end-stay"]`);
await page.waitForSelector(`[data-ending="${old30.id}"] [data-form="end-stay"]`);
const wall = wallAt(Date.parse(old30.entry_at) + 2 * HOUR, HARBOR.timezone);
await page.fill(`[data-ending="${old30.id}"] [data-field="left-at"]`, wall);
await page.fill(`[data-ending="${old30.id}"] [data-field="reason"]`, '   ');
await page.click(`[data-ending="${old30.id}"] [data-action="end-stay-yes"]`);
check(await shows(`[data-ending="${old30.id}"] [data-problem]`, EN['problem.reasonRequired']), `no reason: "${EN['problem.reasonRequired']}"`);
check(endsSent().length === 0, 'and nothing sent');
const REASON = 'Backed out at the gate <b>twice</b>';
await page.fill(`[data-ending="${old30.id}"] [data-field="reason"]`, REASON);
await page.click(`[data-ending="${old30.id}"] [data-action="end-stay-yes"]`);
const owed = await page.waitForFunction(() => document.querySelector('[data-notice="stay-ended"]')?.textContent ?? null, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
const leftAt = new Date(instantOf(wall, HARBOR.timezone)).toISOString();
check(JSON.stringify(endsSent().map((s) => [s.path.split('/').at(-2), bodyOf(s)])) === JSON.stringify([[old30.id, { outcome: 'ended', reason: REASON, left_at: leftAt }]]), `exactly { outcome: "ended", reason, left_at: ${leftAt} } sent for ${old30.plate}, once: the time typed on the garage's clock`);
const theirs = stub.endedStays(HARBOR.id).find((s) => s.id === old30.id);
check(Number.isInteger(theirs?.owed_minor) && theirs.owed_minor > 0, `the platform priced it by the rates: owes ${theirs?.owed_minor}`);
const amount = theirs ? moneyText(theirs.owed_minor, theirs.currency, 'en') : 'nothing';
check(owed === EN['stuck.doneOwes'].replace('{amount}', amount), `the page says what it owes: "${owed}"`);
check(await settled([ownA, ownB, ownC, old26].map((s) => s.id)), 'and reads the list again, without it');

console.log('A stay written off:');
await page.click(`tr[data-stay="${old26.id}"] [data-action="abandon-stay"]`);
await page.waitForSelector(`[data-ending="${old26.id}"] [data-form="abandon-stay"]`);
check((await page.$$(`[data-ending="${old26.id}"] [data-field="left-at"]`)).length === 0, 'no time asked: a stay written off ends now');
await page.fill(`[data-ending="${old26.id}"] [data-field="reason"]`, 'Plate misread twice');
await page.click(`[data-ending="${old26.id}"] [data-action="abandon-stay-yes"]`);
check(await shows('[data-notice="stay-ended"]', EN['stuck.doneAbandoned']), `the page says "${EN['stuck.doneAbandoned']}"`);
check(JSON.stringify(bodyOf(endsSent().at(-1))) === JSON.stringify({ outcome: 'abandoned', reason: 'Plate misread twice' }), 'exactly { outcome: "abandoned", reason } sent: no time');
check(stub.endedStays(HARBOR.id).find((s) => s.id === old26.id)?.owed_minor === null, 'it owes nothing');
check(await settled([ownA, ownB, ownC].map((s) => s.id)), 'and the list read again, without it');

console.log('A stay ended elsewhere meanwhile:');
const elsewhere = await page.evaluate(async ([g, s]) => (await fetch(`/api/v1/garages/${g}/stays/${s}/end`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcome: 'abandoned', reason: 'Ended on another screen' }) })).status, [HARBOR.id, ownA.id]);
check(elsewhere === 200, `${ownA.plate} written off on another screen (${elsewhere})`);
await page.click(`tr[data-stay="${ownA.id}"] [data-action="abandon-stay"]`);
await page.fill(`[data-ending="${ownA.id}"] [data-field="reason"]`, 'Never came back');
await page.click(`[data-ending="${ownA.id}"] [data-action="abandon-stay-yes"]`);
check(await shows('[data-list="stuck"] > [data-problem="stayNotOpen"]', EN['problem.stayNotOpen']), `the page says "${EN['problem.stayNotOpen']}"`);
check(await settled([ownB, ownC].map((s) => s.id)), 'and the list read again, without it');

console.log('The change log:');
await page.evaluate(() => { window.location.hash = '#/change-log'; });
await page.waitForSelector('[data-list="changes"] tbody tr');
const log = await page.$$eval('[data-list="changes"] tbody tr', (trs) => trs.map((tr) => tr.textContent.replace(/\s+/g, ' ')));
const endedLine = log.find((r) => r.includes(REASON));
check(Boolean(endedLine) && endedLine.includes(EN['changes.action.stay_end']), `"${EN['changes.action.stay_end']}", with the reason as typed`);
check(Boolean(endedLine) && endedLine.includes(EN['changes.value.outcome.ended']) && endedLine.includes(amount), `how it ended (${EN['changes.value.outcome.ended']}) and what it owes (${amount})`);
check(Boolean(endedLine) && endedLine.includes(garageDateTime(leftAt, HARBOR.timezone, 'en')), `when it left, on the garage's clock (${garageDateTime(leftAt, HARBOR.timezone, 'en')})`);
check((await page.$$('[data-list="changes"] tbody b')).length === 0, 'the reason shown as words, never as markup');
check(log.some((r) => r.includes('Plate misread twice') && r.includes(EN['changes.value.outcome.abandoned'])), `the stay written off: "${EN['changes.value.outcome.abandoned']}", with its reason`);
check(log.some((r) => r.includes(EN['changes.field.stuck_after_hours'])), 'the hours changed, in the log too');

console.log('Money:');
const MONEY = /charge|capture|payment|refund|terminal|stripe|checkout/i;
const taking = sent.filter((s) => s.method !== 'GET' && MONEY.test(s.path));
check(taking.length === 0, `nothing sent to anything that takes money, in ${sent.length} calls${taking.length ? `: ${taking.map((s) => `${s.method} ${s.path}`).join(', ')}` : ''}`);
const writes = [...new Set(sent.filter((s) => s.method !== 'GET').map((s) => `${s.method} ${s.path.replace(/[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}/g, ':id')}`))].sort();
check(JSON.stringify(writes) === JSON.stringify(['PATCH /api/v1/garages/:id', 'POST /api/v1/auth/sign-in', 'POST /api/v1/garages/:id/stays/:id/end']), `the only writes: sign-in, the hours and the endings (${writes.join('; ')})`);

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
