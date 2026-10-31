// What the person signed in may open, as the platform's `GET /api/v1/auth/me` says it.
//
// The platform names one permission on every operator route (its README, "Permissions:
// one on every operator route"): `<area>:read` or `<area>:change`, a change covering its
// read. The admin holds every one at every garage; a person from a linked accounts module
// holds the ones the module gives, at all garages or a list. This file only decides what
// the menus show and which pages draw: the platform refuses everything else on its own,
// whatever these screens show. An answer that names no permissions is a platform from
// before they existed, where the one person signed in could do everything.

/** Every read each page makes, as the platform's routes name them. A page with none is about these screens. */
export const PAGE_NEEDS = {
  home: ['garages:read'],
  setup: ['garages:read'],
  garages: ['garages:read'],
  lanes: ['lanes:read', 'garages:read'],
  drawings: ['lanes:read', 'garages:read'],
  readers: ['payments:read', 'lanes:read', 'garages:read'],
  rates: ['rates:read', 'log:read'],
  taxes: ['rates:read'],
  paid: ['payments:read', 'garages:read'],
  inside: ['stays:read'],
  // The cars a person let out (platform 0048): its day and each story are stays:read on the
  // platform (#78), and it names the lanes.
  exceptions: ['stays:read', 'lanes:read'],
  banned: ['garages:read'],
  alerts: ['garages:read'],
  changes: ['log:read'],
  settings: [],
};

const PERMISSION = /^[a-z]{1,20}:(read|change)$/;
const EVERYTHING = Object.freeze({ kind: 'admin', permissions: 'all', garages: 'all' });

/**
 * What `who` may do: { kind, permissions: 'all' | [..], garages: 'all' | [ids] }. An
 * answer with no `permissions` is everything (a platform from before them); one whose
 * permissions are not a list of the platform's form opens nothing.
 */
export function accessOf(who) {
  if (!who || typeof who !== 'object' || who.permissions === undefined) return EVERYTHING;
  const kind = who.kind === 'linked' ? 'linked' : 'admin';
  const permissions = Array.isArray(who.permissions) && who.permissions.every((p) => typeof p === 'string' && PERMISSION.test(p)) ? [...who.permissions] : [];
  const garages = who.garages === 'all' ? 'all' : Array.isArray(who.garages) ? who.garages.filter((g) => typeof g === 'string') : [];
  return { kind, permissions, garages };
}

/** Whether `access` holds `wanted`: the permission itself, or its change when a read is wanted. */
export function holds(access, wanted) {
  if (access.permissions === 'all') return true;
  if (access.permissions.includes(wanted)) return true;
  const [area, verb] = wanted.split(':');
  return verb === 'read' && access.permissions.includes(`${area}:change`);
}

/** Whether a page draws for `access`: it holds every read the page makes. An unknown page draws nothing. */
export function opens(access, pageId) {
  const needs = PAGE_NEEDS[pageId];
  return Array.isArray(needs) && needs.every((p) => holds(access, p));
}

/** Whether `access` may add a garage: a change to garages, at every garage. */
export const addsGarages = (access) => holds(access, 'garages:change') && access.garages === 'all';
