// Getting paid and card readers, in words.
//
// The platform keeps the garage's Stripe account as it last read it from
// Stripe (GET /garages/:id/stripe-account): three facts, each with when it
// was read -- whether card payments are on (`card_payments`), whether Stripe
// lets it take charges (`charges_enabled`), and whether the garage's details
// are all given (`details_submitted`). Nothing here asks Stripe; "Check again"
// asks the platform to. No account id or Stripe code is ever shown.
//
// Who sees what is the platform's own rule, as the setup checklist applies
// it: a garage that takes pass holders only takes no cards at its lanes, so
// it needs no payment account and has no card readers.

import { garageDateTime } from './time.js';

/** Stripe's states of card payments, each with words; any other is said as another state. */
export const CARD_STATES = ['active', 'pending', 'inactive', 'unrequested'];

/**
 * Whether the account can take cards now, as the platform's setup checklist
 * counts "getting paid" done: card payments on, and charges allowed.
 */
export const takesCards = (account) => Boolean(account) && account.card_payments === 'active' && account.charges_enabled === true;

/** Whether the garage's details are all given to Stripe: until they are, the owner continues on Stripe's page. */
export const detailsGiven = (account) => account?.details_submitted === true;

/**
 * Who the page is for, from the setup read's answer to "does this garage
 * take drivers without a pass?": 'any' (true), 'passOnly' (false) or
 * 'unanswered' (null).
 */
export const driversAnswer = (takesAnyDriver) => (takesAnyDriver === true ? 'any' : takesAnyDriver === false ? 'passOnly' : 'unanswered');

/** The account's state as one sentence: none, can take cards, or cannot yet. */
export function accountWords(t, account) {
  if (!account) return t('paid.noAccount');
  return takesCards(account) ? t('paid.canTake') : t('paid.cannotYet');
}

/**
 * The three facts, each as { key, value, checked }: the value in words, and
 * when it was read in the garage's time, or that it has not been read yet.
 */
export function accountFacts(t, account, garage, language) {
  const checked = (at) => (at ? t('paid.checkedAt', { time: garageDateTime(at, garage.timezone, language) }) : t('paid.notChecked'));
  const card = account.card_payments;
  const cardWords = card === null || card === undefined
    ? t('paid.notCheckedYet')
    : CARD_STATES.includes(card) ? t(`paid.card.${card}`) : t('paid.card.other');
  const yesNo = (value, yes, no) => (value === true ? t(yes) : value === false ? t(no) : t('paid.notCheckedYet'));
  return [
    { key: 'paid.cards', value: cardWords, checked: checked(account.card_payments_read_at) },
    { key: 'paid.charges', value: yesNo(account.charges_enabled, 'paid.charges.yes', 'paid.charges.no'), checked: checked(account.charges_enabled_read_at) },
    { key: 'paid.details', value: yesNo(account.details_submitted, 'paid.details.yes', 'paid.details.no'), checked: checked(account.details_submitted_read_at) },
  ];
}

/**
 * The garage's address for its readers, written on one line: what the page
 * sends as the place's name, so the address can be shown again later (the
 * platform keeps the name and sends the address itself on to Stripe).
 */
export function placeLine({ line1, city, state, postal_code: zip, country }) {
  const tidy = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
  const stateZip = [tidy(state), tidy(zip)].filter(Boolean).join(' ');
  return [tidy(line1), tidy(city), stateZip, tidy(country)].filter(Boolean).join(', ');
}

/**
 * The most a place's name holds: Stripe's own limit for a Terminal
 * Location's display_name, "Maximum length is 1000 characters" (Stripe's API
 * reference, POST /v1/terminal/locations; github.com/stripe/openapi,
 * openapi/spec3.json, `maxLength: 1000`).
 */
export const PLACE_MAX = 1000;

/** Each part of the address, at most this many characters: the whole line stays well under PLACE_MAX. */
export const ADDRESS_MAX = { line1: 200, city: 100, state: 100, postal_code: 20 };
