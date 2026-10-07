// Text for a lane's screen, as the owner types it: which characters the
// screen cannot show, and how the screen will show the rest.
//
// The screen at a lane draws upper case only, from a short list of
// characters. The list is the platform's (`screen.characters` on the lanes
// and board reads), never a copy kept here. A message is taken only when
// every character, once upper-cased, is ONE character on that list -- the
// platform's own rule (its src/screenText.js) -- so the owner is told here,
// as they type and before anything is sent, every character that is not.

/** Every character of `text` the screen cannot show once upper-cased, each once, in the order typed. */
export function undrawable(text, characters) {
  if (typeof characters !== 'string' || characters === '') return [];
  const drawable = new Set([...characters]);
  const seen = [];
  for (const c of String(text ?? '')) {
    const upper = [...c.toUpperCase()];
    if ((upper.length !== 1 || !drawable.has(upper[0])) && !seen.includes(c)) seen.push(c);
  }
  return seen;
}

/** The characters as the owner reads them in a sentence: each in quotes, a space said as one. */
export const charactersSaid = (list, t) => list.map((c) => (c.trim() === '' ? t('screen.aSpace') : `“${c}”`)).join(', ');

/** How many characters fit on one line of the preview: a stand-in for the screen's own width. */
export const PREVIEW_WIDTH = 24;

/**
 * The text as the screen shows it: upper case, wrapped by words, never cut. A
 * word longer than a line is carried on to the next line whole, a piece at a
 * time, so no letter is lost.
 */
export function screenLines(text, width = PREVIEW_WIDTH) {
  const words = String(text ?? '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    let rest = word;
    if (line && line.length + 1 + rest.length <= width) {
      line = `${line} ${rest}`;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    while ([...rest].length > width) {
      const chars = [...rest];
      lines.push(chars.slice(0, width).join(''));
      rest = chars.slice(width).join('');
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The lanes a board message is shown at, as lanes of the same read of the
 * board: each a real lane with its name, in the order the message keeps
 * them. An id the read does not hold is left out, never named as nothing.
 */
export const messageLanes = (message, lanes) =>
  message.lanes.map((id) => lanes.find((l) => l.id === id)).filter((l) => l !== undefined && typeof l.name === 'string' && l.name !== '');
