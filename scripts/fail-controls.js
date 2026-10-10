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
//   A control may set `env` for its run: the LibreOffice one needs soffice (CI).
//   ... --only TEXT                          only the controls whose name holds TEXT
//   ... --plan                               print every control's name, one per line
//   ... --shard i/N                          run shard i of N; write what ran, what
//                                            failed and how long each took to
//                                            fail-controls-<plain|browser>-shard-<i>.json
//   ... --verify DIR                         read the shard files in DIR: shards 1..N
//                                            each exactly once, every control run in
//                                            exactly one of them, none failed
//
// Which shard a control lands in is chosen by its measured seconds on CI
// (scripts/fail-controls-times.json): longest first, each to the shard with
// the fewest seconds so far. A control with no measured time yet counts as the
// longest of its kind. The times only balance the shards; which controls run
// is the list below, whole, and --verify holds every shard to it.
//
// The download check's odd-text walk (thousands of cells, most of its minutes)
// runs only in the controls marked `oddText: true`: the ones whose break is in
// how text is shown or written. The others run it with --without-odd-text. A
// control that expects an odd-text line but is not marked refuses to run.
//
// The estate-name guard's control is not here: it plants its own, in the same
// run as its scan (`check-no-sibling-names.js --worktree`).

import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const LEAVE_OUT = new Set(['node_modules', '.git', 'dist', '.screens', 'test-results']);

const CHECK_FILES = ['node', 'scripts/check-files.js'];
const CHECK_DOWNLOADS = ['node', 'scripts/check-downloads.js'];
const CHECK_DRAWINGS = ['node', 'scripts/check-drawings.js'];
const CHECK_CACHE_ORDER = ['node', 'scripts/check-cache-order.js'];
const TIDY = ['node', 'scripts/check-tidy.js'];
const BUILD = [['npx', 'vite', 'build', '--logLevel', 'error']];

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
  // The bug U6 found on main: the alert-contact sentence written under the key
  // the "cannot be reached" sentence already had, so the later one won on every page.
  {
    check: '3 the two languages match: a key written twice in English',
    plant: { file: 'src/i18n/en.js', anchor: '  "problem.contactUnreachable": "Give a phone number, an email address, or both.",\n', with: '  "problem.unreachable": "Give a phone number, an email address, or both.",\n' },
    run: ['node', 'scripts/check-languages-match.js'],
    names: ['problem.unreachable: given 2 times in en.js (lines 107, 584); only the last is ever shown'],
  },
  {
    check: '3 the two languages match: a key written twice in Spanish',
    plant: { file: 'src/i18n/es.js', anchor: '  "problem.contactUnreachable": "Indique un teléfono, un correo, o ambos.",\n', with: '  "problem.unreachable": "Indique un teléfono, un correo, o ambos.",\n' },
    run: ['node', 'scripts/check-languages-match.js'],
    names: ['problem.unreachable: given 2 times in es.js (lines 104, 581); only the last is ever shown'],
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
      anchor: "    'Your garages at a glance: whether their lanes are working, and how many cars are inside.',",
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
  {
    check: 'U2b-12 a gateway answering for a platform it cannot reach',
    // Forget the gateway: its 502 page falls back to "something went wrong".
    plant: { file: 'src/api.js', anchor: "    if (GATEWAY.includes(res.status) && !fromPlatform) throw new Problem('unreachable');\n", with: '' },
    run: ['node', '--test', 'test/api.test.js'],
    names: ['a 502 with a page of its own, signing in'],
  },
  {
    check: "U2b-12 the platform's own busy and 500 keep their words",
    // Overreach: every 5xx made "cannot be reached".
    plant: { file: 'src/api.js', anchor: 'if (GATEWAY.includes(res.status) && !fromPlatform)', with: 'if (res.status >= 500)' },
    run: ['node', '--test', 'test/api.test.js'],
    names: ["the platform's own busy, signing in", "the platform's own 500, signing in"],
  },
  {
    check: 'U2b-12 the development proxy answers as a gateway',
    // The proxy left to answer a 500 when the platform is stopped.
    plant: { file: 'vite.config.js', anchor: ", configure: answerAsAGateway }", with: ' }' },
    run: ['node', '--test', 'test/dev-proxy.test.js'],
    names: ['signing in: the platform stopped behind the development proxy'],
  },
  {
    check: 'U2c-1 English by default',
    // The browser's language decides again, as firstLanguage did.
    plant: [
      { file: 'src/i18n/index.js', anchor: 'export function readLanguage(storage) {', with: 'export function readLanguage(storage, browserLanguages) {' },
      {
        file: 'src/i18n/index.js',
        anchor: '  return knownLanguage(stored) ?? DEFAULT_LANGUAGE;',
        with: "  return knownLanguage(stored) ?? (String(browserLanguages?.[0] ?? '').toLowerCase().startsWith('es') ? 'es' : DEFAULT_LANGUAGE);",
      },
    ],
    run: ['node', '--test', 'test/language.test.js'],
    names: ['nothing saved: English, whatever the browser asks for'],
  },
  {
    check: 'U2c-1 the language is kept with a PUT of its own',
    plant: { file: 'src/api.js', anchor: "request('/auth/language', { method: 'PUT', body: { language } })", with: "request('/auth/language', { method: 'POST', body: { language } })" },
    run: ['node', '--test', 'test/api.test.js'],
    names: ['the language is kept with one PUT of {"language"}'],
  },
  {
    check: 'U2c-6 no technical words: "device"',
    plant: { file: 'src/i18n/en.js', anchor: "'Your entry and exit lanes, and the equipment at each one.'", with: "'Your entry and exit lanes, and the device at each one.'" },
    run: ['node', 'scripts/check-plain-words.js'],
    names: ['en: page.lanes.purpose: "device"'],
  },
  {
    check: 'U2c-6 no technical words: "dispositivos"',
    plant: { file: 'src/i18n/es.js', anchor: "'Carriles y equipos'", with: "'Carriles y dispositivos'" },
    run: ['node', 'scripts/check-plain-words.js'],
    names: ['es: page.lanes.title: "dispositivos"'],
  },
  {
    check: 'U2c-6 no technical words: "goes live"',
    plant: { file: 'src/i18n/en.js', anchor: 'and the day it opens.', with: 'and when it goes live.' },
    run: ['node', 'scripts/check-plain-words.js'],
    names: ['en: page.garages.purpose: "goes live"'],
  },
  {
    check: 'U2c-7 every field described: one description removed',
    plant: { file: 'src/i18n/es.js', anchor: "  'inside.ticket.about': 'El número de boleto, si se sacó un boleto en el carril.',\n", with: '' },
    run: ['node', 'scripts/check-descriptions.js'],
    names: ['es: inside.ticket.about (Garage View): missing'],
  },
  {
    check: 'U2c-7 every field described: a column named without one',
    plant: { file: 'src/InsidePage.jsx', anchor: '                <FieldName t={t} name="inside.ticket" />', with: "                {t('inside.ticket')}" },
    run: ['node', 'scripts/check-descriptions.js'],
    names: ['Garage View (src/InsidePage.jsx:', 'a list column with no description'],
  },
  {
    check: 'U2c-7 every field described: a description over 15 words',
    plant: {
      file: 'src/i18n/en.js',
      anchor: "  'signIn.password.about': 'The password that goes with that email.',",
      with: "  'signIn.password.about': 'The password that goes with that email address, the one your garages were set up with long ago.',",
    },
    run: ['node', 'scripts/check-descriptions.js'],
    names: ['en: signIn.password.about (Sign in): 18 words, more than 15'],
  },
  {
    check: "U2c-8 Home's descriptions say only what it shows",
    plant: {
      file: 'src/i18n/en.js',
      anchor: "  'home.inside.about': 'Cars the sensors saw come in that are still inside, plus any not confirmed.',",
      with: "  'home.inside.about': 'Monthly and transient cars the sensors saw drive in.',",
    },
    run: ['node', 'scripts/check-home-claims.js'],
    names: ['en: home.inside.about: "monthly"', 'en: home.inside.about: "transient"'],
  },
  {
    check: 'U2c-9 the stand-in answers the language as the platform does',
    // The stand-in's sign-in answer without the language.
    plant: {
      file: 'test/stub-platform.js',
      anchor: 'session_ends_at: new Date(Date.now() + 30 * MINUTE).toISOString(), language: who.language }, {',
      with: 'session_ends_at: new Date(Date.now() + 30 * MINUTE).toISOString() }, {',
    },
    run: ['node', '--test', 'test/stub-matches-platform.test.js'],
    names: ['the stand-in differs from the platform at "sign-in"'],
  },
  {
    check: 'U2c-fix F1 "Lane computers" says what the column holds',
    // The first gate's finding put back: the description names one computer.
    plant: {
      file: 'src/i18n/en.js',
      anchor: "  'lanes.computers.about': 'Every connection this lane has had: whether it answers, or when it was cancelled.',",
      with: "  'lanes.computers.about': 'The connection of this lane, and when it was last heard from.',",
    },
    run: ['node', '--test', 'test/words-in-every-state.test.js'],
    names: ['en lanes.computers.about says nothing of: several computers', 'en lanes.computers.about says nothing of: a cancelled computer'],
  },
  {
    check: 'U2c-fix F2 a cancelled computer is not "no lane computer yet"',
    // The first gate's finding put back: a lane with only cancelled computers is "yet".
    plant: { file: 'src/lanes.js', anchor: "  if (cancelled.length === 0) return { state: 'none', text: t('lane.noComputer') };", with: "  return { state: 'none', text: t('lane.noComputer') };" },
    run: ['node', '--test', 'test/words-in-every-state.test.js'],
    names: ['a lane whose only computer had its access cancelled says so, and when', 'it says the lane never had a computer'],
  },
  {
    check: 'U2c-fix every state: Home\'s lanes description silent on a lane with no working computer',
    plant: {
      file: 'src/i18n/es.js',
      anchor: "  'home.lanes.about': 'Cada carril, entrada o salida, y si está conectado y responde, o por qué no.',",
      with: "  'home.lanes.about': 'Cada carril, de entrada o salida, y cuándo se comunicó por última vez.',",
    },
    run: ['node', '--test', 'test/words-in-every-state.test.js'],
    names: ['es home.lanes.about says nothing of: no working computer'],
  },
  {
    check: 'U2c-fix every state: "no cars inside" beside one let in',
    plant: { file: 'src/inside.js', anchor: "  else figure = unconfirmed > 0 ? t('inside.countNoneConfirmed') : t('inside.countNone');", with: "  else figure = t('inside.countNone');" },
    run: ['node', '--test', 'test/words-in-every-state.test.js'],
    names: ['it says no cars are inside, beside one let in'],
  },
  {
    check: 'U2c-fix every state: "came in" said of a car that was only let in',
    plant: {
      file: 'src/i18n/es.js',
      anchor: "  'inside.letIn.about': 'Cuándo el carril dejó pasar el carro, en la hora del garaje.',",
      with: "  'inside.letIn.about': 'Cuándo entró el carro, en la hora del garaje.',",
    },
    run: ['node', '--test', 'test/words-in-every-state.test.js'],
    names: ['es inside.letIn.about says the car came in'],
  },
  {
    check: 'U2c-fix O2 a chooser without its description',
    // U7a: the choosers are on the Settings page (and the sign-in screen, which draws the same ones).
    plant: { file: 'src/SettingsPage.jsx', anchor: '        <FieldName t={t} name="theme.label" />\n', with: '' },
    run: ['node', 'scripts/check-descriptions.js'],
    names: ['Settings (src/SettingsPage.jsx:', 'a chooser with no description'],
  },
  {
    check: 'U2c-fix O2 a chooser\'s description missing in one language',
    plant: { file: 'src/i18n/es.js', anchor: "  'language.label.about': 'El idioma de estas páginas. Si ya entró, se guarda para la próxima vez.',\n", with: '' },
    run: ['node', 'scripts/check-descriptions.js'],
    names: ['es: language.label.about (Settings): missing'],
  },
  {
    check: 'U2c-fix O2 Quick Find without its description',
    plant: { file: 'src/QuickFind.jsx', anchor: '          <FieldAbout t={t} name="quickFind.label" />\n', with: '' },
    run: ['node', 'scripts/check-descriptions.js'],
    names: ['Quick Find (src/QuickFind.jsx:', 'a typing box with no description'],
  },
  {
    check: 'U2c-fix O2 the garage chooser without its description',
    plant: { file: 'src/parts.jsx', anchor: '        <FieldName t={t} name="garage.choose" />', with: "        {t('garage.choose')}" },
    run: ['node', 'scripts/check-descriptions.js'],
    names: ['choosing a garage (src/parts.jsx:', 'the garage chooser with no description'],
  },
  {
    check: 'U3-1 the file is the list: a row dropped from the Excel file',
    plant: { file: 'src/files/excel.js', anchor: '  const body = file.rows.map((cells) =>', with: '  const body = file.rows.slice(1).map((cells) =>' },
    run: CHECK_FILES,
    names: ['FAIL 1 the file is the list: inside xlsx (en): 3 rows read back of the list\'s 4'],
  },
  {
    check: 'U3-1 the file is the list: a row dropped from the PDF',
    plant: { file: 'src/files/pdf.js', anchor: '  for (const row of file.rows) {', with: '  for (const row of file.rows.slice(1)) {' },
    run: CHECK_FILES,
    names: ['FAIL 1 the file is the list: inside pdf (en): 2 of 3 plates on a page exactly once', 'not once: HRB4410 · FL'],
  },
  {
    check: "U3-2 garage time: the computer's zone used for a time cell",
    plant: { file: 'src/files/model.js', anchor: "  const parts = new Intl.DateTimeFormat('en-US', {\n    timeZone,\n", with: "  const parts = new Intl.DateTimeFormat('en-US', {\n" },
    run: CHECK_FILES,
    names: ['FAIL 2 garage time: inside xlsx (en): before and after the clock change, 2026-03-08 15:30:00 and 2026-03-08 16:30:00'],
  },
  {
    check: "U3-2 garage time: the zone sentence names the computer's zone",
    plant: { file: 'src/files/model.js', anchor: "{ timeZone, timeZoneName: 'longGeneric' }", with: "{ timeZoneName: 'longGeneric' }" },
    run: CHECK_FILES,
    names: ['FAIL 2 garage time: inside xlsx (en): the zone sentence "Times are Eastern Time."', 'Times are Japan Standard Time.'],
  },
  {
    check: 'U3-3 text stays text: a ticket written as a number',
    plant: {
      file: 'src/files/excel.js',
      anchor: '    cells.map((cell) => (cell.wall ? { number: excelDay(cell.wall), style: TIME } : { text: fit(cell.text) })),',
      with: '    cells.map((cell) => (cell.wall ? { number: excelDay(cell.wall), style: TIME } : /^\\d+$/.test(cell.text) ? { number: Number(cell.text) } : { text: fit(cell.text) })),',
    },
    run: CHECK_FILES,
    names: ['FAIL 3 text stays text: inside xlsx (en): 3 of 4 come back as text', 'not text: 007'],
  },
  {
    check: 'U3-3 text stays text: "=1+1" written as a formula',
    plant: {
      file: 'src/files/excel.js',
      anchor: '      if (cell.number !== undefined)',
      with: "      if (String(cell.text).startsWith('=')) return `<c r=\"${ref}\"><f>${escape(cell.text.slice(1))}</f></c>`;\n      if (cell.number !== undefined)",
    },
    run: CHECK_FILES,
    names: ['FAIL 3 text stays text: inside xlsx (en)', 'formulas in the workbook: 1'],
  },
  {
    check: 'U3-4 a letter the font cannot draw, dropped unseen',
    plant: { file: 'src/files/pdf.js', anchor: '    for (const ch of made.missing) missing.add(ch);\n', with: '' },
    run: CHECK_FILES,
    names: ['FAIL 4 a letter the font cannot draw is named, not dropped unseen: []'],
  },
  {
    check: 'U3-5 the page break broken',
    plant: {
      file: 'src/files/pdf.js',
      anchor: '      if (!fresh && (room < Math.min(tallest, 1) || (room < tallest && tallest * cellLead <= BOTTOM - MARGIN - 200))) {\n        newPage({ headings: true });\n        fresh = true;\n        continue;\n      }\n      const take = Math.max(1, Math.min(room, tallest));',
      with: '      const take = tallest;',
    },
    run: CHECK_FILES,
    names: ['FAIL 5 a long list (en): 250 stays run to 1 pages', 'FAIL 5 a long list (en):', 'text off the page: '],
  },
  {
    check: 'U3-10 the file name not cleaned',
    plant: { file: 'src/files/model.js', anchor: "    String(text).replace(REFUSED_IN_NAMES, '')", with: '    String(text)' },
    run: CHECK_FILES,
    names: ['FAIL 10 the file name (xlsx): "Lanes and equipment - 2026-03-10 1141 - A/B:C*D?"E<F>|G'],
  },
  {
    check: 'U3-12 a column left out of "What each column means", Excel',
    plant: {
      file: 'src/files/excel.js',
      anchor: '    ...file.columns.map((c) => [{ text: c.name, style: BOLD }, { text: c.about, style: WRAP }]),',
      with: '    ...file.columns.slice(1).map((c) => [{ text: c.name, style: BOLD }, { text: c.about, style: WRAP }]),',
    },
    run: CHECK_FILES,
    names: ['FAIL 12 descriptions: inside xlsx (en): sheet "What each column means" describes 4 of 5 columns', 'FAIL 12 descriptions: lanes xlsx (es)'],
  },
  {
    check: 'U3-12 a column left out of "What each column means", PDF',
    plant: { file: 'src/files/pdf.js', anchor: '  for (const c of columns) paragraph(', with: '  for (const c of columns.slice(1)) paragraph(' },
    run: CHECK_FILES,
    names: ['FAIL 12 descriptions: inside pdf (en): page 1, under "What each column means", describes 4 of 5 columns'],
  },
  {
    check: "U3-12 a file column's description missing in one language",
    plant: { file: 'src/i18n/es.js', anchor: "  'file.state.about': 'Funcionando, sin comunicarse últimamente, nunca comunicada, o con su acceso cancelado.',\n", with: '' },
    run: ['node', 'scripts/check-descriptions.js'],
    names: ['es: file.state.about (the files of Lanes and equipment): missing'],
  },
  {
    check: 'U3 no technical words on the new buttons',
    plant: { file: 'src/i18n/en.js', anchor: "  'download.making': 'Making the file…',", with: "  'download.making': 'Making the file from the API…'," },
    run: ['node', 'scripts/check-plain-words.js'],
    names: ['en: download.making: "api"'],
  },
  {
    check: 'U3 the page stays home: an address in the Excel maker',
    plant: { file: 'src/files/excel.js', anchor: 'Target="xl/workbook.xml"/>', with: 'Target="https://example.net/workbook.xml"/>' },
    run: ['node', 'scripts/check-page-stays-home.js'],
    names: ['src/files/excel.js:', 'an absolute address https://example.net/workbook.xml'],
  },
  {
    check: 'U3-9 a maker loaded with the first page',
    plant: [
      { file: 'src/ListActions.jsx', anchor: "import { ProblemNote } from './parts.jsx';", with: "import { ProblemNote } from './parts.jsx';\nimport * as eagerPdf from './files/pdfFile.js';" },
      { file: 'src/ListActions.jsx', anchor: "  pdf: () => import('./files/pdfFile.js'),", with: '  pdf: async () => eagerPdf,' },
    ],
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-first-load.js'],
    names: ['the PDF library (jsPDF), loaded with the first page'],
  },
  {
    check: 'U3 fix F2 undone: a control character reaches the PDF maker',
    plant: [
      { file: 'src/files/text.js', anchor: "    if (SPACE_LIKE.test(ch)) out += ' ';", with: '    if (SPACE_LIKE.test(ch)) out += ch;' },
      { file: 'src/files/text.js', anchor: '    else if (LEFT_OUT.some(([, rule]) => rule.test(ch))) hidden = true;', with: '    else if (LEFT_OUT.some(([, rule]) => rule.test(ch))) out += ch;' },
      { file: 'src/files/text.js', anchor: '    else if (INVISIBLE.test(ch)) hidden = true;', with: '    else if (INVISIBLE.test(ch)) out += ch;' },
    ],
    run: CHECK_FILES,
    names: ['FAIL F2 a lane named "Gx<TAB>H2" prints as "Gx H2"; the PDF has "Gx": the text after <TAB> was lost', 'FAIL F2 a plate "TAB<TAB>999" prints as "TAB 999"; the PDF has "TAB"', 'FAIL odd text: plate × PDF'],
  },
  {
    check: "U3 fix F3 undone: every page's top holds the whole name, and a row is tried again",
    plant: [
      { file: 'src/files/pdf.js', anchor: "    lines(shortName, 'bold', SIZE.garage);", with: "    lines(fullName, 'bold', SIZE.garage);" },
      { file: 'src/files/pdf.js', anchor: '      if (!fresh && (room <', with: '      if ((room <' },
    ],
    run: CHECK_FILES,
    names: ['FAIL F3 a garage name of 3,000 characters: the PDF is made within 5 s (not made', 'FAIL odd text: garage name × PDF'],
  },
  {
    check: "U3 fix F3: a later page's name not cut to two lines",
    plant: { file: 'src/files/pdf.js', anchor: 'const NAME_LINES = 2;', with: 'const NAME_LINES = 3;' },
    run: CHECK_FILES,
    names: ["FAIL odd text: garage name × PDF page tops", 'not cut to two lines with "…"'],
  },
  {
    check: 'U3 fix: hidden characters left out of the PDF without a word',
    plant: { file: 'src/files/pdf.js', anchor: '    hidden ||= made.hidden;', with: '    hidden ||= false;' },
    run: CHECK_FILES,
    names: ['FAIL F1/F2 the screen is told: hidden characters left out (false)', 'FAIL odd text: garage name × notice (PDF)'],
  },
  {
    check: 'U3 fix F1: an invisible character named as a letter',
    plant: { file: 'src/files/text.js', anchor: '    else if (INVISIBLE.test(ch)) hidden = true;', with: '    else if (INVISIBLE.test(ch)) missing.push(ch);' },
    run: CHECK_FILES,
    names: ['FAIL odd text: lane computer name × notice (PDF)', 'invisible named'],
  },
  {
    // U3 fix round 2 (chat's call): the Excel file no longer keeps controls;
    // it carries the same text as the PDF. Skipping the rule there is the break.
    check: 'U3 fix 2 F1: the Excel file skips the rule both files keep',
    plant: { file: 'src/files/excel.js', anchor: '    const both = kept(text);', with: '    const both = { text: String(text), hidden: false };' },
    run: CHECK_FILES,
    names: ['FAIL R2 a lane named "Gx<U+00AD>H2", Lanes, Excel (openpyxl): the lane reads "GxH2"', 'FAIL odd text: ticket × Excel (openpyxl)', 'FAIL odd text by category: Cf format character'],
  },
  {
    // The same break, read by a spreadsheet app: LibreOffice, installed in CI.
    check: 'U3 fix 2 F1: the Excel file skips the rule both files keep, read by LibreOffice',
    plant: { file: 'src/files/excel.js', anchor: '    const both = kept(text);', with: '    const both = { text: String(text), hidden: false };' },
    env: { SPREADSHEET_READERS: 'libreoffice' },
    run: CHECK_FILES,
    names: ['FAIL R2 a lane named "Gx<U+00AD>H2", Lanes, Excel (libreoffice): the lane reads "GxH2"', 'FAIL odd text: ticket × Excel (libreoffice)'],
  },
  ...[
    ['control', "  ['control', /\\p{Cc}/u],\n", 'Cc control'],
    ['format character', "  ['format character', /\\p{Cf}/u],\n", 'Cf format character'],
    ['noncharacter', "  ['noncharacter', /\\p{Noncharacter_Code_Point}/u],\n", 'noncharacter'],
    ['lone surrogate', "  ['lone surrogate', /\\p{Cs}/u],\n", 'Cs lone surrogate'],
  ].map(([kind, anchor, group]) => ({
    check: `U3 fix 2 F1: the ${kind} category dropped from the rule both files keep`,
    plant: { file: 'src/files/text.js', anchor, with: '' },
    run: CHECK_FILES,
    names: [`FAIL odd text by category: ${group}`],
  })),
  {
    check: 'U3 fix 2 F2: glyph 0 counted as a shape the font draws',
    plant: { file: 'src/files/pdf.js', anchor: '    if (!glyph) return false;', with: '    if (glyph === undefined) return false;' },
    run: CHECK_FILES,
    names: ['FAIL R2-F2 the font draws it', 'disagree on U+FFFF (the maker says drawable)'],
  },
  {
    check: "U3 fix 2 F2: a space's empty outline not counted",
    plant: { file: 'src/files/pdf.js', anchor: '    return SPACE_LIKE.test(ch) || loca.lengthOf(glyph) > 0;', with: '    return loca.lengthOf(glyph) > 0;' },
    run: CHECK_FILES,
    names: ['FAIL R2-F2 the font draws it', 'disagree on U+000D (the maker says not drawable), U+0020'],
  },
  {
    check: 'U3 fix 2: hidden characters left out of the Excel file without a word',
    plant: { file: 'src/files/excel.js', anchor: '    hidden ||= both.hidden;', with: '    hidden ||= false;' },
    run: CHECK_FILES,
    names: ['FAIL odd text: garage name × notice (Excel)', 'hidden told false, want true', 'FAIL R2 the check-10 garage (BEL and U+202E before its H), Lanes, Excel: the screen is told hidden characters were left out of the file (false, want true)'],
  },
  {
    check: 'U3 fix: a stored "_x0041_" read back by Excel as "A"',
    plant: { file: 'src/files/excel.js', anchor: "      .replace(/_(?=x[0-9A-Fa-f]{4}_)/g, '_x005F_')\n", with: '' },
    run: CHECK_FILES,
    names: ['FAIL odd text: plate × Excel'],
  },
  {
    check: 'U3 fix: a text longer than an Excel cell holds, not cut',
    plant: { file: 'src/files/text.js', anchor: '  if (s.length <= EXCEL_CELL_LIMIT) return', with: '  if (s.length <= Infinity) return' },
    run: CHECK_FILES,
    names: ['FAIL odd text: lane name × Excel', 'want'],
  },
  {
    check: 'U3 fix: an Excel cell cut without a word',
    plant: { file: 'src/files/excel.js', anchor: '    cut ||= made.cut;', with: '    cut ||= false;' },
    run: CHECK_FILES,
    names: ['FAIL odd text: garage name × notice (Excel)', 'cut told false, longest text 40000'],
  },
  {
    check: "U3 fix: the PDF's title keeps invisible characters",
    plant: { file: 'src/files/pdf.js', anchor: '  const titleName = [...visibleOnly(file.garage)];', with: '  const titleName = [...String(file.garage)];' },
    run: CHECK_FILES,
    names: ['FAIL odd text: garage name × PDF title'],
  },
  {
    check: 'U3 fix: the garage name before the time in the file name',
    plant: { file: 'src/files/model.js', anchor: "  return `${[title, stamp, name].filter(Boolean).join(' - ')}.${extension}`;", with: "  return `${[title, name, stamp].filter(Boolean).join(' - ')}.${extension}`;" },
    run: CHECK_FILES,
    names: ['FAIL 10 the file name (xlsx): "Lanes and equipment - ABCDEFGH - 2026-03-10 1141.xlsx"', 'FAIL odd text: garage name × file name (pdf)'],
  },
  {
    check: 'U4 no technical words: "device" in a new entry',
    plant: { file: 'src/i18n/en.js', anchor: "  \"lanes.connect\": \"Connect this lane\",", with: "  \"lanes.connect\": \"Connect this lane device\"," },
    run: ['node', 'scripts/check-plain-words.js'],
    names: ['en: lanes.connect: "device"'],
  },
  {
    check: "U4 a setup step's description missing in one language",
    plant: { file: 'src/i18n/es.js', anchor: "  \"setup.step.rates.about\": \"Lo que se cobra a los conductores, vigente desde hoy.\",\n", with: '' },
    run: ['node', 'scripts/check-descriptions.js'],
    names: ['es: setup.step.rates.about (Setup): missing'],
  },
  {
    check: 'U4 the change log file is the list: a line dropped',
    plant: { file: 'src/files/model.js', anchor: '  const rows = data.changes.map((line) => {', with: '  const rows = data.changes.slice(1).map((line) => {' },
    run: CHECK_FILES,
    names: ['FAIL 1 the file is the list: changes xlsx (en)'],
  },
  {
    check: 'U4 fix 4: a time zone shown as its code',
    plant: { file: 'src/changes.js', anchor: "  if (field === 'timezone') return { words: zoneSaid(value, language) ?? t('changes.value.anotherZone') };", with: "  if (field === 'timezone') return { words: value };" },
    run: ['node', '--test', 'test/change-words.test.js'],
    names: ['4 NO RAW VALUES', 'America/New_York'],
  },
  {
    check: "U4 fix 4: a setting's choice shown as its code",
    plant: { file: 'src/changes.js', anchor: "    return { words: CHOICES[field].includes(value) ? t(`changes.value.${field}.${value}`) : t('changes.value.another') };", with: '    return { words: value };' },
    run: ['node', '--test', 'test/change-words.test.js'],
    names: ['4 NO RAW VALUES', 'shown as its code'],
  },
  {
    check: 'U4 fix 5: a refused attempt said as if it was done',
    plant: { file: 'src/changes.js', anchor: '  const pieces = [{ words: t(actionKey(line.action, refused)) }];', with: '  const pieces = [{ words: t(actionKey(line.action, false)) }];' },
    run: ['node', '--test', 'test/change-words.test.js'],
    names: ['5 EVERY LINE IS TRUE', 'reads like the change was made'],
  },
  {
    check: "U4 fix 5: another account's attempt on this garage said as \"not there\"",
    plant: { file: 'src/changes.js', anchor: "  const why = line.who?.kind === 'outside' && NOT_FOUND.includes(line.refusal)", with: "  const why = false && NOT_FOUND.includes(line.refusal)" },
    run: ['node', '--test', 'test/change-words.test.js'],
    names: ['5 EVERY LINE IS TRUE', "in the aimed-at garage's log"],
  },
  {
    check: 'U4 fix 3: a key whose name the line lacks, said as someone else',
    plant: { file: 'src/changes.js', anchor: "  if (who.kind === 'key') return [{ words: t('changes.who.keyUnnamed') }];\n", with: '' },
    run: ['node', '--test', 'test/change-words.test.js'],
    names: ['3 EVERY LINE NAMES WHO', 'names no key'],
  },
  {
    check: "U4 fix2: this account's cancelled key said as a working one",
    plant: { file: 'src/changes.js', anchor: '  if (noLonger && who.name) return named(t(noLonger), who.name);\n', with: '' },
    run: ['node', '--test', 'test/change-words.test.js'],
    names: ["no longer worked is said as what it was"],
  },
  // ── U4b: alerts, and no "lane computer" ─────────────────────────────────
  {
    check: 'U4b no "lane computer": planted in English',
    plant: { file: 'src/i18n/en.js', anchor: "  \"lanes.connect\": \"Connect this lane\",", with: "  \"lanes.connect\": \"Connect a lane computer\"," },
    run: ['node', 'scripts/check-plain-words.js'],
    names: ['en: lanes.connect: "lane computer"'],
  },
  {
    check: 'U4b no "lane computer": planted in Spanish',
    plant: { file: 'src/i18n/es.js', anchor: "  \"lanes.connect\": \"Conectar este carril\",", with: "  \"lanes.connect\": \"Conectar una computadora de carril\"," },
    run: ['node', 'scripts/check-plain-words.js'],
    names: ['es: lanes.connect: "computadora de carril"'],
  },
  {
    check: 'U4b no technical words: "SMS" in a new entry',
    plant: { file: 'src/i18n/en.js', anchor: '  "alerts.byText": "By text",', with: '  "alerts.byText": "By SMS",' },
    run: ['node', 'scripts/check-plain-words.js'],
    names: ['en: alerts.byText: "sms"'],
  },
  {
    check: 'U4b "server" alone is still refused: only "server room" is read whole',
    plant: { file: 'src/i18n/en.js', anchor: "or the computer in the server room has lost power.", with: "or the server has lost power." },
    run: ['node', 'scripts/check-plain-words.js'],
    names: ['en: alerts.alert.garage_not_answering.says: "server"'],
  },
  {
    check: "U4b an Alerts field's description missing in one language",
    plant: { file: 'src/i18n/es.js', anchor: '  "alerts.email.about": "Su dirección de correo, para alertas por correo.",\n', with: '' },
    run: ['node', 'scripts/check-descriptions.js'],
    names: ['es: alerts.email.about (Alerts): missing'],
  },
  {
    check: "U4b the change log says which alerts by their codes",
    plant: { file: 'src/changes.js', anchor: "    return { words: value.map((key) => alertName(t, key)).join(', ') };", with: "    return { words: value.join(', ') };" },
    run: ['node', '--test', 'test/change-words.test.js'],
    names: ["U4b a person's line", 'lane_not_answering, card_payments_stopped'],
  },
  {
    check: 'U4b an alert these pages have no words for, said as its key',
    plant: { file: 'src/alerts.js', anchor: "export const alertName = (t, key) => (known(key) ? t(`alerts.alert.${key}`) : t('alerts.alert.other'));", with: 'export const alertName = (t, key) => (known(key) ? t(`alerts.alert.${key}`) : key);' },
    run: ['node', '--test', 'test/change-words.test.js'],
    names: ["U4b a person's line"],
  },
  {
    check: 'U4b the Alerts file is the list: a person dropped',
    plant: { file: 'src/files/model.js', anchor: '  const rows = data.contacts.map((p) => [', with: '  const rows = data.contacts.slice(1).map((p) => [' },
    run: CHECK_FILES,
    names: ['FAIL 1 the file is the list: alerts xlsx (en)', 'FAIL 1 the file is the list: alerts pdf (en)'],
  },
  // ── U4b fix round ───────────────────────────────────────────────────────
  {
    check: 'U4b fix 2 check 3: the kind of change blanked -- a person\'s name change says nothing',
    plant: { file: 'src/changes.js', anchor: "    return { words: PERSON_CHOICES[field].includes(value) ? t(`changes.value.${field}.${value}`) : t('changes.value.another') };", with: "    return { words: '' };" },
    run: ['node', '--test', 'test/change-words.test.js'],
    names: ['EVERY LINE ABOUT A PERSON', 'is not said in words'],
  },
  {
    check: 'U4b fix 2 check 3: the kind of change blanked -- a line about a person says no action',
    plant: { file: 'src/changes.js', anchor: '  const pieces = [{ words: t(actionKey(line.action, refused)) }];', with: "  const pieces = [{ words: line.subject?.kind === PERSON ? '' : t(actionKey(line.action, refused)) }];" },
    run: ['node', '--test', 'test/change-words.test.js'],
    names: ['EVERY LINE ABOUT A PERSON', 'what was done is not said'],
  },
  {
    check: 'U4b fix 2 check 3: a removed person said by the id their line holds',
    plant: { file: 'src/changes.js', anchor: "pieces.push({ words: ': ' }, { words: t('changes.person.removed') });", with: "pieces.push({ words: ': ' }, { stored: line.subject.id });" },
    run: ['node', '--test', 'test/change-words.test.js'],
    names: ['EVERY LINE ABOUT A PERSON', 'the person'],
  },
  {
    check: 'U4b fix F2 a PDF column narrowed back: Confirmed',
    plant: { file: 'src/files/model.js', anchor: "    { key: 'alerts.confirmed', width: 0.109 },", with: "    { key: 'alerts.confirmed', width: 0.09 }," },
    run: ['node', 'scripts/check-pdf-words.js'],
    names: ['FAIL en alerts, heading "Confirmed": split inside the word', 'FAIL es alerts, column "Confirmado"', '"confirmar"'],
  },
  {
    check: 'U4b fix F2 a PDF column narrowed: the change log\'s What',
    plant: { file: 'src/files/model.js', anchor: "    { key: 'changes.what', width: 0.2 },", with: "    { key: 'changes.what', width: 0.1 }," },
    run: ['node', 'scripts/check-pdf-words.js'],
    names: ['FAIL en changes, column "What": ', 'split inside the word'],
  },
  {
    check: "U4b the stand-in's phone refusal not the platform's word for word",
    plant: { file: 'test/stub-platform.js', anchor: "  error: `phone ${why}. A US number is 10 digits", with: "  error: `the phone ${why}. A US number is 10 digits" },
    run: ['node', '--test', 'test/stub-matches-platform.test.js'],
    names: ['the stand-in differs from the platform at "a person to tell, a phone with letters"'],
  },
  {
    check: 'U4c 9: a sample the screen cannot show',
    plant: { file: 'src/i18n/es.js', anchor: '"lanes.sample.everyone2": "Cerrado por obras.",', with: '"lanes.sample.everyone2": "Cerrado por obras — disculpe.",' },
    run: ['node', '--test', 'test/screen.test.js'],
    names: ['every sample message, in both languages, is one the screen can show'],
  },
  {
    check: 'U4c 9: the screen\'s rule takes a letter that is two in capitals',
    plant: { file: 'src/screen.js', anchor: '    if ((upper.length !== 1 || !drawable.has(upper[0])) && !seen.includes(c)) seen.push(c);', with: '    if (!upper.every((u) => drawable.has(u)) && !seen.includes(c)) seen.push(c);' },
    run: ['node', '--test', 'test/screen.test.js'],
    names: ['a character the screen cannot show is named'],
  },
  {
    check: 'U4c 7: the stand-in closes a way out "full"',
    plant: { file: 'test/stub-platform.js', anchor: "      if (body.reason === 'full' && lane.direction !== 'entry') return refuse(res, who, 400, FULL_IS_A_WAY_IN, at);\n", with: '' },
    run: ['node', '--test', 'test/stub-matches-platform.test.js'],
    names: ['the stand-in answers every call and refusal the screens meet as the platform does'],
  },
  {
    check: 'U4 fix 6: a sentence that ends twice',
    plant: { file: 'src/i18n/index.js', anchor: "export const endOnce = (text) => text.replace(/(?<!\\.)\\.\\.(?!\\.)/g, '.');", with: 'export const endOnce = (text) => text;' },
    run: ['node', '--test', 'test/change-words.test.js'],
    names: ['6 NO SENTENCE ENDS TWICE', 'a.m..'],
  },
  // ── U5: the installer drawings (scripts/check-drawings.js) ──────────────
  {
    check: 'U5 1: a length typed into a sheet',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.plan.measured": "All distances are measured back from the gate arm."', with: '"drawings.plan.measured": "All distances are measured back from the gate arm, 12 ft apart."' },
    run: CHECK_DRAWINGS,
    names: ['FAIL en, any driver: every number', '"All distances are measured back from the gate arm, 12 ft apart." holds a number that is not the table\'s'],
  },
  {
    check: 'U5 2: a Draft 7 value changed in the table',
    plant: { file: 'src/drawings/numbers.js', anchor: "truckBack: length(283, '7.2', 'worked'),", with: "truckBack: length(283, '7.3', 'worked')," },
    run: CHECK_DRAWINGS,
    names: ['FAIL Draft 7 "23 ft 7 in (7.2 m)" -> truckBack is 283 in (7.3), not 283 in (7.2)'],
  },
  {
    check: 'U5 3: a length in metres only',
    plant: { file: 'src/drawings/numbers.js', anchor: "      return t('drawings.unit.length', { imperial: feetAndInches(n.inches, t), metric: metric(n, t) });", with: '      return metric(n, t);' },
    run: CHECK_DRAWINGS,
    names: ['a length in one unit only', 'FAIL en, any driver: all'],
  },
  {
    check: 'U5 4: entry types swapped',
    plant: { file: 'src/drawings/sheets.js', anchor: "  const entryType = reader ? '2A' : '2B';\n  const plans", with: "  const entryType = reader ? '2B' : '2A';\n  const plans" },
    run: CHECK_DRAWINGS,
    names: ['FAIL en: any driver, two ways in and one out -> sheets 2B (North Entry), 2B (South Entry), exit (Main Exit)', 'FAIL en: pass holders only -> sheets 2A, exit'],
  },
  {
    check: 'U5 4: a card reader at every exit',
    plant: { file: 'src/drawings/sheets.js', anchor: "    reader: lane.direction === 'exit' && reader,", with: "    reader: lane.direction === 'exit'," },
    run: CHECK_DRAWINGS,
    names: ['FAIL en: pass holders only -> no card reader at the exit, no N5, no W3'],
  },
  {
    check: 'U5 4: a set made with no drivers answer',
    plant: { file: 'src/drawings/sheets.js', anchor: "  if (takesAnyDriver !== true && takesAnyDriver !== false) needs.push('drivers');", with: '' },
    run: CHECK_DRAWINGS,
    names: ['FAIL en: no answer to the drivers question -> no set'],
  },
  {
    check: 'U5 5: "gate box" on a sheet',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.eq.frontCamera": "Front camera, on the control panel."', with: '"drawings.eq.frontCamera": "Front camera, on the gate box."' },
    run: CHECK_DRAWINGS,
    names: ['"gatebox" in "Front camera, on the gate box."'],
  },
  {
    check: 'U5 5: "lane computer" on a Spanish sheet',
    plant: { file: 'src/i18n/es.js', anchor: '"drawings.how2A.atExit": "Un conductor con pase, o uno que quiere registrarse, lo hace a la salida."', with: '"drawings.how2A.atExit": "Un conductor con pase lo hace a la salida, en la computadora del carril."' },
    run: CHECK_DRAWINGS,
    names: ['FAIL es, any driver: no gate box', '"computadoradelcarril"'],
  },
  {
    check: "U5 5: an owner's decision on a sheet",
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.sources.oneTable": "Every number on these sheets comes from one table, listed here with its source."', with: '"drawings.sources.oneTable": "Every number on these sheets comes from one table. The stop distance is the owner\'s decision."' },
    run: CHECK_DRAWINGS,
    names: ['"ownersdecision" in'],
  },
  {
    check: "U5 5: a person's name on a sheet",
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.sources.worked": "Camera angles are worked out from the distances and the F-150 size."', with: '"drawings.sources.worked": "Camera angles are worked out from the distances by Jane Doe."' },
    run: CHECK_DRAWINGS,
    names: ['a name "Jane" in', 'a name "Doe" in'],
  },
  {
    check: 'U5 fix 1: the 6 ft loop drawn back in the 10 ft lane',
    plant: { file: 'src/drawings/plan.js', anchor: "  const loopL = laneWidth - 2 * U * metres('loopEdgeMax');", with: '  const loopL = U * 1.83;' },
    run: CHECK_DRAWINGS,
    names: ['a loop drawn 24.0 in from the lane edge, not 12 to 20 in', 'FAIL en, any driver: all'],
  },
  {
    check: "U5 fix 3: a driver's control drawn within 6 ft of the arm",
    plant: { file: 'src/drawings/plan.js', anchor: "  const pay = before('payStation');", with: '  const pay = ARM - U * 1.2;' },
    run: CHECK_DRAWINGS,
    names: ["a driver's control drawn", "in from the arm's sweep, under 72 in", "FAIL en, any driver: all 3 drivers' controls"],
  },
  // ── U5 gate fixes (handover 2026-10-08 14:20) ─────────────────────────────
  {
    check: 'U5 gate 4: the card reader in a sentence on a pass-only set',
    plant: { file: 'src/drawings/sheets.js', anchor: "t(reader ? 'drawings.every.reach' : 'drawings.every.reachPassOnly',", with: "t('drawings.every.reach'," },
    run: CHECK_DRAWINGS,
    names: ['FAIL en: pass holders only -> the card reader is named only to say there is none', 'scanner, card reader, intercom'],
  },
  {
    check: 'U5 gate 4: the card-reader sentence typed into a sheet',
    plant: { file: 'src/drawings/sheets.js', anchor: "  left.para(t('drawings.about.trade'));", with: "  left.para(t('drawings.about.trade'));\n  left.para('Each exit lane also has a card reader.');" },
    run: CHECK_DRAWINGS,
    names: ["FAIL es, pass holders only: every text on 9 sheets is the drawings' own", '"Each exit lane also has a card reader."'],
  },
  {
    check: 'U5 gate 4: a capitalised name typed into a sheet',
    plant: { file: 'src/drawings/sheets.js', anchor: "  left.para(t('drawings.about.trade'));", with: "  left.para(t('drawings.about.trade'));\n  left.para('Jane chose these lanes.');" },
    run: CHECK_DRAWINGS,
    names: ["FAIL en, any driver: every text on 10 sheets is the drawings' own", '"Jane chose these lanes."'],
  },
  {
    check: 'U5 gate 4: "gate-box" with a hyphen',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.eq.frontCamera": "Front camera, on the control panel."', with: '"drawings.eq.frontCamera": "Front camera, on the gate-box."' },
    run: CHECK_DRAWINGS,
    names: ['"gatebox" in "Front camera, on the gate-box."'],
  },
  {
    check: 'U5 gate 4: "Gate Box" in capitals',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.eq.frontCamera": "Front camera, on the control panel."', with: '"drawings.eq.frontCamera": "Front camera, on the Gate Box."' },
    run: CHECK_DRAWINGS,
    names: ['"gatebox" in "Front camera, on the Gate Box."'],
  },
  {
    check: 'U5 gate 5: a scanner on every lane of a garage that takes any driver',
    plant: { file: 'src/i18n/en.js', anchor: 'a display, an intercom and a small relay box, and one control panel that holds its wiring.",', with: 'a display, a scanner, an intercom and a small relay box, and one control panel that holds its wiring.",' },
    run: CHECK_DRAWINGS,
    // Since fix 11 the "Every lane" check reads its claims as approved (fix 13: from the snapshot), so a claim edited in the dictionary is check 0's to name.
    names: ['en drawings.about.oneComputer: "One computer sits', 'a display, a scanner, an intercom', 'snapshot "One computer sits'],
  },
  {
    check: 'U5 fix 11 sweep: the two "Every lane" claims swapped in the code',
    plant: { file: 'src/drawings/sheets.js', anchor: "left.para(t(reader ? 'drawings.about.alsoAtExit' : 'drawings.about.alsoEveryLane'));", with: "left.para(t(reader ? 'drawings.about.alsoEveryLane' : 'drawings.about.alsoAtExit'));" },
    run: CHECK_DRAWINGS,
    names: ['FAIL en, any driver: "Every lane" says what each lane has', 'scanner: the sheet says it is on North Entry (2A), whose plan has none'],
  },
  {
    check: 'U5 gate 6: a label back on a line',
    plant: { file: 'src/drawings/plan.js', anchor: "  g.text(l2 + loopW + 4, loopTop - 7, t('drawings.plan.l2', { mark: MARK.L2 }), loopText);", with: "  g.text(l2 + loopW / 2, loopTop - 7, t('drawings.plan.l2', { mark: MARK.L2 }), { ...loopText, anchor: 'middle' });" },
    run: CHECK_DRAWINGS,
    names: ['FAIL en, any driver: no label crossed by a line', '"L2 arming"'],
  },
  {
    check: 'U5 gate 3: a job with no time limit',
    plant: { file: '.github/workflows/emails.yml', anchor: '    timeout-minutes: 10\n', with: '' },
    run: ['node', 'scripts/check-job-limits.js'],
    names: ['FAIL workflows/emails.yml: job "emails" has no timeout-minutes'],
  },
  // ── U5 re-gate (handover 2026-10-08 16:50): stems after every non-letter is removed ──
  {
    check: 'U5 re-gate 4: "cardreader" as one word on a pass-only set',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.how2B.shows": "The driver shows a pass to the scanner to get in."', with: '"drawings.how2B.shows": "The driver shows a pass to the scanner or the cardreader to get in."' },
    run: CHECK_DRAWINGS,
    names: ['FAIL en: pass holders only -> the card reader is named only to say there is none', 'the scanner or the cardreader to get in.'],
  },
  {
    check: 'U5 re-gate 4: "lectores de tarjetas" on a pass-only set',
    plant: { file: 'src/i18n/es.js', anchor: '"drawings.how2B.shows": "El conductor muestra un pase al escáner para entrar."', with: '"drawings.how2B.shows": "El conductor muestra un pase al escáner o a los lectores de tarjetas para entrar."' },
    run: CHECK_DRAWINGS,
    names: ['FAIL es: pass holders only -> the card reader is named only to say there is none', 'a los lectores de tarjetas para entrar.'],
  },
  {
    check: 'U5 re-gate 4: "lector de tarjeta" on a pass-only set',
    plant: { file: 'src/i18n/es.js', anchor: '"drawings.how2B.shows": "El conductor muestra un pase al escáner para entrar."', with: '"drawings.how2B.shows": "El conductor muestra un pase al escáner o al lector de tarjeta para entrar."' },
    run: CHECK_DRAWINGS,
    names: ['FAIL es: pass holders only -> the card reader is named only to say there is none', 'al lector de tarjeta para entrar.'],
  },
  {
    check: 'U5 re-gate 4: "Card-Reader" on a pass-only set',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.how2B.shows": "The driver shows a pass to the scanner to get in."', with: '"drawings.how2B.shows": "The driver shows a pass to the scanner or the Card-Reader to get in."' },
    run: CHECK_DRAWINGS,
    names: ['FAIL en: pass holders only -> the card reader is named only to say there is none', 'the scanner or the Card-Reader to get in.'],
  },
  {
    check: 'U5 re-gate 4: the card reader with no-break spaces on a pass-only set',
    plant: { file: 'src/i18n/es.js', anchor: '"drawings.how2B.shows": "El conductor muestra un pase al escáner para entrar."', with: '"drawings.how2B.shows": "El conductor muestra un pase al escáner o al lector\\u00a0de\\u00a0tarjetas para entrar."' },
    run: CHECK_DRAWINGS,
    names: ['FAIL es: pass holders only -> the card reader is named only to say there is none', 'tarjetas para entrar.'],
  },
  {
    check: 'U5 re-gate 5: "gatebox" as one word',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.eq.frontCamera": "Front camera, on the control panel."', with: '"drawings.eq.frontCamera": "Front camera, on the gatebox."' },
    run: CHECK_DRAWINGS,
    names: ['"gatebox" in "Front camera, on the gatebox."'],
  },
  {
    check: 'U5 re-gate 5: "lanecomputer" as one word',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.eq.frontCamera": "Front camera, on the control panel."', with: '"drawings.eq.frontCamera": "Front camera, on the lanecomputer."' },
    run: CHECK_DRAWINGS,
    names: ['"lanecomputer" in "Front camera, on the lanecomputer."'],
  },
  // ── U5 fix 11 (handover 2026-10-08 17:40): pinned texts, the limit's ceiling ──
  // The second re-gate's three edits: each exception edited to name a reader stayed green.
  {
    check: 'U5 fix 11 4: en how2B.noReader edited to "A card reader at the window."',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.how2B.noReader": "No card reader."', with: '"drawings.how2B.noReader": "A card reader at the window."' },
    run: CHECK_DRAWINGS,
    names: ['en drawings.how2B.noReader: "A card reader at the window.", snapshot "No card reader."', 'FAIL en: pass holders only -> the card reader is named only to say there is none', '"A card reader at the window."'],
  },
  {
    check: 'U5 fix 11 4: es type.exitNoReader edited to "Salida, con lector de tarjetas"',
    plant: { file: 'src/i18n/es.js', anchor: '"drawings.type.exitNoReader": "Salida, sin lector de tarjetas"', with: '"drawings.type.exitNoReader": "Salida, con lector de tarjetas"' },
    run: CHECK_DRAWINGS,
    names: ['es drawings.type.exitNoReader: "Salida, con lector de tarjetas", snapshot "Salida, sin lector de tarjetas"', 'FAIL es: pass holders only -> the card reader is named only to say there is none', '"Salida, con lector de tarjetas"'],
  },
  {
    check: 'U5 fix 11 4: en entryType.passOnly with "The exit has a card reader." added',
    plant: { file: 'src/i18n/en.js', anchor: 'No exit lane here has a card reader.",', with: 'No exit lane here has a card reader. The exit has a card reader.",' },
    run: CHECK_DRAWINGS,
    names: ['en drawings.entryType.passOnly: "', 'FAIL en: pass holders only -> the card reader is named only to say there is none', 'The exit has a card reader."'],
  },
  {
    check: 'U5 fix 11 4: es how2B.noReader edited to "Con lector de tarjetas."',
    plant: { file: 'src/i18n/es.js', anchor: '"drawings.how2B.noReader": "Sin lector de tarjetas."', with: '"drawings.how2B.noReader": "Con lector de tarjetas."' },
    run: CHECK_DRAWINGS,
    names: ['es drawings.how2B.noReader: "Con lector de tarjetas.", snapshot "Sin lector de tarjetas."', 'FAIL es: pass holders only -> the card reader is named only to say there is none', '"Con lector de tarjetas."'],
  },
  // A limit, but no limit.
  {
    check: 'U5 fix 11 3: a 6-hour job limit',
    plant: { file: '.github/workflows/emails.yml', anchor: '    timeout-minutes: 10\n', with: '    timeout-minutes: 360\n' },
    run: ['node', 'scripts/check-job-limits.js'],
    names: ['FAIL workflows/emails.yml: job "emails" may run 360 minutes, over the 30-minute ceiling'],
  },
  {
    check: 'U5 fix 11 3: a 31-minute job limit',
    plant: { file: '.github/workflows/ci-caches.yml', anchor: '    timeout-minutes: 25\n', with: '    timeout-minutes: 31\n' },
    run: ['node', 'scripts/check-job-limits.js'],
    names: ['FAIL workflows/ci-caches.yml: job "fill" may run 31 minutes, over the 30-minute ceiling'],
  },
  // The sweep: the other texts a check took from t(key). A claim's lanes, a unit's words, "3 of 10".
  {
    check: 'U5 fix 11 sweep: en "Every lane" claim edited to speak of every lane',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.about.alsoAtExit": "Each exit lane also has a scanner and a card reader."', with: '"drawings.about.alsoAtExit": "Each lane also has a scanner and a card reader."' },
    run: CHECK_DRAWINGS,
    names: ['en drawings.about.alsoAtExit: "Each lane also has a scanner and a card reader."', 'FAIL en, any driver: "Every lane" says what each lane has'],
  },
  {
    check: 'U5 fix 11 sweep: es "Every lane" claim edited to speak of every lane',
    plant: { file: 'src/i18n/es.js', anchor: '"drawings.about.alsoAtExit": "Cada carril de salida tiene además un escáner y un lector de tarjetas."', with: '"drawings.about.alsoAtExit": "Cada carril tiene además un escáner y un lector de tarjetas."' },
    run: CHECK_DRAWINGS,
    names: ['es drawings.about.alsoAtExit: "Cada carril tiene además un escáner y un lector de tarjetas."', 'FAIL es, any driver: "Every lane" says what each lane has'],
  },
  {
    check: "U5 fix 11 sweep: en an equipment word the claims are read for",
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.wiring.scanner": "{mark}  Scanner"', with: '"drawings.wiring.scanner": "{mark}  QR scanner"' },
    run: CHECK_DRAWINGS,
    names: ['en drawings.wiring.scanner: "{mark}  QR scanner", snapshot "{mark}  Scanner"'],
  },
  {
    check: "U5 fix 11 sweep: en a number in a unit's words",
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.unit.turns": "{n} turns"', with: '"drawings.unit.turns": "{n} turns, 7 more"' },
    run: CHECK_DRAWINGS,
    names: ['en drawings.unit.turns: "{n} turns, 7 more", snapshot "{n} turns"', "holds a number that is not the table's"],
  },
  {
    check: "U5 fix 11 sweep: es a number in a unit's words",
    plant: { file: 'src/i18n/es.js', anchor: '"drawings.unit.volts": "{n} V"', with: '"drawings.unit.volts": "{n} V o 240 V"' },
    run: CHECK_DRAWINGS,
    names: ['es drawings.unit.volts: "{n} V o 240 V", snapshot "{n} V"', "holds a number that is not the table's"],
  },
  {
    check: 'U5 fix 11 sweep: en a length in the title block\'s "3 of 10"',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.tb.sheetOf": "{n} of {of}"', with: '"drawings.tb.sheetOf": "{n} of {of}, 12 in"' },
    run: CHECK_DRAWINGS,
    names: ['en drawings.tb.sheetOf: "{n} of {of}, 12 in", snapshot "{n} of {of}"', "is not this garage's data"],
  },
  {
    check: 'U5 6: the sheets on Letter paper',
    plant: { file: 'src/drawings/pdf.js', anchor: "export const SHEET = { format: 'tabloid', orientation: 'landscape' };", with: "export const SHEET = { format: 'letter', orientation: 'landscape' };" },
    run: CHECK_DRAWINGS,
    names: ['each 11 x 17 in landscape (1224 x 792 points): 792 x 612'],
  },
  // ── U5 fix 13 (handover 2026-10-08 20:30): every drawing string held to one snapshot; limits read as YAML ──
  // The third re-gate's edits: each changed what a required text says, and stayed green.
  {
    check: 'U5 fix 13 1: en plan.payReader says "no card reader" (re-gate 3)',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.plan.payReader": "{mark}  Pay station: card reader, scanner, intercom"', with: '"drawings.plan.payReader": "{mark}  Pay station: no card reader, scanner, intercom"' },
    run: CHECK_DRAWINGS,
    names: ['en drawings.plan.payReader: "{mark}  Pay station: no card reader, scanner, intercom", snapshot "{mark}  Pay station: card reader, scanner, intercom"'],
  },
  {
    check: 'U5 fix 13 1: es eq.payReader says "sin lector" (re-gate 3)',
    plant: { file: 'src/i18n/es.js', anchor: 'del conductor: lector de tarjetas, escáner e intercomunicador."', with: 'del conductor: sin lector de tarjetas, escáner e intercomunicador."' },
    run: CHECK_DRAWINGS,
    names: ['es drawings.eq.payReader: "Estación de pago a la ventanilla del conductor: sin lector de tarjetas', 'snapshot "Estación de pago a la ventanilla del conductor: lector de tarjetas'],
  },
  {
    check: 'U5 fix 13 1: es status "Aprobado para obra" (re-gate 3)',
    plant: { file: 'src/i18n/es.js', anchor: '"drawings.status": "Borrador",', with: '"drawings.status": "Aprobado para obra",' },
    run: CHECK_DRAWINGS,
    names: ['es drawings.status: "Aprobado para obra", snapshot "Borrador"'],
  },
  {
    check: 'U5 fix 13 1: en status "Approved for construction" (re-gate 3)',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.status": "Draft",', with: '"drawings.status": "Approved for construction",' },
    run: CHECK_DRAWINGS,
    names: ['en drawings.status: "Approved for construction", snapshot "Draft"'],
  },
  {
    check: 'U5 fix 13 1: en everyWay says only the main way in (re-gate 3)',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.everyWay": "Every way in and every way out of the garage is a lane with this equipment."', with: '"drawings.everyWay": "Only the main way in is a lane with this equipment."' },
    run: CHECK_DRAWINGS,
    names: ['en drawings.everyWay: "Only the main way in is a lane with this equipment.", snapshot "Every way in and every way out of the garage is a lane with this equipment."'],
  },
  {
    check: 'U5 fix 13 1: en entryType.passOnly, punctuation only: "No. Exit lane here has a card reader." (re-gate 3 R3-2)',
    plant: { file: 'src/i18n/en.js', anchor: 'No exit lane here has a card reader.",', with: 'No. Exit lane here has a card reader.",' },
    run: CHECK_DRAWINGS,
    names: ['en drawings.entryType.passOnly: "', 'the driver shows a pass to get in. No. Exit lane here has a card reader.", snapshot "', 'No exit lane here has a card reader."'],
  },
  // Changes a reader cannot see.
  {
    check: 'U5 fix 13 1: en a no-break space',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.eq.frontCamera": "Front camera, on the control panel."', with: '"drawings.eq.frontCamera": "Front camera,\\u00a0on the control panel."' },
    run: CHECK_DRAWINGS,
    names: ['en drawings.eq.frontCamera: "Front camera,\\u00a0on the control panel.", snapshot "Front camera, on the control panel."'],
  },
  {
    check: 'U5 fix 13 1: en a Cyrillic "о" in an English word',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.eq.frontCamera": "Front camera, on the control panel."', with: '"drawings.eq.frontCamera": "Fr\\u043ent camera, on the control panel."' },
    run: CHECK_DRAWINGS,
    names: ['en drawings.eq.frontCamera: "Fr\\u043ent camera, on the control panel.", snapshot "Front camera, on the control panel."'],
  },
  {
    check: 'U5 fix 13 1: es an accent removed',
    plant: { file: 'src/i18n/es.js', anchor: '"drawings.eq.frontCamera": "Cámara delantera, sobre el panel de control."', with: '"drawings.eq.frontCamera": "Camara delantera, sobre el panel de control."' },
    run: CHECK_DRAWINGS,
    names: ['es drawings.eq.frontCamera: "Camara delantera, sobre el panel de control.", snapshot "Cámara delantera, sobre el panel de control."'],
  },
  {
    check: 'U5 fix 13 1: en a drawing key added',
    plant: { file: 'src/i18n/en.js', anchor: '  "drawings.eq.frontCamera": "Front camera, on the control panel.",\n', with: '  "drawings.eq.frontCamera": "Front camera, on the control panel.",\n  "drawings.eq.note": "Ask before you drill.",\n' },
    run: CHECK_DRAWINGS,
    names: ['en drawings.eq.note: added, "Ask before you drill.", not in the snapshot'],
  },
  {
    check: 'U5 fix 13 1: es a drawing key deleted',
    plant: { file: 'src/i18n/es.js', anchor: '  "drawings.draftMark": "Borrador, no apto para construcción",\n', with: '' },
    run: CHECK_DRAWINGS,
    names: ['es drawings.draftMark: removed, snapshot "Borrador, no apto para construcción"'],
  },
  {
    check: 'U5 fix 13 1: a look-alike written as itself in the snapshot too',
    plant: [
      { file: 'src/i18n/en.js', anchor: '"drawings.eq.frontCamera": "Front camera, on the control panel."', with: '"drawings.eq.frontCamera": "Frоnt camera, on the control panel."' },
      { file: 'scripts/drawings-strings.json', anchor: '"drawings.eq.frontCamera": "Front camera, on the control panel."', with: '"drawings.eq.frontCamera": "Frоnt camera, on the control panel."' },
    ],
    run: CHECK_DRAWINGS,
    names: ['FAIL the snapshot is written the one way'],
  },
  {
    check: 'U5 fix 13 1: the table writes a number the snapshot does not',
    plant: { file: 'src/drawings/numbers.js', anchor: "truckBack: length(283, '7.2', 'worked'),", with: "truckBack: length(283, '7.3', 'worked')," },
    run: CHECK_DRAWINGS,
    names: ['en: the table now writes "23 ft 7 in (7.3 m)", not in the snapshot', 'es: the snapshot writes "23 pies 7 pulg (7.2 m)", the table no longer does'],
  },
  // Job limits, read as YAML: what line matching missed (re-gate 3 R3-3), and the forms a limit can take.
  {
    check: 'U5 fix 13 2: a comment after "jobs:" and a 6-hour limit (re-gate 3)',
    plant: [
      { file: '.github/workflows/emails.yml', anchor: 'jobs:\n  emails:\n', with: 'jobs:  # the mail check\n  emails:\n' },
      { file: '.github/workflows/emails.yml', anchor: '    timeout-minutes: 10\n', with: '    timeout-minutes: 360\n' },
    ],
    run: ['node', 'scripts/check-job-limits.js'],
    names: ['FAIL workflows/emails.yml: job "emails" may run 360 minutes, over the 30-minute ceiling'],
  },
  {
    check: 'U5 fix 13 2: Windows line ends and no limit (re-gate 3)',
    plant: { file: '.github/workflows/emails.yml', anchor: '    timeout-minutes: 10\n', with: '', crlf: true },
    run: ['node', 'scripts/check-job-limits.js'],
    names: ['FAIL workflows/emails.yml: job "emails" has no timeout-minutes'],
  },
  {
    check: 'U5 fix 13 2: a limit of "0360"',
    plant: { file: '.github/workflows/emails.yml', anchor: '    timeout-minutes: 10\n', with: '    timeout-minutes: 0360\n' },
    run: ['node', 'scripts/check-job-limits.js'],
    names: ['FAIL workflows/emails.yml: job "emails" may run 360 minutes, over the 30-minute ceiling'],
  },
  {
    check: 'U5 fix 13 2: a limit that is an expression, not a number',
    plant: { file: '.github/workflows/emails.yml', anchor: '    timeout-minutes: 10\n', with: '    timeout-minutes: ${{ 360 }}\n' },
    run: ['node', 'scripts/check-job-limits.js'],
    names: ['FAIL workflows/emails.yml: job "emails" has timeout-minutes "${{ 360 }}", not a number of minutes'],
  },
  {
    check: 'U5 fix 13 2: a limit given twice, so the file is not YAML',
    plant: { file: '.github/workflows/emails.yml', anchor: '    timeout-minutes: 10\n', with: '    timeout-minutes: 10\n    timeout-minutes: 360\n' },
    run: ['node', 'scripts/check-job-limits.js'],
    names: ['FAIL workflows/emails.yml: not readable as YAML (duplicated mapping key)'],
  },
  // ── U5 fix 13b (handover 2026-10-09 10:10): every job on ubuntu-24.04, the release pinned beside it ──
  {
    check: 'U5 fix 13b: a job on ubuntu-latest',
    plant: { file: '.github/workflows/emails.yml', anchor: '    runs-on: ubuntu-24.04\n', with: '    runs-on: ubuntu-latest\n' },
    run: ['node', 'scripts/check-job-limits.js'],
    names: ['FAIL workflows/emails.yml: job "emails" runs on "ubuntu-latest", not "ubuntu-24.04"'],
  },
  {
    check: 'U5 fix 13b: a job on ubuntu-22.04',
    plant: { file: '.github/workflows/ci-caches.yml', anchor: '    runs-on: ubuntu-24.04\n', with: '    runs-on: ubuntu-22.04\n' },
    run: ['node', 'scripts/check-job-limits.js'],
    names: ['FAIL workflows/ci-caches.yml: job "fill" runs on "ubuntu-22.04", not "ubuntu-24.04"'],
  },
  {
    check: 'U5 fix 13b: a job with no runs-on',
    plant: { file: '.github/workflows/cla.yml', anchor: '    runs-on: ubuntu-24.04\n', with: '' },
    run: ['node', 'scripts/check-job-limits.js'],
    names: ['FAIL workflows/cla.yml: job "', 'runs on nothing named, not "ubuntu-24.04"'],
  },
  {
    check: 'U5 fix 13b: a step pinning another Ubuntu release',
    plant: { file: '.github/workflows/ci-caches.yml', anchor: '          ubuntu-release: noble\n', with: '          ubuntu-release: jammy\n' },
    run: ['node', 'scripts/check-job-limits.js'],
    names: ['FAIL workflows/ci-caches.yml: job "fill" pins Ubuntu "jammy", not "noble", the release of ubuntu-24.04'],
  },
  // ── U5 fix 16 (handover 2026-10-09 10:55): nothing restored from a cache is read before it is verified ──
  {
    check: 'U5 fix 16 cache: setup-node asked to cache npm',
    plant: { file: '.github/actions/npm-packages/action.yml', anchor: "    - uses: actions/setup-node@v4\n      with:\n        node-version: '22'\n", with: "    - uses: actions/setup-node@v4\n      with:\n        node-version: '22'\n        cache: npm\n" },
    run: CHECK_CACHE_ORDER,
    names: ['FAIL actions/npm-packages/action.yml, step 1 (actions/setup-node@v4): actions/setup-node asked to cache restores with no verify step after it'],
  },
  {
    check: 'U5 fix 16 cache: actions/cache, which restores with nothing between it and the first reader',
    plant: { file: '.github/workflows/emails.yml', anchor: '      - name: Self-test the guard\n', with: "      - uses: actions/cache@v4\n        with: { path: ~/.npm, key: npm-x }\n      - name: Self-test the guard\n" },
    run: CHECK_CACHE_ORDER,
    names: ['FAIL workflows/emails.yml, job "emails", step 2 (actions/cache@v4): actions/cache restores with no verify step after it'],
  },
  {
    check: 'U5 fix 16 cache: Playwright run between the browsers restore and its verify (re-gate 14 R14-2)',
    plant: {
      file: '.github/actions/check-environment/action.yml',
      anchor: "-v3\n    - name: Chromium and its system packages, verified before anything reads them\n",
      with: "-v3\n    - name: Chromium, installed\n      if: inputs.browser == 'true'\n      shell: bash\n      run: npx playwright install chromium\n    - name: Chromium and its system packages, verified before anything reads them\n",
    },
    run: CHECK_CACHE_ORDER,
    names: ['FAIL actions/check-environment/action.yml, step 3 "Chromium and its system packages, from the cache": the step after it is not the verify step', 'it is step 4 "Chromium, installed"'],
  },
  {
    check: 'U5 fix 16 cache: the browsers left out of their verify step',
    plant: { file: '.github/actions/check-environment/action.yml', anchor: 'restored chromium "$KEY" "$MATCHED" "$HOME/chromium-debs" "$HOME/.cache/ms-playwright"', with: 'restored chromium "$KEY" "$MATCHED" "$HOME/chromium-debs"' },
    run: CHECK_CACHE_ORDER,
    names: ['does not verify ~/.cache/ms-playwright, which "chromium-cache" restores'],
  },
  {
    check: 'U5 fix 16 cache: a verify step under another condition than its restore',
    plant: { file: '.github/actions/check-environment/action.yml', anchor: "    - name: LibreOffice's packages, verified before anything reads them\n      if: inputs.spreadsheet-app == 'true'\n", with: "    - name: LibreOffice's packages, verified before anything reads them\n      if: always()\n" },
    run: CHECK_CACHE_ORDER,
    names: ['LibreOffice\'s packages, verified before anything reads them": runs under "always()", not the restore\'s "inputs.spreadsheet-app == \'true\'"'],
  },
  {
    check: "U5 fix 16 cache: a verify step reading another restore's key",
    plant: { file: '.github/actions/check-environment/action.yml', anchor: '        MATCHED: ${{ steps.readers-cache.outputs.cache-matched-key }}', with: '        MATCHED: ${{ steps.libreoffice-cache.outputs.cache-matched-key }}' },
    run: CHECK_CACHE_ORDER,
    names: ['verifies with KEY and MATCHED other than "readers-cache"\'s own cache-primary-key and cache-matched-key'],
  },
  {
    check: 'U5 fix 16 cache: the wheels restored from another key',
    plant: { file: '.github/actions/check-environment/action.yml', anchor: "-v1\n    - name: The readers' wheels, verified before pip reads them\n", with: "-v1\n        restore-keys: reader-wheels-\n    - name: The readers' wheels, verified before pip reads them\n" },
    run: CHECK_CACHE_ORDER,
    names: ['restore-keys on a wheels cache; only a set of packages may come from another key'],
  },
  // ── U5 fix 18 (handover 2026-10-09 12:10): the verify step pinned whole; nothing lets a job go on past a refusal ──
  {
    check: 'U5 fix 18: || true after the npm verify line (re-gate 16 R16-1)',
    plant: { file: '.github/actions/npm-packages/action.yml', anchor: 'restored npm "$KEY" "$MATCHED" "$HOME/.npm/_cacache" package-lock.json\n', with: 'restored npm "$KEY" "$MATCHED" "$HOME/.npm/_cacache" package-lock.json || true\n' },
    run: CHECK_CACHE_ORDER,
    names: ['FAIL actions/npm-packages/action.yml, step 4 "The npm packages, verified before npm reads them": run is', 'package-lock.json || true", not'],
  },
  {
    check: 'U5 fix 18: ; true after the Chromium verify line',
    plant: { file: '.github/actions/check-environment/action.yml', anchor: `"$RELEASE" $(grep -v '^#' .github/ci-hashes/playwright-deps.txt)\n`, with: `"$RELEASE" $(grep -v '^#' .github/ci-hashes/playwright-deps.txt); true\n` },
    run: CHECK_CACHE_ORDER,
    names: ['FAIL actions/check-environment/action.yml, step 4 "Chromium and its system packages, verified before anything reads them": run is', 'playwright-deps.txt); true", not'],
  },
  {
    check: 'U5 fix 18: || exit 0 after the wheels verify line',
    plant: { file: '.github/actions/check-environment/action.yml', anchor: 'restored wheels "$KEY" "$MATCHED" "$HOME/reader-wheels" scripts/files/readers.txt\n', with: 'restored wheels "$KEY" "$MATCHED" "$HOME/reader-wheels" scripts/files/readers.txt || exit 0\n' },
    run: CHECK_CACHE_ORDER,
    names: ['"The readers\' wheels, verified before pip reads them": run is', 'readers.txt || exit 0", not'],
  },
  {
    check: 'U5 fix 18: set +e; in front of the LibreOffice verify line',
    plant: { file: '.github/actions/check-environment/action.yml', anchor: '      run: python3 -I .github/scripts/verify-installs.py restored debs', with: '      run: set +e; python3 -I .github/scripts/verify-installs.py restored debs' },
    run: CHECK_CACHE_ORDER,
    names: ['"LibreOffice\'s packages, from the cache": the step after it is not the verify step'],
  },
  {
    check: 'U5 fix 18: continue-on-error on the npm verify step (re-gate 16 R16-1)',
    plant: { file: '.github/actions/npm-packages/action.yml', anchor: '    - name: The npm packages, verified before npm reads them\n      shell: bash\n', with: '    - name: The npm packages, verified before npm reads them\n      continue-on-error: true\n      shell: bash\n' },
    run: CHECK_CACHE_ORDER,
    names: ['FAIL actions/npm-packages/action.yml, runs.steps[3]: continue-on-error true', '"The npm packages, verified before npm reads them": has "continue-on-error", which its pinned step has not'],
  },
  {
    check: 'U5 fix 18: continue-on-error on a job',
    plant: { file: '.github/workflows/ci.yml', anchor: '    name: lint\n', with: '    name: lint\n    continue-on-error: true\n' },
    run: CHECK_CACHE_ORDER,
    names: ['FAIL workflows/ci.yml, jobs.lint: continue-on-error true; a failed step must stop its job'],
  },
  {
    check: 'U5 fix 18: if: false on the wheels verify step',
    plant: { file: '.github/actions/check-environment/action.yml', anchor: "    - name: The readers' wheels, verified before pip reads them\n      shell: bash\n", with: "    - name: The readers' wheels, verified before pip reads them\n      if: false\n      shell: bash\n" },
    run: CHECK_CACHE_ORDER,
    names: ['"The readers\' wheels, verified before pip reads them": has "if", which its pinned step has not'],
  },
  {
    check: 'U5 fix 18: if: always() on the step after the wheels verify',
    plant: { file: '.github/actions/check-environment/action.yml', anchor: '    - name: The readers the downloaded files are read back with (pinned, by hash)\n      shell: bash\n', with: '    - name: The readers the downloaded files are read back with (pinned, by hash)\n      if: always()\n      shell: bash\n' },
    run: CHECK_CACHE_ORDER,
    names: ['"The readers the downloaded files are read back with (pinned, by hash)": runs under "always()", so it runs after the verify step'],
  },
  {
    check: 'U5 fix 18: shell: bash {0} on the LibreOffice verify step',
    plant: { file: '.github/actions/check-environment/action.yml', anchor: "    - name: LibreOffice's packages, verified before anything reads them\n      if: inputs.spreadsheet-app == 'true'\n      shell: bash\n", with: "    - name: LibreOffice's packages, verified before anything reads them\n      if: inputs.spreadsheet-app == 'true'\n      shell: bash {0}\n" },
    run: CHECK_CACHE_ORDER,
    names: ['"LibreOffice\'s packages, verified before anything reads them": shell is "bash {0}", not "bash"'],
  },
  {
    check: 'U5 fix 18: a job-level defaults.run.shell',
    plant: { file: '.github/workflows/ci.yml', anchor: '    name: lint\n', with: '    name: lint\n    defaults:\n      run:\n        shell: bash {0}\n' },
    run: CHECK_CACHE_ORDER,
    names: ['FAIL workflows/ci.yml, jobs.lint: defaults.run.shell "bash {0}"'],
  },
  {
    check: 'U5 fix 18: a workflow-level defaults.run.shell',
    plant: { file: '.github/workflows/ci.yml', anchor: 'permissions:\n  contents: read\n', with: 'permissions:\n  contents: read\n\ndefaults:\n  run:\n    shell: bash {0}\n' },
    run: CHECK_CACHE_ORDER,
    names: ['FAIL workflows/ci.yml, the workflow: defaults.run.shell "bash {0}"'],
  },
  {
    check: "U5 fix 18: a shard's report back on always(), after check-environment",
    plant: { file: '.github/workflows/ci.yml', anchor: "if: \"!cancelled() && steps.environment.outcome == 'success'\"\n        uses: actions/upload-artifact@v4\n        with:\n          name: fail-controls-plain-shard", with: "if: always()\n        uses: actions/upload-artifact@v4\n        with:\n          name: fail-controls-plain-shard" },
    run: CHECK_CACHE_ORDER,
    names: ['FAIL workflows/ci.yml, job "controls", step 4 "This shard\'s report": runs under "always()"', 'the one form allowed is "!cancelled() && steps.environment.outcome == \'success\'"'],
  },
  {
    check: 'U5 fix 18: || true in the npm verify line and its pinned step both',
    plant: [
      { file: '.github/actions/npm-packages/action.yml', anchor: 'restored npm "$KEY" "$MATCHED" "$HOME/.npm/_cacache" package-lock.json\n', with: 'restored npm "$KEY" "$MATCHED" "$HOME/.npm/_cacache" package-lock.json || true\n' },
      { file: 'scripts/cache-verify-steps.yml', anchor: 'restored npm "$KEY" "$MATCHED" "$HOME/.npm/_cacache" package-lock.json\n', with: 'restored npm "$KEY" "$MATCHED" "$HOME/.npm/_cacache" package-lock.json || true\n' },
    ],
    run: CHECK_CACHE_ORDER,
    names: ['FAIL scripts/cache-verify-steps.yml, actions/npm-packages/action.yml "npm-cache": run holds the shell operator "|"'],
  },
  {
    check: 'U5 fix 18: a pinned verify step no restore uses',
    plant: { file: 'scripts/cache-verify-steps.yml', anchor: '  npm-cache:\n', with: '  npm-cache-old:\n    name: x\n    shell: bash\n    run: python3 -I .github/scripts/verify-installs.py restored npm x\n  npm-cache:\n' },
    run: CHECK_CACHE_ORDER,
    names: ['FAIL scripts/cache-verify-steps.yml, actions/npm-packages/action.yml "npm-cache-old": pinned, but no cache restore of that id is there'],
  },
  // The drawn text (check-drawings 10): sheet code that draws another string, drops one or moves rows (re-gate 14 R14-1).
  {
    check: 'U5 fix 16 drawn: the lanes table calls an exit with a reader "no card reader" (re-gate 14 D14)',
    plant: { file: 'src/drawings/sheets.js', anchor: "t(reader ? 'drawings.type.exitReader' : 'drawings.type.exitNoReader')", with: "t('drawings.type.exitNoReader')" },
    run: CHECK_DRAWINGS,
    names: ['FAIL any driver, en: every text drawn on its 10 sheets', 'any driver, en, sheet 4 "Every lane", line ', 'any driver, es, sheet 4 '],
  },
  {
    check: 'U5 fix 16 drawn: the lanes table calls any-driver entries 2B (re-gate 14 D15)',
    plant: { file: 'src/drawings/sheets.js', anchor: "t(reader ? 'drawings.type.entry2A' : 'drawings.type.entry2B')", with: "t('drawings.type.entry2B')" },
    run: CHECK_DRAWINGS,
    names: ['any driver, en, sheet 4 "Every lane", line ', 'Entry, type 2B'],
  },
  {
    check: 'U5 fix 16 drawn: the lanes table calls a pass-only entry 2A (re-gate 14 D16)',
    plant: { file: 'src/drawings/sheets.js', anchor: "t(reader ? 'drawings.type.entry2A' : 'drawings.type.entry2B')", with: "t('drawings.type.entry2A')" },
    run: CHECK_DRAWINGS,
    names: ['pass holders only, en, sheet 3 "Every lane", line ', 'Entry, type 2A'],
  },
  {
    check: 'U5 fix 16 drawn: a pass-only garage told it takes any driver (re-gate 14 D17)',
    plant: { file: 'src/drawings/sheets.js', anchor: "left.para(t(reader ? 'drawings.entryType.any' : 'drawings.entryType.passOnly'));", with: "left.para(t('drawings.entryType.any'));" },
    run: CHECK_DRAWINGS,
    names: ['pass holders only, en, sheet 3 "Every lane", line ', 'pass holders only, es, sheet 3 '],
  },
  {
    check: 'U5 fix 16 drawn: the 2B "How it works" loses its "no card reader" sentence (re-gate 14 D13)',
    plant: { file: 'src/drawings/sheets.js', anchor: "t('drawings.how2B.pedestal', { distance: pay }), t('drawings.how2B.noReader'), ", with: "t('drawings.how2B.pedestal', { distance: pay }), " },
    run: CHECK_DRAWINGS,
    names: ['pass holders only, en, sheet 1 "Entry lane, plan view: type 2B', 'pass holders only, es, sheet 1 '],
  },
  {
    check: 'U5 fix 16 drawn: two values of the electrical table swapped',
    plant: [
      { file: 'src/drawings/sheets.js', anchor: "[mark(MARK.W1), t('drawings.power.w1'), t('drawings.power.w1supply', { volts }),", with: "[mark(MARK.W1), t('drawings.power.w1'), t('drawings.power.w2supply')," },
      { file: 'src/drawings/sheets.js', anchor: "[mark(MARK.W2), t('drawings.power.w2'), t('drawings.power.w2supply'), ''],", with: "[mark(MARK.W2), t('drawings.power.w2'), t('drawings.power.w1supply', { volts }), ''],"},
    ],
    run: CHECK_DRAWINGS,
    names: ['any driver, en, sheet 8 "Electrical", line ', 'pass holders only, es, sheet 7 '],
  },
  {
    check: 'U5 fix 16 drawn: two rows of the server-room table reordered',
    plant: {
      file: 'src/drawings/sheets.js',
      anchor: "      [t('drawings.room.mainSwitch'), t('drawings.inRoom.mainSwitch')],\n      [t('drawings.room.backup'), t('drawings.inRoom.backup')],\n",
      with: "      [t('drawings.room.backup'), t('drawings.inRoom.backup')],\n      [t('drawings.room.mainSwitch'), t('drawings.inRoom.mainSwitch')],\n",
    },
    run: CHECK_DRAWINGS,
    names: ['any driver, en, sheet 6 "Server room", line ', 'long names, es, sheet 6 '],
  },
  {
    check: 'U5 fix 16 drawn: the same text, drawn elsewhere on the sheet',
    plant: { file: 'src/drawings/sheets.js', anchor: '  s.text(FRAME.left, 44, title, { size: SIZE.title, bold: true });', with: '  s.text(FRAME.left + 400, 44, title, { size: SIZE.title, bold: true });' },
    run: CHECK_DRAWINGS,
    names: ['any driver, en, sheet 1 "Entry lane, plan view: type 2A, a garage that takes any driver" (North Entry), line 1: drawn "430,44 Entry lane'],
  },
  {
    check: 'U5 fix 16 drawn: a garage that gets a set where it asked for the drivers answer',
    plant: { file: 'test/drawings-fixtures.js', anchor: "  takesAnyDriver: null,\n", with: "  takesAnyDriver: false,\n" },
    run: CHECK_DRAWINGS,
    names: ['no answer, en: asks for "nothing, a set is made", snapshot "drivers"'],
  },
  // ── U6: Taxes and fees, Getting paid, Card readers ──
  {
    check: 'U6-2 a percent sent as 185',
    plant: { file: 'src/taxes.js', anchor: "  const bp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));", with: "  const bp = Number(m[1]) * 10 + Number((m[2] ?? '').padEnd(1, '0'));" },
    run: ['node', '--test', 'test/taxes.test.js'],
    names: ['a percent as typed, in hundredths: 18.5 is 1850'],
  },
  {
    check: "U6-2 the start of a day in the browser's zone",
    plant: { file: 'src/taxes.js', anchor: '  const midnight = Date.UTC(y, mo - 1, d);', with: '  return garageInstant(new Date(`${day}T00:00:00`).getTime(), timeZone);\n  const midnight = Date.UTC(y, mo - 1, d);' },
    run: ['node', '--test', 'test/taxes.test.js'],
    names: ["FROM THE START OF a day, in the garage's own zone, across both of New York's clock changes"],
  },
  {
    check: 'U6-6 a state worded wrong',
    plant: { file: 'src/i18n/en.js', anchor: '"taxes.noTax": "This garage charges no tax.",', with: '"taxes.noTax": "This garage hasn\'t said yet.",' },
    run: ['node', '--test', 'test/words-in-every-state.test.js'],
    names: ['en taxes.noTax: "This garage hasn\'t said yet." does not say it'],
  },
  {
    check: 'U6-1 a refusal with no words of its own, in the client',
    plant: { file: 'src/api.js', anchor: "  [409, 'card_payments_not_active', 'cardsNotActive'],\n", with: '' },
    run: ['node', '--test', 'test/api.test.js'],
    names: ['"readers place, given while card payments are off"'],
  },
  {
    check: 'U6 the change log: a refusal said as "it was not allowed"',
    plant: { file: 'src/changes.js', anchor: "  'card_payments_not_active', 'bad_location',", with: "  'bad_location'," },
    run: ['node', '--test', 'test/change-words.test.js'],
    names: ['card_payments_not_active: said as'],
  },
  {
    check: 'U6 the stand-in differs from the platform',
    plant: { file: 'test/stub-platform.js', anchor: "const NO_PLACE = { error: 'this garage has no Location yet; create it first', code: 'no_terminal_location' };", with: "const NO_PLACE = { error: 'This garage has no place for its readers yet.', code: 'no_terminal_location' };" },
    run: ['node', '--test', 'test/stub-matches-platform.test.js'],
    names: ['the stand-in differs from the platform at "a card reader, with no place given yet"'],
  },
  {
    check: 'U6 a field on Card readers with no description',
    plant: { file: 'src/i18n/es.js', anchor: '  "readers.code.about": "Las palabras que muestra el lector cuando está listo para conectarse. Nunca se guarda.",\n', with: '' },
    run: ['node', 'scripts/check-descriptions.js'],
    names: ['es: readers.code.about (Card readers): missing'],
  },
  {
    check: 'U6 Quick Find: a setting not found',
    plant: { file: 'src/search.js', anchor: "  { id: 'connectReader', action: { page: 'readers' } },\n", with: '' },
    run: ['node', '--test', 'test/search.test.js'],
    names: ['en "connect a card reader"'],
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
        anchor: "BY_STATUS[res.status] : undefined) ?? 'unexpected');",
        with: "BY_STATUS[res.status] : undefined) ?? code ?? 'unexpected');",
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
    names: ['FAIL garage time, not browser time', 'FAIL Garage View: came in at'],
  },
  {
    check: 'U2b-7 garage time on the printed page',
    // The "Printed …" line in the browser's zone.
    plant: {
      file: 'src/time.js',
      anchor: '  return parts(new Date(value), timeZone, language, {',
      with: '  return parts(new Date(value), undefined, language, {',
    },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: [
      'FAIL print (Garage View): the time it was printed is garage time',
      'FAIL print (Garage View): the time it was printed is not browser time',
      'FAIL print (Lanes and equipment): the time it was printed is garage time',
      'FAIL print (Lanes and equipment): the time it was printed is not browser time',
    ],
  },
  {
    check: 'U2b-12 the platform cannot be reached, on screen',
    plant: { file: 'src/api.js', anchor: "    if (GATEWAY.includes(res.status) && !fromPlatform) throw new Problem('unreachable');\n", with: '' },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: [
      'FAIL a gateway answering 502 with a page of its own',
      'FAIL sign-in, the platform stopped behind the development proxy (en)',
      'FAIL sign-in, the platform stopped behind the development proxy (es)',
    ],
  },
  {
    check: 'U2b-10 every sign-in answer has its own words, on screen',
    plant: { file: 'src/api.js', anchor: "  [429, 'sign_in_rate_limited', 'tooMany'],\n", with: '' },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL sign-in, too many tries from here (en)', 'FAIL sign-in, too many tries from here (es)'],
  },
  {
    check: 'U2c-1 English by default, in the browser',
    // firstLanguage put back: the browser's language decides the first visit.
    plant: [
      { file: 'src/i18n/index.js', anchor: 'export function readLanguage(storage) {', with: 'export function readLanguage(storage, browserLanguages) {' },
      {
        file: 'src/i18n/index.js',
        anchor: '  return knownLanguage(stored) ?? DEFAULT_LANGUAGE;',
        with: "  return knownLanguage(stored) ?? (String(browserLanguages?.[0] ?? '').toLowerCase().startsWith('es') ? 'es' : DEFAULT_LANGUAGE);",
      },
      { file: 'src/App.jsx', anchor: 'useState(() => readLanguage(storage));', with: 'useState(() => readLanguage(storage, navigator.languages));' },
    ],
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL English by default: a first visit from a browser set to Spanish is in English'],
  },
  {
    check: 'U2c-2 kept on the profile',
    // Saved only to browser storage.
    plant: {
      file: 'src/App.jsx',
      anchor: '      if (signedInNow.current) keepOnProfile(next);\n      else pickedOnSignIn.current = next;',
      with: '      if (!signedInNow.current) pickedOnSignIn.current = next;',
    },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL kept on the profile: signed in on a different browser, the owner sees Spanish', 'FAIL kept on the profile: Español chosen while signed in is saved to the profile'],
  },
  {
    check: 'U2c-3 chosen at sign-in is kept',
    // The save of the language picked on the sign-in screen, dropped.
    plant: { file: 'src/App.jsx', anchor: '      if (picked && picked !== profile) keepOnProfile(picked);\n', with: '' },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL chosen at sign-in: and is saved to the profile, which said English'],
  },
  {
    check: 'U2c-5 a failed save says so',
    // The sentence never shown.
    plant: { file: 'src/App.jsx', anchor: '          {languageNotKept ? (', with: '          {false && languageNotKept ? (' },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL a failed save, the platform stopped', 'FAIL a failed save, a gateway answering for it', 'FAIL a failed save, a 500'],
  },
  {
    check: 'U2c-7 every field described, on screen',
    // A column of Garage View named without its description.
    plant: { file: 'src/InsidePage.jsx', anchor: '                <FieldName t={t} name="inside.ticket" />', with: "                {t('inside.ticket')}" },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL descriptions, Garage View (en)', '"Ticket": no description under it'],
  },
  {
    check: 'U2c-7 every field described, on the print view',
    // Descriptions hidden when printed.
    plant: { file: 'src/styles.css', anchor: '  .print-head {\n    display: block;', with: '  .field-about {\n    display: none;\n  }\n  .print-head {\n    display: block;' },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL descriptions, print (Garage View) (en)', 'FAIL descriptions, print (Lanes and equipment) (en)'],
  },
  {
    check: 'U2c-fix F2 a cancelled computer is not "no lane computer yet", on screen',
    plant: { file: 'src/lanes.js', anchor: "  if (cancelled.length === 0) return { state: 'none', text: t('lane.noComputer') };", with: "  return { state: 'none', text: t('lane.noComputer') };" },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Home: a lane whose only computer had its access cancelled says', 'FAIL Home in Spanish: the lane whose only computer was cancelled says'],
  },
  {
    check: 'U2c-fix every state: "no cars inside" beside one let in, on screen',
    plant: { file: 'src/inside.js', anchor: "  else figure = unconfirmed > 0 ? t('inside.countNoneConfirmed') : t('inside.countNone');", with: "  else figure = t('inside.countNone');" },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Home: none confirmed but one let in says'],
  },
  {
    check: 'U2c-fix O2 the choosers described, on screen',
    // The choosers' descriptions hidden.
    plant: { file: 'src/styles.css', anchor: '.chooser > .field-about {\n  max-width: 28ch;', with: '.chooser > .field-about {\n  display: none;\n  max-width: 28ch;' },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL descriptions, the choosers, sign-in (en)', 'FAIL descriptions, the choosers, Settings (es)', '"Language": its description is not shown'],
  },
  {
    check: 'U2c-fix O2 Quick Find described, on screen',
    // The description moved above the typing line.
    plant: [
      { file: 'src/QuickFind.jsx', anchor: '        <p className="find-about">\n          <FieldAbout t={t} name="quickFind.label" />\n        </p>\n', with: '' },
      {
        file: 'src/QuickFind.jsx',
        anchor: '        <div className="find-input-row">',
        with: '        <p className="find-about">\n          <FieldAbout t={t} name="quickFind.label" />\n        </p>\n        <div className="find-input-row">',
      },
    ],
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL descriptions, Quick Find (en)', 'FAIL descriptions, Quick Find (es)', 'it is not under the typing line, inside the box'],
  },
  {
    check: 'U2c-fix2 Cars inside: no line says every car listed is parked',
    // The second gate's finding put back: the line under the title.
    plant: [
      {
        file: 'src/i18n/en.js',
        anchor: "  'page.inside.purpose': 'Every car your lanes let in that has not left yet, including any not confirmed inside.',",
        with: "  'page.inside.purpose': 'The cars parked in your garage right now.',",
      },
      {
        file: 'src/i18n/es.js',
        anchor: "    'Cada carro que sus carriles dejaron pasar y que todavía no ha salido, incluso los no confirmados adentro.',",
        with: "    'Los carros que están estacionados en su garaje ahora mismo.',",
      },
    ],
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: [
      'FAIL Garage View, with a car not confirmed (en)',
      '"The cars parked in your garage right now."',
      'FAIL Garage View, with a car not confirmed (es)',
      '"Los carros que están estacionados en su garaje ahora mismo."',
    ],
  },
  {
    check: 'U2c-fix2 Cars inside: no column says every car listed came in',
    // The second gate's finding put back: the time column named "Came in".
    plant: [
      { file: 'src/i18n/en.js', anchor: "  'inside.letIn': 'Let in',", with: "  'inside.letIn': 'Came in'," },
      { file: 'src/i18n/es.js', anchor: "  'inside.letIn': 'Recibió paso',", with: "  'inside.letIn': 'Entró'," },
    ],
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    // The column names are drawn in capitals; the check reports what is on screen.
    names: ['FAIL Garage View, with a car not confirmed (en)', '"CAME IN"', 'FAIL Garage View, with a car not confirmed (es)', '"ENTRÓ"'],
  },
  {
    check: 'U2c-fix2 a page with nothing on it yet says so',
    plant: { file: 'src/App.jsx', anchor: "        {t('page.notYet')}", with: '' },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    // Getting paid has something on it since U6; Garages and Rates still have nothing.
    names: ['FAIL "Garages": nothing on it yet', 'FAIL "Rates": nothing on it yet'],
  },
  {
    check: 'U3-2 garage time in a downloaded file, in the browser',
    plant: { file: 'src/files/model.js', anchor: "  const parts = new Intl.DateTimeFormat('en-US', {\n    timeZone,\n", with: "  const parts = new Intl.DateTimeFormat('en-US', {\n" },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL 2 garage time: inside (en, day): the two stays either side of the clock change at 2026-03-08 15:30:00'],
  },
  {
    check: 'U3-6 fresh read: the file built from the list the page loaded',
    plant: {
      file: 'src/parts.jsx',
      anchor: '    const data = await read(garageId);\n    const readAt = new Date();\n    flushSync(() => setState({ data, problem: null, readAt }));\n    return { data, readAt };\n  }, [read, garageId]);',
      with: '    return { data: state.data, readAt: new Date() };\n  }, [state.data]);',
    },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL 6 fresh read: the file and the screen hold the list as it was at the click (NEW0001)'],
  },
  {
    check: 'U3-6 fresh read: Print without reading the list again',
    plant: {
      file: 'src/ListActions.jsx',
      anchor: '    const asked = client.epoch();\n    try {\n',
      with: "    const asked = client.epoch();\n    if (what === 'print') {\n      print();\n      working.current = false;\n      setBusy(null);\n      return;\n    }\n    try {\n",
    },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL 6 fresh read: Print read the list again first: the printed page holds NEW0002'],
  },
  {
    check: 'U3-7 a failed read without its sentence',
    plant: { file: 'src/ListActions.jsx', anchor: '      {problem ? <ProblemNote t={t} kind={problem} /> : null}', with: '      {null}' },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL 7 a read that fails (serverError)', 'FAIL 7 a read that fails (gateway)'],
  },
  {
    check: 'U3-7 the 401 ignored: a file saved after the session ended',
    plant: [
      {
        file: 'src/ListActions.jsx',
        anchor: '      const { data, readAt } = await refresh();',
        with: "      const { data, readAt } = await refresh().catch((p) => (p.kind === 'ended' ? { data: window.__kept, readAt: new Date() } : Promise.reject(p)));",
      },
      { file: 'src/ListActions.jsx', anchor: "      if (!here.current || client.epoch() !== asked) return;\n      if (what === 'print') {", with: "      if (what === 'print') {" },
      { file: 'src/ListActions.jsx', anchor: '      // Signed out, or the page left, while it was being made: nothing is saved.\n      if (!here.current || client.epoch() !== asked) return;\n', with: '' },
      { file: 'src/ListActions.jsx', anchor: '      here.current = false;\n', with: '' },
      { file: 'src/parts.jsx', anchor: '  return { ...state, retry, refresh };', with: '  window.__kept = state.data ?? window.__kept;\n  return { ...state, retry, refresh };' },
    ],
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL 7 the read answers 401: no file saved (1 saved)'],
  },
  {
    check: 'U3-8 an inline script, with the downloads',
    plant: { file: 'index.html', anchor: '    <title></title>\n', with: '    <title></title>\n    <script>window.planted = 1;</script>\n' },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL 8 the page policy was never broken (', 'policy violation: '],
  },
  {
    check: 'U3-8 the page policy loosened',
    plant: { file: 'index.html', anchor: "script-src 'self';", with: "script-src 'self' 'unsafe-eval';" },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL 8 the page policy is exactly as it was, in index.html and in the built page'],
  },
  {
    check: 'U3 one click, one file: pressed again while busy',
    plant: [
      { file: 'src/ListActions.jsx', anchor: '    if (working.current) return;\n', with: '' },
      { file: 'src/ListActions.jsx', anchor: '        disabled={busy !== null}\n', with: '' },
    ],
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL while busy, none of the three can be pressed', 'FAIL three clicks while one file was being made'],
  },
  {
    check: "U3-6 printed from the browser's menu: no word of how old the list is",
    plant: { file: 'src/parts.jsx', anchor: '  const old = readAt && printed - readAt >= AS_OF_MS;', with: '  const old = false;' },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ["FAIL printed from the browser's menu a minute after the read"],
  },
  {
    check: "U3 the file's address kept after the save",
    plant: { file: 'src/ListActions.jsx', anchor: '  setTimeout(() => URL.revokeObjectURL(address), RELEASE_MS);\n', with: '' },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ["FAIL each file's address is let go after the save: 0 of"],
  },
  {
    check: 'U3 fix F1: a lane computer name not kept apart on screen',
    oddText: true,
    plant: { file: 'src/LanesPage.jsx', anchor: '                            <bdi>{d.name}</bdi>', with: '                            {d.name}' },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL odd text: lane computer name × screen reads in order', 'drawn out of order', 'FAIL odd text: lane computer name × screen:'],
  },
  {
    check: 'U3 fix F1: the letters the notice names not kept apart',
    oddText: true,
    plant: { file: 'src/ListActions.jsx', anchor: '                <bdi data-letter>{shownLetter(ch)}</bdi>', with: '                <span data-letter>{shownLetter(ch)}</span>' },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL odd text: garage name × notice (screen) words', 'letters kept apart false'],
  },
  {
    check: "U3 fix F1: the notice's sentence laid out as separate boxes",
    oddText: true,
    plant: [
      { file: 'src/ListActions.jsx', anchor: '          <span>\n            {before}', with: '          <>\n            {before}' },
      { file: 'src/ListActions.jsx', anchor: '            {after}\n          </span>', with: '            {after}\n          </>' },
    ],
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL odd text: garage name × notice (screen) words', 'drawn out of order'],
  },
  {
    check: 'U3 fix F2 undone, in the browser',
    oddText: true,
    plant: [
      { file: 'src/files/text.js', anchor: "    if (SPACE_LIKE.test(ch)) out += ' ';", with: '    if (SPACE_LIKE.test(ch)) out += ch;' },
      { file: 'src/files/text.js', anchor: '    else if (LEFT_OUT.some(([, rule]) => rule.test(ch))) hidden = true;', with: '    else if (LEFT_OUT.some(([, rule]) => rule.test(ch))) out += ch;' },
      { file: 'src/files/text.js', anchor: '    else if (INVISIBLE.test(ch)) hidden = true;', with: '    else if (INVISIBLE.test(ch)) out += ch;' },
    ],
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL F2 a lane named "Gx<TAB>H2": the PDF prints "Gx H2"', 'the text after the odd character was lost', 'FAIL odd text: lane name × PDF'],
  },
  {
    check: 'U3 fix 2: the hidden-characters sentence never shown, in the browser',
    oddText: true,
    plant: { file: 'src/ListActions.jsx', anchor: '      {left.hidden ? (', with: '      {false ? (' },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL odd text: garage name × notice (screen) (PDF)', 'FAIL odd text: garage name × notice (screen) (Excel)', 'hidden told false, want true'],
  },
  {
    check: 'U3 fix F3 undone, in the browser',
    oddText: true,
    plant: [
      { file: 'src/files/pdf.js', anchor: "    lines(shortName, 'bold', SIZE.garage);", with: "    lines(fullName, 'bold', SIZE.garage);" },
      { file: 'src/files/pdf.js', anchor: '      if (!fresh && (room <', with: '      if ((room <' },
    ],
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL F3 a garage name of 3,000 characters: Download PDF gives a file within 5 s of the click (none in 5 s)'],
  },
  {
    check: 'U3 fix: the garage name before the time in the file name, as shown',
    oddText: true,
    plant: { file: 'src/files/model.js', anchor: "  return `${[title, stamp, name].filter(Boolean).join(' - ')}.${extension}`;", with: "  return `${[title, name, stamp].filter(Boolean).join(' - ')}.${extension}`;" },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL odd text: garage name × file name (pdf) as shown', 'drawn before the'],
  },
  {
    check: 'U4-1 a setup step worked out in the admin, not read',
    plant: { file: 'src/SetupPage.jsx', anchor: "data-done={step.done ? 'yes' : 'no'}", with: "data-done={(step.key === 'lanes' ? step.facts.entry_lanes > 0 && step.facts.exit_lanes > 0 : step.done) ? 'yes' : 'no'}" },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Setup: the page shows each step done as the platform says (every done reversed by the platform)', 'differs at lanes'],
  },
  // ── U4b fix round: on paper, with the browser's default print ──────────
  {
    check: "U4b fix F1 the gate's plant: a tick drawn as a background only",
    plant: [
      { file: 'src/styles.css', anchor: "  .no-print,\n  .tick-box,\n", with: '  .no-print,\n' },
      { file: 'src/styles.css', anchor: '  .print-word {\n    display: inline;\n  }\n', with: '' },
    ],
    before: BUILD,
    run: ['node', 'scripts/check-print.js'],
    names: ['FAIL en Alerts: printed with backgrounds off', 'not on paper as "Yes', 'FAIL es Alertas: printed with backgrounds off', 'not on paper as "Sí'],
  },
  {
    check: 'U4b fix F1 a list prints without its name: the refused attempts told apart only by their tint',
    plant: { file: 'src/styles.css', anchor: "  .no-print,\n  .tick-box,\n", with: "  .no-print,\n  .list-head .section-title,\n  .tick-box,\n" },
    before: BUILD,
    run: ['node', 'scripts/check-print.js'],
    names: ['FAIL en Change log: printed with backgrounds off', 'the list "Refused attempts" names itself, above', 'FAIL es Registro de cambios'],
  },
  {
    check: 'U4b fix 2 check 2: a removed person shown by the id their lines hold',
    plant: { file: 'src/changes.js', anchor: "pieces.push({ words: ': ' }, { words: t('changes.person.removed') });", with: "pieces.push({ words: ': ' }, { stored: line.subject.id });" },
    before: BUILD,
    run: ['node', 'scripts/check-removed-person.js'],
    names: ['FAIL en page: "A person who was removed" for each', 'FAIL en PDF: nothing of the removed person', 'FAIL en Excel: nothing of the removed person', 'FAIL es print: nothing of the removed person'],
  },
  {
    check: 'U4b fix 2 check 2: a removed person shown by the name a line held before',
    plant: { file: 'test/stub-platform.js', anchor: '        return { ...l, subject: { ...l.subject, name: now ? now.name : null, removed: !now } };', with: "        return { ...l, subject: { ...l.subject, name: now ? now.name : 'Ravi ❺❺❺⓿❶⓿⓿❶❼❼', removed: false } };" },
    before: BUILD,
    run: ['node', 'scripts/check-removed-person.js'],
    names: ['FAIL en page: nothing of the removed person', 'FAIL es Excel: nothing of the removed person', 'FAIL en print: "A person who was removed" for each'],
  },
  {
    check: 'U4b fix 2 check 2: a row of the printed log split across two sheets',
    plant: { file: 'src/styles.css', anchor: '  tr {\n    break-inside: avoid;\n  }\n', with: '' },
    before: BUILD,
    run: ['node', 'scripts/check-removed-person.js'],
    names: ['FAIL en print: every row of the log is kept whole on one sheet (0 of', 'FAIL es print: every row of the log is kept whole on one sheet (0 of'],
  },
  {
    check: 'U4b fix F1 both answers print, the chosen one only shaded',
    plant: { file: 'src/styles.css', anchor: "  .tick-box,\n  .segment[aria-checked='false'] {\n", with: '  .tick-box {\n' },
    before: BUILD,
    run: ['node', 'scripts/check-print.js'],
    names: ['FAIL en Setup: printed with backgrounds off', 'the answer not chosen'],
  },
  // ── U4b, on screen ──────────────────────────────────────────────────────
  {
    check: 'U4b the alerts step worked out in the admin, not read',
    plant: { file: 'src/SetupPage.jsx', anchor: "data-done={step.done ? 'yes' : 'no'}", with: "data-done={(step.key === 'alerts' ? (step.facts.nobody_told ?? []).length === 0 : step.done) ? 'yes' : 'no'}" },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Setup: the page shows each step done as the platform says (every done reversed by the platform)', 'differs at alerts'],
  },
  {
    check: 'U4b a text offered to someone with no phone number',
    plant: { file: 'src/alerts.js', anchor: "export const canText = (person) => typeof person.phone === 'string' && person.phone !== '';", with: 'export const canText = () => true;' },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Alerts: no text offered to someone with no phone number'],
  },
  {
    check: 'U4b the page does not say first that alerts are not sent yet',
    plant: { file: 'src/AlertsPage.jsx', anchor: "        <p className=\"warning\" data-notice=\"not-sent-yet\">\n          {t('alerts.notSentYet')}\n        </p>\n", with: '' },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Alerts: the first thing it says is'],
  },
  {
    check: 'U4b the phone taken away without saying its texts stop',
    plant: { file: 'src/AlertsPage.jsx', anchor: '      {changes.phone === null && person.by_text.length ? (', with: '      {false ? (' },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Alerts: emptying the phone says first'],
  },
  {
    check: 'U4b "lane computer" on a page',
    plant: { file: 'src/i18n/en.js', anchor: "  'lane.noComputer': 'Not connected yet',", with: "  'lane.noComputer': 'No lane computer yet'," },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL "Home": never "lane computer" (it says "lane computer")'],
  },
  {
    check: 'U4-4 the connection code written to browser storage',
    plant: { file: 'src/LanesPage.jsx', anchor: '          setCode(made.code);\n', with: "          setCode(made.code);\n          localStorage.setItem('openparking-admin.lastCode', made.code);\n" },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL connection code: browser storage holds only the two keys'],
  },
  {
    check: 'U4-4 the connection code left on the page after the panel closes',
    plant: [
      { file: 'src/LanesPage.jsx', anchor: '          setCode(made.code);\n', with: '          setCode(made.code);\n          window.__code = made.code;\n' },
      { file: 'src/LanesPage.jsx', anchor: '      <BoardSection t={t} language={language} client={client} garage={garage} lanes={lanes.data.lanes} />\n', with: '      <BoardSection t={t} language={language} client={client} garage={garage} lanes={lanes.data.lanes} />\n      <span hidden>{window.__code}</span>\n' },
    ],
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL connection code: gone from the page when the panel closes'],
  },
  {
    check: 'U4-5 the last open lane closed without its warning',
    plant: { file: 'src/LanesPage.jsx', anchor: "      if (p?.kind === 'lastOpenLane' && !override) setLastOpen(true);", with: "      if (p?.kind === 'lastOpenLane' && !override) send(true);" },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Lanes and equipment: the last open way in warns'],
  },
  {
    check: 'U4 a confirmation in a browser dialog',
    plant: { file: 'src/LanesPage.jsx', anchor: "        onClick={async () => {\n          setProblem(null);\n          try {\n            await client.removeLane(lane.id);", with: "        onClick={async () => {\n          if (!window.confirm(t('lanes.removeAsk'))) return;\n          setProblem(null);\n          try {\n            await client.removeLane(lane.id);" },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Lanes and equipment: every confirmation was on the page, none in a browser dialog'],
  },
  {
    check: "U4 fix: the admin keeps its own quiet number",
    plant: { file: 'src/time.js', anchor: "  return minutes < quietMinutes ? { state: 'working', minutes } : { state: 'quiet', since: lastSeen };", with: "  return minutes < 5 ? { state: 'working', minutes } : { state: 'quiet', since: lastSeen };" },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL ONE SETTING: set to 30 on the platform'],
  },
  {
    check: 'U4 fix 6: "Done" beside a "Yes" that was not pressed',
    plant: { file: 'src/LanesPage.jsx', anchor: "const CLOSE_WORDS = { remove: 'lanes.panelKeep',", with: "const CLOSE_WORDS = { remove: 'lanes.panelDone'," },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Lanes and equipment: the button beside'],
  },
  {
    check: 'U4c 7: a way out offered "full"',
    plant: { file: 'src/lanes.js', anchor: "export const reasonsFor = (lane) => (lane.direction === 'exit' ? ['everyone'] : CLOSE_REASONS);", with: 'export const reasonsFor = () => CLOSE_REASONS;' },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Lanes and equipment: a way out offers only'],
  },
  {
    check: 'U4c 9: a character the screen cannot show, not named as it is typed',
    plant: { file: 'src/screen.js', anchor: '    if ((upper.length !== 1 || !drawable.has(upper[0])) && !seen.includes(c)) seen.push(c);', with: '' },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Lanes and equipment: a closing message names each character the screen cannot show', 'FAIL Lane screens: a message names the character'],
  },
  {
    check: 'U4c 13: a board message sent to no lane',
    plant: { file: 'src/BoardSection.jsx', anchor: "  const ready = text.trim() !== '' && chosen.length > 0 && cannotShow.length === 0 && !busy;", with: "  const ready = text.trim() !== '' && cannotShow.length === 0 && !busy;" },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Lane screens: a message with no lane chosen is not sent'],
  },
  {
    check: 'U4c B5: the price switched on for every lane at once',
    plant: { file: 'src/BoardSection.jsx', anchor: '      await client.setBoardPrices(lane.id, show);', with: '      for (const l of board.data.lanes) await client.setBoardPrices(l.id, show);' },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Lane screens: ...and for that lane only'],
  },
  {
    check: 'U4c fix F1: a lane removed leaves its lone message on no lane',
    plant: { file: 'test/stub-platform.js', anchor: '        board.messages = board.messages.filter((msg) => !gone.includes(msg));', with: '        for (const msg of gone) msg.lanes = [];' },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Lane screens: a lane removed takes its lone message with it'],
  },
  {
    check: 'U4c fix F1: the board not read again when the lanes change',
    plant: { file: 'src/BoardSection.jsx', anchor: '    if (lanesBefore.current === lanesNow) return;', with: '    return;' },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Lane screens: a lane added is offered for a message at once'],
  },
  {
    check: 'U4c fix F1: a lane the read does not hold, named as nothing',
    plant: { file: 'src/screen.js', anchor: "  message.lanes.map((id) => lanes.find((l) => l.id === id)).filter((l) => l !== undefined && typeof l.name === 'string' && l.name !== '');", with: "  message.lanes.map((id) => lanes.find((l) => l.id === id) ?? { id, name: '' });" },
    run: ['node', '--test', 'test/screen.test.js'],
    names: ['F1: a message is shown at real lanes only'],
  },
  {
    check: 'U4c fix F1: the messages a lane removal took, not said',
    plant: { file: 'src/changes.js', anchor: "  if (MESSAGE_LISTS.has(field) && Array.isArray(value)) return value.length ? { stored: value.map((m) => `“${m}”`).join(', ') } : { words: NOTHING };", with: '' },
    run: ['node', '--test', 'test/change-words.test.js'],
    names: ['F1: a lane removed says'],
  },
  {
    check: 'U4 fix 1: refused attempts read among the changes made',
    plant: { file: 'test/stub-platform.js', anchor: "(l.garage_id === garage.id || l.garage_id === null) && l.outcome === outcome);", with: "(l.garage_id === garage.id || l.garage_id === null) && (outcome === 'done' || l.outcome === outcome));" },
    before: BUILD,
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL Change log: no refused attempt among the changes made'],
  },
  // ── U5: the installer drawings, in a browser (scripts/check-drawings-browser.js) ──
  {
    check: 'U5 7: a set made from the last read, with no session',
    plant: { file: 'src/DrawingsPage.jsx', anchor: '      const { data, readAt } = await drawings.refresh();', with: '      const { data, readAt } = { data: drawings.data, readAt: new Date() };' },
    before: BUILD,
    run: ['node', 'scripts/check-drawings-browser.js'],
    names: ['FAIL session ended: Download PDF saves no file'],
  },
  {
    check: "U5 7: another owner's garage found",
    plant: {
      file: 'test/stub-platform.js',
      anchor: "      const garage = who.garages.find((g) => g.id === m[1]);\n      // The platform's open-stays read",
      with: "      const garage = Object.values(data).flatMap((o) => o.garages).find((g) => g.id === m[1]);\n      // The platform's open-stays read",
    },
    before: BUILD,
    run: ['node', 'scripts/check-drawings-browser.js'],
    names: ['FAIL owner B asking for owner A\'s lanes is answered "not found" (200)'],
  },
  {
    check: 'U5 fix 13 1: the page says only the main way in, as the dictionary now says (re-gate 3)',
    plant: { file: 'src/i18n/en.js', anchor: '"drawings.everyWay": "Every way in and every way out of the garage is a lane with this equipment."', with: '"drawings.everyWay": "Only the main way in is a lane with this equipment."' },
    before: BUILD,
    run: ['node', 'scripts/check-drawings-browser.js'],
    names: ['FAIL the page says every way in and out is a lane with this equipment, before download'],
  },
  // ── U6: Taxes and fees, Getting paid and Card readers, in a browser (scripts/check-money-pages.js) ──
  {
    check: "U6-1 the platform's words on screen",
    plant: [
      { file: 'src/api.js', anchor: '    if (!res.ok) {\n      const reasons', with: '    if (!res.ok) {\n      globalThis.platformSaid = data?.error;\n      const reasons' },
      { file: 'src/parts.jsx', anchor: '      <p>{t(problemKey({ kind }))}</p>', with: '      <p>{t(problemKey({ kind }))} {globalThis.platformSaid}</p>' },
    ],
    before: BUILD,
    run: ['node', 'scripts/check-money-pages.js'],
    names: ["FAIL 1 no foreign text (en), Taxes, saving, tax_set_invalid", "the platform's own words on screen"],
  },
  {
    check: "U6-2 the start of a day in the browser's zone, in the browser",
    plant: { file: 'src/taxes.js', anchor: '  const midnight = Date.UTC(y, mo - 1, d);', with: '  return garageInstant(new Date(`${day}T00:00:00`).getTime(), timeZone);\n  const midnight = Date.UTC(y, mo - 1, d);' },
    before: BUILD,
    run: ['node', 'scripts/check-money-pages.js'],
    names: ['FAIL 2 from the start of a day: 1 November 2026, New York, starts at its midnight, 04:00 UTC (sent "2026-10-31T15:00:00.000000Z"'],
  },
  {
    check: 'U6-3 a write that is not POST tax-sets',
    plant: { file: 'src/api.js', anchor: "{ method: 'POST', body: { tax_set: taxList }, byStatus: TAX_BY_STATUS }", with: "{ method: 'PUT', body: { tax_set: taxList }, byStatus: TAX_BY_STATUS }" },
    before: BUILD,
    run: ['node', 'scripts/check-money-pages.js'],
    names: ['FAIL 3 append-only', 'also PUT /api/v1/garages/'],
  },
  {
    check: "U6-4 the reader's code in browser storage",
    plant: { file: 'src/CardReadersPage.jsx', anchor: "        const sent = code.trim();\n", with: "        const sent = code.trim();\n        sessionStorage.setItem('reader', sent);\n" },
    before: BUILD,
    run: ['node', 'scripts/check-money-pages.js'],
    names: ["FAIL 4 the reader's code is not in browser storage (reader=simulated-wpe-u6check-7731)"],
  },
  {
    check: "U6-4 the reader's code in the address",
    plant: { file: 'src/CardReadersPage.jsx', anchor: "        const sent = code.trim();\n", with: "        const sent = code.trim();\n        window.history.replaceState(null, '', `${window.location.pathname}?reader=${sent}${window.location.hash}`);\n" },
    before: BUILD,
    run: ['node', 'scripts/check-money-pages.js'],
    names: ["FAIL 4 the reader's code is not in the address"],
  },
  {
    check: 'U6-5 a garage of pass holders only offered getting paid',
    // Taken for one that takes any driver: its account read, and its own words dropped.
    plant: [
      { file: 'src/GettingPaidPage.jsx', anchor: "  if (answer !== 'any') return { answer };", with: "  if (answer === 'unanswered') return { answer };" },
      { file: 'src/GettingPaidPage.jsx', anchor: "  if (answer === 'passOnly') {", with: "  if (answer === 'neverSaid') {" },
    ],
    before: BUILD,
    run: ['node', 'scripts/check-money-pages.js'],
    names: ['FAIL 5 pass holders only, Getting paid'],
  },
  {
    check: 'U6-5 a garage of pass holders only shown card readers',
    // Taken for one that takes any driver: its account read, and its own words dropped.
    plant: [
      { file: 'src/CardReadersPage.jsx', anchor: "  if (answer !== 'any') return { answer };", with: "  if (answer === 'unanswered') return { answer };" },
      { file: 'src/CardReadersPage.jsx', anchor: "  if (answer === 'passOnly') {", with: "  if (answer === 'neverSaid') {" },
    ],
    before: BUILD,
    run: ['node', 'scripts/check-money-pages.js'],
    names: ['FAIL 5 pass holders only, Card readers'],
  },
  {
    check: 'U6-5 the reader form while the account cannot take cards',
    plant: { file: 'src/CardReadersPage.jsx', anchor: '  const can = takesCards(account);', with: '  const can = Boolean(account);' },
    before: BUILD,
    run: ['node', 'scripts/check-money-pages.js'],
    names: ['FAIL 5 an account that cannot take cards: no reader form'],
  },
  {
    check: 'U6 the card-readers step of Setup leads nowhere',
    plant: { file: 'src/setup.js', anchor: "  card_readers: { page: 'readers' },", with: '  card_readers: { notYet: true },' },
    before: BUILD,
    run: ['node', 'scripts/check-money-pages.js'],
    names: ['FAIL Setup: the card_readers step says where it is done'],
  },
  // ── U7a: the owner's screens tidied (scripts/check-tidy.js) ─────────────
  {
    check: 'U7a-1 the Language and Look choosers put back in the top bar',
    plant: { file: 'src/App.jsx', anchor: '          </div>\n        </header>', with: '          </div>\n          {choosers}\n        </header>' },
    before: BUILD,
    run: TIDY,
    names: ['FAIL 1 Home (en): no Language or Look chooser', 'FAIL 1 Garage View (en): no Language or Look chooser', 'in the top bar)'],
  },
  {
    check: 'U7a-2 the old name back: "Cars inside" as the page\'s English name',
    plant: { file: 'src/i18n/en.js', anchor: "  'page.inside.title': 'Garage View',", with: "  'page.inside.title': 'Cars inside'," },
    before: BUILD,
    run: TIDY,
    names: ['FAIL 2 no shown entry of either dictionary says "Cars inside" or "Carros adentro": en page.inside.title', 'FAIL 2 Garage View printed (en)', "FAIL 2 Garage View's Excel file (en)", 'FAIL 2 Quick Find (en)'],
  },
  {
    check: 'U7a-2 the old name in the files only, in both languages',
    plant: { file: 'src/files/model.js', anchor: '      titleOf(t, list),\n', with: "      list === 'inside' ? (language === 'es' ? 'Carros adentro' : 'Cars inside') : titleOf(t, list),\n" },
    before: BUILD,
    run: TIDY,
    names: ["FAIL 2 Garage View's Excel file (en)", "FAIL 2 Garage View's PDF file (en)", "FAIL 2 Garage View's Excel file (es)", "FAIL 2 Garage View's PDF file (es)"],
  },
  {
    check: 'U7a-3 a download that takes the page on screen',
    plant: { file: 'src/files/model.js', anchor: '  const rows = data.sessions.map((s) => [', with: '  const rows = data.sessions.slice(0, 20).map((s) => [' },
    before: BUILD,
    run: TIDY,
    names: ['FAIL 3 Garage View (en): Download Excel holds all 312, not the page on screen (20 rows', 'FAIL 3 Garage View (en): Download PDF holds all 312'],
  },
  {
    check: 'U7a-3 a print that holds only the page on screen',
    plant: { file: 'src/styles.css', anchor: '@media screen {\n  .off-page,\n  .print-only {\n    display: none !important;\n  }\n}', with: '.off-page,\n.print-only {\n  display: none !important;\n}' },
    before: BUILD,
    run: TIDY,
    names: ['FAIL 3 Garage View (en): Print holds all 312', 'FAIL 3 the change log (en): Print holds all 312', 'FAIL 3 Alerts, who gets which alert'],
  },
  {
    check: 'U7a-3 a page that skips a row',
    plant: { file: 'src/parts.jsx', anchor: '  const from = at * PAGE_ROWS;', with: '  const from = at * (PAGE_ROWS + 1);' },
    before: BUILD,
    run: TIDY,
    names: ['FAIL 3 Garage View (en): 312 rows, 20 a page over 16 pages', 'missed PG0020'],
  },
  {
    check: "U7a-3 the change log read no further than the platform's first page",
    plant: { file: 'src/ChangesPage.jsx', anchor: '  } while (next !== null);', with: '  } while (false);' },
    before: BUILD,
    run: TIDY,
    names: ['FAIL 3 the change log (en): 312 rows', 'FAIL 3 the change log (en): Download Excel holds all 312'],
  },
  {
    check: 'U7a-4 Download and Print on an empty list',
    plant: {
      file: 'src/InsidePage.jsx',
      anchor: '        {stays.length ? <ListActions t={t} list="inside" language={language} client={client} garage={garage} refresh={inside.refresh} print={print} /> : null}',
      with: '        <ListActions t={t} list="inside" language={language} client={client} garage={garage} refresh={inside.refresh} print={print} />',
    },
    before: BUILD,
    run: TIDY,
    names: ['FAIL 4 an empty list shows no Download or Print: inside, empty (download-excel, download-pdf, print)'],
  },
  {
    check: "U7a-5 a person's new address with no Confirm email",
    plant: { file: 'src/AlertsPage.jsx', anchor: "  const confirming = value.email.trim() !== was.email && value.email.trim() !== '';", with: '  const confirming = false;' },
    before: BUILD,
    run: TIDY,
    names: ["FAIL 5 changing a person's address (en): Confirm email under the new one", "FAIL 5 changing a person's address (en): two different addresses are not saved"],
  },
  {
    check: 'U7a-5 two different addresses saved when a person is added',
    plant: { file: 'src/AlertsPage.jsx', anchor: '    setTried(true);\n    if (!same) return;\n    setBusy(true);', with: '    setTried(true);\n    setBusy(true);' },
    before: BUILD,
    run: TIDY,
    names: ['FAIL 5 adding a person (en): two different addresses are not saved', 'FAIL 5 adding a person (es): two different addresses are not saved'],
  },
  {
    check: 'U7a-6 Home shows the first garage whichever is chosen',
    plant: { file: 'src/Home.jsx', anchor: '      {garage ? <GarageDetail key={garage.id} t={t} language={language} client={client} garage={garage} /> : null}', with: '      {garage ? <GarageDetail key={garage.id} t={t} language={language} client={client} garage={garages[0]} /> : null}' },
    before: BUILD,
    run: TIDY,
    names: ['FAIL 6 Home, Riverside Deck chosen: its own garage below the list'],
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

// `crlf: true` also saves the whole file with Windows line ends, after the replacement.
function plantOne(dir, { file, anchor, with: replacement, crlf = false }) {
  const path = join(dir, file);
  const text = readFileSync(path, 'utf8');
  const found = text.split(anchor).length - 1;
  if (found !== 1) throw new Error(`${file}: the plant's anchor is there ${found} times, not once`);
  const planted = text.replace(anchor, replacement);
  writeFileSync(path, crlf ? planted.replace(/\r?\n/g, '\r\n') : planted);
}

const run = (dir, [cmd, ...args], env = {}) => {
  const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ...env } });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
};

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const KIND = args.includes('--browser') ? 'browser' : 'plain';
const ALL = KIND === 'browser' ? BROWSER_CONTROLS : CONTROLS;
const reportName = (i) => `fail-controls-${KIND}-shard-${i}.json`;

// A shard's report names its controls; two with one name could not be told apart.
const twice = ALL.map((c) => c.check).filter((name, at, all) => all.indexOf(name) !== at);
if (twice.length) {
  for (const name of new Set(twice)) console.error(`two controls are named "${name}"; a shard report could not tell them apart`);
  process.exit(1);
}

if (args.includes('--plan')) {
  for (const c of ALL) console.log(c.check);
  process.exit(0);
}

if (args.includes('--verify')) {
  const dir = valueOf('--verify');
  const pattern = new RegExp(`^fail-controls-${KIND}-shard-\\d+\\.json$`);
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => pattern.test(f));
  } catch {
    // reported below as no shard report
  }
  const reports = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  const wrong = [];
  if (reports.length === 0) wrong.push(`no ${KIND} shard report in ${dir}`);
  const of = [...new Set(reports.map((r) => r.of))];
  if (of.length > 1) wrong.push(`the ${KIND} shard reports disagree on the shard count: ${of.join(', ')}`);
  const n = of[0] ?? 0;
  for (let i = 1; i <= n; i += 1) {
    const count = reports.filter((r) => r.shard === i).length;
    if (count !== 1) wrong.push(`shard ${i}/${n} reported ${count} times`);
  }
  for (const r of reports) {
    if (r.kind !== KIND) wrong.push(`a report from shard ${r.shard}/${r.of} is of the ${r.kind} controls, not the ${KIND}`);
    if (!(r.shard >= 1 && r.shard <= n)) wrong.push(`a report from shard ${r.shard} of ${n}`);
  }
  const ran = reports.flatMap((r) => r.ran);
  for (const c of ALL) {
    const count = ran.filter((name) => name === c.check).length;
    if (count === 0) wrong.push(`control "${c.check}" ran in no shard`);
    if (count > 1) wrong.push(`control "${c.check}" ran ${count} times, in shards ${reports.filter((r) => r.ran.includes(c.check)).map((r) => r.shard).join(' and ')}`);
  }
  for (const name of new Set(ran)) if (!ALL.some((c) => c.check === name)) wrong.push(`"${name}" ran but is not a control`);
  for (const r of reports) for (const name of r.failed) wrong.push(`shard ${r.shard}/${r.of}: control "${name}" did not fail as required`);
  for (const r of [...reports].sort((a, b) => a.shard - b.shard)) {
    const seconds = Object.values(r.seconds).reduce((a, b) => a + b, 0);
    console.log(`  shard ${r.shard}/${r.of}: ${r.ran.length} controls, ${(seconds / 60).toFixed(1)} min`);
  }
  if (wrong.length) {
    for (const w of wrong) console.error(`  WRONG ${w}`);
    console.error(`\nthe ${KIND} controls' shards do not add up to one whole run (${wrong.length} problem(s)).`);
    process.exit(1);
  }
  console.log(`\nall ${ALL.length} ${KIND} controls ran exactly once over ${n} shards, each caught and named.`);
  process.exit(0);
}

// The measured seconds, for balancing the shards and nothing else.
const TIMES = JSON.parse(readFileSync(join(ROOT, 'scripts', 'fail-controls-times.json'), 'utf8'))[KIND];
const longest = Math.max(...Object.values(TIMES));
const cost = (c) => TIMES[c.check] ?? longest;

/** The controls of shard `i` of `n`: longest first, each to the shard with the fewest seconds so far. */
function shardOf(i, n) {
  const load = Array(n).fill(0);
  const shardAt = new Map();
  const order = ALL.map((c, at) => ({ c, at })).sort((a, b) => cost(b.c) - cost(a.c) || a.at - b.at);
  for (const { c } of order) {
    const least = load.indexOf(Math.min(...load));
    load[least] += cost(c);
    shardAt.set(c, least + 1);
  }
  return ALL.filter((c) => shardAt.get(c) === i);
}

let shard = null;
if (args.includes('--shard')) {
  const m = /^(\d+)\/(\d+)$/.exec(valueOf('--shard') ?? '');
  if (!m || Number(m[1]) < 1 || Number(m[1]) > Number(m[2])) {
    console.error(`--shard takes i/N with 1 <= i <= N, not ${JSON.stringify(valueOf('--shard'))}`);
    process.exit(1);
  }
  if (args.includes('--only')) {
    console.error('--shard runs whole shards; --only is for working on one control');
    process.exit(1);
  }
  shard = { i: Number(m[1]), n: Number(m[2]) };
}

// --only TEXT runs just the controls whose name holds TEXT (for working on one).
const only = valueOf('--only');
const controls = (shard ? shardOf(shard.i, shard.n) : ALL).filter((c) => !only || c.check.includes(only));
if (controls.length === 0) {
  console.error(shard ? `shard ${shard.i}/${shard.n} has no control` : `no control's name holds "${only}"`);
  process.exit(1);
}
if (shard) console.log(`== ${KIND} controls, shard ${shard.i} of ${shard.n}: ${controls.length} of ${ALL.length} ==\n`);
// A control that expects a line only the odd-text walk prints must walk it.
const walkLine = /^(FAIL )?(odd text|F2 |F3 )/;
const unwalked = controls.filter((c) => c.run === CHECK_DOWNLOADS && !c.oddText && c.names.some((n) => walkLine.test(n)));
if (unwalked.length) {
  for (const c of unwalked) console.error(`control "${c.check}" expects an odd-text line but is not marked oddText: true`);
  process.exit(1);
}
const failures = [];
const seconds = {};
for (const c of controls) {
  const dir = scratchCopy();
  const started = Date.now();
  try {
    plant(dir, c.plant);
    for (const step of c.before ?? []) {
      const r = run(dir, step);
      if (r.status !== 0) throw new Error(`could not prepare: ${step.join(' ')}\n${r.out}`);
    }
    const r = run(dir, c.run === CHECK_DOWNLOADS && !c.oddText ? [...c.run, '--without-odd-text'] : c.run, c.env);
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
    seconds[c.check] = Math.round((Date.now() - started) / 100) / 10;
  }
}

if (shard) {
  const ran = controls.map((c) => c.check);
  const report = { kind: KIND, shard: shard.i, of: shard.n, ran, failed: failures, seconds };
  writeFileSync(join(ROOT, reportName(shard.i)), `${JSON.stringify(report, null, 1)}\n`);
}

if (failures.length) {
  console.error(`\n${failures.length} of ${controls.length} controls did not fail as required.`);
  process.exit(1);
}
console.log(`\nfail-controls — ${controls.length} of ${controls.length} breaks were caught, each named.`);
