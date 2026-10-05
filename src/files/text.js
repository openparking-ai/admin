// Stored text, as each file can hold it.
//
// A garage, lane or lane computer name, a plate, a region and a ticket are
// whatever the platform stored: any character at all, at any length. Both
// files carry the SAME text (U3 fix round 2): the Mac's own spreadsheet app
// cuts a cell at the first control or format character it meets, so neither
// file holds one. Visible text is never changed, nothing after a removed
// character is lost, and the screen says when something was left out. The
// stored data is untouched.

// Unicode's own list of characters no one can see on their own: controls,
// format and direction marks, zero-width characters, spaces, and the rest of
// the "default ignorable" ones (variation selectors, fillers).
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Z}\p{Default_Ignorable_Code_Point}]/u;
const SPACE_LIKE = /\p{White_Space}/u;
const MARK = /\p{M}/u;

/**
 * What neither file holds, by Unicode's own categories: every control, every
 * format character (soft hyphen, zero-width characters, direction marks…),
 * every noncharacter, and half of a character pair standing alone.
 */
export const LEFT_OUT = [
  ['control', /\p{Cc}/u],
  ['format character', /\p{Cf}/u],
  ['noncharacter', /\p{Noncharacter_Code_Point}/u],
  ['lone surrogate', /\p{Cs}/u],
];

/**
 * The text both files carry: every space-like character (tab, line and
 * paragraph breaks, form feed, every Unicode space) a plain space; every
 * character in LEFT_OUT left out, and `hidden` says so; the rest as stored.
 */
export function kept(text) {
  let out = '';
  let hidden = false;
  for (const ch of String(text)) {
    if (SPACE_LIKE.test(ch)) out += ' ';
    else if (LEFT_OUT.some(([, rule]) => rule.test(ch))) hidden = true;
    else out += ch;
  }
  return { text: out, hidden };
}

/** True for a character no one can see on its own. */
export const invisible = (ch) => INVISIBLE.test(ch);

/**
 * What the PDF can print of `text`, given the characters its font draws: the
 * text both files carry (`kept`), then only what the font has a shape for. An
 * invisible character the font cannot draw is left out and `hidden` says so; a
 * letter it cannot draw is left out and named in `missing`. Only characters
 * the font draws reach the PDF maker, so nothing in a name can cut off the text
 * after it, or turn the words around it.
 */
export function printable(text, drawable) {
  const both = kept(text);
  let out = '';
  const missing = [];
  let hidden = both.hidden;
  for (const ch of both.text) {
    if (ch === ' ' || drawable(ch)) out += ch;
    else if (INVISIBLE.test(ch)) hidden = true;
    else missing.push(ch);
  }
  return { text: out, missing, hidden };
}

/** A letter as the screen names it: a mark is shown on a dotted circle, so it has something to sit on. */
export const shownLetter = (ch) => (MARK.test(ch) ? `◌${ch}` : ch);

/** Text without any invisible character, every run of spaces one space: for a PDF's title. */
export const visibleOnly = (text) =>
  [...String(text)]
    .map((ch) => (SPACE_LIKE.test(ch) ? ' ' : INVISIBLE.test(ch) ? '' : ch))
    .join('')
    .replace(/ +/g, ' ')
    .trim();

/** The most characters an Excel cell holds (counted as Excel counts them, in UTF-16 units). */
export const EXCEL_CELL_LIMIT = 32767;

/** `text` cut to what an Excel cell holds, never splitting a character in two: { text, cut }. */
export function excelCell(text) {
  const s = String(text);
  if (s.length <= EXCEL_CELL_LIMIT) return { text: s, cut: false };
  let end = EXCEL_CELL_LIMIT;
  const last = s.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return { text: s.slice(0, end), cut: true };
}
