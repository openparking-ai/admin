// The texts scripts/check-drawings.js leans on, read from the snapshot of
// every drawing string (scripts/drawings-strings.json, U5 fix 13), never
// from the dictionary.
//
// A check that takes an exception, a claim's lanes or a number's writing from
// t(key) follows whatever that string is edited to say: "No card reader."
// edited to "A card reader at the window." was still an exception, and stayed
// green. These texts follow only the snapshot, and check 0 holds the
// dictionary to the snapshot exactly, every string, so this file names keys
// and keeps no text of its own: there is no second copy.
//
//   saysNone   4: the only texts on a pass-only set that may hold the card
//              reader's stem, each saying there is none.
//   everyLane  "Every lane": the claims (their lanes are the claim's own,
//              below), and the equipment words they are read for.
//   writing    1 and 3: how a number is written, and the title block's
//              "3 of 10". A digit is what these checks look for.

import { endOnce } from '../src/i18n/index.js';
import { committed } from './drawings-snapshot.js';

export const PINNED = {
  saysNone: ['drawings.stop.passOnly', 'drawings.entryType.passOnly', 'drawings.type.exitNoReader', 'drawings.how2B.noReader'],
  everyLane: ['drawings.about.oneComputer', 'drawings.about.alsoAtExit', 'drawings.about.alsoEveryLane', 'drawings.wiring.scanner', 'drawings.item.cardReader', 'drawings.wiring.intercom'],
  writing: ['drawings.unit.ft', 'drawings.unit.in', 'drawings.unit.m', 'drawings.unit.mm', 'drawings.unit.length', 'drawings.unit.turns', 'drawings.unit.twist', 'drawings.unit.category', 'drawings.unit.volts', 'drawings.unit.amps', 'drawings.unit.degrees', 'drawings.tb.sheetOf'],
};

/** The lanes each "Every lane" claim speaks of. Fixed here: an edit to the text cannot move them. */
export const CLAIMS = [
  { key: 'drawings.about.oneComputer', on: () => true },
  { key: 'drawings.about.alsoAtExit', on: (plan) => plan.kind === 'exit' },
  { key: 'drawings.about.alsoEveryLane', on: () => true },
];

const { snapshot } = committed();

/** Every way the table writes a number in this language, as the snapshot holds them. */
export const writings = (language) => snapshot.writings[language];

/**
 * A t() for one language that knows only the keys named above, filled as the
 * dictionary fills them, with the snapshot's text. Any other key throws: a
 * check given this t reads nothing the dictionary can change under it.
 */
export function pinnedWords(language) {
  const known = new Set(Object.values(PINNED).flat());
  return (key, values) => {
    if (!known.has(key)) throw new Error(`"${key}" is not one of the texts the checks lean on: scripts/drawings-pinned.js`);
    const text = snapshot[language][key];
    if (text === undefined) throw new Error(`"${key}" is not in the snapshot: scripts/drawings-strings.json`);
    return values ? endOnce(text.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole))) : text;
  };
}
