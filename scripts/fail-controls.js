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
//   node scripts/fail-controls.js --browser  the ones that do (each builds its copy)
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
  {
    check: 'U2b-3 the page never touches the session',
    plant: { file: 'src/api.js', anchor: "const BASE = '/api/v1';", with: "const BASE = '/api/v1';\nexport const peek = () => document.cookie;" },
    run: ['node', 'scripts/check-page-stays-home.js'],
    names: ['src/api.js:16: document.cookie'],
  },
  {
    check: 'U2b-4 requests stay home: an absolute address',
    plant: { file: 'src/api.js', anchor: "const BASE = '/api/v1';", with: "const BASE = 'http://127.0.0.1:3000/api/v1';" },
    run: ['node', 'scripts/check-page-stays-home.js'],
    names: ['src/api.js:15: an absolute address http://127.0.0.1:3000/api/v1'],
  },
  {
    check: 'U2b-6 no source maps',
    plant: { file: 'vite.config.js', anchor: '    sourcemap: false,', with: '    sourcemap: true,' },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-no-source-maps.js'],
    names: ['.js.map: a .map file', 'sourceMappingURL', 'Files in the build:'],
  },
  {
    check: "U2b-8 Home says only what it shows",
    // U1's four-kind sentence, put back.
    plant: {
      file: 'src/i18n/en.js',
      anchor: "    'See at a glance whether each lane is working, and how many cars are inside right now.',",
      with:
        "    'See at a glance which lanes are working, whether everything is running as it should, and how many cars are inside right now: garage pass, monthly, transient and registered transient.',",
    },
    run: ['node', 'scripts/check-home-claims.js'],
    names: ['en: page.home.purpose: "garage pass"', 'en: page.home.purpose: "monthly"', 'en: page.home.purpose: "transient"'],
  },
  {
    check: 'U2b-10 every sign-in answer has its own words',
    // Forget one of the platform's answers: busy falls back to "something went wrong".
    plant: { file: 'src/api.js', anchor: "  [503, 'sign_in_busy', 'busy'],\n", with: '' },
    run: ['node', '--test', 'test/api.test.js'],
    names: ['every answer the real sign-in route gives has its own plain sentence', '503 sign_in_busy'],
  },
  {
    check: 'U2b-11 the stand-in answers as the platform does',
    // The stand-in's sign-out answers with a body, as it did before the platform was measured.
    plant: { file: 'test/stub-platform.js', anchor: '      return send(res, 204, undefined, clearCookie);', with: '      return send(res, 200, { signed_out: true }, clearCookie);' },
    run: ['node', '--test', 'test/stub-matches-platform.test.js'],
    names: ['the stand-in differs from the platform at "sign-out"'],
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
  {
    check: 'U2b-1 nothing raw reaches the screen',
    // Let one raw code through: the client keeps the platform's code as the
    // kind, and the note shows a kind it has no words for as it is.
    plant: [
      {
        file: 'src/api.js',
        anchor: "named === code)?.[2] ?? 'unexpected');",
        with: "named === code)?.[2] ?? code ?? 'unexpected');",
      },
      {
        file: 'src/parts.jsx',
        anchor: '      <p>{t(problemKey({ kind }))}</p>',
        with: "      <p>{kind.includes('_') ? kind : t(problemKey({ kind }))}</p>",
      },
    ],
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL a code the screens do not know', 'RAW on screen: a code ("garage_frozen_for_audit")'],
  },
  {
    check: 'U2b-2 sign-out and 401 clear everything',
    // Skip the clear: the next owner starts from what the last one left.
    plant: {
      file: 'src/owner.js',
      anchor: 'const cleared = (state) => ({ ...EMPTY_OWNER, epoch: state.epoch + 1 });',
      with: 'const cleared = (state) => ({ ...state, epoch: state.epoch + 1 });',
    },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL owner B: nothing of owner A was ever drawn'],
  },
  {
    check: 'U2b-5 the page policy holds',
    plant: { file: 'index.html', anchor: '    <title></title>\n', with: '    <title></title>\n    <script>window.planted = 1;</script>\n' },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL the page policy was never broken (', 'policy violation: '],
  },
  {
    check: 'U2b-7 garage time, not browser time',
    // Use the browser's zone.
    plant: {
      file: 'src/time.js',
      anchor: '  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, { timeZone, ...options }).format(date);',
      with: '  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, { ...options }).format(date);',
    },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL garage time, not browser time', 'FAIL Cars inside: came in at'],
  },
  {
    check: 'U2b-10 every sign-in answer has its own words, on screen',
    plant: { file: 'src/api.js', anchor: "  [429, 'sign_in_rate_limited', 'tooMany'],\n", with: '' },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL sign-in, too many tries from here (en)', 'FAIL sign-in, too many tries from here (es)'],
  },
];

function scratchCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'admin-control-'));
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !LEAVE_OUT.has(basename(src)) });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}

function plant(dir, plants) {
  for (const p of [plants].flat()) plantOne(dir, p);
}

function plantOne(dir, { file, anchor, with: replacement }) {
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
    const where = [c.plant].flat().map((p) => p.file).join(' + ');
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} check ${c.check}: planted in ${where} -> exit ${r.status}`);
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
