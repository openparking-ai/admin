// The one place these screens talk to the platform.
//
// Every request is same-origin and relative, and sends the session cookie the
// platform set. The page never reads that cookie and never sees the session
// key: whether someone is signed in is the platform's answer to `me()`.
//
// Nothing raw leaves this file. A request either gives back the parsed body,
// or throws a Problem whose `kind` is one of PROBLEM_KINDS. A body that is not
// JSON, a dropped connection, a status this file does not expect and a code it
// does not know all become a kind, and every kind has words in the
// dictionaries (`problem.<kind>`). The code, the status, the body and the
// browser's own error text are never kept on the Problem, so no screen can
// show them.

const BASE = '/api/v1';

export const PROBLEM_KINDS = [
  'refused', 'tooMany', 'busy', 'notSetUp', 'wrongPlace', 'incomplete', 'ended', 'unreachable', 'unexpected',
  // U4: the setup changes' own refusals.
  'laneName', 'laneMessage', 'laneHasHistory', 'lastOpenLane', 'laneAlreadyOpen', 'notFound', 'notKept',
  // U4b: the people to tell, and what each gets.
  'personName', 'phoneLetters', 'phoneShort', 'phoneLong', 'phoneNotUs', 'phoneOdd',
  'emailSpace', 'emailAt', 'emailLong', 'emailOdd', 'contactUnreachable', 'peopleFull', 'textNeedsPhone', 'emailNeedsEmail',
  // U4c: what a lane does when it is closed, and what its screen says.
  'laneReason', 'screenCharacters', 'boardText', 'boardLanes', 'boardTime', 'boardFull',
  // U6: taxes, getting paid and card readers.
  'taxListRefused', 'taxStartTaken', 'taxNotKept', 'taxNotChecked', 'garageNotFound',
  'cardsNotSetUp', 'countryRefused', 'stripeRefused', 'stripeUnreachable', 'accountTwice', 'noAccount', 'cardsNotActive',
  'placeRefused', 'noPlace', 'readerRefused', 'laneHasReader', 'readerElsewhere', 'noReader',
  // U7c: a garage added.
  'garageRefused',
  // U7d-2: an invite accepted, a forgotten password, a new one chosen.
  'passwordRule', 'linkTooMany', 'linkBusy',
  'inviteUsed', 'inviteExpired', 'inviteReplaced', 'inviteInvalid', 'inviteTaken', 'inviteEmailTaken',
  'resetUsed', 'resetExpired', 'resetReplaced', 'resetInvalid',
  // U7g: rates, trying a stay, and opening the garage.
  'planFindings', 'planRefused', 'planNameTaken', 'planStartTaken', 'planStartPast', 'planStartLater', 'ratesChanged', 'ratesNotChecked', 'planNotKept',
  'notConfirmed', 'noRatesYet', 'tooManyTries', 'tryRefused', 'notReadyToOpen',
  // The fill rule (platform 0034): the garage's number of spaces, and rates that need it.
  'planNeedsSpaces', 'fillChoiceMissing', 'spacesRefused', 'spacesNeeded',
  // The platform could not reach its database (its src/db.js): nothing changed, or a change that may have been saved.
  'databaseUnavailable', 'databaseSaving',
  // Permissions on every route, and a linked accounts module that could not answer (platform 0035).
  'notAllowed', 'undecided',
  // Passkeys (platform 0035): signing in with one, and the admin's own.
  'passkeyRefused', 'passkeyStopped', 'passkeysOff', 'passkeyEnded', 'passkeyNotAdded', 'passkeyKnown', 'passkeysFull', 'passkeyName', 'passkeysElsewhere',
  // Adding a passkey is proved again by the password (platform 0047).
  'passwordAgain', 'passwordNotAccepted',
  // Stuck stays (platform 0043): the garage's hours, and a stay ended or written off.
  'stuckHoursRefused', 'stayGone', 'stayNotOpen', 'reasonRequired', 'reasonOneLine', 'leftBeforeEntry', 'leftInFuture', 'leftTimeOdd',
  // Ending a stay with an exit lane's case still open on it (platform 0045): its payment, at Stripe.
  'stayPaymentInProgress', 'stayPaymentMoving', 'stayPaymentUnsettled', 'stayPaymentMismatch',
  // The cars a person let out (platform 0048): a day the list cannot take, and a record not this garage's.
  'dayRefused', 'letOutGone',
];

/** U7d-2: what an invite link can be, as the platform's status door says it. */
export const LINK_STATUSES = ['ready', 'used', 'expired', 'replaced', 'invalid'];

/**
 * The platform's named answers, each with its own words: the status and the
 * code together, as the platform's src/signIn.js gives them. Any other pair is
 * 'unexpected'.
 */
const NAMED = [
  [429, 'sign_in_rate_limited', 'tooMany'],
  [503, 'sign_in_busy', 'busy'],
  [409, 'sign_in_not_configured', 'notSetUp'],
  [403, 'origin_refused', 'wrongPlace'],
  [400, 'sign_in_unreadable', 'incomplete'],
  // U4, as the platform's src/lanes.js names them.
  [400, 'lane_name_refused', 'laneName'],
  [400, 'lane_message_refused', 'laneMessage'],
  [409, 'lane_has_history', 'laneHasHistory'],
  [409, 'last_open_lane', 'lastOpenLane'],
  [409, 'lane_already_open', 'laneAlreadyOpen'],
  [404, 'lane_not_found', 'notFound'],
  // U4b, as the platform's src/alerts.js names them.
  [400, 'alert_contact_unreachable', 'contactUnreachable'],
  [409, 'alert_contacts_full', 'peopleFull'],
  [409, 'alert_text_needs_phone', 'textNeedsPhone'],
  [409, 'alert_email_needs_email', 'emailNeedsEmail'],
  [404, 'alert_contact_not_found', 'notFound'],
  // U4c, as the platform's src/lanes.js and src/board.js name them.
  [400, 'lane_reason_refused', 'laneReason'],
  [400, 'board_text_refused', 'boardText'],
  [400, 'board_lanes_refused', 'boardLanes'],
  [400, 'board_time_refused', 'boardTime'],
  [409, 'board_messages_full', 'boardFull'],
  [404, 'board_message_not_found', 'notFound'],
  // U6, as the platform's src/app.js (taxSetRefusal), src/stripeAccount.js and src/terminal.js name them.
  [409, 'tax_set_effective_from_taken', 'taxStartTaken'],
  [409, 'tax_set_not_storable', 'taxNotKept'],
  [503, 'rate_engine_unavailable', 'taxNotChecked'],
  [409, 'connect_not_configured', 'cardsNotSetUp'],
  [404, 'garage_not_found', 'garageNotFound'],
  [400, 'bad_country', 'countryRefused'],
  [502, 'stripe_refused', 'stripeRefused'],
  [503, 'stripe_unreachable', 'stripeUnreachable'],
  [409, 'stripe_account_ambiguous', 'accountTwice'],
  [409, 'no_stripe_account', 'noAccount'],
  [409, 'card_payments_not_active', 'cardsNotActive'],
  [400, 'bad_location', 'placeRefused'],
  [409, 'no_terminal_location', 'noPlace'],
  [400, 'bad_reader', 'readerRefused'],
  [409, 'lane_has_reader', 'laneHasReader'],
  [409, 'reader_bound_elsewhere', 'readerElsewhere'],
  [409, 'no_reader_bound', 'noReader'],
  // U7d-2, as the platform's src/accountDoors.js names them.
  [400, 'password_refused', 'passwordRule'],
  [429, 'link_rate_limited', 'linkTooMany'],
  [503, 'link_busy', 'linkBusy'],
  // The platform's database could not be reached, as its src/db.js names it: on any door.
  [503, 'database_unavailable', 'databaseUnavailable'],
  [503, 'database_unavailable_saving', 'databaseSaving'],
  [409, 'invite_used', 'inviteUsed'],
  [409, 'invite_expired', 'inviteExpired'],
  [409, 'invite_replaced', 'inviteReplaced'],
  [409, 'invite_invalid', 'inviteInvalid'],
  [409, 'invite_has_admin', 'inviteTaken'],
  [409, 'invite_email_taken', 'inviteEmailTaken'],
  [409, 'reset_used', 'resetUsed'],
  [409, 'reset_expired', 'resetExpired'],
  [409, 'reset_replaced', 'resetReplaced'],
  [409, 'reset_invalid', 'resetInvalid'],
  // U7d-2: a garage the platform refuses since 130d38d (its src/garageFields.js), each by its
  // code; these screens never send one, so one plain sentence for all three.
  [400, 'garage_name_refused', 'garageRefused'],
  [400, 'garage_currency_refused', 'garageRefused'],
  [400, 'garage_timezone_refused', 'garageRefused'],
  // U7g, as the platform's src/ratePlans.js and src/app.js name them.
  [409, 'plan_has_findings', 'planFindings'],
  [409, 'plan_version_exists', 'planNameTaken'],
  [409, 'plan_effective_from_taken', 'planStartTaken'],
  [409, 'plan_starts_in_the_past', 'planStartPast'],
  // U7i: nothing is scheduled, and the rates checked must still be the newest.
  [422, 'rates_start_when_saved', 'planStartLater'],
  [409, 'rates_changed_since_check', 'ratesChanged'],
  [409, 'rate_engine_unavailable', 'ratesNotChecked'],
  [409, 'plan_currency_disagrees_with_garage', 'planNotKept'],
  [409, 'plan_does_not_price_garage_space_class', 'planNotKept'],
  // The fill rule (platform 0034): rates that charge more when the garage is
  // full need its number of spaces, and both of the rule's choices.
  [409, 'plan_needs_spaces', 'planNeedsSpaces'],
  [409, 'fill_rule_answers_missing', 'fillChoiceMissing'],
  [400, 'garage_spaces_refused', 'spacesRefused'],
  [409, 'spaces_needed_by_fill_rule', 'spacesNeeded'],
  [400, 'not_confirmed', 'notConfirmed'],
  [409, 'no_rate_plan', 'noRatesYet'],
  [429, 'too_many_tries', 'tooManyTries'],
  [409, 'garage_not_activatable', 'notReadyToOpen'],
  // Platform 0035, as its src/permissions.js, src/signIn.js, src/linkedAccounts.js and src/passkeys.js name them.
  [403, 'permission_refused', 'notAllowed'],
  [503, 'sign_in_undecided', 'undecided'],
  [503, 'accounts_undecided', 'undecided'],
  [409, 'passkeys_not_configured', 'passkeysOff'],
  [429, 'passkeys_busy', 'busy'],
  [403, 'password_required', 'passwordAgain'],
  [403, 'password_not_accepted', 'passwordNotAccepted'],
  [409, 'passkey_challenge_ended', 'passkeyEnded'],
  [400, 'passkey_not_added', 'passkeyNotAdded'],
  [409, 'passkey_known', 'passkeyKnown'],
  [409, 'passkeys_full', 'passkeysFull'],
  [400, 'passkey_name_refused', 'passkeyName'],
  [409, 'passkeys_elsewhere', 'passkeysElsewhere'],
  [404, 'passkey_not_found', 'notFound'],
  // Stuck stays, as the platform's src/stuckStays.js and src/app.js name them (0043).
  [400, 'stuck_after_hours_invalid', 'stuckHoursRefused'],
  [404, 'stay_not_found', 'stayGone'],
  [409, 'stay_not_open', 'stayNotOpen'],
  [400, 'reason_required', 'reasonRequired'],
  [400, 'reason_invalid', 'reasonOneLine'],
  [400, 'left_at_before_entry', 'leftBeforeEntry'],
  [409, 'clock_skew', 'leftInFuture'],
  // The cars a person let out, as the platform's src/app.js names them (0048).
  [400, 'day_invalid', 'dayRefused'],
  [404, 'exception_not_found', 'letOutGone'],
];

/**
 * U7g: the plan routes' refusals that carry no code, by status: rates the
 * engine could not read are a 400 holding the engine's own sentence, and a
 * stay the try could not read a 400 holding the platform's; a garage not
 * found is a 404. The platform's text is never kept.
 */
const PLAN_BY_STATUS = { 400: 'planRefused', 404: 'garageNotFound' };
const TRY_BY_STATUS = { 400: 'tryRefused', 404: 'garageNotFound' };
/** The try answers "no engine to ask" as a 503, which elsewhere is the taxes' words. */
const TRY_NAMED = [[503, 'rate_engine_unavailable', 'ratesNotChecked']];

/**
 * Ending a stay (platform 0045): an exit lane's case left open on the stay
 * never blocks it -- the platform cancels the case's unpaid payment at Stripe
 * first, then closes the case with the stay. What can stop that, each in its
 * own words, as the platform's src/app.js names them on this route; nothing
 * changed in any of them. Named here, not for every route: on an exit
 * lane's own routes the same codes mean something else.
 */
const END_NAMED = [
  [409, 'payment_in_progress', 'stayPaymentInProgress'],
  [409, 'stay_payment_moving', 'stayPaymentMoving'],
  [503, 'payment_unsettled', 'stayPaymentUnsettled'],
  [409, 'payment_amount_mismatch', 'stayPaymentMismatch'],
];

/**
 * What a refusal carries that the screens show in their own words: the
 * engine's findings, each only its code, the rules it names and the stay
 * that found it -- never its sentence; and the setup steps still missing,
 * each only its key. Anything else is dropped.
 */
const STEP_KEY = /^[a-z_]{1,40}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}:\d{2}|Z)$/;
function vetted(code, details) {
  if (code === 'plan_has_findings' && Array.isArray(details?.findings)) {
    return {
      findings: details.findings
        .filter((f) => f && typeof f.code === 'string')
        .map((f) => ({
          code: f.code,
          rule_ids: Array.isArray(f.rule_ids) ? f.rule_ids.filter((id) => typeof id === 'string') : [],
          probe:
            f.probe && INSTANT.test(String(f.probe.entry_at)) && INSTANT.test(String(f.probe.exit_at))
              ? { entry_at: f.probe.entry_at, exit_at: f.probe.exit_at }
              : null,
        })),
    };
  }
  if (code === 'garage_not_activatable' && Array.isArray(details?.unmet)) {
    return { unmet: details.unmet.filter((k) => typeof k === 'string' && STEP_KEY.test(k)) };
  }
  return {};
}

/**
 * The tax routes' refusals that carry no code, by status: a list the rate
 * engine would not take is a 400 holding the engine's own sentence (the
 * platform's taxSetRefusal), and a garage not found is a 404. Each has its
 * own words; the platform's text is never kept.
 */
const TAX_BY_STATUS = { 400: 'taxListRefused', 404: 'garageNotFound' };

/**
 * U7c: adding a garage. The platform refuses one with no name, time zone or
 * currency as a 400 with no code; these screens never send one, so this is
 * the plain sentence for the rare case it gets this far.
 */
const GARAGE_BY_STATUS = { 400: 'garageRefused' };

/**
 * Text for a lane's screen refused for a character the screen cannot show:
 * the platform lists them in `details.characters`. The screens say which as
 * the owner types (src/screen.js), so this is the plain sentence for the
 * rare case it gets this far.
 */
const SCREEN_TEXT = ['lane_message_refused', 'board_text_refused'];

/**
 * A name, phone number or email address refused, by why: the platform's
 * `details.reason`, one of a known few, each with its own words. Any other
 * reason is the plainest sentence for the field.
 */
const BY_REASON = {
  alert_contact_name_refused: { other: 'personName' },
  alert_contact_phone_refused: { letters: 'phoneLetters', too_short: 'phoneShort', too_long: 'phoneLong', not_us: 'phoneNotUs', other: 'phoneOdd' },
  alert_contact_email_refused: { space: 'emailSpace', no_at: 'emailAt', two_at: 'emailAt', empty_side: 'emailAt', too_long: 'emailLong', other: 'emailOdd' },
};

/**
 * A refusal with no code that these screens still meet by status alone: a
 * lane, computer or garage that is no longer there (404), and a change the
 * platform would not keep as asked (400).
 */
const BY_STATUS = { 404: 'notFound', 400: 'notKept' };

/**
 * What a gateway in front of the platform answers when it cannot reach it:
 * the development proxy, or whatever a garage serves the site behind. With a
 * body that is not the platform's (any JSON object is), one of these is
 * 'unreachable', the same as no answer at all.
 */
const GATEWAY = [502, 503, 504];

/** Not shown, ever: the answer to a request made before the last sign-out. */
export const STALE = 'stale';

export class Problem extends Error {
  constructor(kind, carried = {}) {
    super(kind);
    this.kind = kind;
    // U7g: only what `vetted` let through -- codes and keys the screens word.
    Object.assign(this, carried);
  }
}

/** The dictionary key for the words a Problem shows. */
export const problemKey = (problem) =>
  `problem.${PROBLEM_KINDS.includes(problem?.kind) ? problem.kind : 'unexpected'}`;

/**
 * A client. Whoever `listen`s is told about EVERY 401, from any request, so
 * the screens can drop what they hold. `kind` is 'ended' when the platform
 * says the session ended, or when someone who was signed in is turned away;
 * null for a plain "not signed in" on first load.
 *
 * Signing in, signing out and any 401 start a new epoch: the answer to a
 * request made before it is thrown away (kind STALE), never handed to a screen.
 */
/**
 * Where one picture of a banned car is, for an image on the page (U7f). Not a
 * request this client makes: the browser fetches it, on this same origin, with
 * the session cookie -- the page's policy takes images from here and nowhere
 * else. The same door as every other: under /api/v1, no query string.
 */
export function bannedPicturePath(garageId, banId, pictureId) {
  return `${BASE}/garages/${encodeURIComponent(garageId)}/banned/${encodeURIComponent(banId)}/pictures/${encodeURIComponent(pictureId)}`;
}

/** Where one entry picture of a stay is (platform 0043): fetched by the browser, as a banned car's is. */
export function stayPicturePath(garageId, stayId, pictureId) {
  return `${BASE}/garages/${encodeURIComponent(garageId)}/stays/${encodeURIComponent(stayId)}/pictures/${encodeURIComponent(pictureId)}`;
}

/**
 * Where one picture a record of a car let out lists is (platform #90): its
 * stay's entry, its exit, or the lane's around then. Fetched by the browser,
 * as a banned car's picture is; the platform serves only a picture that
 * record lists.
 */
export function letOutPicturePath(garageId, letOutId, pictureId) {
  return `${BASE}/garages/${encodeURIComponent(garageId)}/exceptions/${encodeURIComponent(letOutId)}/pictures/${encodeURIComponent(pictureId)}`;
}

export function createClient({ fetch: fetchFn = globalThis.fetch.bind(globalThis) } = {}) {
  let epoch = 0;
  let signedIn = false;
  const listeners = new Set();
  const onSignedOut = (kind) => {
    for (const fn of listeners) fn(kind);
  };

  /**
   * `sessionless`: a door that reads no session (U7d-2: an invite's status
   * and accepting it, forgot, reset). Its answer belongs to no owner, so a
   * sign-out or a 401 while it is on its way -- the "not signed in" of the
   * first load, as the platform holds every door's answer to its floor --
   * does not throw it away.
   */
  async function request(path, { method = 'GET', body, signingIn = false, byStatus = null, sessionless = false, named: ownNames = [], whole = false, dated = false } = {}) {
    const asked = epoch;
    const stale = (at) => (sessionless ? null : staleSince(at));
    let res;
    try {
      // `whole`: a path of this origin outside the platform's doors (a host's extra page, src/extras.js).
      res = await fetchFn(whole ? path : `${BASE}${path}`, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw stale(asked) ?? new Problem('unreachable');
    }

    // Read the body as text first: `res.json()` itself throws on a body that
    // is not JSON, before any code that reads the error could run.
    let data = null;
    try {
      const text = await res.text();
      data = text === '' ? null : JSON.parse(text);
    } catch {
      data = undefined;
    }
    if (stale(asked)) throw stale(asked);

    const fromPlatform = data !== null && typeof data === 'object' && !Array.isArray(data);
    const code = fromPlatform ? data.code : undefined;

    if (res.status === 401) {
      const wasSignedIn = signedIn;
      signedIn = false;
      epoch += 1;
      if (signingIn && (code === 'sign_in_refused' || code === 'passkey_refused')) {
        onSignedOut(null);
        throw new Problem(code === 'passkey_refused' ? 'passkeyRefused' : 'refused');
      }
      const kind = code === 'session_ended' || wasSignedIn ? 'ended' : null;
      onSignedOut(kind);
      throw new Problem(kind ?? 'ended');
    }
    if (GATEWAY.includes(res.status) && !fromPlatform) throw new Problem('unreachable');
    if (!res.ok) {
      const reasons = res.status === 400 ? BY_REASON[code] : undefined;
      if (reasons) {
        const reason = typeof data.details?.reason === 'string' ? data.details.reason : 'other';
        throw new Problem(Object.hasOwn(reasons, reason) ? reasons[reason] : reasons.other);
      }
      if (res.status === 400 && SCREEN_TEXT.includes(code) && Array.isArray(data.details?.characters) && data.details.characters.length) {
        throw new Problem('screenCharacters');
      }
      const named = [...ownNames, ...NAMED].find(([status, name]) => status === res.status && name === code)?.[2];
      if (named) throw new Problem(named, vetted(code, data.details));
      // A route whose refusals carry no code says which words each status has (TAX_BY_STATUS).
      const byRoute = code === undefined && fromPlatform && byStatus ? byStatus[res.status] : undefined;
      throw new Problem(named ?? byRoute ?? (code === undefined && fromPlatform && method !== 'GET' ? BY_STATUS[res.status] : undefined) ?? 'unexpected');
    }
    if (data === undefined) throw new Problem('unexpected');
    // `dated`: the body and the platform's clock as it answered (the answer's
    // own Date, to the second), for new rates dated by the platform's clock.
    if (dated) return { data, date: Date.parse(res.headers?.get?.('date') ?? '') };
    return data;
  }

  // An answer that arrived after a sign-out belongs to nobody on screen now.
  const staleSince = (asked) => (asked === epoch ? null : new Problem(STALE));

  const object = (data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Problem('unexpected');
    return data;
  };
  /** What a lane's screen can show, as the platform says it: its characters, and the most a message holds. */
  const screenOf = (data) => {
    const screen = object(object(data).screen);
    if (typeof screen.characters !== 'string' || screen.characters === '' || !Number.isInteger(screen.message_max) || screen.message_max < 1) throw new Problem('unexpected');
    return { characters: screen.characters, messageMax: screen.message_max };
  };
  const list = (data, key) => {
    const value = object(data)[key];
    if (!Array.isArray(value)) throw new Problem('unexpected');
    return value;
  };
  /**
   * Who is signed in, once a sign-in answered: the platform's sign-in answer names the
   * person, and only `/auth/me` names what they may open (platform 0035), so it is asked
   * before any screen is drawn. A platform from before permissions answers `/auth/me` as it
   * answered sign-in. If that read fails, the sign-in's own answer is kept: it names no
   * permissions, so the menus show every page, and the platform refuses each read the person
   * may not make (`notAllowed`), as it does whatever the screens show.
   */
  const whoAfter = async (answer) => {
    try {
      return { ...answer, ...object(await request('/auth/me')) };
    } catch (problem) {
      if (problem.kind === STALE || problem.kind === 'ended') throw problem;
      return answer;
    }
  };

  return {
    /** Who is signed in, or null. Never throws for "not signed in". */
    async me() {
      try {
        const who = object(await request('/auth/me'));
        signedIn = true;
        return who;
      } catch (problem) {
        if (problem.kind === 'ended') return null;
        throw problem;
      }
    },
    async signIn(email, password) {
      epoch += 1;
      const answer = object(await request('/auth/sign-in', { method: 'POST', body: { email, password }, signingIn: true }));
      signedIn = true;
      return whoAfter(answer);
    },
    /**
     * Sign in with a passkey, in the platform's two steps: its options, then the browser's
     * answer to them (`respond`, src/passkeys.js), sent with the challenge's id. A sign-in:
     * a new epoch, and who is signed in after.
     */
    async passkeySignIn(respond) {
      epoch += 1;
      const asked = object(await request('/auth/passkey/options', { method: 'POST', signingIn: true }));
      if (typeof asked.challenge_id !== 'string' || !asked.options) throw new Problem('unexpected');
      const response = await respond(asked.options);
      const answer = object(await request('/auth/passkey/sign-in', { method: 'POST', body: { challenge_id: asked.challenge_id, response }, signingIn: true }));
      signedIn = true;
      return whoAfter(answer);
    },
    /** The admin's own passkeys: { id, name, created_at, last_used_at }, as the platform lists them. */
    passkeys: async () => list(await request('/auth/passkeys'), 'passkeys'),
    /**
     * Add a passkey named `name`: the platform's options, the browser's new passkey (`make`), then
     * both sent back. The platform asks for the password again unless the admin signed in with it
     * in the last five minutes (platform 0047): `password`, when typed, goes with the first step.
     */
    async addPasskey(name, make, password) {
      const asked = object(await request('/auth/passkeys/options', { method: 'POST', ...(password ? { body: { password } } : {}) }));
      if (typeof asked.challenge_id !== 'string' || !asked.options) throw new Problem('unexpected');
      const response = await make(asked.options);
      return object(object(await request('/auth/passkeys', { method: 'POST', body: { challenge_id: asked.challenge_id, name, response } })).passkey);
    },
    renamePasskey: async (id, name) => object(object(await request('/auth/passkeys/rename', { method: 'POST', body: { id, name } })).passkey),
    removePasskey: async (id) => {
      await request('/auth/passkeys/remove', { method: 'POST', body: { id } });
    },
    /**
     * U7d-2: what an invite link is now -- ready, used, expired, replaced or
     * invalid -- and, when ready, the email it is for and its language. The
     * token goes in the body, never in an address.
     */
    inviteStatus: async (token) => {
      const data = object(await request('/auth/invite/status', { method: 'POST', body: { token }, sessionless: true }));
      if (!LINK_STATUSES.includes(data.status)) throw new Problem('unexpected');
      if (data.status !== 'ready') return { status: data.status };
      if (typeof data.email !== 'string' || !['en', 'es'].includes(data.language)) throw new Problem('unexpected');
      return { status: 'ready', email: data.email, language: data.language };
    },
    /**
     * U7d-2: make the account an invite is for, with its password and
     * language, and be signed in as it -- the platform signs in as sign-in
     * does, so this is a sign-in: a new epoch, and who is signed in after.
     */
    async acceptInvite(token, password, language) {
      epoch += 1;
      const answer = object(await request('/auth/invite/accept', { method: 'POST', body: { token, password, language }, sessionless: true }));
      signedIn = true;
      return whoAfter(answer);
    },
    /** U7d-2: ask for a link to choose a new password. The platform's answer is the same whoever the email names. */
    forgot: async (email) => {
      object(await request('/auth/forgot', { method: 'POST', body: { email }, sessionless: true }));
    },
    /** U7d-2: the new password, with the link's token. It signs nobody in, and signs the account out everywhere. */
    resetPassword: async (token, password) => object(await request('/auth/reset', { method: 'POST', body: { token, password }, sessionless: true })),
    async signOut() {
      try {
        await request('/auth/sign-out', { method: 'POST' });
      } finally {
        signedIn = false;
        epoch += 1;
        onSignedOut(null);
      }
    },
    /**
     * Which sign-in this is: it changes on every sign-in, sign-out and 401. A
     * screen that started something compares it before and after, and drops
     * what it made if it changed (src/ListActions.jsx: no file is saved).
     */
    epoch: () => epoch,
    /** Be told of every sign-out and every 401. Returns the way to stop. */
    /**
     * One read of a path of this origin that is not the platform's: a host's extra page
     * saying whether its step is done (src/extras.js). The same cookie, the same 401 rule,
     * the same epoch; the body as JSON, or a Problem.
     */
    readOwn(path) {
      return request(path, { whole: true });
    },
    listen(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Keep `language` on the signed-in owner's profile, so every computer they sign in on speaks it. */
    setLanguage: async (language) => object(await request('/auth/language', { method: 'PUT', body: { language } })),
    garages: async () => list(await request('/garages'), 'garages'),
    /**
     * Add a garage (U7c): its name, time zone and currency, and nothing else,
     * so what the platform does with an unknown plate, its kind of space and
     * whether it takes drivers without a pass stay its own (the last a Setup
     * step). None of the three can be changed after. The answer is the new
     * garage's row: its id is what these screens keep.
     */
    addGarage: async ({ name, timezone, currency }) => {
      const garage = object(object(await request('/garages', { method: 'POST', body: { name, timezone, currency }, byStatus: GARAGE_BY_STATUS })).garage);
      if (typeof garage.id !== 'string' || garage.id === '') throw new Problem('unexpected');
      return garage;
    },
    /**
     * The garage's lanes, and the platform's one setting for when a lane
     * computer counts as not heard from (`quiet_minutes`): read with them,
     * never kept here.
     */
    lanes: async (garageId) => {
      const data = await request(`/garages/${encodeURIComponent(garageId)}/lanes`);
      const lanes = list(data, 'lanes');
      const quietMinutes = data.quiet_minutes;
      if (!Number.isInteger(quietMinutes) || quietMinutes < 1) throw new Problem('unexpected');
      return { lanes, quietMinutes, screen: screenOf(data) };
    },
    /**
     * The garage's board: the messages for the lanes' screens, each lane's
     * price switch, and what the screens can show. Read, never kept here.
     */
    board: async (garageId) => {
      const data = object(await request(`/garages/${encodeURIComponent(garageId)}/board`));
      if (!Array.isArray(data.messages) || !Array.isArray(data.lanes) || !Number.isInteger(data.messages_max)) throw new Problem('unexpected');
      return { messages: data.messages, lanes: data.lanes, messagesMax: data.messages_max, screen: screenOf(data) };
    },
    addBoardMessage: async (garageId, message) =>
      object(await request(`/garages/${encodeURIComponent(garageId)}/board-messages`, { method: 'POST', body: message })),
    /** Only what changed is sent; `starts: null` or `ends: null` takes a time away. */
    changeBoardMessage: async (garageId, messageId, changes) =>
      object(await request(`/garages/${encodeURIComponent(garageId)}/board-messages/${encodeURIComponent(messageId)}`, { method: 'PATCH', body: changes })),
    removeBoardMessage: async (garageId, messageId) =>
      request(`/garages/${encodeURIComponent(garageId)}/board-messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' }),
    setBoardPrices: async (laneId, show) => object(await request(`/lanes/${encodeURIComponent(laneId)}/board-prices`, { method: 'PUT', body: { show: show === true } })),
    /** The garage's setup checklist, as the platform works it out: never worked out here. */
    setup: async (garageId) => {
      const data = object(object(await request(`/garages/${encodeURIComponent(garageId)}/setup`)).setup);
      if (!Array.isArray(data.steps)) throw new Problem('unexpected');
      return data;
    },
    /** One page of the change log, newest first; `after` is the `next` of the page before: a line's id, in the path. */
    changes: async (garageId, after = null) => {
      const page = after ? `/${encodeURIComponent(after)}` : '';
      const data = object(await request(`/garages/${encodeURIComponent(garageId)}/changes${page}`));
      if (!Array.isArray(data.changes)) throw new Problem('unexpected');
      return { changes: data.changes, next: typeof data.next === 'string' ? data.next : null };
    },
    /**
     * One page of the refused attempts, newest first, read apart from the
     * changes so they can never push a change out of sight; with how many
     * there are in all. `after` as for the changes.
     */
    refused: async (garageId, after = null) => {
      const page = after ? `/${encodeURIComponent(after)}` : '';
      const data = object(await request(`/garages/${encodeURIComponent(garageId)}/refused-attempts${page}`));
      const count = object(data.count);
      if (!Array.isArray(data.refused) || !Number.isInteger(count.attempts) || !Number.isInteger(count.lines)) throw new Problem('unexpected');
      return { refused: data.refused, next: typeof data.next === 'string' ? data.next : null, count: { lines: count.lines, attempts: count.attempts } };
    },
    /**
     * The garage's number of spaces (platform 0034): a whole number, 1 or
     * more. The answer is the garage's row; its `spaces` is what was kept.
     */
    setSpaces: async (garageId, spaces) => {
      const garage = object(object(await request(`/garages/${encodeURIComponent(garageId)}`, { method: 'PATCH', body: { spaces } })).garage);
      if (!Number.isInteger(garage.spaces)) throw new Problem('unexpected');
      return garage;
    },
    /** Whether the garage takes drivers without a pass: true or false, never back to unanswered. */
    setDrivers: async (garageId, takesAny) =>
      object(await request(`/garages/${encodeURIComponent(garageId)}`, { method: 'PATCH', body: { transient_available: takesAny === true } })),
    // ── U7f: tailgaters and banned cars ──
    /**
     * The garage's two tailgater settings, and every car whose ban reaches it
     * (listed here, or at one of the account's garages that bans across all),
     * each with its pictures. A car is listed only by the platform, as a
     * tailgater; nothing here can put one on the list.
     */
    banned: async (garageId) => {
      const data = object(await request(`/garages/${encodeURIComponent(garageId)}/banned`));
      if (typeof data.ban_tailgaters !== 'boolean' || !['garage', 'all'].includes(data.ban_reach)) throw new Problem('unexpected');
      return { banTailgaters: data.ban_tailgaters, banReach: data.ban_reach, cars: list(data, 'cars') };
    },
    /** The two settings: ban tailgaters (true or false), and the list's reach ('garage' or 'all'). */
    setTailgaters: async (garageId, { banTailgaters, banReach }) =>
      object(await request(`/garages/${encodeURIComponent(garageId)}`, { method: 'PATCH', body: { ban_tailgaters: banTailgaters === true, ban_reach: banReach === 'all' ? 'all' : 'garage' } })),
    /** Take one car off the list. */
    removeBanned: async (garageId, banId) =>
      object(await request(`/garages/${encodeURIComponent(garageId)}/banned/${encodeURIComponent(banId)}/remove`, { method: 'POST' })),
    addLane: async (garageId, name, direction) =>
      object(await request(`/garages/${encodeURIComponent(garageId)}/lanes`, { method: 'POST', body: { name, direction } })),
    renameLane: async (laneId, name) => object(await request(`/lanes/${encodeURIComponent(laneId)}`, { method: 'PATCH', body: { name } })),
    removeLane: async (laneId) => request(`/lanes/${encodeURIComponent(laneId)}`, { method: 'DELETE' }),
    closeLane: async (laneId, { reason, message, override = false }) =>
      object(await request(`/lanes/${encodeURIComponent(laneId)}/close`, { method: 'POST', body: { reason, message, ...(override ? { override: true } : {}) } })),
    reopenLane: async (laneId) => object(await request(`/lanes/${encodeURIComponent(laneId)}/reopen`, { method: 'POST' })),
    /**
     * Connect a lane computer. The answer holds its connection code, shown
     * once by the screen and kept nowhere: not here, not in storage, not in
     * the address.
     */
    connectComputer: async (laneId, name) => {
      const data = object(await request(`/lanes/${encodeURIComponent(laneId)}/devices`, { method: 'POST', body: { name } }));
      if (typeof data.token !== 'string' || !data.device) throw new Problem('unexpected');
      return { device: data.device, code: data.token };
    },
    cancelComputer: async (deviceId) => object(await request(`/devices/${encodeURIComponent(deviceId)}/revoke`, { method: 'POST' })),
    /**
     * The alerts, in the platform's order, its quiet setting, and the
     * garage's people with what each gets: read, never kept here.
     */
    alerts: async (garageId) => {
      const data = object(await request(`/garages/${encodeURIComponent(garageId)}/alerts`));
      if (!Array.isArray(data.alerts) || !Array.isArray(data.contacts) || !Number.isInteger(data.quiet_minutes) || !Number.isInteger(data.max_contacts)) {
        throw new Problem('unexpected');
      }
      return { alerts: data.alerts, contacts: data.contacts, quietMinutes: data.quiet_minutes, maxContacts: data.max_contacts };
    },
    addPerson: async (garageId, person) =>
      object(await request(`/garages/${encodeURIComponent(garageId)}/alert-contacts`, { method: 'POST', body: person })),
    /** Only what changed is sent; `phone: null` or `email: null` takes it away. The answer says what was turned off. */
    changePerson: async (garageId, personId, changes) =>
      object(await request(`/garages/${encodeURIComponent(garageId)}/alert-contacts/${encodeURIComponent(personId)}`, { method: 'PATCH', body: changes })),
    removePerson: async (garageId, personId) =>
      request(`/garages/${encodeURIComponent(garageId)}/alert-contacts/${encodeURIComponent(personId)}`, { method: 'DELETE' }),
    /** The whole of what a person gets: { by_text: [alert], by_email: [alert] }. */
    setChoices: async (garageId, personId, choices) =>
      object(await request(`/garages/${encodeURIComponent(garageId)}/alert-contacts/${encodeURIComponent(personId)}/choices`, { method: 'PUT', body: choices })),
    // ── The cars a person let out (platform 0048): read only ──
    /**
     * One day's cars let out at the garage, the garage's own day: `day`
     * (YYYY-MM-DD), named in the path (#90), or today when null -- the answer
     * says which day it read. Each carries the gate agent in short. The
     * platform's order (oldest first) is kept; the page orders it.
     */
    letOutDay: async (garageId, day = null) => {
      if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Problem('dayRefused');
      const named = day === null ? '' : `/day/${encodeURIComponent(day)}`;
      const data = object(await request(`/garages/${encodeURIComponent(garageId)}/exceptions${named}`));
      if (typeof data.day !== 'string' || !Array.isArray(data.exceptions) || !Number.isInteger(data.count)) throw new Problem('unexpected');
      return { day: data.day, count: data.count, owing: Number.isInteger(data.let_out_unpaid) ? data.let_out_unpaid : null, letOuts: data.exceptions };
    },
    /** One car let out: its whole story as the platform kept it, and everything appended after. */
    letOutStory: async (garageId, letOutId) => {
      const x = object(object(await request(`/garages/${encodeURIComponent(garageId)}/exceptions/${encodeURIComponent(letOutId)}`)).exception);
      if (typeof x.id !== 'string' || !x.story || typeof x.story !== 'object' || !x.gate_agent || typeof x.gate_agent !== 'object') throw new Problem('unexpected');
      return x;
    },
    carsInside: async (garageId) => {
      const data = object(await request(`/garages/${encodeURIComponent(garageId)}/sessions/open`));
      if (!Array.isArray(data.sessions)) throw new Problem('unexpected');
      return data;
    },
    // ── Stuck stays (platform 0043) ──
    /**
     * The open stays that look stuck, oldest first: older than the garage's
     * own number of hours, or not seen on its latest walk. The hours are the
     * platform's setting, read with the list, never kept here.
     */
    stuckStays: async (garageId) => {
      const data = object(await request(`/garages/${encodeURIComponent(garageId)}/stays/stuck`));
      if (!Number.isInteger(data.stuck_after_hours) || data.stuck_after_hours < 1) throw new Problem('unexpected');
      return { stuckAfterHours: data.stuck_after_hours, stays: list(data, 'stays') };
    },
    /** How many hours an open stay waits before it is listed: a whole number the platform bounds. */
    setStuckAfterHours: async (garageId, hours) =>
      object(await request(`/garages/${encodeURIComponent(garageId)}`, { method: 'PATCH', body: { stuck_after_hours: hours } })),
    /**
     * End one stay: `ended` (the car left at `leftAt`, an instant) or
     * `abandoned` (written off), with the person's reason. Nothing is charged:
     * an ended stay's price comes back as what it owes (`owedMinor`, null
     * when the rates could not price it). Since platform 0045 that is what
     * it still owes: the price (`priceMinor`) less what was paid on the stay
     * at an exit (`paid`, null when nothing was), never below 0 -- the
     * platform's figure, never worked out here. `passUnasked`: the garage
     * has no exit lane, so a pass it links was not asked about this car.
     */
    endStay: async (garageId, stayId, { outcome, reason, leftAt = null }) => {
      const body = { outcome, reason, ...(outcome === 'ended' && leftAt ? { left_at: leftAt } : {}) };
      const stay = object(object(await request(`/garages/${encodeURIComponent(garageId)}/stays/${encodeURIComponent(stayId)}/end`, { method: 'POST', body, named: END_NAMED })).stay);
      const owed = stay.ended?.owed ?? null;
      if (stay.owed_minor !== null && !Number.isInteger(stay.owed_minor)) throw new Problem('unexpected');
      const paid = stay.ended?.paid ?? null;
      const paidOk = paid !== null && typeof paid === 'object' && Number.isInteger(paid.amount_minor) && typeof paid.currency === 'string';
      return {
        owedMinor: stay.owed_minor,
        currency: stay.currency,
        covered: owed?.outcome === 'covered',
        priced: owed !== null && owed.refused !== true,
        priceMinor: Number.isInteger(owed?.fee_minor) ? owed.fee_minor : null,
        paid: paidOk ? { amountMinor: paid.amount_minor, currency: paid.currency.toUpperCase() } : null,
        passUnasked: stay.pass_unasked === true,
      };
    },
    /**
     * Every list of taxes the garage has stated, each with when it starts and
     * its lines, as the platform keeps them. Nothing here picks the one in
     * force for a fee: that is the rate engine's.
     */
    /**
     * U7g: the garage's rate plans, every one, and the kind of space its stays
     * are priced as (a plan the Rates form builds declares it).
     */
    ratePlans: async (garageId) => {
      const answer = await request(`/garages/${encodeURIComponent(garageId)}/rate-plans`, { byStatus: PLAN_BY_STATUS, dated: true });
      const data = object(answer.data);
      if (!Array.isArray(data.rate_plans) || typeof data.space_class !== 'string') throw new Problem('unexpected');
      const plans = data.rate_plans.map((row) => object(row.plan));
      // U7i: each stored row's id, which its change-log line names (who saved it), and
      // which a save names as the rates it was checked against (`based_on`).
      const saved = data.rate_plans.map((row) => ({ id: typeof row.id === 'string' ? row.id : null, plan_version: row.plan_version ?? row.plan?.plan_version }));
      // The platform's clock as it answered, and this computer's when the answer
      // came: new rates are dated by the platform's clock (rates.js platformNow,
      // OP-NODE-014). Null when the answer carried no Date.
      const clock = Number.isFinite(answer.date) ? { date: answer.date, local: Date.now() } : null;
      return { plans, spaceClass: data.space_class, saved, clock };
    },
    /**
     * U7g: what cars would pay, priced the way the platform prices a car that
     * leaves, nothing kept. `plan` is new rates not saved yet, or null for the
     * rates saved; `stays` are { entry, exit } in the garage's own time.
     */
    tryStays: async (garageId, { plan = null, stays }) => {
      const data = object(
        await request(`/garages/${encodeURIComponent(garageId)}/rate-plans/try`, {
          method: 'POST',
          body: plan ? { plan, stays } : { stays },
          byStatus: TRY_BY_STATUS,
          named: TRY_NAMED,
        }),
      );
      if (!Array.isArray(data.stays) || data.stays.length !== stays.length) throw new Problem('unexpected');
      return { stays: data.stays, draftFindings: Array.isArray(data.draft_findings) ? vetted('plan_has_findings', { findings: data.draft_findings }).findings : [] };
    },
    /**
     * U7g: new rates, saved once the owner confirmed them: `confirmed` is the tick.
     * U7i: `basedOn` is the id of the rates in force when the prices were
     * checked (null for none); the platform refuses the save if any other rates
     * were stored since (`ratesChanged`).
     */
    addRatePlan: async (garageId, plan, { confirmed, basedOn = null }) =>
      object(
        await request(`/garages/${encodeURIComponent(garageId)}/rate-plans`, {
          method: 'POST',
          body: { plan, confirmed: confirmed === true, based_on: basedOn },
          byStatus: PLAN_BY_STATUS,
        }),
      ),
    /** U7g: open the garage. Refused with the setup steps still missing (`problem.unmet`). */
    openGarage: async (garageId) => object(await request(`/garages/${encodeURIComponent(garageId)}/activate`, { method: 'POST' })),
    taxLists: async (garageId) => list(await request(`/garages/${encodeURIComponent(garageId)}/tax-sets`, { byStatus: TAX_BY_STATUS }), 'tax_sets'),
    /**
     * State a new list of taxes: `{ effective_from, rules }`, an empty `rules`
     * being "this garage charges no tax". The only write the Taxes page makes:
     * a list is never changed or taken back, a later one takes over.
     */
    addTaxList: async (garageId, taxList) =>
      object(object(await request(`/garages/${encodeURIComponent(garageId)}/tax-sets`, { method: 'POST', body: { tax_set: taxList }, byStatus: TAX_BY_STATUS })).tax_set),
    /** The garage's payment account as the platform last read it from Stripe, or null for none. */
    paymentAccount: async (garageId) => {
      const data = object(await request(`/garages/${encodeURIComponent(garageId)}/stripe-account`));
      if (!('stripe_account' in data) || (data.stripe_account !== null && typeof data.stripe_account !== 'object')) throw new Problem('unexpected');
      return data.stripe_account;
    },
    /** Make the garage's payment account, in `country` (two capital letters), or answer the one it has. */
    makePaymentAccount: async (garageId, country) =>
      object(object(await request(`/garages/${encodeURIComponent(garageId)}/stripe-account`, { method: 'POST', body: { country } })).stripe_account),
    /** Ask Stripe now what the account can do, and keep the answer with when it was read. */
    checkPaymentAccount: async (garageId) =>
      object(object(await request(`/garages/${encodeURIComponent(garageId)}/stripe-account/refresh`, { method: 'POST' })).stripe_account),
    /**
     * A fresh address of Stripe's own page for the garage's details. Opened for
     * the owner, never shown, kept or put in this page's address.
     */
    stripePage: async (garageId) => {
      const link = object(object(await request(`/garages/${encodeURIComponent(garageId)}/stripe-account/onboarding-link`, { method: 'POST' })).onboarding_link);
      if (typeof link.url !== 'string' || !/^https?:\/\//i.test(link.url)) throw new Problem('unexpected');
      return link.url;
    },
    /** Where the garage's card readers are: the place as the platform recorded it, or null for none yet. */
    readerPlace: async (garageId) => {
      const data = object(await request(`/garages/${encodeURIComponent(garageId)}/stripe-account/location`));
      if (!('location' in data) || (data.location !== null && typeof data.location !== 'object')) throw new Problem('unexpected');
      return data.location;
    },
    /** Give the place, once: `{ display_name, address: { line1, city, state, postal_code, country } }`. */
    setReaderPlace: async (garageId, place) =>
      object(object(await request(`/garages/${encodeURIComponent(garageId)}/stripe-account/location`, { method: 'POST', body: place })).location),
    /** Every card reader connection the garage's lanes have had, current ones first. */
    readerConnections: async (garageId) => list(await request(`/garages/${encodeURIComponent(garageId)}/readers`), 'readers'),
    /**
     * Connect the reader showing `code` to a way out, named `label`. The code
     * goes to the platform, which sends it to Stripe and keeps it nowhere; it
     * is not kept here either, nor in the answer.
     */
    connectReader: async (laneId, code, label) =>
      object(object(await request(`/lanes/${encodeURIComponent(laneId)}/reader`, { method: 'POST', body: { registration_code: code, label } })).reader),
    disconnectReader: async (laneId) => object(object(await request(`/lanes/${encodeURIComponent(laneId)}/reader/unbind`, { method: 'POST' })).reader),
  };
}
