// The links an email brings (U7d-2): `<admin>/#invite=<token>` to accept an
// invite and make the account, `<admin>/#reset=<token>` to choose a new
// password.
//
// The token rides in the address's fragment, which a browser never sends to
// anyone. It is read from there once, as the page starts (or as a link is
// opened in a page already open), and the address is put back without it at
// once, in place: so it is not left in the browser's history, a bookmark, or
// a picture of the address bar. From then on it lives in memory only, and
// goes to the platform in a POST body (src/api.js), never in an address or a
// query.

const LINK = /^#(invite|reset)=(.*)$/s;

/** The link in `location`, taken out of the address: `{ kind, token }`, or null when there is none. */
export function takeLink(location, history) {
  const m = LINK.exec(location.hash ?? '');
  if (!m) return null;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  return { kind: m[1], token: m[2].trim() };
}

/** The most a link's token can be, as the platform reads one: an empty one, or a longer one, is no link of ours. */
export const TOKEN_MAX = 128;
export const couldBeToken = (token) => typeof token === 'string' && token.length > 0 && token.length <= TOKEN_MAX;

/** The platform's one rule for a password: 12 to 1024 characters, counted as a person counts them. */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 1024;

/**
 * What is wrong with a new password typed twice, before anything is sent:
 * the dictionary keys of what to say (`password.short`, `password.long`,
 * `password.differ`), none when it can be sent.
 */
export function passwordProblems(first, second) {
  const length = [...first].length;
  const problems = [];
  if (length < PASSWORD_MIN) problems.push('password.short');
  if (length > PASSWORD_MAX) problems.push('password.long');
  if (first !== second) problems.push('password.differ');
  return problems;
}
