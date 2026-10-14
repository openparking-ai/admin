// The side menu (the approved picture of 2026-10-13).
//
// Home, Garage View and Alerts keep their own entries, in that order, at the top. Every
// other page is in one group, Setup, in the order src/pages.js lists them. The host's own
// groups (src/extras.js) sit below Setup. One way to draw a group, for Setup and the
// host's alike. Whether each group is open is kept on this computer; a group opens itself
// when the page shown is inside it. A page's address, title, purpose and search words do
// not change with where it sits in the menu.

import { PAGES } from './pages.js';

/** The pages with their own entry at the top, in order. */
export const TOP = ['home', 'inside', 'alerts'];
/** The group every other page is in. */
export const SETUP_GROUP = 'own:setup';
/** Where this computer keeps which groups are open. */
export const MENU_KEY = 'openparking-admin.menu';
/** At most this many groups are kept: Setup and the host's (src/extras.js MAX_GROUPS). */
const MAX_KEPT = 8;

/** The pages at the top and the pages in Setup, each in order. */
export function menuPages(pages = PAGES) {
  return {
    top: TOP.map((id) => pages.find((p) => p.id === id)).filter(Boolean),
    setup: pages.filter((p) => !TOP.includes(p.id)),
  };
}

/** A host group's key in the kept state: apart from Setup's, whatever id the host gives it. */
export const hostGroupKey = (id) => `host:${id}`;

/** The group the page shown is inside (its key), or null for one at the top. */
export function groupShown(page, menuEntry) {
  if (menuEntry?.menu) return hostGroupKey(menuEntry.menu.group.id);
  if (!page || TOP.includes(page.id)) return null;
  return SETUP_GROUP;
}

/** Closed until opened: Setup. The host's groups are open until closed, as before. */
export const openByDefault = (key) => key !== SETUP_GROUP;

/** Whether a group is open: as kept, else its default. */
export const isOpen = (state, key) => (typeof state?.[key] === 'boolean' ? state[key] : openByDefault(key));

/** Which groups this computer has open or closed: { key: true|false }. Anything else kept there is ignored. */
export function readOpenGroups(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(MENU_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [key, open] of Object.entries(raw).slice(0, MAX_KEPT)) {
      if (typeof open === 'boolean' && /^(own|host):[A-Za-z0-9_-]{1,64}$/.test(key)) out[key] = open;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveOpenGroups(storage, state) {
  try {
    storage?.setItem(MENU_KEY, JSON.stringify(state));
  } catch {
    // Storage switched off: open and closed hold for this visit only.
  }
}

/** The state with one group opened or closed. */
export const withGroup = (state, key, open) => ({ ...state, [key]: open });
