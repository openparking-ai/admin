// U6 check 2: a percent and a start, as the platform takes them. 18.5 is
// 1850 hundredths; "no tax" is a list with no lines; "from the start of" a day
// is the first moment of that day in the GARAGE'S zone -- across a clock
// change, and where the clocks jump at midnight -- with this computer in
// Tokyo, whose zone decides nothing.
process.env.TZ = 'Asia/Tokyo';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrange, garageInstant, listToState, parsePercent, percentText, startOfDay, taxState } from '../src/taxes.js';

test('the computer is in Tokyo, so a page that used its own zone would show here', () => {
  assert.equal(new Date('2026-03-08T00:00:00').toISOString(), '2026-03-07T15:00:00.000Z');
});

test('a percent as typed, in hundredths: 18.5 is 1850', () => {
  for (const [typed, bp] of [['18.5', 1850], ['18,5', 1850], ['18.50', 1850], ['7', 700], ['7.25', 725], ['0.01', 1], ['100', 10000], ['8.875 '.trim().slice(0, 4), 887], ['6 %', 600]]) {
    assert.deepEqual(parsePercent(typed), { bp }, `"${typed}"`);
  }
  for (const [typed, problem] of [['', 'empty'], ['  ', 'empty'], ['0', 'zero'], ['0.00', 'zero'], ['18.555', 'shape'], ['-5', 'shape'], ['1e2', 'shape'], ['five', 'shape'], ['1000', 'shape'], ['$5', 'shape']]) {
    assert.deepEqual(parsePercent(typed), { problem }, `"${typed}"`);
  }
});

test('a percent in hundredths, as people write it: "18.5%"', () => {
  assert.equal(percentText(1850, 'en'), '18.5%');
  assert.equal(percentText(700, 'en'), '7%');
  assert.equal(percentText(725, 'es'), '7.25%');
});

test('NO TAX is a list with no lines; lines are numbered by the page, each id once, in the order shown', () => {
  assert.deepEqual(listToState({ noTax: true, lines: [{ name: 'City', bp: 1850, rounding: 'up' }], start: '2026-11-01T00:00:00-04:00' }), { effective_from: '2026-11-01T00:00:00-04:00', rules: [] });
  const list = listToState({
    noTax: false,
    lines: [{ name: ' City tax ', bp: 1850, rounding: 'nearest' }, { name: 'City tax', bp: 600, rounding: 'up' }, { name: 'State', bp: 1, rounding: 'down' }],
    start: '2026-11-01T00:00:00-04:00',
  });
  assert.deepEqual(list.rules, [
    { id: 'tax-1', label: 'City tax', percent_bp: 1850, rounding: 'nearest', sequence: 1 },
    { id: 'tax-2', label: 'City tax', percent_bp: 600, rounding: 'up', sequence: 2 },
    { id: 'tax-3', label: 'State', percent_bp: 1, rounding: 'down', sequence: 3 },
  ]);
  assert.equal(new Set(list.rules.map((r) => r.id)).size, list.rules.length);
});

test('FROM THE START OF a day, in the garage\'s own zone, across both of New York\'s clock changes', () => {
  // Clocks go forward at 2 am on 8 March 2026: the day starts at midnight, still -05:00.
  assert.equal(startOfDay('2026-03-08', 'America/New_York'), '2026-03-08T00:00:00-05:00');
  assert.equal(Date.parse(startOfDay('2026-03-08', 'America/New_York')), Date.parse('2026-03-08T05:00:00Z'));
  // The day after: midnight at -04:00.
  assert.equal(startOfDay('2026-03-09', 'America/New_York'), '2026-03-09T00:00:00-04:00');
  // Clocks go back at 2 am on 1 November 2026: the day starts at midnight, still -04:00.
  assert.equal(startOfDay('2026-11-01', 'America/New_York'), '2026-11-01T00:00:00-04:00');
  assert.equal(startOfDay('2026-11-02', 'America/New_York'), '2026-11-02T00:00:00-05:00');
  // Never Tokyo's midnight, which is 14 or 13 hours earlier.
  assert.notEqual(Date.parse(startOfDay('2026-11-01', 'America/New_York')), Date.parse('2026-11-01T00:00:00+09:00'));
});

test('where the clocks jump at midnight, the day starts at the first moment it has', () => {
  // Santiago moves its clocks forward at midnight on 6 September 2026: there is no 00:00 that day.
  assert.equal(startOfDay('2026-09-06', 'America/Santiago'), '2026-09-06T01:00:00-03:00');
  // A zone a quarter hour off the hour, and one ahead of UTC by more than half a day.
  assert.equal(startOfDay('2026-05-01', 'Asia/Kathmandu'), '2026-05-01T00:00:00+05:45');
  assert.equal(startOfDay('2026-05-01', 'Pacific/Kiritimati'), '2026-05-01T00:00:00+14:00');
  assert.equal(startOfDay('2026-05-01', 'Pacific/Pago_Pago'), '2026-05-01T00:00:00-11:00');
});

test('a day that is not a date starts nowhere', () => {
  for (const day of ['', '2026-02-30', '2026-13-01', '2026-1-1', 'tomorrow', null]) assert.equal(startOfDay(day, 'America/New_York'), null, String(day));
});

test('"now" is written as the garage\'s clock and offset, the same instant', () => {
  const at = Date.parse('2026-07-04T16:20:30.900Z');
  assert.equal(garageInstant(at, 'America/New_York'), '2026-07-04T12:20:30-04:00');
  assert.equal(garageInstant(at, 'America/Los_Angeles'), '2026-07-04T09:20:30-07:00');
  assert.equal(Date.parse(garageInstant(at, 'Asia/Kathmandu')), Date.parse('2026-07-04T16:20:30Z'));
});

const set = (effective_from, rules = []) => ({ effective_from, rule_count: rules.length, rules });
const NOW = new Date('2026-06-01T12:00:00Z');

test('which list is in force now, which start later and which came before', () => {
  const lists = [set('2027-01-01T05:00:00.000000Z'), set('2025-01-01T05:00:00.000000Z', [{ id: 'a' }]), set('2026-01-01T05:00:00.000000Z'), set('2026-09-01T04:00:00.000000Z')];
  const { current, later, earlier } = arrange(lists, NOW);
  assert.equal(current.effective_from, '2026-01-01T05:00:00.000000Z');
  assert.deepEqual(later.map((l) => l.effective_from), ['2026-09-01T04:00:00.000000Z', '2027-01-01T05:00:00.000000Z']);
  assert.deepEqual(earlier.map((l) => [l.effective_from, l.until]), [['2025-01-01T05:00:00.000000Z', '2026-01-01T05:00:00.000000Z']]);
});

test('every state of a garage\'s taxes: none said, none yet in force, no tax, and lines', () => {
  assert.equal(taxState([], NOW), 'none');
  assert.equal(taxState(undefined, NOW), 'none');
  assert.equal(taxState([set('2027-01-01T05:00:00.000000Z', [{ id: 'a' }])], NOW), 'notYet');
  assert.equal(taxState([set('2026-01-01T05:00:00.000000Z')], NOW), 'noTax');
  assert.equal(taxState([set('2026-01-01T05:00:00.000000Z', [{ id: 'a' }]), set('2027-01-01T05:00:00.000000Z')], NOW), 'lines');
  assert.equal(taxState([set('2025-01-01T05:00:00.000000Z', [{ id: 'a' }]), set('2026-01-01T05:00:00.000000Z')], NOW), 'noTax');
});
