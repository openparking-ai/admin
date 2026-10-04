import en from './en.js';
import es from './es.js';

export const DICTIONARIES = { en, es };
export const LANGUAGES = ['en', 'es'];
export const LANGUAGE_KEY = 'openparking-admin.language';

/** English, unless someone chose otherwise. The browser's own language decides nothing. */
export const DEFAULT_LANGUAGE = 'en';

/** `language` if it is one these screens have words for, else null. */
export const knownLanguage = (language) => (LANGUAGES.includes(language) ? language : null);

/**
 * The language last used on this computer, else English. Signed in, the
 * owner's profile decides instead (src/App.jsx); this is what the sign-in
 * screen speaks, when nobody is known yet.
 */
export function readLanguage(storage) {
  let stored = null;
  try {
    stored = storage?.getItem(LANGUAGE_KEY);
  } catch {
    // Storage can be switched off; then every visit starts in English.
  }
  return knownLanguage(stored) ?? DEFAULT_LANGUAGE;
}

export function saveLanguage(storage, language) {
  try {
    storage?.setItem(LANGUAGE_KEY, language);
  } catch {
    // As above: the choice holds for this visit only.
  }
}

/** The words for `key` in `language`, with each `{name}` filled from `values`. */
export function translate(language, key, values) {
  const text = DICTIONARIES[language]?.[key];
  if (text === undefined) throw new Error(`no words for "${key}" in ${language}`);
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole));
}
