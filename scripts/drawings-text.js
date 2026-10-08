// How scripts/check-drawings.js reads a sheet's words: whole paragraphs, made
// alike, and traced back to where they may come from.
//
//   norm(text)       case, accents, hyphens and dashes, quotes and spaces made
//                    alike, so "Gate-Box", "gate box" and "GATE  BOX" read the same.
//   runsOf(sheet)    each paragraph, bullet, cell or label whole: the lines
//                    one run was broken into, joined again.
//   ownWords(...)    whether a text is the drawings' own: made only of the
//                    dictionary's drawing strings (with their {values} filled
//                    by the same), the number table's writings, the marks,
//                    the sheet numbers and this garage's own names and date.
//                    Anything else, a typed sentence or a name, is not.

import { DICTIONARIES } from '../src/i18n/index.js';

export const norm = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[‐-―\-_]/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

// Made alike, then every non-letter dropped (spaces, no-break spaces, hyphens,
// punctuation, digits): "card reader", "Card-Reader", "cardreader" and
// "card\u00a0reader" are all "cardreader". What checks 4 and 5 match stems in.
export const squash = (text) => norm(text).replace(/\P{L}/gu, '');

/** The sheet's text runs: { run, kind, text, items }, in the order drawn. */
export function runsOf(sheet) {
  const runs = new Map();
  for (const item of sheet.items) {
    if (item.t !== 'text' || !item.text) continue;
    if (!runs.has(item.run)) runs.set(item.run, { run: item.run, kind: item.kind, items: [] });
    runs.get(item.run).items.push(item);
  }
  return [...runs.values()].map((r) => ({ ...r, text: r.items.map((i) => i.text).join(r.kind === 'link' ? '' : ' ') }));
}

/** The keys a sheet may draw words from. */
const OWN_KEY = (key) => key.startsWith('drawings.') || key === 'app.name';

// Between two pieces: spaces and the punctuation that joins them.
const SEP = /[\s,;:·()/.]/;
const wordChar = /[\p{L}\p{N}]/u;

/**
 * A test for one language and one garage: ownWords(text) is true when text,
 * made alike, is a sequence of the allowed pieces and nothing else.
 */
export function ownWords({ language, atoms }) {
  const dictionary = DICTIONARIES[language];
  const templates = Object.entries(dictionary)
    .filter(([key]) => OWN_KEY(key))
    .map(([, text]) => {
      const parts = [];
      let last = 0;
      for (const m of text.matchAll(/\{(\w+)\}/g)) {
        if (m.index > last) parts.push({ lit: norm(text.slice(last, m.index)) || ' ' });
        parts.push({ hole: m[1] });
        last = m.index + m[0].length;
      }
      if (last < text.length) parts.push({ lit: norm(text.slice(last)) || ' ' });
      return parts.filter((p) => p.hole || p.lit.trim() || p.lit === ' ');
    })
    .filter((parts) => parts.length);
  const pieces = [...new Set(atoms.map(norm).filter(Boolean))].sort((a, b) => b.length - a.length);

  const memo = new Map();
  const ends = (s, i, depth) => {
    const out = new Set();
    const boundary = (e) => e === s.length || !wordChar.test(s[e]) || !wordChar.test(s[e - 1]);
    for (const p of pieces) if (s.startsWith(p, i) && boundary(i + p.length)) out.add(i + p.length);
    for (const parts of templates) {
      const first = parts[0];
      if (first.lit && !s.startsWith(first.lit.trimStart(), i)) continue;
      for (const e of fill(s, parts, 0, i, depth)) if (boundary(e)) out.add(e);
    }
    return out;
  };
  // Where `parts` from part k, starting at pos, can end.
  const fill = (s, parts, k, pos, depth) => {
    if (k === parts.length) return [pos];
    const part = parts[k];
    if (part.lit) {
      const lit = k === 0 ? part.lit.trimStart() : part.lit;
      const at = s.startsWith(lit, pos) ? pos : s.startsWith(lit.trim(), pos) ? pos : -1;
      if (at < 0) return [];
      const len = s.startsWith(lit, pos) ? lit.length : lit.trim().length;
      return fill(s, parts, k + 1, pos + len, depth);
    }
    if (depth <= 0) return [];
    // A {value}: up to where the next words of the template start, or anywhere if it ends the template.
    const next = parts[k + 1];
    const out = [];
    const tries = [];
    if (next?.lit) {
      const lit = next.lit.trim();
      for (let at = s.indexOf(lit, pos + 1); at >= 0; at = s.indexOf(lit, at + 1)) tries.push(at, at - 1);
    } else {
      for (let e = pos + 1; e <= s.length; e += 1) tries.push(e);
    }
    for (const e of [...new Set(tries)]) {
      if (e <= pos || e > s.length) continue;
      if (covers(s.slice(pos, e).trim(), depth - 1)) out.push(...fill(s, parts, k + 1, e, depth));
    }
    return out;
  };
  // Whether the whole of s is pieces and joins.
  const covers = (s, depth) => {
    if (!s) return false;
    const key = `${depth}\u0000${s}`;
    if (memo.has(key)) return memo.get(key);
    const reach = new Set([0]);
    for (let i = 0; i <= s.length; i += 1) {
      if (!reach.has(i)) continue;
      if (i === s.length) break;
      if (SEP.test(s[i])) {
        reach.add(i + 1);
        continue;
      }
      for (const e of ends(s, i, depth)) reach.add(e);
    }
    const ok = reach.has(s.length);
    memo.set(key, ok);
    return ok;
  };
  return (text) => covers(norm(text), 3);
}
