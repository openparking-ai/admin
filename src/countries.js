// The countries a payment account and its readers' address can be in, as the
// owner picks one.
//
// The codes are Stripe's own list of countries (ISO 3166-1 alpha-2), from
// Stripe's API reference: github.com/stripe/openapi, openapi/spec3.json,
// version 2026-09-30.endive, the `allowed_countries` enum, less "ZZ" (no
// country). Stripe itself says which of them it opens an account in, and
// refuses the rest; the page says so in plain words. Each is named by the
// browser, in the language on screen, as time zones and currencies are.

export const COUNTRY_CODES = (
  'AC AD AE AF AG AI AL AM AO AQ AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CD CF CG CH CI CK CL CM CN CO CR CV CW CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FO FR GA GB GD GE ' +
  'GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IS IT JE JM JO JP KE KG KH KI KM ' +
  'KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MK ML MM MN MO MQ MR MS MT MU MV MW MX MY MZ NA ' +
  'NC NE NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI ' +
  'SJ SK SL SM SN SO SR SS ST SV SX SZ TA TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG ' +
  'VN VU WF WS XK YE YT ZA ZM ZW'
).split(' ');

const LOCALES = { en: 'en-US', es: 'es-US' };

/** A country as people say it, in `language`; null when the browser has no name for it. */
export function countrySaid(code, language) {
  try {
    const said = new Intl.DisplayNames([LOCALES[language] ?? LOCALES.en], { type: 'region', fallback: 'none' }).of(code);
    return said && said !== code ? said : null;
  } catch {
    return null;
  }
}

/** Every country the browser can name, as { code, name }, in the order of their names in `language`. */
export function countryChoices(language) {
  const collator = new Intl.Collator(LOCALES[language] ?? LOCALES.en);
  return COUNTRY_CODES.map((code) => ({ code, name: countrySaid(code, language) }))
    .filter((c) => c.name)
    .sort((a, b) => collator.compare(a.name, b.name));
}

/** The country to start the chooser on: the United States for a garage that charges in US dollars, else none. */
export const firstCountry = (garage) => (garage?.currency === 'USD' ? 'US' : '');
