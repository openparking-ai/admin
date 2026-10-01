#!/usr/bin/env node
// Text against background is at least 4.5 : 1, by day and by night.
//
// Reads the colours from src/styles.css -- the day set on :root, and the night
// set on :root[data-theme='night'] over it -- and measures every text colour
// against every background, with the WCAG 2 relative-luminance formula.
//
// It also reads every `color:` in styles.css: each must be one of the text
// colours measured here, or `inherit`/`currentColor`, or be listed in
// NOT_TEXT with the reason it is not text. So a new text colour cannot skip
// this check by not being in it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
export const MINIMUM = 4.5;
export const TEXTS = ['--text-primary', '--text-secondary'];
export const BACKGROUNDS = ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--accent-soft'];
const NOT_TEXT = {
  '.brand-mark': 'colours the drawn mark only; the brand has its words beside it',
};

function block(css, selector) {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no ${selector} block in styles.css`);
  const body = css.slice(at, css.indexOf('}', at));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

function rgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
}
const channel = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

export function measure(css) {
  const day = block(css, ':root');
  const night = { ...day, ...block(css, ":root[data-theme='night']") };
  const rows = [];
  for (const [look, vars] of [['day', day], ['night', night]]) {
    for (const text of TEXTS) {
      for (const bg of BACKGROUNDS) {
        rows.push({ look, text, bg, ratio: ratio(vars[text], vars[bg]) });
      }
    }
  }
  const strays = [];
  const allowed = new Set([...TEXTS.map((t) => `var(${t})`), 'inherit', 'currentColor']);
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = m[1].trim().split('\n').pop().trim();
    for (const d of m[2].matchAll(/(?:^|;|\s)color\s*:\s*([^;]+);/g)) {
      const value = d[1].trim();
      if (!allowed.has(value) && !(selector in NOT_TEXT)) strays.push(`${selector}: color: ${value}`);
    }
  }
  return { rows, strays };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { rows, strays } = measure(readFileSync(join(ROOT, 'src', 'styles.css'), 'utf8'));
  for (const r of rows) {
    const mark = r.ratio >= MINIMUM ? 'ok ' : 'LOW';
    console.log(`  ${mark} ${r.look.padEnd(5)} ${r.text.padEnd(16)} on ${r.bg.padEnd(15)} ${r.ratio.toFixed(2)} : 1`);
  }
  const low = rows.filter((r) => r.ratio < MINIMUM);
  if (low.length || strays.length) {
    if (low.length) console.error(`\n${low.length} pair(s) below ${MINIMUM} : 1.`);
    for (const s of strays) console.error(`a text colour this check does not measure: ${s}`);
    process.exit(1);
  }
  console.log(`contrast — ${rows.length} pairs, all at least ${MINIMUM} : 1.`);
}
