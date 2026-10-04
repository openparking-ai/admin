#!/usr/bin/env node
// Every field has a short description, in both languages.
//
// A field is anything a person reads or fills: a form field, a figure on
// Home, a column of a list. On these screens each one is named through
// <FieldName name="..." /> (src/FieldName.jsx), which draws the name and,
// under it, `<name>.about`. This check reads every screen under src/ and
// fails:
//   - a list column (<th>), a form field (<label>) or a figure on Home (a
//     section's title) that is NOT named through <FieldName>;
//   - a field whose `<name>.about` is missing or empty in either language;
//   - a description longer than MAX_WORDS words, or the same as the name.
// Each failure names the language, the field and its page.
//
//   node scripts/check-descriptions.js

import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DICTIONARIES, LANGUAGES } from '../src/i18n/index.js';

export const MAX_WORDS = 15;

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

// The page each screen file draws, by the key of its title.
const PAGE_OF = {
  'SignIn.jsx': 'signIn.title',
  'Home.jsx': 'page.home.title',
  'LanesPage.jsx': 'page.lanes.title',
  'InsidePage.jsx': 'page.inside.title',
};
const pageName = (file) => (PAGE_OF[file] ? DICTIONARIES.en[PAGE_OF[file]] : file);

const words = (text) => String(text).trim().split(/\s+/).filter(Boolean);

function screens(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'i18n' ? [] : screens(p);
    return e.name.endsWith('.jsx') && e.name !== 'FieldName.jsx' ? [p] : [];
  });
}

/** Every element `open` (a pattern for its opening tag) begins, to its `close`, with the line it starts on. */
function blocks(source, open, close) {
  const out = [];
  for (const m of source.matchAll(new RegExp(open, 'g'))) {
    const end = source.indexOf(close, m.index);
    if (end === -1) continue;
    out.push({ text: source.slice(m.index, end + close.length), line: source.slice(0, m.index).split('\n').length });
  }
  return out;
}

/** The fields each screen names, and the places that show a field without <FieldName>. */
export function readScreens(files) {
  const fields = [];
  const unnamed = [];
  for (const { file, source } of files) {
    const page = pageName(file);
    for (const m of source.matchAll(/<FieldName\b[^>]*\bname="([\w.]+)"/g)) fields.push({ key: m[1], page, file });
    const kinds = [
      ['a list column', blocks(source, '<th[\\s>]', '</th>')],
      ['a form field', blocks(source, '<label[\\s>]', '</label>')],
      // A figure on Home: each section's title.
      ...(file === 'Home.jsx' ? [['a figure on Home', blocks(source, '<h2 className="section-title"', '</h2>')]] : []),
    ];
    for (const [kind, found] of kinds) {
      for (const b of found) {
        if (!/<FieldName\b/.test(b.text)) unnamed.push(`${page} (src/${file}:${b.line}): ${kind} with no description: ${b.text.replace(/\s+/g, ' ').slice(0, 80)}`);
      }
    }
  }
  return { fields, unnamed };
}

export function checkDescriptions(fields, dictionaries) {
  const problems = [];
  for (const { key, page } of fields) {
    for (const language of LANGUAGES) {
      const about = dictionaries[language][`${key}.about`];
      const where = `${language}: ${key}.about (${page})`;
      if (about === undefined) problems.push(`${where}: missing`);
      else if (String(about).trim() === '') problems.push(`${where}: empty`);
      else {
        const n = words(about).length;
        if (n > MAX_WORDS) problems.push(`${where}: ${n} words, more than ${MAX_WORDS}`);
        if (String(about).trim() === String(dictionaries[language][key] ?? '').trim()) problems.push(`${where}: says no more than the name`);
      }
    }
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = screens(join(ROOT, 'src')).map((p) => ({ file: basename(p), source: readFileSync(p, 'utf8') }));
  const { fields, unnamed } = readScreens(files);
  const problems = [...unnamed, ...checkDescriptions(fields, DICTIONARIES)];
  if (fields.length === 0) problems.push('no field found on any screen; the check is not seeing the screens');
  if (problems.length) {
    console.error('Fields without a short description:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  const pages = [...new Set(fields.map((f) => f.page))];
  console.log(
    `descriptions — ${fields.length} fields on ${pages.length} pages (${pages.join(', ')}), each described in ` +
      `${LANGUAGES.join(' and ')} in at most ${MAX_WORDS} words; every list column, form field and Home figure is named with its description.`,
  );
}
