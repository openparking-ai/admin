// The host's People page (src/extras.js readPeopleLink): one link, only when the host's
// file names one, to a path of this origin or an https address with no name or password.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExtras, loadExtraPages, readPeopleLink } from '../src/extras.js';

test('a path of this origin, or an https address, is the link', () => {
  assert.equal(readPeopleLink({ people: { href: '/people/' } }), '/people/');
  assert.equal(readPeopleLink({ people: { href: 'https://portal.example.com/people' } }), 'https://portal.example.com/people');
  assert.equal(readPeopleLink({ people: { href: 'https://portal.example.com:8443/people?x=1' } }), 'https://portal.example.com:8443/people?x=1');
});

test('anything else is no link', () => {
  const refused = [
    undefined, null, {}, { people: null }, { people: 'https://example.com' }, { people: { href: '' } }, { people: { href: 42 } },
    { people: { href: 'http://portal.example.com/people' } },
    { people: { href: 'javascript:alert(1)' } },
    { people: { href: 'data:text/html,hi' } },
    { people: { href: '//evil.example.com/people' } },
    { people: { href: '/%2F%2Fevil.example.com' } },
    { people: { href: 'https://user:pw@portal.example.com/people' } },
    { people: { href: 'https://portal.example.com/peo ple' } },
    { people: { href: 'https://portal.example.com/\npeople' } },
    { people: { href: `/${'a'.repeat(600)}` } },
  ];
  for (const file of refused) assert.equal(readPeopleLink(file), null, JSON.stringify(file));
});

test("the host's file gives its pages and its People link; no file gives neither", async () => {
  const file = { people: { href: '/people/' }, pages: [] };
  const answer = (body, ok = true) => async () => ({ ok, json: async () => body });
  assert.deepEqual(await loadExtras(answer(file)), { pages: [], people: '/people/' });
  assert.deepEqual(await loadExtras(answer(null, false)), { pages: [], people: null });
  assert.deepEqual(await loadExtras(async () => { throw new Error('offline'); }), { pages: [], people: null });
  assert.deepEqual(await loadExtraPages(answer(file)), []);
});
