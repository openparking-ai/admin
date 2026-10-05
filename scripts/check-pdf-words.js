#!/usr/bin/env node
// No word of ours is split inside the word, in any PDF (U4b fix round, F2).
//
// For every list that downloads as a PDF -- Cars inside, Lanes and equipment,
// the change log, the refused attempts and Alerts -- in English and Spanish,
// makes the PDF as the browser does from a list that holds every word these
// pages can put in each column (scripts/files/our-words.js: every action,
// refusal, field and value, every alert, every state of a lane connection,
// every month and both halves of the day, every time zone and currency the
// browser can name), reads it back with pypdf, and requires, column by
// column:
//   1  every word of every cell comes back whole, in its column: the column
//      is wide enough for the longest of our words, and lines break only at
//      spaces;
//   2  every word of every column heading comes back whole, on every page.
// A word that does not is named, with its column and language. Only what an
// owner types may break inside a word, when one word of it is longer than
// its whole column (as U3 left long names); none such is here.
//
//   node scripts/check-pdf-words.js      (FILES_PYTHON names the Python with the readers)

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsPDF } from 'jspdf';
import { translate } from '../src/i18n/index.js';
import { FILES } from '../src/files/model.js';
import { fontDraws, makePdf } from '../src/files/pdf.js';
import { printable } from '../src/files/text.js';
import { readBack } from './files/read-back.js';
import { GARAGE, LISTS, READ_AT } from './files/our-words.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIR = mkdtempSync(join(tmpdir(), 'admin-pdf-words-'));
const fontFile = (name) => readFileSync(join(ROOT, 'src', 'files', 'fonts', name)).toString('binary');
const FONTS = { regular: fontFile('DMSans-Regular.ttf'), bold: fontFile('DMSans-Bold.ttf') };

// The page as src/files/pdf.js lays it out: where each column's text starts, and its sizes.
const MARGIN = 40;
const WIDTH = 612 - 2 * MARGIN;
const PAD = 4;
const CELL_SIZE = 9;
const HEADING_SIZE = 8.5;

// What the PDF can print of a text, as the maker decides it.
const probe = new jsPDF({ unit: 'pt', format: 'letter' });
probe.addFileToVFS('DMSans-Regular.ttf', FONTS.regular);
probe.addFont('DMSans-Regular.ttf', 'DMSans', 'normal');
probe.setFont('DMSans', 'normal');
const drawable = fontDraws(probe.internal.getFont());
const words = (text) => printable(String(text), drawable).text.split(/\s+/).filter(Boolean);

const failures = [];
let passed = 0;
const check = (ok, what) => {
  if (ok) passed += 1;
  else failures.push(what);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};

/** The words of `want` that are not among `got` as often: each a word that did not come back whole. */
function notWhole(want, got) {
  const left = new Map();
  for (const w of got) left.set(w, (left.get(w) ?? 0) + 1);
  const missing = [];
  for (const w of want) {
    if (left.get(w)) left.set(w, left.get(w) - 1);
    else missing.push(w);
  }
  return [...new Set(missing)];
}

const jobs = [];
for (const [list, make] of Object.entries(LISTS)) {
  for (const language of ['en', 'es']) {
    const t = (key, values) => translate(language, key, values);
    const file = FILES[list]({ t, language, garage: GARAGE, data: make(), readAt: READ_AT });
    const { bytes } = makePdf(file, { fonts: FONTS, meaningsTitle: t('file.meanings'), pageWords: (page, pages) => t('file.page', { page, pages }) });
    const path = join(DIR, `${list}-${language}.pdf`);
    writeFileSync(path, bytes);
    jobs.push({ list, language, file, path });
  }
}

const read = readBack(jobs.map((j) => j.path));
const near = (a, b) => Math.abs(a - b) < 0.6;

console.log('No word of ours split inside the word, in any PDF:');
for (const { list, language, file, path } of jobs) {
  const pages = read[path].pages;
  let x = MARGIN;
  const columns = file.columns.map((c) => {
    const column = { ...c, x: x + PAD };
    x += c.width * WIDTH;
    return column;
  });
  for (const [i, column] of columns.entries()) {
    const want = file.rows.flatMap((row) => words(row[i].text));
    const got = [];
    for (const page of pages) {
      const lines = page.lines.filter(([lx, , size]) => near(lx, column.x) && near(size, CELL_SIZE));
      lines.sort((a, b) => b[1] - a[1]);
      for (const line of lines) got.push(...words(line[3]));
    }
    const split = notWhole(want, got);
    check(split.length === 0, `${language} ${list}, column "${column.name}": ${want.length} words of ${file.rows.length} rows${split.length ? ` -- split inside the word: ${split.slice(0, 12).map((w) => `"${w}"`).join(', ')}${split.length > 12 ? ` and ${split.length - 12} more` : ''}` : ', every one whole'}`);

    const heading = words(column.name);
    const brokenOn = [];
    for (const [p, page] of pages.entries()) {
      const lines = page.lines.filter(([lx, , size]) => near(lx, column.x) && near(size, HEADING_SIZE));
      if (!lines.length) continue;
      const missing = notWhole(heading, lines.flatMap((l) => words(l[3])));
      if (missing.length) brokenOn.push(`page ${p + 1}: ${missing.map((w) => `"${w}"`).join(', ')}`);
    }
    check(brokenOn.length === 0, `${language} ${list}, heading "${column.name}": ${brokenOn.length ? `split inside the word on ${brokenOn.slice(0, 3).join('; ')}` : `whole on all ${pages.length} pages`}`);
  }
}

rmSync(DIR, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailed:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
