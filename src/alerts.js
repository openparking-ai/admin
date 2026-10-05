// The alerts, in words.
//
// Which alerts there are, and in what order, is the platform's: its one list
// (GET /garages/:id/alerts) is read and shown as it comes. Nothing here
// keeps a list of its own. Each alert's name and what it means are in the
// dictionaries under `alerts.alert.<key>` and `alerts.alert.<key>.says`; an
// alert the platform adds before these pages have words for it is shown as
// "an alert these pages cannot name yet", never as its key.

import { DICTIONARIES } from './i18n/index.js';

const known = (key) => typeof key === 'string' && `alerts.alert.${key}` in DICTIONARIES.en;

/** An alert's name. */
export const alertName = (t, key) => (known(key) ? t(`alerts.alert.${key}`) : t('alerts.alert.other'));

/** What an alert means, with the platform's quiet setting where it needs it; null when there are no words for it. */
export const alertSays = (t, key, quietMinutes) => (known(key) ? t(`alerts.alert.${key}.says`, { minutes: quietMinutes }) : null);

/** The alerts a person gets one way, in the platform's order, as names joined as a sentence would join them. */
export function alertNames(t, keys, order, language) {
  const ordered = [...(keys ?? [])].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (ordered.length === 0) return null;
  return new Intl.ListFormat(language === 'es' ? 'es' : 'en', { style: 'long', type: 'conjunction' }).format(ordered.map((k) => alertName(t, k)));
}

/** A person's language, in words. */
export const languageWords = (t, language) => (language === 'en' || language === 'es' ? t(`language.${language}`) : t('changes.value.another'));

/** The choices a person can have: a text needs a phone number, an email an address. */
export const canText = (person) => typeof person.phone === 'string' && person.phone !== '';
export const canEmail = (person) => typeof person.email === 'string' && person.email !== '';
