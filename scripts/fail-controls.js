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
//   ... --only TEXT                          only the controls whose name holds TEXT
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

const CHECK_FILES = ['node', 'scripts/check-files.js'];
const CHECK_DOWNLOADS = ['node', 'scripts/check-downloads.js'];
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
    names: ['es: inside.ticket.about (Cars inside): missing'],
  },
  {
    check: 'U2c-7 every field described: a column named without one',
    plant: { file: 'src/InsidePage.jsx', anchor: '                <FieldName t={t} name="inside.ticket" />', with: "                {t('inside.ticket')}" },
    run: ['node', 'scripts/check-descriptions.js'],
    names: ['Cars inside (src/InsidePage.jsx:', 'a list column with no description'],
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
      anchor: "  'lanes.computers.about': 'Every computer this lane has had: how each is doing, or when access was cancelled.',",
      with: "  'lanes.computers.about': 'The computer at this lane, and when it was last heard from.',",
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
      anchor: "  'home.lanes.about': 'Cada carril, entrada o salida, y si alguna computadora suya funciona, o por qué no.',",
      with: "  'home.lanes.about': 'Cada carril, de entrada o salida, y cuándo se comunicó su computadora por última vez.',",
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
    plant: { file: 'src/App.jsx', anchor: '        <FieldName t={t} name="theme.label" />\n', with: '' },
    run: ['node', 'scripts/check-descriptions.js'],
    names: ['the top of every page (src/App.jsx:', 'a chooser with no description'],
  },
  {
    check: 'U2c-fix O2 a chooser\'s description missing in one language',
    plant: { file: 'src/i18n/es.js', anchor: "  'language.label.about': 'El idioma de estas páginas. Si ya entró, se guarda para la próxima vez.',\n", with: '' },
    run: ['node', 'scripts/check-descriptions.js'],
    names: ['es: language.label.about (the top of every page): missing'],
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
      { file: 'src/files/text.js', anchor: "    if (SPACE_LIKE.test(ch) && (BREAKING.test(ch) || !drawable(ch))) out += ' ';", with: "    if (SPACE_LIKE.test(ch) && (BREAKING.test(ch) || !drawable(ch))) out += ch;" },
      { file: 'src/files/text.js', anchor: '    else if (CONTROL.test(ch)) hidden = true;', with: '    else if (CONTROL.test(ch)) out += ch;' },
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
    check: 'U3 fix: a control character in Excel not kept as stored',
    plant: { file: 'src/files/excel.js', anchor: '      .replace(NOT_XML, hex)', with: "      .replace(NOT_XML, '\\uFFFD')" },
    run: CHECK_FILES,
    names: ['FAIL odd text: ticket × Excel', 'FAIL odd text: garage name × Excel'],
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
      'FAIL print (Cars inside): the time it was printed is garage time',
      'FAIL print (Cars inside): the time it was printed is not browser time',
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
    // A column of Cars inside named without its description.
    plant: { file: 'src/InsidePage.jsx', anchor: '                <FieldName t={t} name="inside.ticket" />', with: "                {t('inside.ticket')}" },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL descriptions, Cars inside (en)', '"Ticket": no description under it'],
  },
  {
    check: 'U2c-7 every field described, on the print view',
    // Descriptions hidden when printed.
    plant: { file: 'src/styles.css', anchor: '  .print-head {\n    display: block;', with: '  .field-about {\n    display: none;\n  }\n  .print-head {\n    display: block;' },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL descriptions, print (Cars inside) (en)', 'FAIL descriptions, print (Lanes and equipment) (en)'],
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
    names: ['FAIL descriptions, the choosers, sign-in (en)', 'FAIL descriptions, the choosers, Home (es)', '"Language": its description is not shown'],
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
      'FAIL Cars inside, with a car not confirmed (en)',
      '"The cars parked in your garage right now."',
      'FAIL Cars inside, with a car not confirmed (es)',
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
    names: ['FAIL Cars inside, with a car not confirmed (en)', '"CAME IN"', 'FAIL Cars inside, with a car not confirmed (es)', '"ENTRÓ"'],
  },
  {
    check: 'U2c-fix2 a page with nothing on it yet says so',
    plant: { file: 'src/App.jsx', anchor: "        {t('page.notYet')}", with: '' },
    before: [['npx', 'vite', 'build', '--logLevel', 'error']],
    run: ['node', 'scripts/check-browser.js'],
    names: ['FAIL "Garages": nothing on it yet', 'FAIL "Getting paid": nothing on it yet'],
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
    plant: { file: 'src/LanesPage.jsx', anchor: '                            <bdi>{d.name}</bdi>', with: '                            {d.name}' },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL odd text: lane computer name × screen reads in order', 'drawn out of order', 'FAIL odd text: lane computer name × screen:'],
  },
  {
    check: 'U3 fix F1: the letters the notice names not kept apart',
    plant: { file: 'src/ListActions.jsx', anchor: '                <bdi data-letter>{shownLetter(ch)}</bdi>', with: '                <span data-letter>{shownLetter(ch)}</span>' },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL odd text: garage name × notice (screen) words', 'letters kept apart false'],
  },
  {
    check: "U3 fix F1: the notice's sentence laid out as separate boxes",
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
    plant: [
      { file: 'src/files/text.js', anchor: "    if (SPACE_LIKE.test(ch) && (BREAKING.test(ch) || !drawable(ch))) out += ' ';", with: "    if (SPACE_LIKE.test(ch) && (BREAKING.test(ch) || !drawable(ch))) out += ch;" },
      { file: 'src/files/text.js', anchor: '    else if (CONTROL.test(ch)) hidden = true;', with: '    else if (CONTROL.test(ch)) out += ch;' },
    ],
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL F2 a lane named "Gx<TAB>H2": the PDF prints "Gx H2"', 'the text after the odd character was lost', 'FAIL odd text: lane name × PDF'],
  },
  {
    check: 'U3 fix F3 undone, in the browser',
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
    plant: { file: 'src/files/model.js', anchor: "  return `${[title, stamp, name].filter(Boolean).join(' - ')}.${extension}`;", with: "  return `${[title, name, stamp].filter(Boolean).join(' - ')}.${extension}`;" },
    before: BUILD,
    run: CHECK_DOWNLOADS,
    names: ['FAIL odd text: garage name × file name (pdf) as shown', 'drawn before the'],
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

// --only TEXT runs just the controls whose name holds TEXT (for working on one).
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt > 0 ? process.argv[onlyAt + 1] : null;
const controls = (process.argv.includes('--browser') ? BROWSER_CONTROLS : CONTROLS).filter((c) => !only || c.check.includes(only));
if (controls.length === 0) {
  console.error(`no control's name holds "${only}"`);
  process.exit(1);
}
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
