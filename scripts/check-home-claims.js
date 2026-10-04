#!/usr/bin/env node
// Home says only what it shows.
//
// The platform returns no breakdown of the cars inside by kind of customer,
// so Home shows none, and none of Home's words may promise one: neither its
// one-sentence description nor anything drawn on it, in either language.
// The words Home draws are every dictionary key its screen asks for
// (src/Home.jsx, and src/lanes.js for the lanes' words), each field's name
// and description, and the page's own title and description.
//
// If the platform starts returning a breakdown and Home shows it, this
// check changes with it.
//
//   node scripts/check-home-claims.js

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DICTIONARIES } from '../src/i18n/index.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

// The kinds of customer, as each language says them, without accents.
const KINDS = {
  en: ['garage pass', 'monthly', 'transient', 'registered'],
  es: ['pase de garaje', 'mensual', 'visitante', 'registrado'],
};
const fold = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const source = ['Home.jsx', 'lanes.js'].map((f) => readFileSync(join(ROOT, 'src', f), 'utf8')).join('\n');
// A field named through <FieldName name="..." /> draws its name and its description.
const fields = [...source.matchAll(/<FieldName\b[^>]*\bname="([\w.]+)"/g)].flatMap((m) => [m[1], `${m[1]}.about`]);
const keys = new Set(['page.home.title', 'page.home.purpose', ...[...source.matchAll(/\bt\(\s*'([\w.]+)'/g)].map((m) => m[1]), ...fields]);

const found = [];
for (const [language, dictionary] of Object.entries(DICTIONARIES)) {
  for (const key of keys) {
    const text = fold(dictionary[key] ?? '');
    for (const kind of KINDS[language]) if (text.includes(kind)) found.push(`${language}: ${key}: "${kind}"`);
  }
}
if (keys.size < 10) found.push(`only ${keys.size} keys read from src/Home.jsx and src/lanes.js; the scan is not seeing the screen`);
if (found.length) {
  console.error('Home promises a breakdown by kind of customer that it does not show:');
  for (const f of found) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`home says only what it shows — ${keys.size} entries Home draws, in en and es: no kind of customer named.`);
