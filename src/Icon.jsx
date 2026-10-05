// Line icons, drawn here so nothing is fetched. Decorative only: every icon
// sits beside words that say the same thing.

const PATHS = {
  home: ['M3 11l9-7 9 7', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
  garage: ['M3 20V9l9-5 9 5v11', 'M7 20v-8h10v8', 'M7 15h10'],
  lane: ['M5 21L9 3', 'M19 21L15 3', 'M12 6v2', 'M12 11v2', 'M12 16v2'],
  card: ['M3 6h18v12H3z', 'M3 10h18', 'M7 15h4'],
  rate: ['M20 12l-8 8-9-9V3h8z', 'M7.5 7.5h.01'],
  tax: ['M19 5L5 19', 'M7 7h.01', 'M17 17h.01', 'M4 7a3 3 0 1 0 6 0a3 3 0 1 0-6 0', 'M14 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0'],
  paid: ['M3 7h18v10H3z', 'M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5', 'M6 12h.01', 'M18 12h.01'],
  car: ['M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16', 'M3 16h18v3H3z', 'M7 19v2', 'M17 19v2'],
  search: ['M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13', 'M15.5 15.5L20 20'],
  day: ['M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  night: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  auto: ['M3 5h18v11H3z', 'M8 20h8', 'M12 16v4'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  check: ['M4 6h11', 'M4 12h11', 'M4 18h11', 'M18 5l1.5 1.5L22 4', 'M18 11l1.5 1.5L22 10'],
  log: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 12h7', 'M9 16h7'],
  copy: ['M8 8h12v12H8z', 'M4 16V4h12'],
  bell: ['M6 16V11a6 6 0 0 1 12 0v5l2 2H4z', 'M10 20a2 2 0 0 0 4 0'],
};

export default function Icon({ name }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {(PATHS[name] ?? []).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
