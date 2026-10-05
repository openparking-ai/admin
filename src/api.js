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
  [400, 'alert_contact_name_refused', 'personName'],
  [400, 'alert_contact_unreachable', 'unreachable'],
  [409, 'alert_contacts_full', 'peopleFull'],
  [409, 'alert_text_needs_phone', 'textNeedsPhone'],
  [409, 'alert_email_needs_email', 'emailNeedsEmail'],
  [404, 'alert_contact_not_found', 'notFound'],
];

/**
 * A phone number or email address refused, by why: the platform's
 * `details.reason`, one of a known few, each with its own words. Any other
 * reason is the plainest sentence for the field.
 */
const BY_REASON = {
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

  async function request(path, { method = 'GET', body, signingIn = false } = {}) {
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
      const named = NAMED.find(([status, name]) => status === res.status && name === code)?.[2];
      throw new Problem(named ?? (code === undefined && fromPlatform && method !== 'GET' ? BY_STATUS[res.status] : undefined) ?? 'unexpected');
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
      return { lanes, quietMinutes };
    },
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
  };
}
