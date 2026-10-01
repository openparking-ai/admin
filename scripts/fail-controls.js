#!/usr/bin/env node
// Every check, shown failing before its result is read.
//
// Each control copies this repository to a scratch folder, plants ONE break
// there, runs the check, and requires it to FAIL and to name what was planted.
// The working tree is never edited, so a control cannot leave a break behind
// or race a check running beside it. A plant whose anchor is not found
// exactly once refuses to run: a plant that silently changed nothing would
// make the check look like it caught something it never saw.
//
//   node scripts/fail-controls.js            the controls that need no browser
//   node scripts/fail-controls.js --browser  the one that does (builds a copy)
//
// The estate-name guard's control is not here: it plants its own, in the same
// run as its scan (`check-no-sibling-names.js --worktree`).

import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const LEAVE_OUT = new Set(['node_modules', '.git', 'dist', '.screens', 'test-results']);

const CONTROLS = [
  {
    check: '1 no tech language',
    plant: { file: 'src/i18n/es.js', anchor: "'Lo que usted cobra:", with: "'Lo que usted cobra por token:" },
    run: ['node', 'scripts/check-plain-words.js'],
    names: ['es: page.rates.purpose: "token"'],
  },
  {
    check: '2 nothing readable outside the dictionaries',
    plant: { file: 'src/App.jsx', anchor: '<h1 className="page-title">', with: '<h1 className="page-title">Welcome ' },
    run: ['node', 'scripts/check-readable-text.js'],
    names: ['src/App.jsx', 'Welcome'],
  },
  {
    check: '3 the two languages match',
    plant: { file: 'src/i18n/es.js', anchor: "  'page.taxes.title': 'Impuestos y cargos',\n", with: '' },
    run: ['node', 'scripts/check-languages-match.js'],
    names: ['page.taxes.title: missing in es'],
  },
  {
    check: '4 Quick Find finds every page in both languages',
    plant: { file: 'src/search.js', anchor: '...PAGES.map((page) =>', with: "...PAGES.filter((p) => p.id !== 'readers').map((page) =>" },
    run: ['node', '--test', 'test/search.test.js'],
    names: ['finds the readers page first'],
  },
  {
    check: '5 day/night/auto: the reload',
    plant: { file: 'src/theme.js', anchor: '    storage?.setItem(THEME_KEY, choice);', with: '    void storage;' },
    run: ['node', '--test', 'test/theme.test.js'],
    names: ['the choice survives a reload', 'day was not kept'],
  },
  {
    check: '5 day/night/auto: auto changing live',
    plant: { file: 'src/theme.js', anchor: "  media?.addEventListener?.('change', onComputerChange);", with: '' },
    run: ['node', '--test', 'test/theme.test.js'],
    names: ['auto changes live when the computer changes'],
  },
  {
    check: '8 contrast: a pair below 4.5 : 1',
    plant: { file: 'src/styles.css', anchor: '  --text-secondary: rgba(249, 246, 240, 0.66);', with: '  --text-secondary: rgba(249, 246, 240, 0.3);' },
    run: ['node', 'scripts/check-contrast.js'],
    names: ['LOW night --text-secondary'],
  },
  {
    check: '8 contrast: a text colour the check does not measure',
    plant: {
      file: 'src/styles.css',
      anchor: '  font-size: 12px;\n  color: var(--text-secondary);\n}',
      with: '  font-size: 12px;\n  color: #aaaaaa;\n}',
    },
    run: ['node', 'scripts/check-contrast.js'],
    names: ['.find-hint: color: #aaaaaa'],
  },
  {
    check: '9 no colour from the first look',
    // The three night values the first gate found left in at ca0e68d, put back.
    plant: {
      file: 'src/styles.css',
      anchor:
        '  --backdrop: rgba(14, 12, 9, 0.72);\n' +
        '  --shadow: 0 1px 2px rgba(14, 12, 9, 0.5), 0 4px 16px rgba(14, 12, 9, 0.5);\n' +
        '  --shadow-hover: 0 4px 10px rgba(14, 12, 9, 0.6), 0 12px 32px rgba(14, 12, 9, 0.6);\n',
      with:
        '  --backdrop: rgba(0, 0, 0, 0.6);\n' +
        '  --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 4px 16px rgba(0, 0, 0, 0.3);\n' +
        '  --shadow-hover: 0 4px 10px rgba(0, 0, 0, 0.4), 0 12px 32px rgba(0, 0, 0, 0.4);\n',
    },
    run: ['node', 'scripts/check-old-colours.js'],
    names: [
      'is rgba(0, 0, 0, 0.6) from the first look',
      'is rgba(0, 0, 0, 0.3) from the first look',
      'is rgba(0, 0, 0, 0.4) from the first look',
      '3 found',
    ],
  },
];

const BROWSER_CONTROLS = [
  {
    check: '6 no request leaves the page',
    plant: {
      file: 'index.html',
      anchor: '    <title></title>\n',
      with: '    <title></title>\n    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400..700&display=swap" />\n',
    },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['went outside: https://fonts.googleapis.com/'],
  },
];

function scratchCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'admin-control-'));
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !LEAVE_OUT.has(basename(src)) });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}

function plant(dir, { file, anchor, with: replacement }) {
  const path = join(dir, file);
  const text = readFileSync(path, 'utf8');
  const found = text.split(anchor).length - 1;
  if (found !== 1) throw new Error(`${file}: the plant's anchor is there ${found} times, not once`);
  writeFileSync(path, text.replace(anchor, replacement));
}

const run = (dir, [cmd, ...args]) => {
  const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
};

const controls = process.argv.includes('--browser') ? BROWSER_CONTROLS : CONTROLS;
const failures = [];
for (const c of controls) {
  const dir = scratchCopy();
  try {
    plant(dir, c.plant);
    for (const step of c.before ?? []) {
      const r = run(dir, step);
      if (r.status !== 0) throw new Error(`could not prepare: ${step.join(' ')}\n${r.out}`);
    }
    const r = run(dir, c.run);
    const missing = c.names.filter((n) => !r.out.includes(n));
    const ok = r.status !== 0 && missing.length === 0;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} check ${c.check}: planted in ${c.plant.file} -> exit ${r.status}`);
    if (ok) {
      for (const n of c.names) console.log(`         named: ${n}`);
    } else {
      failures.push(c.check);
      if (r.status === 0) console.log('         the check PASSED with the break planted');
      for (const n of missing) console.log(`         did not name: ${n}`);
      console.log(r.out.split('\n').slice(-25).join('\n'));
    }
  } catch (error) {
    failures.push(c.check);
    console.log(`  FAIL check ${c.check}: ${error.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (failures.length) {
  console.error(`\n${failures.length} of ${controls.length} controls did not fail as required.`);
  process.exit(1);
}
console.log(`\nfail-controls — ${controls.length} of ${controls.length} breaks were caught, each named.`);
