#!/usr/bin/env node
// Neither file maker is in the first page's JavaScript.
//
// Reads the built site (run `npm run build` first): the scripts dist/index.html
// loads, and every file those import (not the ones they only load later, on a
// click, with import()). None may be a maker's own chunk (pdfFile-, excelFile-),
// and none may carry the PDF library (its name, "jsPDF") or the zip one
// ("fflate"'s own words for a broken zip). Prints the first load's size.
//
//   node scripts/check-first-load.js

import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIST = join(ROOT, 'dist');
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('no built site in dist/ — run `npm run build` first.');
  process.exit(1);
}

const MAKERS = /(?:^|\/)(pdfFile|excelFile)-[\w-]+\.js$/;
const LIBRARIES = [
  [/jsPDF/, 'the PDF library (jsPDF)'],
  [/invalid zip data|unexpected EOF/, 'the zip library (fflate)'],
];

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const entries = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"|<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => join(DIST, m[1] ?? m[2]));

// Every file the first page loads: the entries and what they import, statically.
const first = new Set();
const queue = [...entries];
while (queue.length) {
  const file = queue.shift();
  if (first.has(file) || !existsSync(file)) continue;
  first.add(file);
  const code = readFileSync(file, 'utf8');
  for (const m of code.matchAll(/(?:\bimport\s*|\bfrom\s*)["'](\.{1,2}\/[^"']+\.js)["']/g)) queue.push(join(file, '..', m[1]));
}

const found = [];
for (const file of first) {
  const name = relative(ROOT, file).split('\\').join('/');
  if (MAKERS.test(name)) found.push(`${name}: a maker's own chunk, loaded with the first page`);
  const code = readFileSync(file, 'utf8');
  for (const [re, what] of LIBRARIES) if (re.test(code)) found.push(`${name}: ${what}, loaded with the first page`);
}

// The check's own control: the makers ARE in the build, and the markers find them there.
const later = [];
const entryCode = [...first].map((f) => readFileSync(f, 'utf8')).join('\n');
for (const kind of ['pdfFile', 'excelFile']) {
  const m = new RegExp(`import\\(["']\\./(${kind}-[\\w-]+\\.js)["']\\)`).exec(entryCode);
  if (!m) {
    found.push(`no import() of the ${kind} maker in the first page's code: the check cannot see where the makers are loaded`);
    continue;
  }
  const chunk = readFileSync(join(DIST, 'assets', m[1]), 'utf8');
  if (kind === 'pdfFile' && !LIBRARIES[0][0].test(chunk)) found.push(`the PDF library's marker is not in ${m[1]}: the check would not see it`);
  later.push(m[1]);
}

const bytes = [...first].reduce((n, f) => n + statSync(f).size, 0);
const gzipped = [...first].reduce((n, f) => n + gzipSync(readFileSync(f)).length, 0);
if (found.length) {
  console.error('A file maker in the first page:');
  for (const f of found) console.error(`  ${f}`);
  console.error(`\nFirst-load files: ${[...first].map((f) => relative(DIST, f)).join(', ')}.`);
  process.exit(1);
}
console.log(
  `first load — ${first.size} JavaScript file(s), ${bytes} bytes (${gzipped} gzipped), none of them carrying jsPDF or fflate; ` +
    `the makers load on a click: ${later.join(', ')}.`,
);
