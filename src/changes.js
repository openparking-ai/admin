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

import { garageDateTime, zoneSaid } from './time.js';

/** The actions the platform writes, each with words of its own for a change made and for one tried. */
export const ACTIONS = [
  'garage.create', 'garage.update', 'garage.open', 'garage.pass_links', 'garage.validations_link',
  'payment_account.create', 'payment_account.setup_link', 'payment_account.read', 'payment_account.reader_place',
  'lane.add', 'lane.rename', 'lane.remove', 'lane.close', 'lane.close_again', 'lane.reopen',
  'lane.card_reader_connect', 'lane.card_reader_disconnect',
  'computer.connect', 'computer.cancel',
  'rate_plan.add', 'tax_set.add', 'key.cancel', 'language.change', 'rates.retired',
];

/** The refusals the platform names, each with words of its own; any other is "it was not allowed". */
export const REFUSALS = [
  'origin_refused', 'session_ended', 'not_signed_in', 'not_found', 'lane_not_found', 'garage_not_found', 'computer_not_found',
  'key_not_found', 'bad_request', 'lane_name_refused', 'lane_message_refused', 'lane_reason_refused', 'lane_override_refused',
  'last_open_lane', 'lane_has_history', 'lane_already_open', 'language_refused', 'rates_retired',
  'garage_not_activatable', 'connect_not_configured', 'too_many_refused', 'key_cancelled', 'key_expired',
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
const NOT_FOUND = ['not_found', 'lane_not_found', 'garage_not_found', 'computer_not_found', 'key_not_found'];

/** The fields a before or after can hold, each with a name of its own. */
export const FIELDS = [
  'name', 'direction', 'state', 'reason', 'message', 'access', 'lane', 'label', 'transient_available', 'default_action',
  'open', 'language', 'plan_version', 'effective_from', 'taxes', 'account', 'charges_enabled', 'card_payments',
  'details_submitted', 'place_name', 'timezone', 'currency', 'space_class', 'garage_pass', 'monthly_billing',
  'validations', 'last_open_overridden',
];

/** Fields holding text someone typed: kept as it is, apart. */
export const STORED = new Set(['name', 'message', 'lane', 'label', 'plan_version', 'place_name']);

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
 * words, and the thing it was aimed at by name when there is one.
 */
export function whatPieces(t, line) {
  const refused = line.outcome === 'refused';
  if (refused && line.refusal === 'too_many_refused') return [{ words: t('changes.tried.many') }];
  const pieces = [{ words: t(actionKey(line.action, refused)) }];
  if (line.subject?.name) pieces.push({ words: ': ' }, { stored: line.subject.name });
  return pieces;
}

/** One value of a before or after, in words. */
function valueWords(t, field, value, garage, language) {
  if (value === null || value === undefined) return { words: NOTHING };
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
    before: field in before ? valueWords(t, field, before[field], garage, language) : { words: NOTHING },
    after: field in after ? valueWords(t, field, after[field], garage, language) : { words: NOTHING },
  }));
}

/**
 * Why an attempt was refused, true in whichever log it is read. In the log
 * of the garage it aimed at, a "not found" from another account means the
 * thing is this owner's and not theirs; in the asker's own log, it named
 * something that is not this account's.
 */
export function whyWords(t, line) {
  const why = line.who?.kind === 'outside' && NOT_FOUND.includes(line.refusal)
    ? t('changes.refusal.notTheirs')
    : t(REFUSALS.includes(line.refusal) ? `changes.refusal.${line.refusal}` : 'changes.refusal.other');
  // A column of its own: said as a sentence, from its first letter.
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
