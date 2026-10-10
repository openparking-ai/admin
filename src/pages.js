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
  { id: 'drawings', path: '/installer-drawings', icon: 'drawings' },
  { id: 'readers', path: '/card-readers', icon: 'card' },
  { id: 'rates', path: '/rates', icon: 'rate' },
  { id: 'taxes', path: '/taxes', icon: 'tax' },
  { id: 'paid', path: '/getting-paid', icon: 'paid' },
  // U7a: Garage View, once "Cars inside": its old address still opens it.
  { id: 'inside', path: '/garage-view', was: ['/cars-inside'], icon: 'car' },
  { id: 'alerts', path: '/alerts', icon: 'bell' },
  { id: 'changes', path: '/change-log', icon: 'log' },
  // U7a: the language and the look, once at the top of every page.
  { id: 'settings', path: '/settings', icon: 'settings' },
];

export const HOME = PAGES[0];

/** The page a location hash points at (by its address, or one it had before), or Home for anything unknown. */
export function pageForHash(hash) {
  const path = String(hash ?? '').replace(/^#/, '') || '/';
  return PAGES.find((p) => p.path === path || p.was?.includes(path)) ?? HOME;
}

export const hashFor = (page) => `#${page.path}`;
