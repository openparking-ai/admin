// The garages the installer drawings are checked on (scripts/check-drawings.js).
// Invented names and lanes; every garage in New York time.

export const MADE_AT = new Date('2026-10-08T15:00:00Z');

export const ANY_DRIVER = {
  garage: { id: 'd1000000-0000-4000-8000-000000000001', name: 'Harbor Street Garage', timezone: 'America/New_York' },
  takesAnyDriver: true,
  lanes: [
    { id: 'ld100000-0000-4000-8000-000000000001', name: 'North Entry', direction: 'entry' },
    { id: 'ld100000-0000-4000-8000-000000000002', name: 'South Entry', direction: 'entry' },
    { id: 'ld100000-0000-4000-8000-000000000003', name: 'Main Exit', direction: 'exit' },
  ],
};

export const PASS_ONLY = {
  garage: { id: 'd2000000-0000-4000-8000-000000000002', name: 'Elm Court Garage', timezone: 'America/New_York' },
  takesAnyDriver: false,
  lanes: [
    { id: 'ld200000-0000-4000-8000-000000000001', name: 'Elm Gate In', direction: 'entry' },
    { id: 'ld200000-0000-4000-8000-000000000002', name: 'Elm Gate Out', direction: 'exit' },
  ],
};

export const UNANSWERED = {
  garage: { id: 'd3000000-0000-4000-8000-000000000003', name: 'Riverside Deck', timezone: 'America/New_York' },
  takesAnyDriver: null,
  lanes: [{ id: 'ld300000-0000-4000-8000-000000000001', name: 'Ramp In', direction: 'entry' }],
};

export const NO_LANES = {
  garage: { id: 'd4000000-0000-4000-8000-000000000004', name: 'Bay Lot', timezone: 'America/New_York' },
  takesAnyDriver: true,
  lanes: [],
};

/** Long names in both places a name is printed: the title block and the server room. */
export const LONG_NAMES = {
  garage: { id: 'd5000000-0000-4000-8000-000000000005', name: 'The Very Long Name Municipal Parking Structure at Harbor Street and Fifth Avenue, North Building, Upper Levels', timezone: 'America/New_York' },
  takesAnyDriver: true,
  lanes: [
    { id: 'ld500000-0000-4000-8000-000000000001', name: 'Northeast Corner Entrance from Harbor Street, the wide one by the loading dock', direction: 'entry' },
    { id: 'ld500000-0000-4000-8000-000000000002', name: 'Peña Ñandú – Café ¿Salida?', direction: 'exit' },
    { id: 'ld500000-0000-4000-8000-000000000003', name: 'Third Lane', direction: 'exit' },
  ],
};
