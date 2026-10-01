#!/usr/bin/env node
// No colour from the first look is left anywhere.
//
// The first look (commit d4c9301, before the site's look) wrote its colours
// in src/styles.css and nowhere else: 25 different values, every one listed
// below. This searches src/, index.html and, when it has been built, dist/
// for any of the 25, however it is written -- #rgb, #rrggbb, #rrggbbaa,
// rgb(), rgba(), hsl(), with any spacing -- because the build may rewrite a
// colour (rgba(0, 0, 0, 0.6) as #0009). In CSS files "white" and "black" are
// searched too; elsewhere those are words in a sentence, not colours. Each
// value found is named with its file and line, and the check fails.
//
//   node scripts/check-old-colours.js

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

// Every colour literal in d4c9301:src/styles.css, each once.
const OLD = [
  '#161614', '#1a1a1a', '#1e1e1c', '#2a2a28', '#3a241c', '#666666', '#993c1d',
  '#999896', '#cc785c', '#f0eeeb', '#f0efed', '#f7f7f6', '#faece7', '#ffffff',
  'rgba(0, 0, 0, 0.08)', 'rgba(0, 0, 0, 0.15)', 'rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 0.4)',
  'rgba(0, 0, 0, 0.6)', 'rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.15)',
  'rgba(26, 26, 26, 0.04)', 'rgba(26, 26, 26, 0.05)', 'rgba(26, 26, 26, 0.08)',
  'rgba(26, 26, 26, 0.45)',
];

const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/gi;
const COLOUR_IN_CSS = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)|(?<![\w-])(?:white|black)(?![\w-])/gi;
const SCAN_TYPES = /\.(css|js|jsx|html)$/;

// The colour as red, green, blue and opacity, opacity to two places: the
// build writes 0.3 as 4d (0.302). Anything that is not a colour gives null.
export function canonical(literal) {
  const s = literal.trim().toLowerCase();
  if (s === 'white') return '255,255,255,1';
  if (s === 'black') return '0,0,0,1';
  let r, g, b, a = 1;
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else {
    const m = s.match(/^(rgba?|hsla?)\(([^)]*)\)$/);
    if (!m) return null;
    const parts = m[2].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const num = (p, scale) => (p.endsWith('%') ? (parseFloat(p) / 100) * scale : parseFloat(p));
    if (parts[3] !== undefined) a = num(parts[3], 1);
    if (m[1].startsWith('rgb')) {
      [r, g, b] = parts.slice(0, 3).map((p) => Math.round(num(p, 255)));
    } else {
      const hue = parseFloat(parts[0]) / 360;
      const sat = num(parts[1], 1);
      const light = num(parts[2], 1);
      const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
      const p = 2 * light - q;
      const channel = (t) => {
        t = (t + 1) % 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      [r, g, b] = [hue + 1 / 3, hue, hue - 1 / 3].map((t) => Math.round(channel(t) * 255));
    }
  }
  if ([r, g, b, a].some((v) => Number.isNaN(v))) return null;
  return `${r},${g},${b},${Math.round(a * 100) / 100}`;
}

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return SCAN_TYPES.test(name) ? [path] : [];
  });
}

const old = new Map(OLD.map((v) => [canonical(v), v]));
if (old.size !== 25 || old.has(null)) {
  console.error(`check-old-colours: the list holds ${old.size} different values, not the 25 of d4c9301.`);
  process.exit(1);
}

const files = [...filesUnder(join(ROOT, 'src')), join(ROOT, 'index.html'), ...filesUnder(join(ROOT, 'dist'))];
const found = [];
const values = new Set();
for (const file of files) {
  const pattern = file.endsWith('.css') ? COLOUR_IN_CSS : COLOUR;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [literal] of line.matchAll(pattern)) {
        const was = old.get(canonical(literal));
        if (!was) continue;
        values.add(was);
        found.push(`${relative(ROOT, file)}:${i + 1}: ${literal} is ${was} from the first look`);
      }
    });
}

for (const f of found) console.error(`  OLD ${f}`);
const built = existsSync(join(ROOT, 'dist')) ? ', dist/ included' : ', dist/ not built';
const summary = `check-old-colours — ${old.size} old values searched in ${files.length} files${built}: ${values.size} found, in ${found.length} places.`;
if (found.length) {
  console.error(summary);
  process.exit(1);
}
console.log(summary);
