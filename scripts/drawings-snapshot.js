#!/usr/bin/env node
// Every text a drawing sheet may hold, as approved: scripts/drawings-strings.json
// (U5 fix 13, handover 2026-10-08 20:30).
//
// Each round before this one pinned the strings someone happened to name, and
// the next gate found the next one nobody had named. This file holds them all:
// the exact text, byte for byte and made alike in no way, of every drawings.*
// key (and app.name, which a sheet's title block draws) in English and
// Spanish, and every way the number table writes a number in each language
// (what check 1 reads a sheet's numbers against). check-drawings' check 0
// compares the dictionaries and the table to it: a string added, removed or
// changed -- punctuation, case, a space, a look-alike letter -- is named by
// key and language. The checks that lean on a text (4's exceptions, the
// "Every lane" claims, how a number is written) read it from here, never from
// t(key), so there is no second copy.
//
// The snapshot changes only in the same commit as the string, so every change
// of wording is a diff a gate reads. In the file, any character a reader could
// take for another is written as \uXXXX: a no-break space, a Cyrillic "о".
// Only printable ASCII, the Spanish letters and marks, and the six signs the
// sheets use are written as themselves; check 0 refuses a file that is not
// written this way, so a look-alike cannot sit in it unseen.
//
//   node scripts/drawings-snapshot.js --write    the snapshot, from the dictionaries now

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DICTIONARIES, translate } from '../src/i18n/index.js';
import { everyWriting } from '../src/drawings/numbers.js';

export const FILE = join(fileURLToPath(import.meta.url), '..', 'drawings-strings.json');
export const LANGUAGES = ['en', 'es'];

/** The keys a sheet may draw words from (as scripts/drawings-text.js reads them). */
export const SHEET_KEY = (key) => key.startsWith('drawings.') || key === 'app.name';

// Written as themselves in the file: printable ASCII, the Spanish letters and
// marks, and … ° × · “ ”. Everything else is \uXXXX.
const PLAIN = /[\x20-\x7e áéíóúüñÁÉÍÓÚÜÑ¿¡…°×·“”]/u;

/** The snapshot of the dictionaries and the table as they are now. */
export function current() {
  const out = {};
  for (const language of LANGUAGES) {
    const dictionary = DICTIONARIES[language];
    out[language] = Object.fromEntries(Object.keys(dictionary).filter(SHEET_KEY).sort().map((key) => [key, dictionary[key]]));
  }
  // A unit's words removed would stop the writing: said as a writing of its own, so check 0 names it.
  const writings = (language) => {
    try {
      return everyWriting((key, values) => translate(language, key, values));
    } catch (error) {
      return [`(the table cannot write its numbers: ${error.message})`];
    }
  };
  out.writings = Object.fromEntries(LANGUAGES.map((language) => [language, writings(language)]));
  return out;
}

// A character a reader could take for another, as \uXXXX.
const visible = (text) => [...text].map((c) => (PLAIN.test(c) || c === '\n' ? c : [...c].map((u) => `\\u${u.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''))).join('');

/** The file's one way of being written. */
export const serialise = (snapshot) => `${visible(JSON.stringify(snapshot, null, 2))}\n`;

/** A string in a message, quoted, written as the file writes it: a no-break space and a plain one read differently. */
export const shown = (text) => visible(JSON.stringify(text));

/** The file as committed: its text, and what it holds. */
export function committed() {
  const text = readFileSync(FILE, 'utf8');
  return { text, snapshot: JSON.parse(text) };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  const snapshot = current();
  writeFileSync(FILE, serialise(snapshot));
  console.log(`wrote ${FILE}: ${LANGUAGES.map((l) => `${l} ${Object.keys(snapshot[l]).length} strings, ${snapshot.writings[l].length} writings`).join('; ')}`);
}
