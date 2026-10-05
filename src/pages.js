// The owner's pages, in the order the side navigation shows them.
//
// A page's words live in the dictionaries under `page.<id>.title`,
// `page.<id>.purpose` and `page.<id>.words` (the other things a person might
// type to find it, comma-separated). Nothing readable is kept here.

export const PAGES = [
  { id: 'home', path: '/', icon: 'home' },
  { id: 'setup', path: '/setup', icon: 'check' },
  { id: 'garages', path: '/garages', icon: 'garage' },
  { id: 'lanes', path: '/lanes', icon: 'lane' },
  { id: 'readers', path: '/card-readers', icon: 'card' },
  { id: 'rates', path: '/rates', icon: 'rate' },
  { id: 'taxes', path: '/taxes', icon: 'tax' },
  { id: 'paid', path: '/getting-paid', icon: 'paid' },
  { id: 'inside', path: '/cars-inside', icon: 'car' },
  { id: 'changes', path: '/change-log', icon: 'log' },
];

export const HOME = PAGES[0];

/** The page a location hash points at, or Home for anything unknown. */
export function pageForHash(hash) {
  const path = String(hash ?? '').replace(/^#/, '') || '/';
  return PAGES.find((p) => p.path === path) ?? HOME;
}

export const hashFor = (page) => `#${page.path}`;
