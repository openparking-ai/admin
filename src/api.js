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

export const PROBLEM_KINDS = ['refused', 'tooMany', 'busy', 'notSetUp', 'wrongPlace', 'incomplete', 'ended', 'unreachable', 'unexpected'];

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
];

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
    if (!res.ok) throw new Problem(NAMED.find(([status, named]) => status === res.status && named === code)?.[2] ?? 'unexpected');
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
    /** Be told of every sign-out and every 401. Returns the way to stop. */
    listen(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Keep `language` on the signed-in owner's profile, so every computer they sign in on speaks it. */
    setLanguage: async (language) => object(await request('/auth/language', { method: 'PUT', body: { language } })),
    garages: async () => list(await request('/garages'), 'garages'),
    lanes: async (garageId) => list(await request(`/garages/${encodeURIComponent(garageId)}/lanes`), 'lanes'),
    carsInside: async (garageId) => {
      const data = object(await request(`/garages/${encodeURIComponent(garageId)}/sessions/open`));
      if (!Array.isArray(data.sessions)) throw new Problem('unexpected');
      return data;
    },
  };
}
