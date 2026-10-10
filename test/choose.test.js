import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../src/i18n/index.js';
import { ACTIONS, KINDS, NO_CHOICE, REFUSALS, SORTS, choiceWords, chosenLines, isChosen, kindOf, kindsIn, whyKey, whysIn } from '../src/changes.js';

// U7b: the change log sorted, and only the lines chosen. Every action the
// platform writes is about one kind of thing; the lines chosen keep their
// order when they sort the same; the head says what was chosen.

const T = (language) => (key, values) => translate(language, key, values);
const line = (n, action, extra = {}) => ({
  id: `l${n}`,
  at: new Date(Date.UTC(2026, 1, 1, 12, n)).toISOString(),
  outcome: 'done',
  who: { kind: 'owner', name: 'owner@example.com' },
  action,
  subject: { kind: 'lane', name: `Gate ${n}` },
  ...extra,
});

test('every action the platform writes is about exactly one kind of thing, with words in both languages', () => {
  for (const action of ACTIONS) {
    const kinds = Object.keys(KINDS).filter((kind) => KINDS[kind].includes(action));
    assert.equal(kinds.length, 1, `${action}: ${kinds.join(', ') || 'no kind'}`);
  }
  for (const kind of [...Object.keys(KINDS), 'many', 'other']) for (const language of ['en', 'es']) assert.ok(T(language)(`choose.kind.${kind}`));
  assert.equal(kindOf(line(1, 'lane.made_up')), 'other');
  assert.equal(kindOf({ ...line(1, 'refused.many'), outcome: 'refused', refusal: 'too_many_refused' }), 'many');
});

test('only the kinds and reasons that appear are offered', () => {
  const lines = [line(1, 'lane.rename'), line(2, 'tax_set.add'), line(3, 'lane.close')];
  assert.deepEqual(kindsIn(lines), ['lanes', 'taxes']);
  const refused = [
    { ...line(4, 'lane.rename'), outcome: 'refused', refusal: 'lane_name_refused' },
    { ...line(5, 'lane.remove'), outcome: 'refused', refusal: 'lane_not_found', who: { kind: 'outside', name: null } },
    { ...line(6, 'lane.remove'), outcome: 'refused', refusal: 'a_code_not_known_yet' },
  ];
  assert.deepEqual(whysIn(T('en'), refused, 'en').sort(), ['lane_name_refused', 'notTheirs', 'other'].sort());
  assert.ok(REFUSALS.includes(whyKey(refused[0])));
});

test('nothing chosen is every line, newest first; oldest first is the same lines turned round', () => {
  const lines = [line(3, 'lane.rename'), line(2, 'tax_set.add'), line(1, 'lane.close')];
  assert.deepEqual(chosenLines(T('en'), lines, NO_CHOICE, 'en').map((l) => l.id), ['l3', 'l2', 'l1']);
  assert.deepEqual(chosenLines(T('en'), lines, { ...NO_CHOICE, sort: 'oldest' }, 'en').map((l) => l.id), ['l1', 'l2', 'l3']);
  assert.equal(isChosen(NO_CHOICE), false);
  assert.deepEqual(SORTS, ['newest', 'oldest', 'who', 'what']);
});

test('lines of the same moment keep the platform order, newest first and oldest first alike', () => {
  const same = line(5, 'lane.rename').at;
  const lines = [{ ...line(1, 'lane.rename'), id: 'a', at: same }, { ...line(2, 'lane.rename'), id: 'b', at: same }];
  assert.deepEqual(chosenLines(T('en'), lines, NO_CHOICE, 'en').map((l) => l.id), ['a', 'b']);
  assert.deepEqual(chosenLines(T('en'), lines, { ...NO_CHOICE, sort: 'oldest' }, 'en').map((l) => l.id), ['b', 'a']);
});

test('sorted by who or what: in the order of their words, numbers as numbers; the same words newest first', () => {
  const lines = [
    line(1, 'lane.rename', { who: { kind: 'key', name: 'Desk key 10' } }),
    line(2, 'lane.rename', { who: { kind: 'key', name: 'Desk key 2' } }),
    line(3, 'lane.rename', { who: { kind: 'key', name: 'desk key 2' } }),
  ];
  assert.deepEqual(chosenLines(T('en'), lines, { ...NO_CHOICE, sort: 'who' }, 'en').map((l) => l.id), ['l3', 'l2', 'l1']);
  const what = [line(1, 'tax_set.add'), line(2, 'lane.rename', { subject: { kind: 'lane', name: 'Gate 9' } }), line(3, 'lane.rename', { subject: { kind: 'lane', name: 'Gate 10' } })];
  assert.deepEqual(chosenLines(T('en'), what, { ...NO_CHOICE, sort: 'what' }, 'en').map((l) => l.id), ['l2', 'l3', 'l1']);
});

test('only the kinds ticked, and the reasons ticked: nothing ticked is everything', () => {
  const lines = [line(1, 'lane.rename'), line(2, 'tax_set.add'), line(3, 'garage.update')];
  assert.deepEqual(chosenLines(T('en'), lines, { ...NO_CHOICE, kinds: ['lanes', 'taxes'] }, 'en').map((l) => l.id), ['l2', 'l1']);
  const refused = [
    { ...line(4, 'lane.rename'), outcome: 'refused', refusal: 'lane_name_refused' },
    { ...line(5, 'lane.close'), outcome: 'refused', refusal: 'last_open_lane' },
    { ...line(6, 'tax_set.add'), outcome: 'refused', refusal: 'lane_name_refused' },
  ];
  assert.deepEqual(chosenLines(T('en'), refused, { ...NO_CHOICE, whys: ['lane_name_refused'] }, 'en').map((l) => l.id), ['l6', 'l4']);
  assert.deepEqual(chosenLines(T('en'), refused, { ...NO_CHOICE, whys: ['lane_name_refused'], kinds: ['lanes'] }, 'en').map((l) => l.id), ['l4']);
});

test('the head says what was chosen, or "Everything", in both languages', () => {
  assert.equal(choiceWords(T('en'), NO_CHOICE, 'en'), 'Everything');
  assert.equal(choiceWords(T('en'), { ...NO_CHOICE, kinds: ['taxes', 'lanes'], sort: 'oldest' }, 'en'), 'Only: lanes, taxes and fees · oldest first');
  assert.equal(choiceWords(T('es'), { ...NO_CHOICE, kinds: ['lanes'] }, 'es'), 'Solo: carriles');
  assert.equal(choiceWords(T('en'), { ...NO_CHOICE, whys: ['last_open_lane'], sort: 'who' }, 'en'), 'Only those refused because: it was the last open lane of its kind · sorted by who');
  assert.equal(choiceWords(T('es'), { ...NO_CHOICE, sort: 'what' }, 'es'), 'Todo · ordenado por qué');
});
