import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTheme, THEME_KEY } from '../src/theme.js';

// Check 5. Everything a browser provides is faked here: storage that outlives
// a "reload" (a second createTheme over the same storage), and a computer
// setting that can change while the page is open.

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    data,
  };
}

function fakeComputer(dark) {
  const listeners = new Set();
  const media = {
    get matches() {
      return dark;
    },
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  return {
    matchMedia: () => media,
    set(next) {
      dark = next;
      for (const fn of listeners) fn({ matches: dark });
    },
    listeners,
  };
}

const start = (storage, computer) =>
  createTheme({ storage, matchMedia: computer.matchMedia, root: { dataset: {} } });

test('first visit is auto, and auto follows the computer', () => {
  const light = start(fakeStorage(), fakeComputer(false));
  assert.equal(light.choice, 'auto');
  assert.equal(light.look, 'day');
  const dark = start(fakeStorage(), fakeComputer(true));
  assert.equal(dark.look, 'night');
});

test('each of the three choices gives its look, on the page itself', () => {
  const root = { dataset: {} };
  const theme = createTheme({ storage: fakeStorage(), matchMedia: fakeComputer(true).matchMedia, root });
  theme.choose('day');
  assert.equal(root.dataset.theme, 'day');
  theme.choose('night');
  assert.equal(root.dataset.theme, 'night');
  theme.choose('auto');
  assert.equal(root.dataset.theme, 'night');
});

test('the choice survives a reload', () => {
  for (const choice of ['day', 'night', 'auto']) {
    const storage = fakeStorage();
    const computer = fakeComputer(true);
    start(storage, computer).choose(choice);
    const afterReload = start(storage, computer);
    assert.equal(afterReload.choice, choice, `${choice} was not kept`);
  }
  // And the stored choice wins over the computer: night kept on a light computer.
  const storage = fakeStorage();
  start(storage, fakeComputer(false)).choose('night');
  assert.equal(start(storage, fakeComputer(false)).look, 'night');
});

test('auto changes live when the computer changes, with no reload', () => {
  const computer = fakeComputer(false);
  const theme = start(fakeStorage(), computer);
  assert.equal(theme.look, 'day');
  computer.set(true);
  assert.equal(theme.look, 'night');
  computer.set(false);
  assert.equal(theme.look, 'day');
});

test('day and night stay put when the computer changes', () => {
  const computer = fakeComputer(false);
  const theme = start(fakeStorage(), computer);
  theme.choose('day');
  computer.set(true);
  assert.equal(theme.look, 'day');
  theme.choose('night');
  computer.set(false);
  assert.equal(theme.look, 'night');
});

test('a stored value that is not a choice reads as auto; storage switched off still works', () => {
  const storage = fakeStorage();
  storage.setItem(THEME_KEY, 'purple');
  assert.equal(start(storage, fakeComputer(false)).choice, 'auto');
  const broken = { getItem() { throw new Error('off'); }, setItem() { throw new Error('off'); } };
  const theme = start(broken, fakeComputer(false));
  theme.choose('night');
  assert.equal(theme.look, 'night');
});
