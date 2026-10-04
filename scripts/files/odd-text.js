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

export const FILE_SECONDS = 5;

const hex = (c) => `U+${c.toString(16).toUpperCase().padStart(4, '0')}`;
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const one = (group, code, label) => ({ id: label ?? hex(code), group, text: String.fromCodePoint(code) });

/** The brief's case set: every C0 and C1 control, DEL, the direction marks, zero-width characters, and the rest. */
export const CASES = [
  ...range(0x00, 0x1f).map((c) => one('C0 control', c)),
  one('DEL', 0x7f),
  ...range(0x80, 0x9f).map((c) => one('C1 control', c)),
  ...[0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x061c].map((c) => one('direction mark', c)),
  ...[0x200b, 0x200c, 0x200d, 0x2060, 0xfeff].map((c) => one('zero-width', c)),
  one('NBSP', 0x00a0),
  one('line separator', 0x2028),
  one('paragraph separator', 0x2029),
  { id: 'e + U+0301', group: 'combining mark', text: 'é' },
  { id: 'U+20DD alone', group: 'combining mark', text: '⃝' },
  { id: 'Arabic', group: 'Arabic', text: 'مرآب الميناء' },
  { id: 'Hebrew', group: 'Hebrew', text: 'חניון הנמל' },
  { id: 'Chinese', group: 'Chinese', text: '港口停车场' },
  { id: 'emoji', group: 'emoji', text: '🚗👨‍👩‍👧🇺🇸👍🏽' },
  // Not in the brief's list: the Excel file's own escape, written as text, must come back as text.
  { id: '"_x0041_" as text', group: 'Excel escape', text: '_x0041_' },
];

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

/** The characters a TrueType font has a shape for, read from its cmap table (formats 4 and 12). */
export function fontCharacters(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cmap = -1;
  for (let i = 0; i < v.getUint16(4); i += 1) {
    const at = 12 + 16 * i;
    if (String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3)) === 'cmap') cmap = v.getUint32(at + 8);
  }
  if (cmap < 0) throw new Error('the font has no cmap table');
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
          const glyph = offset === 0 ? (c + delta) & 0xffff : v.getUint16(offsets + s + offset + 2 * (c - start));
          if (glyph !== 0) has.add(c);
        }
      }
    } else if (format === 12) {
      for (let g = 0; g < v.getUint32(t + 12); g += 1) {
        const at = t + 16 + 12 * g;
        for (let c = v.getUint32(at); c <= v.getUint32(at + 4); c += 1) has.add(c);
      }
    }
  }
  return has;
}

/**
 * What the PDF must print of `text`, given the font's characters: space-like
 * controls and separators as a space; other controls and invisible characters
 * the font lacks, left out (`hidden`); letters the font lacks, left out and
 * named (`letters`); the rest, as stored.
 */
export function pdfExpect(text, font) {
  let out = '';
  let hidden = false;
  const letters = [];
  for (const ch of String(text)) {
    const has = font.has(ch.codePointAt(0));
    const space = /\p{White_Space}/u.test(ch);
    if (space && (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(ch) || !has)) out += ' ';
    else if (/\p{Cc}/u.test(ch)) hidden = true;
    else if (has) out += ch;
    else if (INVISIBLE.test(ch)) hidden = true;
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
