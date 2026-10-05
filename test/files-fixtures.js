// Lists for the file checks (scripts/check-files.js, scripts/check-downloads.js),
// shaped as the platform answers them. Every name and plate here is invented.

const MINUTE = 60_000;

/** The moment of the read: 11:41 AM in New York on 10 March 2026 (EDT). */
export const READ_AT = new Date('2026-03-10T15:41:00Z');

export const GARAGE = {
  id: 'f1000000-0000-4000-8000-000000000001',
  name: 'Garaje Peña Ñandú – Café ¿?',
  timezone: 'America/New_York',
  currency: 'USD',
  live: true,
};

/**
 * The clock change in New York, 8 March 2026: 2:00 AM became 3:00 AM.
 * One stay let in before it (1:30 AM EST) and one after (3:30 AM EDT).
 */
export const BEFORE_CHANGE = '2026-03-08T06:30:00Z';
export const AFTER_CHANGE = '2026-03-08T07:30:00Z';

/** Values a spreadsheet would turn into something else if they were not text. */
export const TEXT_CASES = { ticket: '007', plate: '1E5', formula: '=1+1', at: '@Rampa Norte' };

const stay = (n, fields) => ({
  id: `ff100000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  entry_at: '2026-03-10T15:05:00Z',
  currency: 'USD',
  entry_confirmation: 'confirmed',
  plate: null,
  plate_region: null,
  ticket_ref: null,
  entry_lane: 'Entrada Norte',
  ...fields,
});

export function insideData() {
  const sessions = [
    stay(1, { plate: 'HRB4410', plate_region: 'FL', entry_at: BEFORE_CHANGE }),
    stay(2, { ticket_ref: TEXT_CASES.ticket, entry_at: AFTER_CHANGE }),
    stay(3, { plate: TEXT_CASES.plate, entry_lane: TEXT_CASES.at }),
    stay(4, { plate: TEXT_CASES.formula, ticket_ref: 'T-0099', entry_confirmation: 'unconfirmable' }),
  ];
  return withCounts(sessions);
}

export function withCounts(sessions) {
  const confirmed = sessions.filter((s) => s.entry_confirmation === 'confirmed').length;
  return { inside_count: confirmed, unconfirmable_count: sessions.length - confirmed, open_count: sessions.length, sessions };
}

/** `count` stays, each with its own plate, PL00001 on. */
export function manyStays(count) {
  return withCounts(
    Array.from({ length: count }, (_, i) =>
      stay(1000 + i, {
        plate: `PL${String(i + 1).padStart(5, '0')}`,
        plate_region: 'NY',
        entry_at: new Date(Date.parse('2026-03-09T12:00:00Z') + i * 7 * MINUTE).toISOString(),
        entry_confirmation: i % 9 === 0 ? 'unconfirmable' : 'confirmed',
      }),
    ),
  );
}

/** A name of 60 characters, in words, so it wraps where a person would break it. */
export const LONG_NAME = 'Estacionamiento Municipal de la Avenida Libertador Poniente 1';

export function lanesData(readAt = READ_AT) {
  const ago = (ms) => new Date(readAt - ms).toISOString();
  return [
    {
      id: 'lf100000-0000-4000-8000-000000000001',
      name: 'Entrada Norte',
      direction: 'entry',
      reader: { reader_id: 'rd-fixture-0001', label: 'Entrada Norte reader', bound_at: ago(90 * 24 * 60 * MINUTE) },
      devices: [{ id: 'df100000-0000-4000-8000-000000000001', name: 'Computadora Norte', last_seen_at: ago(2 * MINUTE), revoked_at: null }],
    },
    {
      id: 'lf100000-0000-4000-8000-000000000002',
      name: TEXT_CASES.at,
      direction: 'exit',
      reader: null,
      devices: [
        { id: 'df100000-0000-4000-8000-000000000002', name: 'Computadora Rampa', last_seen_at: BEFORE_CHANGE, revoked_at: null },
        { id: 'df100000-0000-4000-8000-000000000003', name: 'Computadora Rampa vieja', last_seen_at: '2026-01-04T22:10:00Z', revoked_at: '2026-01-05T13:55:00Z' },
        { id: 'df100000-0000-4000-8000-000000000004', name: 'Computadora Rampa nueva', last_seen_at: null, revoked_at: null },
      ],
    },
    { id: 'lf100000-0000-4000-8000-000000000003', name: 'Carril de Servicio', direction: 'entry', reader: null, devices: [] },
  ];
}
