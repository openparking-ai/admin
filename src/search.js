// Quick Find's index and its matching. It finds pages and settings, never
// data, in the language on screen.

import { PAGES } from './pages.js';
import { translate } from './i18n/index.js';

export const FEATURES = [
  { id: 'day', action: { theme: 'day' } },
  { id: 'night', action: { theme: 'night' } },
  { id: 'auto', action: { theme: 'auto' } },
  { id: 'en', action: { language: 'en' } },
  { id: 'es', action: { language: 'es' } },
  // U6: the settings on Taxes and fees, Getting paid and Card readers, each found and taken to its page.
  { id: 'changeTaxes', action: { page: 'taxes' } },
  { id: 'setUpPaid', action: { page: 'paid' } },
  { id: 'connectReader', action: { page: 'readers' } },
  // U7c: adding a garage, found and taken to the Garages page.
  { id: 'addGarage', action: { page: 'garages' } },
];

/** The page a setting is on, for a setting that is found on a page. */
export const pageOf = (feature) => PAGES.find((p) => p.id === feature.action?.page) ?? null;

/** Lowercase, without accents, so "cámara" and "camara" are the same. */
export const fold = (text) =>
  String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

const wordsOf = (text) => fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function entry(kind, id, title, words, extra) {
  const phrases = String(words).split(',').map(fold).filter(Boolean);
  return {
    kind,
    id,
    title,
    ...extra,
    folded: fold(title),
    titleWords: wordsOf(title),
    phrases,
    phraseWords: phrases.flatMap(wordsOf),
  };
}

/** Every page and setting, with its title and other words, in `language`. */
export function buildIndex(language) {
  const t = (key) => translate(language, key);
  return [
    ...PAGES.map((page) =>
      entry('page', page.id, t(`page.${page.id}.title`), t(`page.${page.id}.words`), { page }),
    ),
    ...FEATURES.map((feature) =>
      entry('feature', feature.id, t(`feature.${feature.id}.title`), t(`feature.${feature.id}.words`), {
        action: feature.action,
      }),
    ),
  ];
}

// Lower is better. -1 means the term is not there at all.
function scoreTerm(item, term) {
  if (item.folded.startsWith(term)) return 0;
  if (item.titleWords.some((w) => w.startsWith(term))) return 1;
  if (item.phrases.some((p) => p.startsWith(term))) return 2;
  if (item.phraseWords.some((w) => w.startsWith(term))) return 3;
  // Only the start of a word counts, as in Spotlight: "ra" is Rates, not
  // every word with "ra" somewhere inside it.
  return -1;
}

/**
 * The entries matching `query`, best first. Every word typed must match
 * somewhere. An empty query lists everything in index order.
 */
export function search(index, query) {
  const whole = fold(query);
  if (!whole) return index.slice();
  const terms = wordsOf(query);
  const scored = [];
  index.forEach((item, position) => {
    let total = 0;
    for (const term of terms) {
      const s = scoreTerm(item, term);
      if (s < 0) return;
      total += s;
    }
    // The whole query read as one phrase beats the same words found apart.
    if (item.folded === whole || item.phrases.includes(whole)) total -= 2;
    scored.push({ item, total, position });
  });
  scored.sort((a, b) => a.total - b.total || a.position - b.position);
  return scored.map((s) => s.item);
}
