#!/usr/bin/env node
// Nothing readable outside the dictionaries.
//
// Runs the no-readable-literal lint rule (scripts/eslint-readable-text.js)
// alone over every file under src/, and reads index.html, whose only text
// would be its <title> or something in <body>. Fails naming each file.

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

const eslint = new ESLint({
  cwd: ROOT,
  overrideConfig: { rules: { 'local/jsx-uses-vars': 'off' } },
});
const results = await eslint.lintFiles(['src/**/*.{js,jsx}']);

const problems = [];
for (const r of results) {
  for (const m of r.messages) {
    if (m.ruleId === 'local/no-readable-literal' || m.fatal) {
      problems.push(`${relative(ROOT, r.filePath)}:${m.line}: ${m.message}`);
    }
  }
}

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '').replace(/<[^>]*>/g, '');
if (/\p{L}/u.test(title)) problems.push(`index.html: words in <title>: "${title.trim()}"`);
if (/\p{L}/u.test(body)) problems.push(`index.html: words in <body>: "${body.trim().slice(0, 40)}"`);

if (problems.length) {
  console.error('Readable words outside the dictionaries:\n');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`no readable words outside the dictionaries — ${results.length} files under src/ and index.html.`);
