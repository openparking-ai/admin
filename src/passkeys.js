// Passkeys in the browser: the platform's options in, the browser's answer out.
//
// The platform sends WebAuthn options as JSON, every binary field base64url, and reads the
// answer in the same form (its README, "Passkeys for the admin"). The browser wants and
// gives ArrayBuffers. These are the only conversions; nothing here keeps a key, a challenge
// or an answer, and nothing is written to storage, the address or a log.

import { Problem } from './api.js';

/** base64url text to bytes; null for anything that is not base64url. */
export function fromBase64url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const b64 = text.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((text.length + 3) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

/** Bytes (an ArrayBuffer or a view of one) to base64url text, with no padding. */
export function toBase64url(bytes) {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let raw = '';
  for (const b of view) raw += String.fromCharCode(b);
  return btoa(raw).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

const bytes = (text) => {
  const out = fromBase64url(text);
  if (!out) throw new Problem('unexpected');
  return out;
};
const withIds = (list) => (Array.isArray(list) ? list.map((c) => ({ ...c, id: bytes(c.id) })) : undefined);

/** The options to ask for a passkey with (`navigator.credentials.get`), from the platform's JSON. */
export function requestOptions(json) {
  if (!json || typeof json !== 'object' || typeof json.challenge !== 'string') throw new Problem('unexpected');
  const out = { ...json, challenge: bytes(json.challenge) };
  if (json.allowCredentials !== undefined) out.allowCredentials = withIds(json.allowCredentials);
  return out;
}

/** The options to make a passkey with (`navigator.credentials.create`), from the platform's JSON. */
export function creationOptions(json) {
  if (!json || typeof json !== 'object' || typeof json.challenge !== 'string' || !json.user || typeof json.user.id !== 'string') throw new Problem('unexpected');
  const out = { ...json, challenge: bytes(json.challenge), user: { ...json.user, id: bytes(json.user.id) } };
  if (json.excludeCredentials !== undefined) out.excludeCredentials = withIds(json.excludeCredentials);
  return out;
}

/** The browser's answer as the platform reads it: every binary field base64url. */
export function answerJson(credential) {
  const r = credential.response;
  const response = { clientDataJSON: toBase64url(r.clientDataJSON) };
  if (r.attestationObject) {
    response.attestationObject = toBase64url(r.attestationObject);
    if (typeof r.getTransports === 'function') response.transports = r.getTransports();
  } else {
    response.authenticatorData = toBase64url(r.authenticatorData);
    response.signature = toBase64url(r.signature);
    if (r.userHandle) response.userHandle = toBase64url(r.userHandle);
  }
  const extensions = typeof credential.getClientExtensionResults === 'function' ? credential.getClientExtensionResults() : {};
  return {
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    type: credential.type,
    response,
    clientExtensionResults: extensions,
    ...(credential.authenticatorAttachment ? { authenticatorAttachment: credential.authenticatorAttachment } : {}),
  };
}

/** Whether this browser can use passkeys at all. */
export function passkeysHere(win = globalThis.window) {
  return typeof win?.PublicKeyCredential === 'function' && typeof win?.navigator?.credentials?.get === 'function';
}

/**
 * The browser's own window, then its answer. A person who closes it, or a passkey this
 * browser does not have, is `passkeyStopped`: nothing was sent, and the password still works.
 */
async function ask(how, publicKey, credentials) {
  let credential;
  try {
    credential = await credentials[how]({ publicKey });
  } catch (err) {
    throw new Problem(err?.name === 'NotAllowedError' || err?.name === 'AbortError' ? 'passkeyStopped' : how === 'create' ? 'passkeyNotAdded' : 'passkeyRefused');
  }
  if (!credential) throw new Problem('passkeyStopped');
  return answerJson(credential);
}

/** Ask the browser for a passkey to sign in with. */
export const askForPasskey = (json, credentials = globalThis.navigator.credentials) => ask('get', requestOptions(json), credentials);

/** Ask the browser to make a passkey. */
export const makePasskey = (json, credentials = globalThis.navigator.credentials) => ask('create', creationOptions(json), credentials);
