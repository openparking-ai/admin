// The change log, in words: who did what, what changed, and when -- and,
// apart, every refused attempt: who tried what, and why it was refused.
//
// Each line comes from the platform as it was written (GET /garages/:id/
// changes and /refused-attempts). Nothing here judges a line; this only says
// it in plain words, in the garage's own time. Stored text -- a lane's name,
// a lane message, an email, a key's name -- is returned apart (`stored`), so
// the screen keeps it apart on its own and a file writes it as it is. Every
// other value is said in words from the dictionaries, or by the browser's own
// names for a time zone or a currency: never as the code the platform keeps.
//
// A line about a person to tell holds no name and nothing typed: the platform
// names the person as they are named now (`subject.name`), or says they were
// removed (`subject.removed`), and the line says only what kind of change it
// was -- "the name changed", never from what to what.

import { garageDateTime, localSaid, zoneSaid } from './time.js';
import { alertName } from './alerts.js';

/** The actions the platform writes, each with words of its own for a change made and for one tried. */
export const ACTIONS = [
  'garage.create', 'garage.update', 'garage.open', 'garage.pass_links', 'garage.validations_link',
  'payment_account.create', 'payment_account.setup_link', 'payment_account.read', 'payment_account.reader_place',
  'lane.add', 'lane.rename', 'lane.remove', 'lane.close', 'lane.close_again', 'lane.reopen',
  'lane.card_reader_connect', 'lane.card_reader_disconnect',
  'computer.connect', 'computer.cancel',
  'rate_plan.add', 'tax_set.add', 'key.cancel', 'language.change', 'rates.retired',
  'alert_contact.add', 'alert_contact.change', 'alert_contact.remove', 'alert_contact.choices',
  'board_message.add', 'board_message.change', 'board_message.remove', 'lane.board_prices',
];

/** The refusals the platform names, each with words of its own; any other is "it was not allowed". */
export const REFUSALS = [
  'origin_refused', 'session_ended', 'not_signed_in', 'not_found', 'lane_not_found', 'garage_not_found', 'computer_not_found',
  'key_not_found', 'bad_request', 'lane_name_refused', 'lane_message_refused', 'lane_reason_refused', 'lane_override_refused',
  'last_open_lane', 'lane_has_history', 'lane_already_open', 'language_refused', 'rates_retired',
  'garage_not_activatable', 'connect_not_configured', 'too_many_refused', 'key_cancelled', 'key_expired',
  'alert_contact_not_found', 'alert_contact_name_refused', 'alert_contact_phone_refused', 'alert_contact_email_refused',
  'alert_contact_language_refused', 'alert_contact_unreachable', 'alert_contacts_full', 'alert_text_needs_phone',
  'alert_email_needs_email', 'alert_choice_refused',
  'board_message_not_found', 'board_text_refused', 'board_lanes_refused', 'board_time_refused', 'board_messages_full',
  'board_prices_refused', 'board_message_refused',
  // U6: a tax list, the payment account and card readers (the platform logs its 4xx refusals only).
  'tax_set_effective_from_taken', 'tax_set_not_storable', 'bad_country', 'stripe_account_ambiguous', 'no_stripe_account',
  'card_payments_not_active', 'bad_location', 'no_terminal_location', 'bad_reader', 'lane_has_reader', 'reader_bound_elsewhere',
  'no_reader_bound',
];

/**
 * This account's own sign-in or key that no longer worked, used again: said
 * as what it was ("A cancelled key named …", "A sign-in by … that had ended").
 */
const NO_LONGER = {
  key: { key_cancelled: 'changes.who.keyCancelled', key_expired: 'changes.who.keyExpired' },
  owner: { session_ended: 'changes.who.signInEnded' },
};

/** Words with one stored name inside them, as pieces: the name kept apart. */
const named = (text, name) => {
  const [before, after] = text.split('{name}');
  return [{ words: before }, { stored: name }, { words: after ?? '' }];
};

/** A refusal that says what the request named was not found: from the account it belongs to, it is not the asker's. */
const NOT_FOUND = ['not_found', 'lane_not_found', 'garage_not_found', 'computer_not_found', 'key_not_found', 'alert_contact_not_found', 'board_message_not_found'];

/** The fields a before or after can hold, each with a name of its own. */
export const FIELDS = [
  'name', 'direction', 'state', 'reason', 'message', 'access', 'lane', 'label', 'transient_available', 'default_action',
  'open', 'language', 'plan_version', 'effective_from', 'taxes', 'account', 'charges_enabled', 'card_payments',
  'details_submitted', 'place_name', 'timezone', 'currency', 'space_class', 'garage_pass', 'monthly_billing',
  'validations', 'last_open_overridden', 'phone', 'email', 'by_text', 'by_email',
  'text', 'lanes', 'starts', 'ends', 'prices', 'messages_off', 'messages_removed',
];

/**
 * The alerts a person gets one way: a list of alert names, said in words.
 * A person's phone number and email address are never in a line: only
 * whether one is kept, or that it changed (CHOICES).
 */
const ALERT_LISTS = new Set(['by_text', 'by_email']);

/** Fields holding text someone typed: kept as it is, apart. */
export const STORED = new Set(['name', 'message', 'lane', 'label', 'plan_version', 'place_name', 'text']);

/** A screen message's lanes, by name as the line keeps them: typed names, kept as they are. */
const LANE_NAMES = 'lanes';
/** A lane removed: the screen messages it came off, and the ones removed with it -- typed words, kept as they are. */
const MESSAGE_LISTS = new Set(['messages_off', 'messages_removed']);
/** A screen message's start and end, in the garage's own time as the owner wrote them. */
const GARAGE_LOCAL = new Set(['starts', 'ends']);

/** A line about a person to tell: its fields are all of a known few, the name too. */
const PERSON = 'alert_contact';
const PERSON_CHOICES = { name: ['changed'] };

/**
 * Fields whose value is one of a known few: each said in words. A value the
 * platform may add later is said as "another value", never as its code.
 */
export const CHOICES = {
  state: ['open', 'closed'],
  reason: ['full', 'everyone'],
  access: ['connected', 'cancelled', 'active'],
  default_action: ['allow', 'deny'],
  card_payments: ['active', 'inactive', 'pending', 'unrequested'],
  space_class: ['standard'],
  phone: ['given', 'none', 'changed'],
  email: ['given', 'none', 'changed'],
};

const NOTHING = '–';

const actionKey = (action, refused) => {
  const known = ACTIONS.includes(action);
  if (refused) return known ? `changes.tried.${action.replace(/\./g, '_')}` : 'changes.tried.other';
  return known ? `changes.action.${action.replace(/\./g, '_')}` : 'changes.action.other';
};

/** Who made the change, as pieces: an owner by email, a key by its name, or someone not named. */
export function whoPieces(t, line) {
  const who = line.who ?? {};
  const noLonger = line.outcome === 'refused' ? NO_LONGER[who.kind]?.[line.refusal] : undefined;
  if (noLonger && who.name) return named(t(noLonger), who.name);
  if (who.kind === 'owner' && who.name) return [{ stored: who.name }];
  if (who.kind === 'owner') return [{ words: t('changes.who.ownerUnnamed') }];
  if (who.kind === 'key' && who.name) return named(t('changes.who.key'), who.name);
  if (who.kind === 'key') return [{ words: t('changes.who.keyUnnamed') }];
  return [{ words: t(who.kind === 'outside' ? 'changes.who.outside' : 'changes.who.nobody') }];
}

/**
 * What was done -- or, for a refused attempt, what was tried: the action's
 * words, and the thing it was aimed at by name when there is one. A person to
 * tell who has been removed is said to be, by no name.
 */
export function whatPieces(t, line) {
  const refused = line.outcome === 'refused';
  if (refused && line.refusal === 'too_many_refused') return [{ words: t('changes.tried.many') }];
  const pieces = [{ words: t(actionKey(line.action, refused)) }];
  if (line.subject?.kind === PERSON && line.subject.removed) pieces.push({ words: ': ' }, { words: t('changes.person.removed') });
  else if (line.subject?.name) pieces.push({ words: ': ' }, { stored: line.subject.name });
  return pieces;
}

/** One value of a before or after, in words. */
function valueWords(t, field, value, garage, language, kind) {
  if (value === null || value === undefined) return { words: NOTHING };
  if (kind === PERSON && PERSON_CHOICES[field]) {
    return { words: PERSON_CHOICES[field].includes(value) ? t(`changes.value.${field}.${value}`) : t('changes.value.another') };
  }
  if (typeof value === 'boolean') {
    if (field === 'transient_available') return { words: t(value ? 'changes.value.anyDriver' : 'changes.value.passOnly') };
    return { words: t(value ? 'yes' : 'no') };
  }
  if (field === 'direction') return { words: t(value === 'exit' ? 'lane.out' : 'lane.in') };
  // The default kind of space has words; any other is the operator's own name for it.
  if (field === 'space_class' && value !== 'standard') return { stored: String(value) };
  if (CHOICES[field]) {
    return { words: CHOICES[field].includes(value) ? t(`changes.value.${field}.${value}`) : t('changes.value.another') };
  }
  if (field === 'language') return { words: ['en', 'es'].includes(value) ? t(`language.${value}`) : t('changes.value.another') };
  if (field === 'timezone') return { words: zoneSaid(value, language) ?? t('changes.value.anotherZone') };
  if (field === 'currency') return { words: currencySaid(value, language) ?? t('changes.value.another') };
  if (field === 'effective_from') return { words: garageDateTime(value, garage.timezone, language) };
  if (GARAGE_LOCAL.has(field)) return { words: localSaid(value, language) ?? t('changes.value.another') };
  if (field === LANE_NAMES && Array.isArray(value)) return value.length ? { stored: value.join(', ') } : { words: NOTHING };
  if (MESSAGE_LISTS.has(field) && Array.isArray(value)) return value.length ? { stored: value.map((m) => `“${m}”`).join(', ') } : { words: NOTHING };
  if (ALERT_LISTS.has(field) && Array.isArray(value)) {
    if (value.length === 0) return { words: t('changes.value.noAlerts') };
    return { words: value.map((key) => alertName(t, key)).join(', ') };
  }
  if (field === 'taxes' && Array.isArray(value)) {
    if (value.length === 0) return { words: t('changes.value.noTax') };
    return { stored: value.map((x) => `${x.label} ${(Number(x.percent_bp) / 100).toLocaleString(language === 'es' ? 'es-US' : 'en-US')}%`).join(', ') };
  }
  if (typeof value === 'object') return { words: t('changes.value.linked') };
  if (STORED.has(field)) return { stored: String(value) };
  return { words: t('changes.value.another') };
}

/** A currency as people say it: "US dollars", "dólares estadounidenses". Null when the browser has no name for it. */
export function currencySaid(code, language) {
  try {
    const said = new Intl.DisplayNames([language === 'es' ? 'es-US' : 'en-US'], { type: 'currency', fallback: 'none' }).of(code);
    return said ?? null;
  } catch {
    return null;
  }
}

/**
 * What changed, field by field: [{ field, before, after }], each side a piece.
 * A line with nothing before or after (a refusal) has none.
 */
export function changedFields(t, line, garage, language) {
  const before = line.before ?? {};
  const after = line.after ?? {};
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return fields.map((field) => ({
    field: FIELDS.includes(field) ? t(`changes.field.${field}`) : t('changes.field.other'),
    before: field in before ? valueWords(t, field, before[field], garage, language, line.subject?.kind) : { words: NOTHING },
    after: field in after ? valueWords(t, field, after[field], garage, language, line.subject?.kind) : { words: NOTHING },
  }));
}

/**
 * Why an attempt was refused, true in whichever log it is read. In the log
 * of the garage it aimed at, a "not found" from another account means the
 * thing is this owner's and not theirs; in the asker's own log, it named
 * something that is not this account's.
 */
export const whyWords = (t, line) => whySaid(t, whyKey(line));

/** Which reason an attempt was refused for: a refusal the platform names, 'notTheirs', or 'other'. */
export function whyKey(line) {
  if (line.who?.kind === 'outside' && NOT_FOUND.includes(line.refusal)) return 'notTheirs';
  return REFUSALS.includes(line.refusal) ? line.refusal : 'other';
}

/** A reason in words. A column, or a list of ticks, of its own: said as a sentence, from its first letter. */
export function whySaid(t, key) {
  const why = t(`changes.refusal.${key}`);
  return why.charAt(0).toLocaleUpperCase() + why.slice(1);
}

/** How many times an attempt was made: the count, in the page's way of writing numbers. */
export const timesWords = (line, language) => Number(line.attempts ?? 1).toLocaleString(language === 'es' ? 'es-US' : 'en-US');

/** When the last of the attempts was made. */
export const lastWords = (line, garage, language) => garageDateTime(line.last_at ?? line.at, garage.timezone, language);

export const whenWords = (line, garage, language) => garageDateTime(line.at, garage.timezone, language);

/** Pieces as one plain string, for a file. */
export const piecesText = (pieces) => pieces.map((p) => p.words ?? p.stored).join('');

/** Before and after as two plain strings, field by field, for a file and for the screen's reading. */
export function changeText(t, line, garage, language) {
  const fields = changedFields(t, line, garage, language);
  return {
    before: fields.length ? fields.map((f) => `${f.field}: ${piecesText([f.before])}`).join('; ') : NOTHING,
    after: fields.length ? fields.map((f) => `${f.field}: ${piecesText([f.after])}`).join('; ') : NOTHING,
  };
}

// ── U7b: the log sorted, and only the lines chosen ─────────────────────────
//
// Done on the screen, on the whole log as read (src/ChangesPage.jsx
// `readWhole`): so the pages on screen, Download and Print all follow the
// same choices, and hold every line that matches, never only one page.

/** The kinds of thing a line can be about, each with the actions about it, in the order the ticks list them. */
export const KINDS = {
  garage: ['garage.create', 'garage.update', 'garage.open', 'garage.pass_links', 'garage.validations_link'],
  lanes: ['lane.add', 'lane.rename', 'lane.remove', 'lane.close', 'lane.close_again', 'lane.reopen'],
  connections: ['computer.connect', 'computer.cancel'],
  screens: ['board_message.add', 'board_message.change', 'board_message.remove', 'lane.board_prices'],
  rates: ['rate_plan.add', 'rates.retired'],
  taxes: ['tax_set.add'],
  paid: ['payment_account.create', 'payment_account.setup_link', 'payment_account.read'],
  readers: ['payment_account.reader_place', 'lane.card_reader_connect', 'lane.card_reader_disconnect'],
  people: ['alert_contact.add', 'alert_contact.change', 'alert_contact.remove', 'alert_contact.choices'],
  keys: ['key.cancel'],
  language: ['language.change'],
};
// Then the attempts counted together on one line, and any action these pages do not know yet.
const KIND_ORDER = [...Object.keys(KINDS), 'many', 'other'];

/** What a line is about: one of KIND_ORDER, as its What column says it. */
export function kindOf(line) {
  if (line.outcome === 'refused' && line.refusal === 'too_many_refused') return 'many';
  return Object.keys(KINDS).find((kind) => KINDS[kind].includes(line.action)) ?? 'other';
}

/** The ways a list can be sorted; the first is the platform's own, newest first. */
export const SORTS = ['newest', 'oldest', 'who', 'what'];

/** Nothing chosen: every line, newest first. */
export const NO_CHOICE = { sort: 'newest', kinds: [], whys: [] };

export const isChosen = (choice) => choice.sort !== SORTS[0] || choice.kinds.length > 0 || choice.whys.length > 0;

const LOCALES = { en: 'en-US', es: 'es-US' };
const collator = (language) => new Intl.Collator(LOCALES[language] ?? LOCALES.en, { sensitivity: 'base', numeric: true });

/** The kinds of thing the lines are about, each once, in the ticks' order: only kinds that appear. */
export const kindsIn = (lines) => KIND_ORDER.filter((kind) => lines.some((line) => kindOf(line) === kind));

/** The reasons the lines were refused for, each once, in the order of their words: only reasons that appear. */
export function whysIn(t, lines, language) {
  const keys = [...new Set(lines.map(whyKey))];
  const compare = collator(language);
  return keys.sort((a, b) => compare.compare(whySaid(t, a), whySaid(t, b)));
}

/**
 * The lines chosen, in the order chosen: only those about the kinds ticked
 * and refused for the reasons ticked (nothing ticked is everything), sorted
 * by When (newest or oldest first), Who or What. Lines that sort the same are
 * kept newest first; lines of the same moment, in the platform's order.
 */
export function chosenLines(t, lines, choice, language) {
  const shown = lines
    .map((line, i) => ({ line, i, at: Date.parse(line.at) }))
    .filter(({ line }) => (choice.kinds.length === 0 || choice.kinds.includes(kindOf(line))) && (choice.whys.length === 0 || choice.whys.includes(whyKey(line))));
  const newest = (a, b) => b.at - a.at || a.i - b.i;
  const compare = collator(language);
  const byWords = (words) => {
    for (const x of shown) x.words = piecesText(words(t, x.line));
    return (a, b) => compare.compare(a.words, b.words) || newest(a, b);
  };
  const order = {
    newest,
    oldest: (a, b) => a.at - b.at || b.i - a.i,
    who: () => byWords(whoPieces),
    what: () => byWords(whatPieces),
  };
  const sort = choice.sort === 'who' || choice.sort === 'what' ? order[choice.sort]() : (order[choice.sort] ?? newest);
  return shown.sort(sort).map((x) => x.line);
}

/**
 * The choices in words, for the head of a printed list and of its files:
 * "Only: lanes, taxes and fees · oldest first", or "Everything".
 */
export function choiceWords(t, choice, language) {
  const locale = LOCALES[language] ?? LOCALES.en;
  const lower = (text) => text.charAt(0).toLocaleLowerCase(locale) + text.slice(1);
  const parts = [];
  const kinds = KIND_ORDER.filter((kind) => choice.kinds.includes(kind));
  if (kinds.length) parts.push(t('choose.only', { list: kinds.map((kind) => lower(t(`choose.kind.${kind}`))).join(', ') }));
  if (choice.whys.length) parts.push(t('choose.onlyWhy', { list: choice.whys.map((key) => t(`changes.refusal.${key}`)).join('; ') }));
  if (parts.length === 0) parts.push(t('choose.everything'));
  if (choice.sort !== SORTS[0]) parts.push(t(`choose.sorted.${choice.sort}`));
  return parts.join(' · ');
}
