// Every measurement in the lane install package's Draft 7 (2 October 2026),
// the source U5's drawings were ported from: as Draft 7 wrote it, and the
// value it stated. scripts/check-drawings.js holds the number table to each:
// the same inches and the same metric value, or a line in CHANGED saying why.

const ft = (f, i = 0) => f * 12 + i;

export const DRAFT7 = [
  { key: 'islandLength', wrote: '20 ft (6.1 m)', inches: ft(20), metric: '6.1' },
  { key: 'islandWidth', wrote: '3 ft (0.9 m)', inches: ft(3), metric: '0.9' },
  { key: 'islandHeight', wrote: '6 in (0.15 m)', inches: 6, metric: '0.15' },
  { key: 'laneWidth', wrote: '10 ft (3.0 m)', inches: ft(10), metric: '3.0' },
  { key: 'truckLength', wrote: '20 ft 4 in (6.20 m)', inches: ft(20, 4), metric: '6.20' },
  { key: 'truckWidth', wrote: '6 ft 8 in (2.03 m)', inches: ft(6, 8), metric: '2.03' },
  { key: 'smallCarLength', wrote: '13 ft (4.0 m)', inches: ft(13), metric: '4.0' },
  { key: 'stopToArm', wrote: '3 ft 3 in (1.0 m)', inches: ft(3, 3), metric: '1.0' },
  { key: 'payStation', wrote: '11 ft 6 in (3.5 m)', inches: ft(11, 6), metric: '3.5' },
  { key: 'thirdLoopNear', wrote: '26 ft 3 in (8.0 m)', inches: ft(26, 3), metric: '8.0' },
  { key: 'truckBack', wrote: '23 ft 7 in (7.2 m)', inches: ft(23, 7), metric: '7.2' },
  { key: 'backCamera', wrote: '30 ft 2 in (9.2 m)', inches: ft(30, 2), metric: '9.2' },
  { key: 'scaleBar', wrote: '20 ft (20 ft = 6.1 m)', inches: ft(20), metric: '6.1' },
  { key: 'scaleStep', wrote: '0 5 10 15 20 ft', inches: ft(5), metric: null },
  { key: 'cameraBehindTruck', wrote: '6½ ft (2.0 m)', inches: ft(6, 6), metric: '2.0' },
  { key: 'loopWidth', wrote: '2½ × 6 ft (0.76 × 1.83 m)', inches: ft(2, 6), metric: '0.76' },
  { key: 'loopTurns', wrote: 'three turns', value: 3 },
  { key: 'loopSpacing', wrote: '4 ft (1.2 m)', inches: ft(4), metric: '1.2' },
  { key: 'loopEdgeMin', wrote: '12 to 20 in (0.3 to 0.5 m)', inches: 12, metric: '0.3' },
  { key: 'loopEdgeMax', wrote: '12 to 20 in (0.3 to 0.5 m)', inches: 20, metric: '0.5' },
  { key: 'thirdLoopRoom', wrote: '29 ft (8.8 m)', inches: ft(29), metric: '8.8' },
  { key: 'networkLongest', wrote: '328 ft (100 m)', inches: ft(328), metric: '100' },
  { key: 'leadTwist', wrote: '10 turns per foot', value: 10 },
  { key: 'leadLongest', wrote: '100 ft (30 m)', inches: ft(100), metric: '30' },
  { key: 'conduit', wrote: '1⅛ in (29 mm)', inches: 1.125, metric: '29' },
  { key: 'supply', wrote: '120 V', value: 120 },
  { key: 'cableCategory', wrote: 'Network cable (Cat6)', value: 6 },
  { key: 'frontCameraHeight', wrote: '3 ft 6 in (1.07 m)', inches: ft(3, 6), metric: '1.07' },
  { key: 'frontLens', wrote: 'about 100°', value: 100 },
  { key: 'ceilingLow', wrote: '7 to 8 ft (2.1 to 2.4 m)', inches: ft(7), metric: '2.1' },
  { key: 'ceilingHigh', wrote: '7 to 8 ft (2.1 to 2.4 m)', inches: ft(8), metric: '2.4' },
  { key: 'postHeight', wrote: '3 ft 6 in (1.07 m)', inches: ft(3, 6), metric: '1.07' },
  { key: 'backViewWide', wrote: 'about 64° wide', value: 64 },
  { key: 'backViewTall', wrote: '53° tall', value: 53 },
  { key: 'driverWindow', wrote: '8 ft 2 in (2.5 m)', inches: ft(8, 2), metric: '2.5' },
  { key: 'modelYear', wrote: '2025 Ford F-150 dimensions', value: 2025 },
];

/** Numbers Draft 7 printed that the drawings do not, each with its reason. */
export const CHANGED = [
  { wrote: 'Gate arm (0)', reason: 'the "0" marked the arm as where distances start; the sheet already says "All distances are measured back from the gate arm", and a bare 0 is a number from no table' },
  { wrote: "the owner's decisions, 1 and 2 October 2026", reason: 'brief change 2: the provenance line goes' },
  { wrote: 'Date 2 October 2026 · Status Draft 7', reason: 'each sheet\'s title block carries the date the set was made and the status "Draft"' },
  { wrote: 'Lane 1 gate box · Lane 2 gate box', reason: 'the server room names each lane as its owner named it' },
  { wrote: 'The light number. Sheet 7.', reason: 'sheet numbers differ from garage to garage; the sheet is named instead' },
  {
    wrote: 'Each loop is 2½ × 6 ft (0.76 × 1.83 m) ... 12 to 20 in (0.3 to 0.5 m) from the lane edge',
    reason:
      'a 6 ft loop centred in the 10 ft lane is 24 in from each edge, beyond the edge distance Draft 7 itself gives. The Magnetic MHTM manual (p. 57): "The distance of the induction loop from the roadside should be about 11.8 in to 19.7 in (300 to 500 mm)." So across the lane a loop follows the lane: 12 to 20 in from each edge, centred; 6 ft 8 in to 8 ft in a 10 ft lane (loopAcrossLeast, loopAcrossMost)',
  },
  {
    wrote: 'The gate draws about 1 amp.',
    reason:
      'no source named in Draft 7. The Magnetic MHTM manual, table 3 (Access series, 120 V AC, without accessories): nominal current 0.5 to 1.5 A, peak 2.5 to 3.5 A. The sheet gives that range and the peak, names the manual, and says to confirm with the gate\'s own manual (gateDrawLeast, gateDrawMost, gatePeak)',
  },
];

/** Numbers the table holds that Draft 7 did not print: drawn to, or listed with their source. */
export const ADDED = {
  smallCarWidth: 'Draft 7 drew the small car 1.75 m wide without printing it',
  islandPastArm: 'Draft 7 drew the island 0.6 m past the gate arm without printing it',
  scaleStep: 'Draft 7 printed the marks 0, 5, 10, 15 without a metric value; 1.5 m is 5 ft rounded as the table rounds',
  loopAcrossLeast: 'the loop across the lane, worked out: the 10 ft lane less 20 in at each edge (see CHANGED)',
  loopAcrossMost: 'the loop across the lane, worked out: the 10 ft lane less 12 in at each edge (see CHANGED)',
  gateDrawLeast: 'the gate\'s draw, from the Magnetic MHTM manual, table 3 (see CHANGED)',
  gateDrawMost: 'the gate\'s draw, from the Magnetic MHTM manual, table 3 (see CHANGED)',
  gatePeak: 'the gate\'s peak draw, from the Magnetic MHTM manual, table 3 (see CHANGED)',
};
