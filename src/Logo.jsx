// The Open Parking AI mark, exactly as the site draws it: nine faces of a
// stack of three blocks, in ink, gold and pale gold.

export default function Logo({ label }) {
  return (
    <svg viewBox="0 0 120 120" width="26" height="26" role="img" aria-label={label}>
      <g transform="translate(6,2)">
        <polygon points="20,54 44,68 44,96 20,82" fill="#0E0C09" /><polygon points="68,54 44,68 44,96 68,82" fill="#B8975A" /><polygon points="44,40 68,54 44,68 20,54" fill="#CCA96E" />
        <polygon points="20,26 44,40 44,68 20,54" fill="#0E0C09" /><polygon points="68,26 44,40 44,68 68,54" fill="#B8975A" /><polygon points="44,12 68,26 44,40 20,26" fill="#CCA96E" />
        <polygon points="44,68 68,82 68,110 44,96" fill="#0E0C09" /><polygon points="92,68 68,82 68,110 92,96" fill="#B8975A" /><polygon points="68,54 92,68 68,82 44,68" fill="#CCA96E" />
      </g>
    </svg>
  );
}
