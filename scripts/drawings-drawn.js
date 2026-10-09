#!/usr/bin/env node
// What each test garage's sheets draw, as approved: scripts/drawings-drawn.json
// (U5 fix 16, handover 2026-10-09 10:55).
//
// The strings snapshot (scripts/drawings-strings.json) holds the dictionary,
// not which string each sheet draws: re-gate 14 swapped "2A" for "2B" in the
// lanes table, dropped the "no card reader" sentence and told a pass-only
// garage it takes any driver, all in the sheet code, and every check stayed
// green (R14-1). This file holds the drawn text itself: for each garage of
// test/drawings-fixtures.js and each language, every sheet in order, and on
// each every text the sheet draws, in drawing order -- every label, table
// cell, note, link and title-block entry -- exactly as the PDF prints it,
// with where it stands on the page (points from the top left, rounded), so
// rows reordered on the page are a change too. It is taken from the set the
// PDF is drawn from, before it is drawn, with the fonts in this repository,
// so no font on any machine changes it. A garage that gets no set holds what
// the page asks for instead.
//
// check-drawings compares the sets it makes to this file and names the
// garage, the language, the sheet and the first line that differs. The file
// changes only in the same commit as the code or string that changes what a
// sheet says, so every such change is a diff a gate reads. It is written the
// way drawings-strings.json is: a character a reader could take for another
// as \uXXXX.
//
//   node scripts/drawings-drawn.js --write    the snapshot, from the sheets the code draws now

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translate } from '../src/i18n/index.js';
import { makeDrawings } from '../src/drawings/pdf.js';
import { ANY_DRIVER, LONG_NAMES, MADE_AT, NO_LANES, PASS_ONLY, UNANSWERED } from '../test/drawings-fixtures.js';
import { serialise, shown } from './drawings-snapshot.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
export const FILE = join(ROOT, 'scripts', 'drawings-drawn.json');
export const LANGUAGES = ['en', 'es'];
/** Every test garage, by the name the check's messages use. */
export const GARAGES = { 'any driver': ANY_DRIVER, 'pass holders only': PASS_ONLY, 'long names': LONG_NAMES, 'no answer': UNANSWERED, 'no lanes': NO_LANES };

const fontFile = (name) => readFileSync(join(ROOT, 'src', 'files', 'fonts', name)).toString('binary');
export const FONTS = { regular: fontFile('DMSans-Regular.ttf'), bold: fontFile('DMSans-Bold.ttf') };

/** One set, as the PDF draws it: the sheets' texts, or what the page asks for first. */
export function build(garage, language) {
  return makeDrawings({ fonts: FONTS, t: (key, values) => translate(language, key, values), language, ...garage, madeAt: MADE_AT });
}

/** What a made set draws: { needs } or { sheets: [{ title, lane, text: ["x,y words", ...] }] }. */
export function drawnOf(made) {
  if (made.needs) return { needs: made.needs };
  return {
    sheets: made.sheets.map((sheet) => ({
      title: sheet.title,
      lane: sheet.lane,
      text: sheet.items.filter((i) => i.t === 'text' && i.text).map((i) => `${Math.round(i.x)},${Math.round(i.y)} ${i.text}`),
    })),
  };
}

/** The snapshot of what the sheets draw now; `made(name, language)` may hand back sets already made. */
export function current(made = (name, language) => build(GARAGES[name], language)) {
  return Object.fromEntries(Object.keys(GARAGES).map((name) => [name, Object.fromEntries(LANGUAGES.map((language) => [language, drawnOf(made(name, language))]))]));
}

export function committed() {
  const text = readFileSync(FILE, 'utf8');
  return { text, snapshot: JSON.parse(text) };
}

/** Where `is` (one garage, one language) first differs from `was`, in words; [] when it does not. */
export function differences(name, language, was, is) {
  const where = `${name}, ${language}`;
  if (!was) return [`${where}: not in the snapshot`];
  if (was.needs || is.needs) {
    return JSON.stringify(was.needs ?? null) === JSON.stringify(is.needs ?? null) ? [] : [`${where}: asks for ${shown(String(is.needs ?? 'nothing, a set is made'))}, snapshot ${shown(String(was.needs ?? 'nothing, a set is made'))}`];
  }
  const out = [];
  if (was.sheets.length !== is.sheets.length) out.push(`${where}: ${is.sheets.length} sheets, snapshot ${was.sheets.length}`);
  for (let n = 0; n < Math.max(was.sheets.length, is.sheets.length); n += 1) {
    const a = was.sheets[n];
    const b = is.sheets[n];
    const sheet = `${where}, sheet ${n + 1} ${shown((b ?? a).title)}${(b ?? a).lane ? ` (${(b ?? a).lane})` : ''}`;
    if (!a || !b) {
      out.push(`${sheet}: ${a ? 'not drawn' : 'drawn, not in the snapshot'}`);
      continue;
    }
    if (a.title !== b.title || a.lane !== b.lane) out.push(`${sheet}: titled ${shown(b.title)} (${b.lane}), snapshot ${shown(a.title)} (${a.lane})`);
    const at = b.text.findIndex((line, i) => line !== a.text[i]);
    const first = at >= 0 ? at : a.text.length > b.text.length ? b.text.length : -1;
    if (first >= 0) out.push(`${sheet}, line ${first + 1}: drawn ${b.text[first] === undefined ? '(nothing)' : shown(b.text[first])}, snapshot ${a.text[first] === undefined ? '(nothing)' : shown(a.text[first])}`);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  const snapshot = current();
  writeFileSync(FILE, serialise(snapshot));
  const count = (s) => (s.sheets ? `${s.sheets.length} sheets, ${s.sheets.reduce((n, x) => n + x.text.length, 0)} texts` : `no set (${s.needs})`);
  for (const [name, byLanguage] of Object.entries(snapshot)) console.log(`${name}: ${LANGUAGES.map((l) => `${l} ${count(byLanguage[l])}`).join('; ')}`);
  console.log(`wrote ${FILE}`);
}
