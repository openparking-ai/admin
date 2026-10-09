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
  'emailSpace', 'emailAt', 'emailLong', 'emailOdd', 'unreachable', 'peopleFull', 'textNeedsPhone', 'emailNeedsEmail',
  // U4c: what a lane does when it is closed, and what its screen says.
  'laneReason', 'screenCharacters', 'boardText', 'boardLanes', 'boardTime', 'boardFull',
  // U6: taxes, getting paid and card readers.
  'taxListRefused', 'taxStartTaken', 'taxNotKept', 'taxNotChecked', 'garageNotFound',
  'cardsNotSetUp', 'countryRefused', 'stripeRefused', 'stripeUnreachable', 'accountTwice', 'noAccount', 'cardsNotActive',
  'placeRefused', 'noPlace', 'readerRefused', 'laneHasReader', 'readerElsewhere', 'noReader',
];

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
  [400, 'alert_contact_unreachable', 'unreachable'],
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
];

/**
 * The tax routes' refusals that carry no code, by status: a list the rate
 * engine would not take is a 400 holding the engine's own sentence (the
 * platform's taxSetRefusal), and a garage not found is a 404. Each has its
 * own words; the platform's text is never kept.
 */
const TAX_BY_STATUS = { 400: 'taxListRefused', 404: 'garageNotFound' };

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
  constructor(kind) {
    super(kind);
    this.kind = kind;
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
export function createClient({ fetch: fetchFn = globalThis.fetch.bind(globalThis) } = {}) {
  let epoch = 0;
  let signedIn = false;
  const listeners = new Set();
  const onSignedOut = (kind) => {
    for (const fn of listeners) fn(kind);
  };

  async function request(path, { method = 'GET', body, signingIn = false, byStatus = null } = {}) {
    const asked = epoch;
    let res;
    try {
      res = await fetchFn(`${BASE}${path}`, {
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
      if (signingIn && code === 'sign_in_refused') {
        onSignedOut(null);
        throw new Problem('refused');
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
      const named = NAMED.find(([status, name]) => status === res.status && name === code)?.[2];
      // A route whose refusals carry no code says which words each status has (TAX_BY_STATUS).
      const byRoute = code === undefined && fromPlatform && byStatus ? byStatus[res.status] : undefined;
      throw new Problem(named ?? byRoute ?? (code === undefined && fromPlatform && method !== 'GET' ? BY_STATUS[res.status] : undefined) ?? 'unexpected');
    }
    if (data === undefined) throw new Problem('unexpected');
    return data;
  }

  // An answer that arrived after a sign-out belongs to nobody on screen now.
  const stale = (asked) => (asked === epoch ? null : new Problem(STALE));

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
      const who = object(await request('/auth/sign-in', { method: 'POST', body: { email, password }, signingIn: true }));
      signedIn = true;
      return who;
    },
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
    listen(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Keep `language` on the signed-in owner's profile, so every computer they sign in on speaks it. */
    setLanguage: async (language) => object(await request('/auth/language', { method: 'PUT', body: { language } })),
    garages: async () => list(await request('/garages'), 'garages'),
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
    /** Whether the garage takes drivers without a pass: true or false, never back to unanswered. */
    setDrivers: async (garageId, takesAny) =>
      object(await request(`/garages/${encodeURIComponent(garageId)}`, { method: 'PATCH', body: { transient_available: takesAny === true } })),
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
    carsInside: async (garageId) => {
      const data = object(await request(`/garages/${encodeURIComponent(garageId)}/sessions/open`));
      if (!Array.isArray(data.sessions)) throw new Problem('unexpected');
      return data;
    },
    /**
     * Every list of taxes the garage has stated, each with when it starts and
     * its lines, as the platform keeps them. Nothing here picks the one in
     * force for a fee: that is the rate engine's.
     */
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
