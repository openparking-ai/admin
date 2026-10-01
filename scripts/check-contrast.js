#!/usr/bin/env node
// Text against background is at least 4.5 : 1, by day and by night.
//
// Reads the colours from src/styles.css -- the day set on :root, and the night
// set on :root[data-theme='night'] over it -- follows each var() to its value,
// lays a see-through colour over what is behind it (a translucent text over
// its background, a translucent highlight over the panel it sits on), and
// measures every text colour against every background with the WCAG 2
// relative-luminance formula.
//
// It also reads every `color:` in styles.css: each must be one of the text
// colours measured here, or `inherit`/`currentColor`, or be listed in
// NOT_TEXT with the reason it is not held to 4.5 : 1. So a new text colour
// cannot skip this check by not being in it. NOT_TEXT entries are still
// measured and printed.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
export const MINIMUM = 4.5;
export const TEXTS = ['--text-primary', '--text-secondary'];
//: Each background, as the layers that make it, bottom first.
export const BACKGROUNDS = [
  ['--bg-page'],
  ['--bg-panel'],
  ['--bg-raised'],
  ['--bg-sunken'],
  ['--bg-panel', '--accent-soft'],
  ['--bg-raised', '--accent-soft'],
];
const NOT_TEXT = {
  '.brand-name i': {
    why: 'the ".ai" of the wordmark is the logo, set as the site sets it (WCAG 1.4.3 exempts logotypes)',
    colour: '--wordmark-end',
    on: ['--bg-panel'],
  },
};

function block(css, selector) {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no ${selector} block in styles.css`);
  const body = css.slice(at, css.indexOf('}', at));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

/** A colour as [r, g, b, a], channels 0-255, following var() references. */
function colour(vars, value, seen = new Set()) {
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  if (ref) {
    if (seen.has(ref[1]) || !(ref[1] in vars)) throw new Error(`cannot resolve ${value}`);
    seen.add(ref[1]);
    return colour(vars, vars[ref[1]], seen);
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1].split(',').map((x) => x.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  throw new Error(`not a colour this check reads: ${value}`);
}

const over = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];

function layered(vars, names) {
  let out = colour(vars, `var(${names[0]})`);
  if (out[3] !== 1) throw new Error(`${names[0]} is see-through and has nothing under it`);
  for (const n of names.slice(1)) out = over(colour(vars, `var(${n})`), out);
  return out;
}

const channel = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
export const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

export function measure(css) {
  const day = block(css, ':root');
  const night = { ...day, ...block(css, ":root[data-theme='night']") };
  const rows = [];
  const exempt = [];
  for (const [look, vars] of [['day', day], ['night', night]]) {
    for (const bgNames of BACKGROUNDS) {
      const bg = layered(vars, bgNames);
      for (const text of TEXTS) {
        rows.push({ look, text, bg: bgNames.join(' + '), ratio: ratio(over(colour(vars, `var(${text})`), bg), bg) });
      }
    }
    for (const [selector, e] of Object.entries(NOT_TEXT)) {
      for (const on of e.on) {
        const bg = layered(vars, [on]);
        exempt.push({ look, selector, text: e.colour, bg: on, ratio: ratio(over(colour(vars, `var(${e.colour})`), bg), bg) });
      }
    }
  }
  const strays = [];
  const allowed = new Set([...TEXTS.map((t) => `var(${t})`), 'inherit', 'currentColor']);
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = m[1].trim().split('\n').pop().trim();
    for (const d of m[2].matchAll(/(?:^|;|\s)color\s*:\s*([^;]+);/g)) {
      const value = d[1].trim();
      const listed = NOT_TEXT[selector];
      if (!allowed.has(value) && !(listed && value === `var(${listed.colour})`)) strays.push(`${selector}: color: ${value}`);
    }
  }
  return { rows, exempt, strays };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { rows, exempt, strays } = measure(readFileSync(join(ROOT, 'src', 'styles.css'), 'utf8'));
  for (const r of rows) {
    const mark = r.ratio >= MINIMUM ? 'ok ' : 'LOW';
    console.log(`  ${mark} ${r.look.padEnd(5)} ${r.text.padEnd(16)} on ${r.bg.padEnd(29)} ${r.ratio.toFixed(2)} : 1`);
  }
  for (const e of exempt) {
    console.log(`  --  ${e.look.padEnd(5)} ${e.text.padEnd(16)} on ${e.bg.padEnd(29)} ${e.ratio.toFixed(2)} : 1  (not held: ${NOT_TEXT[e.selector].why})`);
  }
  const low = rows.filter((r) => r.ratio < MINIMUM);
  if (low.length || strays.length) {
    if (low.length) console.error(`\n${low.length} pair(s) below ${MINIMUM} : 1.`);
    for (const s of strays) console.error(`a text colour this check does not measure: ${s}`);
    process.exit(1);
  }
  console.log(`contrast — ${rows.length} pairs, all at least ${MINIMUM} : 1.`);
}
