import en from './en.js';
import es from './es.js';

export const DICTIONARIES = { en, es };
export const LANGUAGES = ['en', 'es'];
export const LANGUAGE_KEY = 'openparking-admin.language';

/** First visit: Spanish if the browser asks for Spanish first, otherwise English. */
export function firstLanguage(browserLanguages) {
  const preferred = String(browserLanguages?.[0] ?? '').toLowerCase();
  return preferred === 'es' || preferred.startsWith('es-') ? 'es' : 'en';
}

/** The stored choice if there is a valid one, else the first-visit language. */
export function readLanguage(storage, browserLanguages) {
  let stored = null;
  try {
    stored = storage?.getItem(LANGUAGE_KEY);
  } catch {
    // Storage can be switched off; then every visit is a first visit.
  }
  return LANGUAGES.includes(stored) ? stored : firstLanguage(browserLanguages);
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
