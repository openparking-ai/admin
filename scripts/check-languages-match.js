#!/usr/bin/env node
// English and Spanish say the same things.
//
//   - every key in one dictionary is in the other;
//   - no value is empty;
//   - no Spanish value is identical to the English, except the entries in
//     SAME_ON_PURPOSE, each with its reason;
//   - both carry the same {placeholders};
//   - every key the screens ask for exists: each t('...') written in src/, and
//     each key the screens build from the page, setting, look and language lists;
//   - each key is written once in each dictionary's source: given twice, the
//     later entry silently wins and the earlier words are never shown. Read by
//     ESLint's own parser (rule no-dupe-keys), so 'a' and "a" are one key.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Linter } from 'eslint';
import { DICTIONARIES, LANGUAGES } from '../src/i18n/index.js';
import { PAGES } from '../src/pages.js';
import { FEATURES } from '../src/search.js';
import { THEME_CHOICES } from '../src/theme.js';
import { PROBLEM_KINDS } from '../src/api.js';

export const SAME_ON_PURPOSE = {
  'app.name': 'the name of the project',
  'app.wordmark': 'the wordmark, set as the site sets it',
  'app.wordmarkEnd': 'the wordmark, set as the site sets it',
  'language.en': 'each language is shown in its own name',
  'language.es': 'each language is shown in its own name',
  'quickFind.shortcutMac': 'the keys printed on the keyboard',
  'quickFind.shortcutOther': 'the keys printed on the keyboard',
  no: '"no" is the same word in both languages',
  'drawings.unit.m': 'the metre\'s symbol, the same in both languages',
  'drawings.unit.mm': 'the millimetre\'s symbol, the same in both languages',
  'drawings.unit.length': 'a length: feet and inches, then metres in brackets, in both languages',
  'drawings.unit.category': 'the network cable\'s category, as printed on the cable',
  'drawings.unit.volts': 'the volt\'s symbol, the same in both languages',
  'drawings.unit.degrees': 'the degree sign, the same in both languages',
};

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'i18n' ? [] : sourceFiles(p);
    return /\.(js|jsx)$/.test(e.name) ? [p] : [];
  });
}

export function keysTheScreensUse() {
  const keys = new Set();
  for (const file of sourceFiles(join(ROOT, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bt\(\s*'([\w.]+)'/g)) keys.add(m[1]);
    for (const m of text.matchAll(/\bt\(\s*isMac\(\)\s*\?\s*'([\w.]+)'\s*:\s*'([\w.]+)'/g)) {
      keys.add(m[1]);
      keys.add(m[2]);
    }
  }
  for (const p of PAGES) for (const part of ['title', 'purpose', 'words']) keys.add(`page.${p.id}.${part}`);
  for (const f of FEATURES) for (const part of ['title', 'words']) keys.add(`feature.${f.id}.${part}`);
  for (const c of THEME_CHOICES) keys.add(`theme.${c}`);
  for (const l of LANGUAGES) keys.add(`language.${l}`);
  for (const k of PROBLEM_KINDS) keys.add(`problem.${k}`);
  return keys;
}

/** Each key written more than once in a dictionary's source, with the lines it is on. */
export function keysGivenTwice(language, text) {
  const lines = text.split('\n');
  const linter = new Linter({ configType: 'flat' });
  const found = linter.verify(text, { languageOptions: { ecmaVersion: 2023, sourceType: 'module' }, rules: { 'no-dupe-keys': 'error' } });
  return found.map((m) => {
    if (m.ruleId !== 'no-dupe-keys') return `${language}.js line ${m.line}: ${m.message}`;
    const key = /'(.*)'\.?$/.exec(m.message.replace(/^Duplicate key /, ''))?.[1] ?? m.message;
    const at = lines.flatMap((l, i) => (new RegExp(`^\\s*(['"])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1\\s*:`).test(l) ? [i + 1] : []));
    return `${key}: given ${at.length || 'more than one'} times in ${language}.js (lines ${at.join(', ') || m.line}); only the last is ever shown`;
  });
}

export function compare(dictionaries, used) {
  const [first, ...rest] = LANGUAGES;
  const problems = [];
  const all = new Set(LANGUAGES.flatMap((l) => Object.keys(dictionaries[l])));
  for (const key of all) {
    for (const l of LANGUAGES) {
      const value = dictionaries[l][key];
      if (value === undefined) problems.push(`${key}: missing in ${l}`);
      else if (String(value).trim() === '') problems.push(`${key}: empty in ${l}`);
    }
    for (const l of rest) {
      const a = dictionaries[first][key];
      const b = dictionaries[l][key];
      if (a === undefined || b === undefined) continue;
      if (a === b && !(key in SAME_ON_PURPOSE)) problems.push(`${key}: ${l} is the same as ${first} ("${a}")`);
      if (placeholders(a) !== placeholders(b)) problems.push(`${key}: ${first} and ${l} fill in different things`);
    }
  }
  for (const key of Object.keys(SAME_ON_PURPOSE)) {
    if (!all.has(key)) problems.push(`${key}: listed as the same on purpose, but no such entry`);
  }
  for (const key of used) {
    if (!all.has(key)) problems.push(`${key}: the screens ask for it, and no dictionary has it`);
  }
  return { problems, keys: all.size };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const used = keysTheScreensUse();
  const { problems, keys } = compare(DICTIONARIES, used);
  for (const l of LANGUAGES) problems.push(...keysGivenTwice(l, readFileSync(join(ROOT, 'src', 'i18n', `${l}.js`), 'utf8')));
  if (problems.length) {
    console.error('The two languages do not match:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  const same = Object.keys(SAME_ON_PURPOSE);
  console.log(
    `languages match — ${keys} keys in each of ${LANGUAGES.join(' and ')}; ${used.size} asked for by the screens, ` +
      `all present; each written once; same on purpose (${same.length}): ${same.join(', ')}.`,
  );
}
