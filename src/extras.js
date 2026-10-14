// Extra pages from the host.
//
// A host that serves these screens may serve more pages of its own beside them, and say
// so in one file at its origin, `/extra-pages.json`. These screens read it at start and
// draw each page it names inside their own page, in a same-origin frame: as one more step
// of Setup (with a path that answers whether it is done, and one line of facts), as a
// section inside one of the pages named below, or as a page of its own in the side menu,
// under a group the host names. The file absent, or not as expected, changes nothing
// anywhere. Nothing here knows what those pages are.
//
// The file: { "groups"?: [ { id, title: { en, es } } ],
//   "pages": [ { id, prefixes, page, title: { en, es }, purpose: { en, es },
//   setup?: { status }, section?: { page }, menu?: { group },
//   note?: { page, text: { en, es }, link: { en, es } } } ] }
//   groups    at most four menu groups, each id once; a group with no page is not drawn
//   id        letters, digits and dashes, at most 40, starting with a letter; each once
//   prefixes  one to four same-origin paths every path of the entry must start with
//   page      the page drawn in the frame; status: the setup step's path, with {garage}
//             where the garage's id goes
//   title, purpose   in English and Spanish, plain text, shown as text
//   menu      the page is in the side menu under the group with this id; a group the
//             file does not name refuses the entry
//   note      one short line at the top of one of NOTE_PAGES (text, then a link with its
//             own words), which opens the entry's menu page for the garage chosen: an
//             entry with a note must be in the menu; another page refuses the entry
//
// A path is accepted only when it is this origin's: it starts with "/" and not "//",
// holds no scheme, no backslash and no encoded form of either, and starts with one of the
// entry's prefixes. Anything else refuses the whole entry, and nothing of it is drawn.

export const EXTRA_PAGES_PATH = '/extra-pages.json';
export const MESSAGE_TYPE = 'extra-page';
/** The pages a section may sit inside. */
export const SECTION_PAGES = ['inside', 'changes'];
/** The pages that may show a host's note: never sign-in, Settings or the other pages. */
export const NOTE_PAGES = ['rates'];
export const LANGUAGES = ['en', 'es'];
/** At most this many menu groups from the host. */
export const MAX_GROUPS = 4;
const ID = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_PATH = 500;
const MAX_TEXT = 200;
/** A frame is never taller than this, whatever a page says (pixels). */
export const MAX_HEIGHT = 20000;

/** True when `path` is a plain path of this origin: a text that starts with "/" and names nothing else. */
export function ownPath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_PATH) return false;
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  for (const text of [path, decoded]) {
    if (!text.startsWith('/') || text.startsWith('//')) return false;
    if (/[\\\u0000-\u001f\u007f]/.test(text)) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(text.slice(1)) || /:\/\//.test(text)) return false;
    if (/\/\.\.(\/|$)/.test(text)) return false;
  }
  return true;
}

const text = (value) => (typeof value === 'string' && value.trim() && value.length <= MAX_TEXT && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null);

function words(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const l of LANGUAGES) {
    const w = text(value[l]);
    if (!w) return null;
    out[l] = w;
  }
  return out;
}

/** The icons a host group may name for its row in the side menu; any other, or none, is the chart. */
export const GROUP_ICONS = ['chart', 'log', 'check', 'car', 'garage', 'bell'];

/**
 * The menu groups the file names: { id -> { id, title, icon } }. A group not as expected is left
 * out (and so is every page that names it); a list that is not one, or is longer than
 * MAX_GROUPS, gives none.
 */
export function readGroups(raw) {
  const out = new Map();
  if (!Array.isArray(raw) || raw.length > MAX_GROUPS) return out;
  for (const g of raw) {
    if (!g || typeof g !== 'object' || Array.isArray(g) || typeof g.id !== 'string' || !ID.test(g.id) || out.has(g.id)) continue;
    const title = words(g.title);
    if (!title) continue;
    out.set(g.id, { id: g.id, title, icon: GROUP_ICONS.includes(g.icon) ? g.icon : 'chart' });
  }
  return out;
}

/** One entry, read; null when any part of it is not as expected. */
export function readEntry(raw, groups = new Map()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.id !== 'string' || !ID.test(raw.id)) return null;
  const prefixes = Array.isArray(raw.prefixes) ? raw.prefixes : [];
  if (prefixes.length < 1 || prefixes.length > 4 || !prefixes.every((p) => ownPath(p) && p.endsWith('/'))) return null;
  const under = (p) => ownPath(p) && prefixes.some((prefix) => p.startsWith(prefix));
  if (!under(raw.page)) return null;
  const title = words(raw.title);
  const purpose = words(raw.purpose);
  if (!title || !purpose) return null;
  const entry = { id: raw.id, prefixes: [...prefixes], page: raw.page, title, purpose, setup: null, section: null, menu: null, note: null };
  if (raw.setup !== undefined) {
    if (!raw.setup || typeof raw.setup !== 'object' || !under(raw.setup.status)) return null;
    entry.setup = { status: raw.setup.status };
  }
  if (raw.section !== undefined) {
    if (!raw.section || typeof raw.section !== 'object' || !SECTION_PAGES.includes(raw.section.page)) return null;
    entry.section = { page: raw.section.page };
  }
  if (raw.menu !== undefined) {
    if (!raw.menu || typeof raw.menu !== 'object' || typeof raw.menu.group !== 'string' || !groups.has(raw.menu.group)) return null;
    entry.menu = { group: groups.get(raw.menu.group) };
  }
  if (raw.note !== undefined) {
    const n = raw.note;
    if (!n || typeof n !== 'object' || Array.isArray(n) || !NOTE_PAGES.includes(n.page) || !entry.menu) return null;
    const noteText = words(n.text);
    const link = words(n.link);
    if (!noteText || !link) return null;
    entry.note = { page: n.page, text: noteText, link };
  }
  if (!entry.setup && !entry.section && !entry.menu) return null;
  return entry;
}

/**
 * The file, read: the entries that are as expected, each id once. An entry that is not --
 * a path of another host, a name missing -- is refused and nothing of it is drawn; a file
 * that is not a list of entries gives none.
 */
export function readExtraPages(file) {
  if (!file || typeof file !== 'object' || !Array.isArray(file.pages) || file.pages.length > 20) return [];
  const groups = readGroups(file.groups);
  const out = [];
  const seen = new Set();
  for (const raw of file.pages) {
    const entry = readEntry(raw, groups);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

/**
 * The file from this origin, as a list of entries: none when it is absent, not JSON, or not
 * as expected. Never throws.
 */
export async function loadExtraPages(fetchFn = globalThis.fetch?.bind(globalThis)) {
  try {
    const res = await fetchFn(EXTRA_PAGES_PATH, { credentials: 'omit', cache: 'no-store' });
    if (!res.ok) return [];
    return readExtraPages(await res.json());
  } catch {
    return [];
  }
}

/**
 * The side menu's groups, in the order the file first names a page of each: [{ id, title,
 * entries }]. Only groups with a page.
 */
export function menuGroups(extras) {
  const out = [];
  for (const entry of extras) {
    if (!entry.menu) continue;
    let group = out.find((g) => g.id === entry.menu.group.id);
    if (!group) {
      group = { id: entry.menu.group.id, title: entry.menu.group.title, icon: entry.menu.group.icon ?? 'chart', entries: [] };
      out.push(group);
    }
    group.entries.push(entry);
  }
  return out;
}

/** The notes the host puts at the top of one page: the entries whose note names it. */
export const notesFor = (extras, pageId) => extras.filter((e) => e.note && e.menu && e.note.page === pageId);

/** A menu page's address in these screens, and the menu page an address names (its id, or null). */
export const EXTRA_HASH_PREFIX = '#/extra/';
export const menuHash = (entry) => `${EXTRA_HASH_PREFIX}${entry.id}`;
export function menuIdForHash(hash) {
  const h = String(hash ?? '');
  if (!h.startsWith(EXTRA_HASH_PREFIX)) return null;
  const id = h.slice(EXTRA_HASH_PREFIX.length);
  return ID.test(id) ? id : null;
}

/** The address a framed page is opened at: its path, the chosen garage, the language and the look. */
export function frameAddress(entry, { garageId, language, look }) {
  const [path, hash = ''] = entry.page.split('#');
  const q = new URLSearchParams({ framed: entry.id, garage: garageId, language, look });
  return `${path}?${q.toString()}${hash ? `#${hash}` : ''}`;
}

/** The setup step's status path for a garage. */
export const statusAddress = (entry, garageId) => entry.setup.status.replaceAll('{garage}', encodeURIComponent(garageId));

/**
 * A message from a frame, as these screens act on it: from this origin only, of the expected
 * shape only -- { type, id, height? , changed? } with a height a page can have. Else null.
 */
export function frameMessage(event, { origin, ids }) {
  if (!event || event.origin !== origin) return null;
  const m = event.data;
  if (!m || typeof m !== 'object' || Array.isArray(m) || m.type !== MESSAGE_TYPE || typeof m.id !== 'string' || !ids.includes(m.id)) return null;
  const out = { id: m.id };
  if (m.height !== undefined) {
    if (typeof m.height !== 'number' || !Number.isFinite(m.height) || m.height < 0 || m.height > MAX_HEIGHT) return null;
    out.height = Math.ceil(m.height);
  }
  if (m.changed !== undefined) {
    if (m.changed !== true) return null;
    out.changed = true;
  }
  if (out.height === undefined && !out.changed) return null;
  return out;
}

/** The status a step's path answered, read: { done, facts } or null when not as expected. */
export function readStatus(body, language) {
  if (!body || typeof body !== 'object' || typeof body.done !== 'boolean') return null;
  const facts = body.facts && typeof body.facts === 'object' ? text(body.facts[language]) ?? text(body.facts.en) : null;
  return { done: body.done, facts };
}
