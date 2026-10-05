// Odd stored text, for scripts/check-files.js and scripts/check-downloads.js.
//
// The platform stores a garage, lane or lane computer name, a plate, a region
// and a ticket as any text at all. Every case below goes through every output
// (screen, print, PDF, Excel, file name, the notice), and each must end one of
// two ways: the text is there whole, or the owner is told in plain words what
// was left out. Text after an odd character is never lost; the words around a
// name are never reordered; every file is made within FILE_SECONDS.
//
// What each output must hold is worked out HERE, from Unicode's categories and
// from the font file's own character map (read below), not by the screens' code.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PYTHON } from './read-back.js';

const HERE = join(fileURLToPath(import.meta.url), '..');

export const FILE_SECONDS = 5;

// ── The case set, from Unicode's own tables (scripts/files/unicode-cases.py) ─
// Built by Python's unicodedata at the version pinned there, so no category is
// left to memory: every Cc, Cf, Zs, Zl, Zp and noncharacter, and samples of
// lone surrogates, marks, private use and unassigned code points.
const generated = (() => {
  const r = spawnSync(PYTHON, [join(HERE, 'unicode-cases.py')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`the case set could not be built (${PYTHON}):\n${r.stderr}${r.error ? r.error.message : ''}`);
  return JSON.parse(r.stdout);
})();
/** The Unicode version of the tables the cases and their expectations come from. */
export const UNICODE = generated.version;
/** How many cases of each kind. */
export const CASE_COUNTS = generated.counts;
/** Every case: { id, group, text }. */
export const CASES = generated.cases;

/** A code point's general category, from those tables (not from this node's). */
export function categoryOf(cp) {
  const ranges = generated.ranges;
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid][0]) hi = mid - 1;
    else if (cp > ranges[mid][1]) lo = mid + 1;
    else return ranges[mid][2];
  }
  throw new Error(`no category for U+${cp.toString(16)}`);
}
const SPACE_CONTROLS = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x85]);
const noncharacter = (cp) => (cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe;
/** Unicode's White_Space: every Zs, Zl and Zp, and tab, line feed, VT, form feed, CR and NEL. */
export const whiteSpace = (cp) => SPACE_CONTROLS.has(cp) || ['Zs', 'Zl', 'Zp'].includes(categoryOf(cp));
/** What chat's rule does with a character: 'space', 'kept', or the kind it is left out as. */
export function ruleFor(cp) {
  if (whiteSpace(cp)) return 'space';
  const gc = categoryOf(cp);
  if (gc === 'Cc') return 'control';
  if (gc === 'Cf') return 'format character';
  if (noncharacter(cp)) return 'noncharacter';
  if (gc === 'Cs') return 'lone surrogate';
  return 'kept';
}

/**
 * The text both files must carry (U3 fix round 2, chat's rule), worked out
 * from the tables: a space-like character is a plain space; every control,
 * format character, noncharacter and lone surrogate is left out (`hidden`);
 * the rest as stored.
 */
export function keptExpect(text) {
  let out = '';
  let hidden = false;
  for (const ch of String(text)) {
    const rule = ruleFor(ch.codePointAt(0));
    if (rule === 'space') out += ' ';
    else if (rule === 'kept') out += ch;
    else hidden = true;
  }
  return { text: out, hidden };
}

/**
 * Where this node's Unicode and the tables' disagree about a case's
 * characters, for the rule: a newer Unicode could have filled an "unassigned"
 * sample, or moved a character between categories. Each disagreement is named.
 */
export function unicodeDisagreements() {
  const node = (ch) => {
    if (/\p{White_Space}/u.test(ch)) return 'space';
    if (/\p{Cc}/u.test(ch)) return 'control';
    if (/\p{Cf}/u.test(ch)) return 'format character';
    if (/\p{Noncharacter_Code_Point}/u.test(ch)) return 'noncharacter';
    if (/\p{Cs}/u.test(ch)) return 'lone surrogate';
    return 'kept';
  };
  const out = [];
  for (const c of CASES) {
    for (const ch of c.text) {
      const cp = ch.codePointAt(0);
      const gc = categoryOf(cp);
      if (node(ch) !== ruleFor(cp) || !new RegExp(`\\p{gc=${gc}}`, 'u').test(ch)) out.push(`U+${cp.toString(16).toUpperCase()} (${gc} in ${UNICODE})`);
    }
  }
  return [...new Set(out)];
}

/** A name that is only spaces, and the four lengths. */
export const SPACES = '   ';
export const LENGTHS = [3000, 8000, 40000, 100000];

/**
 * A case inside visible text, with its own marker before and after:
 * `${field}${n}x<case>y${n}`. If the text after the odd character were lost,
 * "y{n}" would be missing, and no other case can stand in for it.
 */
export const token = (field, n, text) => `${field}${n}x${text}y${n}`;

/**
 * `length` characters with no space at all (so the PDF must break inside a
 * word), numbered, so an out-of-order or missing piece shows: "Ñ00001-Ñ00002-…".
 */
export function longText(length, letter = 'Ñ') {
  let s = '';
  for (let i = 1; s.length < length; i += 1) s += `${letter}${String(i).padStart(5, '0')}-`;
  return s.slice(0, length);
}

// ── Unicode, as this check reads it ─────────────────────────────────────────
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Z}\p{Default_Ignorable_Code_Point}]/u;
export const isInvisible = (ch) => INVISIBLE.test(ch);
/** Anything in a sentence on screen that is not a plain space and cannot be seen. */
export const invisibleIn = (text) => [...String(text)].filter((ch) => ch !== ' ' && INVISIBLE.test(ch));

/**
 * The characters a TrueType font has a real shape for, read from its own
 * tables: the cmap (formats 4 and 12) names a glyph other than glyph 0, and
 * that glyph has an outline in glyf (its loca entry is not empty), unless the
 * character is a space.
 */
export function fontCharacters(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = {};
  for (let i = 0; i < v.getUint16(4); i += 1) {
    const at = 12 + 16 * i;
    tables[String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3))] = v.getUint32(at + 8);
  }
  if (tables.cmap === undefined || tables.loca === undefined || tables.head === undefined) throw new Error('the font has no cmap, loca or head table');
  const cmap = tables.cmap;
  const longLoca = v.getInt16(tables.head + 50) === 1;
  const outlineAt = (g) => (longLoca ? v.getUint32(tables.loca + 4 * g) : 2 * v.getUint16(tables.loca + 2 * g));
  const shaped = (c, glyph) => glyph !== 0 && (whiteSpace(c) || outlineAt(glyph + 1) > outlineAt(glyph));
  const has = new Set();
  for (let i = 0; i < v.getUint16(cmap + 2); i += 1) {
    const t = cmap + v.getUint32(cmap + 4 + 8 * i + 4);
    const format = v.getUint16(t);
    if (format === 4) {
      const seg2 = v.getUint16(t + 6);
      const ends = t + 14;
      const starts = ends + seg2 + 2;
      const deltas = starts + seg2;
      const offsets = deltas + seg2;
      for (let s = 0; s < seg2; s += 2) {
        const end = v.getUint16(ends + s);
        const start = v.getUint16(starts + s);
        const delta = v.getUint16(deltas + s);
        const offset = v.getUint16(offsets + s);
        for (let c = start; c <= end && c !== 0xffff; c += 1) {
          let glyph = offset === 0 ? (c + delta) & 0xffff : v.getUint16(offsets + s + offset + 2 * (c - start));
          if (offset !== 0 && glyph !== 0) glyph = (glyph + delta) & 0xffff;
          if (shaped(c, glyph)) has.add(c);
        }
      }
    } else if (format === 12) {
      for (let g = 0; g < v.getUint32(t + 12); g += 1) {
        const at = t + 16 + 12 * g;
        for (let c = v.getUint32(at); c <= v.getUint32(at + 4); c += 1) if (shaped(c, v.getUint32(at + 8) + (c - v.getUint32(at)))) has.add(c);
      }
    }
  }
  return has;
}

/**
 * What the PDF must print of `text`, given the font's characters: the text
 * both files carry (keptExpect), then of that only what the font draws; an
 * invisible character it lacks is left out (`hidden`), a letter it lacks is
 * left out and named (`letters`).
 */
export function pdfExpect(text, font) {
  const both = keptExpect(text);
  let out = '';
  let hidden = both.hidden;
  const letters = [];
  for (const ch of both.text) {
    const cp = ch.codePointAt(0);
    if (ch === ' ' || font.has(cp)) out += ch;
    else if (['Cc', 'Cf', 'Cs', 'Co', 'Cn', 'Zs', 'Zl', 'Zp'].includes(categoryOf(cp)) || /\p{Default_Ignorable_Code_Point}/u.test(ch)) hidden = true;
    else letters.push(ch);
  }
  return { text: out, hidden, letters };
}

/** Text as the PDF reader gives it, with every run of white space one space. */
export const plain = (text) => String(text).replace(/[\s  ]+/g, ' ').trim();
/** Text with no white space at all: a long text read back from lines broken anywhere. */
export const squash = (text) => String(text).replace(/[\s  ]+/g, '');

// ── The PDF's layout, as the reader sees it (src/files/pdf.js) ──────────────
const MARGIN = 40;
const WIDTH = 612 - 2 * MARGIN;
const PAD = 4;
export const SIZES = { garage: 13, list: 11, cell: 9 };

/** Where a column's cells start, in points from the left. */
export function columnX(columns, index) {
  return MARGIN + columns.slice(0, index).reduce((sum, c) => sum + c.width * WIDTH, 0) + PAD;
}

/** Every line of a column's cells, page after page, joined: what that column holds. */
export function columnText(pages, x) {
  return pages
    .flatMap((p) => p.lines)
    .filter(([lx, , size]) => Math.abs(lx - x) < 0.5 && Math.abs(size - SIZES.cell) < 0.01)
    .map((l) => l[3])
    .join('\n');
}

/**
 * The garage's name in the PDF: page 1's name lines, and on later pages any
 * that carry it on after the head; and each later page's name at the top,
 * which must be cut to two lines.
 */
export function garageLines(pages) {
  const whole = [];
  const tops = [];
  pages.forEach((p, i) => {
    const named = p.lines.filter(([, , size]) => Math.abs(size - SIZES.garage) < 0.01 || Math.abs(size - SIZES.list) < 0.01);
    if (i === 0) {
      whole.push(...named.filter((l) => Math.abs(l[2] - SIZES.garage) < 0.01).map((l) => l[3]));
      return;
    }
    const head = named.findIndex((l) => Math.abs(l[2] - SIZES.list) < 0.01);
    tops.push(named.slice(0, head).map((l) => l[3]));
    whole.push(...named.slice(head + 1).filter((l) => Math.abs(l[2] - SIZES.garage) < 0.01).map((l) => l[3]));
  });
  return { whole: whole.join('\n'), tops };
}

// ── The file name ───────────────────────────────────────────────────────────
export const REFUSED_IN_NAMES = /[/\\:*?"<>|\p{Cc}\p{Cf}]/u;
