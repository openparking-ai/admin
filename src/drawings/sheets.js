// The installer drawings of ONE garage, built from its own lanes and its
// answer to "does this garage take drivers without a pass?".
//
// One plan sheet for each lane, in the order the platform lists them and
// under the name the owner gave it: a way out with a card reader at its pay
// station when the garage takes any driver and without one when it takes pass
// holders only; a way in as type 2A (the gate opens for every car) or type 2B
// (pass holders show a pass). Then the sheets every lane shares. No answer to
// the drivers question, or no lane, and there is no set: the page says what
// to do first.
//
// Every number comes from src/drawings/numbers.js through `say`; every word
// from the dictionaries; what the garage stored (its name, its lanes' names)
// is marked 'data'.

import { COLOR, FRAME, PAGE, SIZE, column, createSheet, scaled } from './layout.js';
import { NUMBERS, SOURCES, say } from './numbers.js';
import { MARK } from './marks.js';
import { PLAN, drawPlan } from './plan.js';
import { ROOM, WIRING, drawRoom, drawWiring, fit } from './diagrams.js';

/** What stops a set being made, in the order the page says them. */
export const NEEDS = ['drivers', 'lanes'];

const SHARED = ['everyLane', 'wiring', 'room', 'cabling', 'electrical', 'cameras', 'open'];

/** The date a set was made, in the garage's own time zone and the owner's language. */
export const madeOn = (at, garage, language) =>
  new Intl.DateTimeFormat(language === 'es' ? 'es-US' : 'en-US', { dateStyle: 'long', timeZone: garage.timezone }).format(at);

/** What the garage must give before a set can be made: none, 'drivers', 'lanes' or both. */
export function needsOf({ lanes, takesAnyDriver }) {
  const needs = [];
  if (takesAnyDriver !== true && takesAnyDriver !== false) needs.push('drivers');
  if (!lanes.length) needs.push('lanes');
  return needs;
}

/** The sheets of a set, in order, before any is drawn: { key, kind, lane, reader }. */
export function specsOf({ lanes, takesAnyDriver }) {
  const reader = takesAnyDriver === true;
  const entryType = reader ? '2A' : '2B';
  const plans = lanes.map((lane) => ({
    key: 'plan',
    kind: lane.direction === 'exit' ? 'exit' : entryType,
    lane,
    reader: lane.direction === 'exit' && reader,
  }));
  return [...plans, ...SHARED.map((key) => ({ key, kind: key, lane: null, reader }))];
}

/** A sheet's title, in words. */
export function titleOf(t, spec) {
  if (spec.key !== 'plan') return t(`drawings.title.${spec.key}`);
  return t(spec.kind === 'exit' ? 'drawings.title.exit' : `drawings.title.entry${spec.kind}`);
}

/**
 * The set for `garage`: { needs } when it cannot be made, else { sheets },
 * each sheet { key, kind, lane, reader, title, items }.
 *   takesAnyDriver: true, false, or null for not answered yet
 *   lanes: [{ name, direction: 'entry' | 'exit' }] as the platform lists them
 *   fonts: { measure(text, size, bold), clean(text) }
 */
export function buildSet({ t, language, garage, lanes, takesAnyDriver, madeAt, fonts }) {
  const needs = needsOf({ lanes, takesAnyDriver });
  if (needs.length) return { needs };

  const reader = takesAnyDriver === true;
  const entryType = reader ? '2A' : '2B';
  const specs = specsOf({ lanes, takesAnyDriver });
  const total = specs.length;
  const date = madeOn(madeAt, garage, language);
  const ctx = { t, garage, lanes, reader, entryType, specs };

  const sheets = specs.map((spec, i) => {
    const s = createSheet(fonts);
    const title = titleOf(t, spec);
    frame(s, t, { title, garage, lane: spec.lane, number: i + 1, total, date });
    BODIES[spec.key](s, t, spec, ctx);
    return { key: spec.key, kind: spec.kind, lane: spec.lane?.name ?? null, reader: spec.reader, title, items: s.items };
  });
  return { sheets };
}

/** The frame, the sheet's title and the title block: garage, lane, sheet number of total, date made, status. */
function frame(s, t, { title, garage, lane, number, total, date }) {
  const { inset } = FRAME;
  s.rect(0, 0, PAGE.width, PAGE.height, { stroke: null, fill: COLOR.paper });
  s.rect(inset, inset, PAGE.width - 2 * inset, PAGE.height - 2 * inset, { width: 1.5 });
  s.text(FRAME.left, 44, title, { size: SIZE.title, bold: true });
  const mark = t('drawings.draftMark').toLocaleUpperCase();
  const mw = s.measure(mark, SIZE.small, true);
  s.rect(FRAME.right - mw - 12, 30, mw + 12, 16, { stroke: COLOR.confirm, width: 1.2 });
  s.text(FRAME.right - 6, 41, mark, { size: SIZE.small, bold: true, color: COLOR.confirm, anchor: 'end' });
  s.line(inset, 52, PAGE.width - inset, 52, { width: 1.5 });

  // The title block, along the bottom.
  const top = PAGE.height - inset - 58;
  s.line(inset, top, PAGE.width - inset, top, { width: 1.5 });
  const cells = [
    { label: 'drawings.tb.garage', value: garage.name, kind: 'data', width: 280 },
    { label: 'drawings.tb.lane', value: lane ? lane.name : t('drawings.tb.everyLane'), kind: lane ? 'data' : 'words', width: 230 },
    { label: 'drawings.tb.sheet', value: t('drawings.tb.sheetOf', { n: number, of: total }), kind: 'data', width: 90 },
    { label: 'drawings.tb.date', value: date, kind: 'data', width: 130 },
    { label: 'drawings.tb.status', value: t('drawings.status'), kind: 'words', width: 70 },
    { label: 'drawings.tb.units', value: t('drawings.units'), kind: 'words', width: 190 },
    { label: 'drawings.tb.document', value: `${t('drawings.doc')} · ${t('app.name')}`, kind: 'words', width: null },
  ];
  let x = inset;
  cells.forEach((cell, i) => {
    const w = cell.width ?? PAGE.width - inset - x;
    if (i > 0) s.line(x, top, x, PAGE.height - inset, { color: COLOR.rule, width: 0.75 });
    s.text(x + 8, top + 14, t(cell.label).toLocaleUpperCase(), { size: SIZE.small, bold: true, color: COLOR.soft });
    const lines = s.wrap(cell.value, w - 16, SIZE.value, true);
    const shown = lines.length > 2 ? [lines[0], fit(s, `${lines[1]} ${lines.slice(2).join(' ')}`, w - 16, SIZE.value, true)] : lines;
    const run = s.run();
    shown.forEach((line, j) => s.text(x + 8, top + 30 + j * 13, line, { size: SIZE.value, bold: true, kind: cell.kind, run }));
    x += w;
  });
}

// ── The lane sheets ────────────────────────────────────────────────────────

const PLAN_K = 0.8;
const SIDE = FRAME.left + PLAN.width * PLAN_K + 24; // the column beside the plan
const BELOW = FRAME.top + PLAN.height * PLAN_K + 4; // the boxes under it

function equipmentRows(t, spec) {
  const m = (mark) => ({ text: mark, color: COLOR.gold, bold: true });
  const exit = spec.kind === 'exit';
  const rows = [
    [m(MARK.panel), t('drawings.eq.panel')],
    [m(MARK.display), t('drawings.eq.display')],
    [m(MARK.frontCamera), t('drawings.eq.frontCamera')],
    [m(MARK.pay), t(exit ? (spec.reader ? 'drawings.eq.payReader' : 'drawings.eq.payNoReader') : `drawings.eq.pedestal${spec.kind}`)],
    [m(MARK.backCamera), t('drawings.eq.backCamera', { distance: say('cameraBehindTruck', t) })],
    [m(MARK.intercom), t('drawings.eq.intercom')],
  ];
  if (exit || spec.kind === '2B') rows.push([m(MARK.scanner), t(exit ? 'drawings.eq.scannerExit' : 'drawings.eq.scannerEntry')]);
  return rows;
}

function loopsTable(c, t) {
  const m = (mark) => ({ text: mark, color: COLOR.loop, bold: true });
  c.heading(t('drawings.box.loops'));
  c.table(
    [
      { name: t('drawings.col.mark'), share: 0.13 },
      { name: t('drawings.col.job'), share: 0.57 },
      { name: t('drawings.col.wiredTo'), share: 0.3 },
    ],
    [
      [m(MARK.L1), t('drawings.loop.l1'), t('drawings.item.relay')],
      [m(MARK.L2), t('drawings.loop.l2'), t('drawings.item.relay')],
      [m(MARK.L3), t('drawings.loop.l3'), t('drawings.loop.l3wired')],
      [m(`${MARK.L4}, ${MARK.L5}`), t('drawings.loop.l45'), t('drawings.item.relay')],
    ],
  );
  c.para(
    t('drawings.loop.note', {
      width: say('loopWidth', t),
      turns: say('loopTurns', t),
      spacing: say('loopSpacing', t),
      edge: t('drawings.range', { from: say('loopEdgeMin', t), to: say('loopEdgeMax', t) }),
      lane: say('laneWidth', t),
      across: t('drawings.range', { from: say('loopAcrossLeast', t), to: say('loopAcrossMost', t) }),
    }),
    { color: COLOR.soft },
  );
}

function planSheet(s, t, spec) {
  drawPlan(scaled(s, FRAME.left, FRAME.top, PLAN_K), t, spec);
  const side = column(s, SIDE, FRAME.top, FRAME.right - SIDE);
  side.heading(t('drawings.box.equipment'));
  side.table([{ name: t('drawings.col.mark'), share: 0.16 }, { name: t('drawings.col.item'), share: 0.84 }], equipmentRows(t, spec));

  const w = (FRAME.right - FRAME.left - 2 * 24) / 3;
  const at = (i) => FRAME.left + i * (w + 24);
  loopsTable(column(s, at(0), BELOW, w), t);
  const pay = say('payStation', t);
  if (spec.kind === 'exit') {
    const stop = [
      t('drawings.stop.sized', { stop: say('stopToArm', t) }),
      t('drawings.stop.oneSpot', { distance: pay }),
      t('drawings.stop.shorter'),
      t('drawings.reach', { distance: say('controlsFromGate', t), here: pay }),
    ];
    if (!spec.reader) stop.push(t('drawings.stop.passOnly', { cable: MARK.N5, outlet: MARK.W3 }));
    column(s, at(1), BELOW, w).heading(t('drawings.box.stop')).bullets(stop);
    const room = say('thirdLoopRoom', t);
    column(s, at(2), BELOW, w).heading(t('drawings.box.third')).bullets([t('drawings.third.everyLane'), t('drawings.third.room', { room }), t('drawings.third.noFit', { room })]);
  } else {
    const how = spec.kind === '2A'
      ? [t('drawings.how2A.opens'), t('drawings.how2A.atExit'), t('drawings.how2A.pedestal', { distance: pay }), t('drawings.reach', { distance: say('controlsFromGate', t), here: pay })]
      : [t('drawings.how2B.shows'), t('drawings.how2B.pedestal', { distance: pay }), t('drawings.how2B.noReader'), t('drawings.reach', { distance: say('controlsFromGate', t), here: pay })];
    column(s, at(1), BELOW, w).heading(t('drawings.box.how')).bullets(how);
    column(s, at(2), BELOW, w).heading(t('drawings.box.sameAsExit')).bullets([t('drawings.same.every'), t('drawings.same.arming', { distance: pay })]);
  }
}

// ── The shared sheets ──────────────────────────────────────────────────────

const HALF = (FRAME.right - FRAME.left - 30) / 2;
const RIGHT = FRAME.left + HALF + 30;

function everyLaneSheet(s, t, _spec, { lanes, reader, specs }) {
  const left = column(s, FRAME.left, FRAME.top, HALF);
  left.heading(t('drawings.box.about'));
  left.para(t('drawings.about.oneComputer'));
  // What this garage's lanes add (Gokhan 2026-10-02): every exit has the scanner; an entry has one only in a garage for
  // pass holders only (2B), and only a garage that takes any driver has card readers, at its exits.
  left.para(t(reader ? 'drawings.about.alsoAtExit' : 'drawings.about.alsoEveryLane'));
  left.para(t('drawings.about.trade'));
  left.heading(t('drawings.box.entryType'));
  left.para(t(reader ? 'drawings.entryType.any' : 'drawings.entryType.passOnly'));
  left.heading(t('drawings.box.everyLane'));
  left.bullets([t('drawings.every.pictures'), t('drawings.every.backCamera'), t('drawings.every.same'), t('drawings.everyWay'), t(reader ? 'drawings.every.reach' : 'drawings.every.reachPassOnly', { distance: say('controlsFromGate', t) })]);

  const right = column(s, RIGHT, FRAME.top, HALF);
  right.heading(t('drawings.box.lanes'));
  const typeOf = (lane) =>
    lane.direction === 'exit' ? t(reader ? 'drawings.type.exitReader' : 'drawings.type.exitNoReader') : t(reader ? 'drawings.type.entry2A' : 'drawings.type.entry2B');
  right.table(
    [
      { name: t('drawings.col.lane'), share: 0.4 },
      { name: t('drawings.col.way'), share: 0.15 },
      { name: t('drawings.col.type'), share: 0.33 },
      { name: t('drawings.col.sheet'), share: 0.12 },
    ],
    lanes.map((lane) => [
      { text: lane.name, kind: 'data' },
      t(lane.direction === 'exit' ? 'drawings.way.out' : 'drawings.way.in'),
      typeOf(lane),
      { text: t('drawings.tb.sheetOf', { n: specs.findIndex((x) => x.lane === lane) + 1, of: specs.length }), kind: 'data' },
    ]),
  );
}

function wiringSheet(s, t, _spec, { reader }) {
  const k = 0.8;
  drawWiring(scaled(s, FRAME.left, FRAME.top + 8, k), t, { reader, scannerAt: t(reader ? 'drawings.wiring.scannerAtExit' : 'drawings.wiring.scannerAtBoth') });
  const x = FRAME.left + WIRING.width * k + 30;
  const c = column(s, x, FRAME.top, FRAME.right - x);
  c.heading(t('drawings.box.inside'));
  c.table(
    [{ name: t('drawings.col.item'), share: 0.32 }, { name: t('drawings.col.does'), share: 0.68 }],
    [
      [t('drawings.item.terminal'), t('drawings.inside.terminal', { volts: say('supply', t) })],
      [t('drawings.item.gateControl'), t('drawings.inside.gateControl')],
      [t('drawings.item.switch'), t('drawings.inside.switch')],
      [t('drawings.item.relay'), t('drawings.inside.relay')],
      [t('drawings.item.detector'), t('drawings.inside.detector', { marks: [MARK.L1, MARK.L2, MARK.L4, MARK.L5].join(', ') })],
    ],
  );
  c.heading(t('drawings.box.rules'));
  c.bullets([t('drawings.rule.closing', { mark: MARK.L3 }), t('drawings.rule.pulse', { mark: MARK.K1 })]);
}

function roomSheet(s, t, _spec, { lanes }) {
  drawRoom(scaled(s, FRAME.left - ROOM.left, FRAME.top + 6, 1), t, lanes);
  const y = FRAME.top + ROOM.height + 20;
  const left = column(s, FRAME.left, y, HALF);
  left.heading(t('drawings.box.inRoom'));
  left.table(
    [{ name: t('drawings.col.item'), share: 0.3 }, { name: t('drawings.col.note'), share: 0.7 }],
    [
      [t('drawings.room.computer'), t('drawings.inRoom.computer')],
      [t('drawings.room.mainSwitch'), t('drawings.inRoom.mainSwitch')],
      [t('drawings.room.backup'), t('drawings.inRoom.backup')],
      [t('drawings.inRoom.routerName'), t('drawings.inRoom.router')],
    ],
  );
  column(s, RIGHT, y, HALF)
    .heading(t('drawings.box.roomNeeds'))
    .bullets([t('drawings.roomNeeds.outlet'), t('drawings.roomNeeds.temperature'), t('drawings.roomNeeds.path'), t('drawings.roomNeeds.door')]);
}

function cablingSheet(s, t, _spec, { reader }) {
  const mark = (m) => ({ text: m, color: COLOR.gold, bold: true });
  const cable = t('drawings.cable.network', { category: say('cableCategory', t) });
  const rows = [
    [mark(MARK.N1), t('drawings.cable.n1'), cable, t('drawings.cable.n1rule', { longest: say('networkLongest', t) })],
    [mark(MARK.N2), t('drawings.cable.n2'), cable, t('drawings.cable.n2rule', { outlet: MARK.W4 })],
    [mark(`${MARK.N3}, ${MARK.N4}`), t('drawings.cable.n34'), cable, t('drawings.cable.n34rule')],
  ];
  if (reader) rows.push([mark(MARK.N5), t('drawings.cable.n5'), cable, t('drawings.cable.n5rule', { outlet: MARK.W3 })]);
  rows.push(
    [mark(MARK.N6), t('drawings.cable.n6'), cable, t('drawings.cable.n6rule')],
    [mark(MARK.N7), t('drawings.cable.n7'), cable, t('drawings.cable.n7rule')],
    [mark(MARK.N8), t('drawings.cable.n8'), t('drawings.cable.n8cable'), ''],
    [mark(MARK.S1), t('drawings.cable.s1', { marks: [MARK.L1, MARK.L2, MARK.L4, MARK.L5].join(', ') }), t('drawings.cable.s1cable', { twist: say('leadTwist', t) }), t('drawings.cable.s1rule', { longest: say('leadLongest', t) })],
    [mark(MARK.S2), t('drawings.cable.s2', { mark: MARK.L3 }), t('drawings.cable.s2cable'), t('drawings.cable.s2rule', { longest: say('gateLeadLongest', t), twist: say('gateLeadTwist', t) })],
    [mark(MARK.K1), t('drawings.cable.k1'), t('drawings.cable.k1cable'), ''],
    [mark(MARK.K2), t('drawings.cable.k2'), t('drawings.cable.k2cable'), t('drawings.cable.k2rule')],
  );
  const top = column(s, FRAME.left, FRAME.top, FRAME.right - FRAME.left);
  top.table(
    [
      { name: t('drawings.col.mark'), share: 0.06 },
      { name: t('drawings.col.fromTo'), share: 0.34 },
      { name: t('drawings.col.cable'), share: 0.25 },
      { name: t('drawings.col.rule'), share: 0.35 },
    ],
    rows,
  );
  const y = top.y + 6;
  const volts = say('supply', t);
  const left = column(s, FRAME.left, y, HALF);
  left.heading(t('drawings.box.conduit'));
  left.table(
    [{ name: t('drawings.col.mark'), share: 0.1 }, { name: t('drawings.col.run'), share: 0.4 }, { name: t('drawings.col.carries'), share: 0.5 }],
    [
      [mark(MARK.C1), t('drawings.conduit.c1'), t('drawings.conduit.c1carries', { volts })],
      [mark(MARK.C2), t('drawings.conduit.c2'), t('drawings.conduit.c2carries', { cable: MARK.N1 })],
      [mark(MARK.C3), t('drawings.conduit.c3'), t(reader ? 'drawings.conduit.c3carries' : 'drawings.conduit.c3carriesPassOnly', { volts })],
      [mark(MARK.C4), t('drawings.conduit.c4'), t('drawings.conduit.c4carries')],
      [mark(MARK.C5), t('drawings.conduit.c5'), t('drawings.conduit.c5carries')],
    ],
  );
  left.para(t('drawings.conduit.note', { size: say('conduit', t) }), { color: COLOR.soft });
  column(s, RIGHT, y, HALF)
    .heading(t('drawings.box.network'))
    .bullets([t('drawings.network.plugs'), t('drawings.network.oneCable'), t('drawings.network.outdoor'), t('drawings.network.label')]);
}

function electricalSheet(s, t, _spec, { reader }) {
  const mark = (m) => ({ text: m, color: COLOR.gold, bold: true });
  const volts = say('supply', t);
  const rows = [
    [mark(MARK.W1), t('drawings.power.w1'), t('drawings.power.w1supply', { volts }), t('drawings.power.w1rule', { amps: t('drawings.range', { from: say('gateDrawLeast', t), to: say('gateDrawMost', t) }), peak: say('gatePeak', t) })],
    [mark(MARK.W2), t('drawings.power.w2'), t('drawings.power.w2supply'), ''],
  ];
  if (reader) rows.push([mark(MARK.W3), t('drawings.power.w3'), t('drawings.power.grounded', { volts }), t('drawings.power.w3rule')]);
  rows.push(
    [mark(MARK.W4), t('drawings.power.w4'), t('drawings.power.grounded', { volts }), t('drawings.power.w4rule')],
    [mark(t('drawings.wiring.serverRoom')), t('drawings.power.room'), volts, t('drawings.power.roomRule')],
  );
  const c = column(s, FRAME.left, FRAME.top, FRAME.right - FRAME.left);
  c.table(
    [
      { name: t('drawings.col.mark'), share: 0.1 },
      { name: t('drawings.col.fromTo'), share: 0.32 },
      { name: t('drawings.col.supply'), share: 0.22 },
      { name: t('drawings.col.rule'), share: 0.36 },
    ],
    rows,
  );
  c.para(t('drawings.power.note'), { color: COLOR.soft });
}

function camerasSheet(s, t) {
  const left = column(s, FRAME.left, FRAME.top, HALF);
  left.heading(t('drawings.box.cameras'));
  left.table(
    [{ name: t('drawings.col.camera'), share: 0.25 }, { name: t('drawings.col.position'), share: 0.75 }],
    [
      [t('drawings.plan.frontCamera', { mark: MARK.frontCamera }), t('drawings.camera.front', { height: say('frontCameraHeight', t), lens: say('frontLens', t) })],
      [
        t('drawings.plan.backCamera', { mark: MARK.backCamera }),
        t('drawings.camera.back', {
          distance: say('backCamera', t),
          ceiling: t('drawings.range', { from: say('ceilingLow', t), to: say('ceilingHigh', t) }),
          post: say('postHeight', t),
          wide: say('backViewWide', t),
          tall: say('backViewTall', t),
        }),
      ],
    ],
  );
  left.para(t('drawings.camera.first'), { color: COLOR.soft });
  column(s, RIGHT, FRAME.top, HALF)
    .heading(t('drawings.box.light'))
    .bullets([t('drawings.light.steady'), t('drawings.light.daylight'), t('drawings.light.lamp'), t('drawings.light.darker'), t('drawings.light.dayNight')], { color: COLOR.confirm });
}

function openSheet(s, t, _spec, { reader }) {
  const third = (FRAME.right - FRAME.left - 2 * 24) / 3;
  const left = column(s, FRAME.left, FRAME.top, third);
  left.heading(t('drawings.box.open'));
  const models = t('drawings.open.models') + (reader ? ` ${t('drawings.open.reader')}` : '');
  left.bullets(
    [
      t('drawings.open.light', { sheet: t('drawings.title.cameras') }),
      t('drawings.open.display'),
      models,
      t('drawings.open.window', { distance: say('driverWindow', t) }),
      t('drawings.open.heights'),
      t('drawings.open.circuit'),
    ],
    { color: COLOR.confirm },
  );
  left.heading(t('drawings.box.sources'));
  left.para(t('drawings.sources.oneTable'));
  const named = [
    ['f150', t('drawings.sources.f150', { year: say('modelYear', t) })],
    ['msu', t('drawings.sources.msu')],
    ['mhtm', t('drawings.sources.mhtm')],
    ['doorking', t('drawings.sources.doorking')],
    ...(reader ? [['stripe', t('drawings.sources.stripe')]] : []),
  ];
  for (const [key, text] of named) {
    left.para(text, { after: 0 });
    left.para(SOURCES[key], { size: SIZE.small, color: COLOR.gold, kind: 'link' });
  }
  left.para(t('drawings.sources.worked'));

  const x = FRAME.left + third + 24;
  const right = column(s, x, FRAME.top, FRAME.right - x);
  right.heading(t('drawings.box.numbers'));
  const keys = Object.keys(NUMBERS);
  const half = Math.ceil(keys.length / 2);
  const w = (FRAME.right - x - 24) / 2;
  const cols = [
    { name: t('drawings.col.what'), share: 0.44 },
    { name: t('drawings.col.value'), share: 0.28 },
    { name: t('drawings.col.source'), share: 0.28 },
  ];
  const rows = (list) => list.map((key) => [t(`drawings.n.${key}`), say(key, t), t(`drawings.source.${NUMBERS[key].source}`)]);
  column(s, x, right.y, w).table(cols, rows(keys.slice(0, half)));
  column(s, x + w + 24, right.y, w).table(cols, rows(keys.slice(half)));
}

const BODIES = {
  plan: planSheet,
  everyLane: everyLaneSheet,
  wiring: wiringSheet,
  room: roomSheet,
  cabling: cablingSheet,
  electrical: electricalSheet,
  cameras: camerasSheet,
  open: openSheet,
};
