// Every number on the installer drawings, in ONE table.
//
// A sheet never holds a number of its own: it asks this table for one by its
// key, and `say()` writes it, feet and inches first with metres in brackets
// on every length. Each entry keeps the value as the source gave it (inches,
// and the metric value as written), its unit, and where it comes from: a
// public source, the distances worked out from the others, or this set's own
// layout. scripts/check-drawings.js reads every built sheet back and refuses
// a number that is not one of these.

/** Where a number comes from. The words are in the dictionaries, under `drawings.source.<key>`. */
export const SOURCES = {
  f150: 'https://www.chalmersford.com/blog/how-big-is-the-2025-ford-f150-interior-and-exterior',
  msu: 'https://ipf.msu.edu/sites/default/files/2018-08/CS_TEC_2004_111200_PARKING_CONTROL_EQUIPMENT.PDF',
  mhtm: 'https://magneticgateopeners.com/store/pdfs/MHTM_Manual.pdf',
  doorking: 'https://gatesnfences.com/files/Doorking_Loop_Manual.pdf',
  stripe: 'https://docs.stripe.com/terminal/payments/setup-reader',
  worked: null,
  layout: null,
  site: null,
  cable: null,
  supply: null,
  notNamed: null,
};

const length = (inches, metric, source, more = {}) => ({ unit: 'length', inches, metric, source, ...more });

/**
 * The table. A length's `metric` is written as the source wrote it ("6.20",
 * "0.15"); `mm: true` writes it in millimetres. `drawn: true` marks a number
 * the drawings are drawn to but never print.
 */
export const NUMBERS = {
  // The vehicle the sheets are sized on, and a small car beside it.
  modelYear: { unit: 'year', value: 2025, source: 'f150' },
  truckLength: length(244, '6.20', 'f150'),
  truckWidth: length(80, '2.03', 'f150'),
  smallCarLength: length(156, '4.0', 'layout'),
  smallCarWidth: length(69, '1.75', 'layout', { drawn: true }),

  // The lane and its island.
  laneWidth: length(120, '3.0', 'site'),
  islandLength: length(240, '6.1', 'layout'),
  islandWidth: length(36, '0.9', 'layout'),
  islandHeight: length(6, '0.15', 'layout'),
  islandPastArm: length(24, '0.6', 'layout', { drawn: true }),

  // Where the car stops and what stands beside it, measured back from the gate arm.
  stopToArm: length(39, '1.0', 'layout'),
  driverWindow: length(98, '2.5', 'layout'),
  payStation: length(138, '3.5', 'layout'),
  truckBack: length(283, '7.2', 'worked'),
  thirdLoopNear: length(315, '8.0', 'layout'),
  backCamera: length(362, '9.2', 'layout'),
  cameraBehindTruck: length(78, '2.0', 'layout'),
  thirdLoopRoom: length(348, '8.8', 'worked'),

  // Loops.
  loopWidth: length(30, '0.76', 'msu'),
  loopLength: length(72, '1.83', 'msu'),
  loopTurns: { unit: 'turns', value: 3, source: 'msu' },
  loopSpacing: length(48, '1.2', 'doorking'),
  loopEdgeMin: length(12, '0.3', 'mhtm'),
  loopEdgeMax: length(20, '0.5', 'mhtm'),
  leadTwist: { unit: 'twist', value: 10, source: 'msu' },
  leadLongest: length(1200, '30', 'notNamed'),

  // Cable, conduit and power.
  cableCategory: { unit: 'category', value: 6, source: 'cable' },
  networkLongest: length(3936, '100', 'cable'),
  conduit: length(1.125, '29', 'mhtm', { mm: true }),
  supply: { unit: 'volts', value: 120, source: 'supply' },
  gateDraw: { unit: 'amps', value: 1, source: 'notNamed' },

  // Cameras.
  frontCameraHeight: length(42, '1.07', 'layout'),
  frontLens: { unit: 'degrees', value: 100, source: 'worked' },
  ceilingLow: length(84, '2.1', 'layout'),
  ceilingHigh: length(96, '2.4', 'layout'),
  postHeight: length(42, '1.07', 'layout'),
  backViewWide: { unit: 'degrees', value: 64, source: 'worked' },
  backViewTall: { unit: 'degrees', value: 53, source: 'worked' },

  // The scale bar under each plan: its length, and a mark every so often.
  scaleBar: length(240, '6.1', 'layout'),
  scaleStep: length(60, '1.5', 'layout', { drawn: true }),
};

/** A length in metres, as a number, for drawing to scale. */
export const metres = (key) => {
  const n = NUMBERS[key];
  if (n?.unit !== 'length') throw new Error(`"${key}" is not a length in the table`);
  return n.inches * 0.0254;
};

const FRACTIONS = [
  [0, ''],
  [0.125, '1/8'],
  [0.25, '1/4'],
  [0.375, '3/8'],
  [0.5, '1/2'],
  [0.625, '5/8'],
  [0.75, '3/4'],
  [0.875, '7/8'],
];

/** Feet and inches, as an installer reads a tape: "20 ft", "3 ft 3 in", "20 in", "1 1/8 in". */
export function feetAndInches(inches, t) {
  const whole = Math.floor(inches);
  const part = FRACTIONS.find(([f]) => Math.abs(inches - whole - f) < 1e-9);
  if (!part) throw new Error(`${inches} in is not a whole eighth of an inch`);
  // Under two feet, an installer reads inches: "20 in", not "1 ft 8 in".
  const feet = whole < 24 ? 0 : Math.floor(whole / 12);
  const rest = whole - feet * 12;
  const inchText = [rest || (!feet && !part[1]) ? String(rest) : '', part[1]].filter(Boolean).join(' ');
  const pieces = [];
  if (feet) pieces.push(t('drawings.unit.ft', { n: feet }));
  if (inchText) pieces.push(t('drawings.unit.in', { n: inchText }));
  return pieces.join(' ');
}

/** The metric side of a length, as the source wrote it. */
export const metric = (n, t) => (n.mm ? t('drawings.unit.mm', { n: n.metric }) : t('drawings.unit.m', { n: n.metric }));

/**
 * A number from the table, in words of `t`'s language. Every length is feet
 * and inches with metres in brackets: "3 ft 3 in (1.0 m)".
 */
export function say(key, t) {
  // No-break spaces: a sheet never breaks a line inside a number.
  return written(key, t).replace(/ /g, NBSP);
}

/** A no-break space. The PDF prints it as a space (src/files/text.js `kept`). */
export const NBSP = '\u00a0';

function written(key, t) {
  const n = NUMBERS[key];
  if (!n) throw new Error(`no number "${key}" in the table`);
  switch (n.unit) {
    case 'length':
      return t('drawings.unit.length', { imperial: feetAndInches(n.inches, t), metric: metric(n, t) });
    case 'turns':
      return t('drawings.unit.turns', { n: n.value });
    case 'twist':
      return t('drawings.unit.twist', { n: n.value });
    case 'category':
      return t('drawings.unit.category', { n: n.value });
    case 'volts':
      return t('drawings.unit.volts', { n: n.value });
    case 'amps':
      return t('drawings.unit.amps', { n: n.value });
    case 'degrees':
      return t('drawings.unit.degrees', { n: n.value });
    case 'year':
      return String(n.value);
    default:
      throw new Error(`"${key}" has a unit no sheet knows: ${n.unit}`);
  }
}

/** The scale bar's marks, from the table: "0", then each step, the last one a whole length. */
export function scaleMarks(t) {
  const bar = NUMBERS.scaleBar.inches;
  const step = NUMBERS.scaleStep.inches;
  const marks = [];
  for (let at = 0; at <= bar + 1e-9; at += step) {
    marks.push({ at: at / bar, text: at === bar ? written('scaleBar', t) : String(at / 12) });
  }
  return marks;
}

/**
 * Every way the table writes a number in `t`'s language: what a built sheet's
 * numbers are read against. A scale bar's bare marks are not here: a mark is
 * only ever a text of its own (scripts/check-drawings.js).
 */
export function everyWriting(t) {
  return [...new Set(Object.keys(NUMBERS).map((key) => written(key, t)))].sort((a, b) => b.length - a.length);
}
