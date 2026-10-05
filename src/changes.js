// The change log, in words: who did what, what changed, and when.
//
// Each line comes from the platform as it was written (GET /garages/:id/
// changes). Nothing here judges a line; this only says it in plain words, in
// the garage's own time. Stored text -- a lane's name, a lane message, an
// email, a key's name -- is returned apart (`stored`), so the screen keeps
// it apart on its own and a file writes it as it is.

import { garageDateTime } from './time.js';

/** The actions the platform writes, each with words of its own; any other is "a change". */
export const ACTIONS = [
  'garage.create', 'garage.update', 'garage.open', 'garage.open_again', 'garage.pass_links', 'garage.validations_link',
  'payment_account.create', 'payment_account.create_again', 'payment_account.setup_link', 'payment_account.read',
  'payment_account.reader_place', 'payment_account.reader_place_again',
  'lane.add', 'lane.rename', 'lane.remove', 'lane.close', 'lane.close_again', 'lane.reopen',
  'lane.card_reader_connect', 'lane.card_reader_disconnect',
  'computer.connect', 'computer.cancel', 'computer.cancel_again',
  'rate_plan.add', 'tax_set.add', 'key.cancel', 'key.cancel_again', 'language.change', 'rates.retired',
];

/** The refusals the platform names, each with words of its own; any other is "refused". */
export const REFUSALS = [
  'origin_refused', 'session_ended', 'not_signed_in', 'not_found', 'lane_not_found', 'garage_not_found',
  'bad_request', 'lane_name_refused', 'lane_message_refused', 'lane_reason_refused', 'lane_override_refused',
  'last_open_lane', 'lane_has_history', 'lane_already_open', 'language_refused', 'rates_retired',
  'garage_not_activatable', 'connect_not_configured',
];

/** The fields a before or after can hold, each with a name of its own. */
export const FIELDS = [
  'name', 'direction', 'state', 'reason', 'message', 'access', 'lane', 'label', 'transient_available', 'default_action',
  'open', 'language', 'plan_version', 'effective_from', 'taxes', 'account', 'charges_enabled', 'card_payments',
  'details_submitted', 'place_name', 'timezone', 'currency', 'space_class', 'garage_pass', 'monthly_billing',
  'validations', 'last_open_overridden',
];

const STORED = new Set(['name', 'message', 'lane', 'label', 'plan_version', 'place_name', 'space_class']);
const NOTHING = '–';

const actionKey = (action) => (ACTIONS.includes(action) ? `changes.action.${action.replace(/\./g, '_')}` : 'changes.action.other');

/** Who made the change, as pieces: an owner by email, a key by its name, or someone not named. */
export function whoPieces(t, line) {
  const who = line.who ?? {};
  if (who.kind === 'owner') return [{ stored: who.name ?? '' }];
  if (who.kind === 'key') {
    const [before, after] = t('changes.who.key').split('{name}');
    return [{ words: before }, { stored: who.name ?? '' }, { words: after ?? '' }];
  }
  return [{ words: t(who.kind === 'outside' ? 'changes.who.outside' : 'changes.who.nobody') }];
}

/** What was done: the action's words, and the thing it was done to by name when there is one. */
export function whatPieces(t, line) {
  const pieces = [{ words: t(actionKey(line.action)) }];
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
  if (field === 'state' || field === 'access' || field === 'reason') {
    const key = `changes.value.${value}`;
    return { words: KNOWN_VALUES.includes(value) ? t(key) : String(value) };
  }
  if (field === 'language') return { words: t(`language.${value}`) };
  if (field === 'effective_from') return { words: garageDateTime(value, garage.timezone, language) };
  if (field === 'taxes' && Array.isArray(value)) {
    if (value.length === 0) return { words: t('changes.value.noTax') };
    return { stored: value.map((x) => `${x.label} ${(Number(x.percent_bp) / 100).toLocaleString(language === 'es' ? 'es-US' : 'en-US')}%`).join(', ') };
  }
  if (typeof value === 'object') return { words: t('changes.value.linked') };
  return STORED.has(field) ? { stored: String(value) } : { words: String(value) };
}

const KNOWN_VALUES = ['open', 'closed', 'full', 'everyone', 'connected', 'cancelled', 'active'];

/**
 * What changed, field by field: [{ field, before, after }], each side a piece.
 * A line with nothing before or after (a request that changed nothing, or a
 * refusal) has none.
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

/** Done, or refused and why. */
export function outcomeWords(t, line) {
  if (line.outcome !== 'refused') return t('changes.done');
  return t('changes.refusedBecause', { why: t(REFUSALS.includes(line.refusal) ? `changes.refusal.${line.refusal}` : 'changes.refusal.other') });
}

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
