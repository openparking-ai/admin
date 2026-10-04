// Stored text, as each file can hold it.
//
// A garage, lane or lane computer name, a plate, a region and a ticket are
// whatever the platform stored: any character at all, at any length. Each file
// either holds the text whole, or says what it left out. Nothing after an odd
// character is ever lost.

// Unicode's own list of characters no one can see on their own: controls,
// format and direction marks, zero-width characters, spaces, and the rest of
// the "default ignorable" ones (variation selectors, fillers).
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Z}\p{Default_Ignorable_Code_Point}]/u;
const SPACE_LIKE = /\p{White_Space}/u;
const BREAKING = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const CONTROL = /\p{Cc}/u;
const MARK = /\p{M}/u;

/** True for a character no one can see on its own. */
export const invisible = (ch) => INVISIBLE.test(ch);

/**
 * What the PDF can print of `text`, given the characters its font draws.
 *   - Tab, line breaks, form feed and the other space-like controls become a
 *     plain space; so does a space the font has no shape for.
 *   - Every other control, and any invisible character the font has no shape
 *     for, is left out: `hidden` says so.
 *   - A letter the font cannot draw is left out and named in `missing`.
 * Only characters the font draws reach the PDF maker, so nothing in a name can
 * cut off the text after it, or turn the words around it.
 */
export function printable(text, drawable) {
  let out = '';
  const missing = [];
  let hidden = false;
  for (const ch of String(text)) {
    if (SPACE_LIKE.test(ch) && (BREAKING.test(ch) || !drawable(ch))) out += ' ';
    else if (CONTROL.test(ch)) hidden = true;
    else if (drawable(ch)) out += ch;
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
