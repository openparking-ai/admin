// How many digits after the point each currency has (ISO 4217's minor unit),
// exactly as the rate engine has them: rate-engine src/rate_engine/currency.py
// (MINOR_UNIT_DIGITS) at the commit in rate-engine.pin. A price typed on these
// screens is stored in the currency's smallest unit, and the engine, the lane
// board and the card reader read that number back by this table; a table that
// differed would store every price 100 or 1000 times off (OP-NODE-006).
//
// Not asked of the browser: its own currency data (Intl) says no digits for
// COP, HUF, IDR, PKR and others, and none for IQD, where the engine says 2 and
// 3. The same groups as the engine's file, in the same order, so the two can
// be read side by side. scripts/check-currency-digits.js holds this table to
// the engine's at the pin, entry for entry, and every currency a garage can be
// added with (CURRENCY_CODES, src/garages.js) to it.

/** No digits after the point: 800 is 800. */
const ZERO_DECIMAL = ['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];

/** Three digits after the point: 1500 is 1.500. */
const THREE_DECIMAL = ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'];

/** Four digits after the point. */
const FOUR_DECIMAL = ['CLF', 'UYW'];

/** Two digits after the point: 800 is 8.00. Every currency the engine prices in that is not named above. */
const TWO_DECIMAL = [
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BGN', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN',
  'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF', 'CNY', 'COP', 'CRC', 'CUP',
  'CVE', 'CZK', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD',
  'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GTQ', 'GYD', 'HKD', 'HNL',
  'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IRR', 'JMD', 'KES', 'KGS', 'KHR',
  'KPW', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'MAD', 'MDL',
  'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN',
  'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'PAB', 'PEN',
  'PGK', 'PHP', 'PKR', 'PLN', 'QAR', 'RON', 'RSD', 'RUB', 'SAR', 'SBD',
  'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN',
  'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TOP', 'TRY', 'TTD', 'TWD',
  'TZS', 'UAH', 'USD', 'UYU', 'UZS', 'VED', 'VES', 'WST', 'XCD', 'XCG',
  'YER', 'ZAR', 'ZMW', 'ZWG',
];

/** Code to how many digits after the point, built as the engine builds its own: two unless named above. */
export const MINOR_UNIT_DIGITS = Object.freeze(
  Object.fromEntries([
    ...TWO_DECIMAL.map((code) => [code, 2]),
    ...ZERO_DECIMAL.map((code) => [code, 0]),
    ...THREE_DECIMAL.map((code) => [code, 3]),
    ...FOUR_DECIMAL.map((code) => [code, 4]),
  ]),
);

/** How many digits after the point `code` has, as the engine has it; null for a code the engine does not price in. */
export const minorUnitDigits = (code) => (typeof code === 'string' && Object.hasOwn(MINOR_UNIT_DIGITS, code) ? MINOR_UNIT_DIGITS[code] : null);
