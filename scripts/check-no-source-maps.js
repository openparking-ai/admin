#!/usr/bin/env node
// The built site publishes no source maps: no `.map` file and no
// `sourceMappingURL` in any file of dist/. Run `npm run build` first.
//
//   node scripts/check-no-source-maps.js

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIST = join(ROOT, 'dist');
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('no built site in dist/ — run `npm run build` first.');
  process.exit(1);
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

const built = walk(DIST);
const found = [];
for (const path of built) {
  const name = relative(ROOT, path);
  if (/\.map$/i.test(path)) found.push(`${name}: a .map file`);
  if (/\.(js|css|html)$/i.test(path) && /sourceMappingURL/.test(readFileSync(path, 'utf8'))) found.push(`${name}: sourceMappingURL`);
}
if (found.length) {
  console.error('Source maps in the built site:');
  for (const f of found) console.error(`  ${f}`);
  console.error(`\nFiles in the build: ${built.length}.`);
  process.exit(1);
}
console.log(`no source maps — ${built.length} files in the build: 0 .map files, 0 sourceMappingURL.`);
