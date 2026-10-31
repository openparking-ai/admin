// The side menu (src/menu.js): Home, Garage View and Alerts at the top; every other page
// in Setup, in order; which groups are open kept on this computer, and nothing else read
// back from it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAGES } from '../src/pages.js';
import { MENU_KEY, SETUP_GROUP, TOP, groupShown, hostGroupKey, isOpen, menuPages, readOpenGroups, saveOpenGroups, withGroup } from '../src/menu.js';

const store = (value) => {
  const kept = new Map(value === undefined ? [] : [[MENU_KEY, value]]);
  return { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, String(v)), kept };
};

test('the top: Home, Garage View, Alerts, in that order', () => {
  assert.deepEqual(menuPages().top.map((p) => p.id), ['home', 'inside', 'alerts']);
  assert.deepEqual(TOP, ['home', 'inside', 'alerts']);
});

test('Setup: every other page, in the order the pages are listed, each once', () => {
  const { top, setup } = menuPages();
  assert.deepEqual(setup.map((p) => p.id), ['setup', 'garages', 'lanes', 'drawings', 'readers', 'rates', 'taxes', 'paid', 'banned', 'exceptions', 'changes', 'settings']);
  assert.equal(top.length + setup.length, PAGES.length);
  assert.equal(new Set([...top, ...setup].map((p) => p.id)).size, PAGES.length);
});

test('the group of the page shown: Setup for a page inside it, none at the top, the host group for a host page', () => {
  const page = (id) => PAGES.find((p) => p.id === id);
  assert.equal(groupShown(page('rates'), null), SETUP_GROUP);
  assert.equal(groupShown(page('settings'), null), SETUP_GROUP);
  for (const id of TOP) assert.equal(groupShown(page(id), null), null);
  assert.equal(groupShown(page('home'), { menu: { group: { id: 'reports' } } }), hostGroupKey('reports'));
  // A host group named like Setup is still the host's.
  assert.notEqual(hostGroupKey('setup'), SETUP_GROUP);
});

test('open or closed: Setup closed until opened, a host group open until closed, as kept', () => {
  assert.equal(isOpen({}, SETUP_GROUP), false);
  assert.equal(isOpen({}, hostGroupKey('reports')), true);
  assert.equal(isOpen({ [SETUP_GROUP]: true }, SETUP_GROUP), true);
  assert.equal(isOpen({ [hostGroupKey('reports')]: false }, hostGroupKey('reports')), false);
  assert.deepEqual(withGroup({ a: true }, SETUP_GROUP, true), { a: true, [SETUP_GROUP]: true });
});

test('kept on this computer and read back: only group keys with true or false', () => {
  const s = store();
  saveOpenGroups(s, { [SETUP_GROUP]: true });
  assert.deepEqual(readOpenGroups(s), { [SETUP_GROUP]: true });
  assert.deepEqual(readOpenGroups(store('{"own:setup":"yes","host:x":1,"other":true,"host:<b>":true,"host:reports":false}')), { 'host:reports': false });
  for (const bad of ['not json', '[]', 'null', '"text"', '42']) assert.deepEqual(readOpenGroups(store(bad)), {}, bad);
  assert.deepEqual(readOpenGroups(null), {});
  assert.deepEqual(readOpenGroups({ getItem: () => { throw new Error('off'); } }), {});
  assert.doesNotThrow(() => saveOpenGroups({ setItem: () => { throw new Error('off'); } }, {}));
});
