// A garage's time zone and money, as the owner picks them and reads them (U7c).
//
// Both are fixed when the garage is created: the platform takes a time zone
// and a currency on POST /garages and never changes them after. So each is
// picked from a list, never typed, and nothing is picked until the owner
// picks it. Every choice is said in plain words -- "Eastern — New York",
// "US dollars" -- never as the code the platform keeps.

import { zoneSaid } from './time.js';
import { currencySaid } from './changes.js';

const LOCALES = { en: 'en-US', es: 'es-US' };
const locale = (language) => LOCALES[language] ?? LOCALES.en;

/**
 * The United States' time zones, listed first, each said in the
 * dictionaries' own words (`zone.<key>`). U7d-2: every zone tzdata's
 * zone1970.tab gives the United States (tzdata 2026c: 29 zones), in its
 * order -- by clock, east to west, each clock's most-used place first --
 * then the three territories U7c listed. A zone of these that a browser
 * names by an older name (America/Indianapolis) is put right by
 * ZONE_RENAMED below, so it is listed here once and nowhere else.
 */
export const US_ZONES = [
  { id: 'America/New_York', key: 'eastern' },
  { id: 'America/Detroit', key: 'detroit' },
  { id: 'America/Kentucky/Louisville', key: 'louisville' },
  { id: 'America/Kentucky/Monticello', key: 'monticello' },
  { id: 'America/Indiana/Indianapolis', key: 'indianapolis' },
  { id: 'America/Indiana/Vincennes', key: 'vincennes' },
  { id: 'America/Indiana/Winamac', key: 'winamac' },
  { id: 'America/Indiana/Marengo', key: 'marengo' },
  { id: 'America/Indiana/Petersburg', key: 'petersburg' },
  { id: 'America/Indiana/Vevay', key: 'vevay' },
  { id: 'America/Chicago', key: 'central' },
  { id: 'America/Indiana/Tell_City', key: 'tellCity' },
  { id: 'America/Indiana/Knox', key: 'knox' },
  { id: 'America/Menominee', key: 'menominee' },
  { id: 'America/North_Dakota/Center', key: 'center' },
  { id: 'America/North_Dakota/New_Salem', key: 'newSalem' },
  { id: 'America/North_Dakota/Beulah', key: 'beulah' },
  { id: 'America/Denver', key: 'mountain' },
  { id: 'America/Boise', key: 'boise' },
  { id: 'America/Phoenix', key: 'arizona' },
  { id: 'America/Los_Angeles', key: 'pacific' },
  { id: 'America/Anchorage', key: 'alaska' },
  { id: 'America/Juneau', key: 'juneau' },
  { id: 'America/Sitka', key: 'sitka' },
  { id: 'America/Metlakatla', key: 'metlakatla' },
  { id: 'America/Yakutat', key: 'yakutat' },
  { id: 'America/Nome', key: 'nome' },
  { id: 'America/Adak', key: 'adak' },
  { id: 'Pacific/Honolulu', key: 'hawaii' },
  { id: 'America/Puerto_Rico', key: 'puertoRico' },
  { id: 'Pacific/Guam', key: 'guam' },
  { id: 'Pacific/Pago_Pago', key: 'samoa' },
];

/**
 * U7d-2: the old names a browser still gives for zones tzdata has renamed,
 * each with today's name. A browser's list of zones (and the zone it says
 * the computer is in) is ICU's, which keeps names tzdata changed long ago:
 * "Asia/Calcutta" for Asia/Kolkata, "Europe/Kiev" for Europe/Kyiv. These
 * are exactly the zones Chromium 141 and Node 22 list that tzdata 2026c
 * keeps only as a link and does not list as a place of its own in
 * zone.tab -- a rename, not two places that keep one clock, which stay
 * apart (Bratislava is not Prague). Each is shown, and sent, by today's name.
 */
export const ZONE_RENAMED = {
  'Africa/Asmera': 'Africa/Asmara',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Coral_Harbour': 'America/Atikokan',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Godthab': 'America/Nuuk',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Louisville': 'America/Kentucky/Louisville',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Truk': 'Pacific/Chuuk',
};

/** A zone by today's name. */
export const zoneToday = (id) => (Object.hasOwn(ZONE_RENAMED, id) ? ZONE_RENAMED[id] : id);

/** The place a zone is named for, from its name: "America/Indiana/Knox" is "Knox, Indiana". */
function cityOf(id) {
  const parts = String(id).split('/').slice(1).map((p) => p.replace(/_/g, ' '));
  return parts.length ? parts.reverse().join(', ') : null;
}

/**
 * A time zone as people say it, with the place it is named for: "Eastern —
 * New York", "Central European Time — Madrid". Null when the browser has no
 * name for it.
 */
export function zoneWords(t, id, language) {
  const today = zoneToday(id);
  const us = US_ZONES.find((z) => z.id === today);
  if (us) return t(`zone.${us.key}`);
  const said = zoneSaid(today, language);
  if (!said) return null;
  const zone = said.charAt(0).toLocaleUpperCase(locale(language)) + said.slice(1);
  const city = cityOf(today);
  return city ? t('zone.said', { zone, city }) : zone;
}

/** Every time zone this browser knows, as the platform keeps them. */
function everyZone() {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

/**
 * The time zones to pick from: the United States' first, in their order,
 * then every other zone the browser can name, in the order of their words.
 * Each `{ id, words }`, by today's name (ZONE_RENAMED), and each once: a
 * browser that lists a zone under its old name and its new one, or a US
 * zone under an old name, shows it once, where it belongs.
 */
export function zoneChoices(t, language) {
  const us = US_ZONES.map((z) => ({ id: z.id, words: t(`zone.${z.key}`) }));
  const collator = new Intl.Collator(locale(language));
  const others = [...new Set(everyZone().map(zoneToday))]
    .filter((id) => !US_ZONES.some((z) => z.id === id))
    .map((id) => ({ id, words: zoneWords(t, id, language) }))
    .filter((z) => z.words)
    .sort((a, b) => collator.compare(a.words, b.words));
  return { us, others };
}

/**
 * The currencies in use today (ISO 4217, list one, as of 2026), less funds,
 * precious metals, drawing rights and the testing code. The platform keeps a
 * garage's money as one of these codes; each is named by the browser, in the
 * language on screen.
 */
export const CURRENCY_CODES = (
  'AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP ' +
  'CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG ' +
  'HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL ' +
  'MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR ' +
  'RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD ' +
  'TZS UAH UGX USD UYU UZS VED VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG'
).split(' ');

/** A garage's money in words: US dollars in the dictionaries' words, any other as the browser names it. */
export function moneyWords(t, code, language) {
  if (code === 'USD') return t('money.usd');
  const said = currencySaid(code, language);
  return said ? said.charAt(0).toLocaleUpperCase(locale(language)) + said.slice(1) : null;
}

/** The money to pick from: US dollars first, then every other the browser can name, in the order of their names. */
export function moneyChoices(t, language) {
  const collator = new Intl.Collator(locale(language));
  const others = CURRENCY_CODES.filter((code) => code !== 'USD')
    .map((code) => ({ code, words: moneyWords(t, code, language) }))
    .filter((c) => c.words)
    .sort((a, b) => collator.compare(a.words, b.words));
  return [{ code: 'USD', words: t('money.usd') }, ...others];
}
