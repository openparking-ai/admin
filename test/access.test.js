// What the person signed in may open (src/access.js): the menus, the pages and Quick Find
// follow the platform's `/auth/me`, and an answer from a platform before permissions opens
// everything, as before.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGES } from '../src/pages.js';
import { PAGE_NEEDS, accessOf, addsGarages, holds, opens } from '../src/access.js';
import { menuPages } from '../src/menu.js';
import { buildIndex } from '../src/search.js';

const ALL_PAGES = PAGES.map((p) => p.id);
const linked = (permissions, garages = 'all') => accessOf({ kind: 'linked', email: 'p@example.com', permissions, garages });
const opened = (access) => ALL_PAGES.filter((id) => opens(access, id));

test('every page names the reads it makes, and nothing else is a page', () => {
  assert.deepEqual(Object.keys(PAGE_NEEDS).sort(), [...ALL_PAGES].sort());
  for (const [id, needs] of Object.entries(PAGE_NEEDS)) {
    for (const p of needs) assert.match(p, /^[a-z]+:read$/, `${id} needs ${p}`);
  }
  assert.equal(opens(linked([]), 'not-a-page'), false);
});

// The platform's read routes the screens call, by the client's name for each, and the one
// permission the platform names on it (its src/app.js, platform 0035).
const READS = {
  garages: 'garages:read', setup: 'garages:read', banned: 'garages:read', alerts: 'garages:read', board: 'garages:read',
  lanes: 'lanes:read', carsInside: 'stays:read', ratePlans: 'rates:read', taxLists: 'rates:read', changes: 'log:read', refused: 'log:read',
  paymentAccount: 'payments:read', readerPlace: 'payments:read', readerConnections: 'payments:read',
};
// Home reads the lanes and the cars inside only for someone who holds them (checked below).
const FILES = {
  home: [], setup: ['SetupPage.jsx'], garages: ['GaragesPage.jsx'], lanes: ['LanesPage.jsx', 'BoardSection.jsx'],
  drawings: ['DrawingsPage.jsx'], readers: ['CardReadersPage.jsx'], rates: ['RatesPage.jsx'], taxes: ['TaxesPage.jsx'],
  paid: ['GettingPaidPage.jsx'], inside: ['InsidePage.jsx'], banned: ['BannedPage.jsx'], alerts: ['AlertsPage.jsx'],
  changes: ['ChangesPage.jsx'], settings: ['SettingsPage.jsx'],
};

test("each page's needs cover every platform read its screens make", () => {
  assert.deepEqual(Object.keys(FILES).sort(), [...ALL_PAGES].sort());
  for (const [id, files] of Object.entries(FILES)) {
    const calls = new Set(files.flatMap((f) => [...readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').matchAll(/client\.([a-zA-Z]+)\(/g)].map((m) => m[1])));
    for (const call of calls) {
      if (READS[call]) assert.ok(PAGE_NEEDS[id].includes(READS[call]), `${id} reads ${call} (${READS[call]}) but does not need it`);
    }
  }
});

test('Home makes each read beyond the garages only behind the permission it needs', () => {
  const home = readFileSync(new URL('../src/Home.jsx', import.meta.url), 'utf8');
  assert.match(home, /lanes: holds\(access, 'lanes:read'\)/);
  assert.match(home, /inside: holds\(access, 'stays:read'\)/);
  for (const m of home.matchAll(/client\.(lanes|carsInside)\(/g)) {
    const line = home.slice(home.lastIndexOf('\n', m.index), home.indexOf('\n', m.index));
    assert.match(line, m[1] === 'lanes' ? /readIf\(shows\.lanes,/ : /readIf\(shows\.inside,/, line.trim());
  }
});

test('a platform from before permissions, and the admin, open every page', () => {
  for (const who of [null, { email: 'o@example.com', tenant_id: 't', language: 'en' }]) {
    const access = accessOf(who);
    assert.deepEqual(opened(access), ALL_PAGES);
    assert.equal(addsGarages(access), true);
  }
  const admin = accessOf({ kind: 'admin', permissions: ['garages:read', 'garages:change'], garages: 'all' });
  assert.equal(admin.kind, 'admin');
  assert.equal(addsGarages(admin), true);
});

test('a change covers its read; a read never covers a change', () => {
  const a = linked(['money:change', 'lanes:read']);
  assert.equal(holds(a, 'money:read'), true);
  assert.equal(holds(a, 'money:change'), true);
  assert.equal(holds(a, 'lanes:read'), true);
  assert.equal(holds(a, 'lanes:change'), false);
  assert.equal(holds(a, 'rates:read'), false);
});

test('the dashboard ranks, as the linked accounts module gives them, each open their own pages only', () => {
  // Site manager: garages, lanes, money, stays, inventory and log, each read.
  const site = linked(['garages:read', 'lanes:read', 'money:read', 'stays:read', 'inventory:read', 'log:read'], ['g1']);
  assert.deepEqual(opened(site), ['home', 'setup', 'garages', 'lanes', 'drawings', 'inside', 'banned', 'alerts', 'changes', 'settings']);
  assert.equal(addsGarages(site), false);
  // Money controller: garages, payments and payouts read; money and refunds change.
  const money = linked(['garages:read', 'payments:read', 'payouts:read', 'money:change', 'refunds:change']);
  assert.deepEqual(opened(money), ['home', 'setup', 'garages', 'paid', 'banned', 'alerts', 'settings']);
  assert.equal(addsGarages(money), false);
  // Garages changed at a list of garages is still not adding one: that needs every garage.
  assert.equal(addsGarages(linked(['garages:change'], ['g1'])), false);
  assert.equal(addsGarages(linked(['garages:change'], 'all')), true);
});

test('permissions not of the platform form open nothing but Settings', () => {
  for (const permissions of ['all', [42], ['garages'], ['garages:write'], null, {}]) {
    const access = accessOf({ kind: 'linked', permissions, garages: 'all' });
    assert.deepEqual(opened(access), ['settings'], JSON.stringify(permissions));
  }
  assert.deepEqual(accessOf({ kind: 'linked', permissions: [], garages: 'some' }).garages, []);
  assert.equal(accessOf({ kind: 'owner?', permissions: [] }).kind, 'admin');
});

test('the menu and Quick Find list only the pages that open, and the settings on them', () => {
  const site = linked(['garages:read', 'lanes:read', 'stays:read', 'log:read']);
  const menu = menuPages(PAGES.filter((p) => opens(site, p.id)));
  assert.deepEqual(menu.top.map((p) => p.id), ['home', 'inside', 'alerts']);
  assert.ok(!menu.setup.some((p) => ['rates', 'taxes', 'paid', 'readers'].includes(p.id)));

  const index = buildIndex('en', (id) => opens(site, id));
  const pages = index.filter((e) => e.kind === 'page').map((e) => e.id);
  assert.deepEqual(pages, opened(site));
  const settings = index.filter((e) => e.kind === 'feature').map((e) => e.id);
  assert.ok(!settings.includes('changeTaxes') && !settings.includes('setUpPaid') && !settings.includes('connectReader'));
  assert.ok(settings.includes('day') && settings.includes('en') && settings.includes('addGarage'));
  // With no filter, as before: every page and every setting.
  assert.equal(buildIndex('en').filter((e) => e.kind === 'page').length, PAGES.length);
});
