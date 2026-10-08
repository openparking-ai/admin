// A lane's plan view, to scale, drawn from the number table.
//
// The drawing's own units are 60 to the metre with the gate arm at 760, so a
// distance "before the gate" is 760 - 60 x metres. Every position below is
// worked out from src/drawings/numbers.js; the labels say the table's
// numbers through `say`.

import { COLOR, SIZE } from './layout.js';
import { metres, say, scaleMarks } from './numbers.js';
import { MARK } from './marks.js';

export const PLAN = { width: 1140, height: 560 };
const U = 60; // drawing units to the metre
const ARM = 760;
const MID = 240; // the middle of the lane, across
const LANE_TOP = 150;
const before = (key) => ARM - U * metres(key);

/**
 * kind: 'exit' | '2A' | '2B'; reader: whether the exit's pay station has a card reader.
 * `g` is the sheet scaled to the drawing's units (src/drawings/layout.js `scaled`).
 */
export function drawPlan(g, t, { kind, reader }) {
  const lbl = { size: SIZE.text, bold: true };
  const soft = { size: SIZE.text, color: COLOR.soft };
  const num = { size: SIZE.text };
  const laneWidth = U * metres('laneWidth');
  const laneBottom = LANE_TOP + laneWidth;

  // The island, on the driver's side, and the lane.
  const islandEnd = ARM + U * metres('islandPastArm');
  const islandStart = islandEnd - U * metres('islandLength');
  const islandTop = LANE_TOP - U * metres('islandWidth');
  g.rect(70, 80, 1010, 70, { stroke: COLOR.rule, width: 1 });
  g.rect(islandStart, islandTop, islandEnd - islandStart, LANE_TOP - islandTop, { fill: COLOR.shade, width: 1.5 });
  g.line(islandStart, 30, islandStart, islandTop - 2);
  g.line(islandEnd, 30, islandEnd, islandTop - 2);
  g.arrow(islandStart, 36, islandEnd, 36, { both: true });
  g.text((islandStart + islandEnd) / 2, 26, t('drawings.plan.island', { length: say('islandLength', t), width: say('islandWidth', t), height: say('islandHeight', t) }), { ...num, anchor: 'middle' });
  g.text(1072, 142, t('drawings.plan.driverSide'), { ...soft, anchor: 'end' });
  g.rect(70, LANE_TOP, 1010, laneWidth, { width: 1.5 });
  g.rect(70, laneBottom, 1010, 12, { fill: COLOR.shade, width: 1 });
  g.text(84, laneBottom - 8, t('drawings.plan.lane', { width: say('laneWidth', t) }), soft);
  g.arrow(84, MID, 150, MID, { width: 1.5 });
  g.text(84, MID - 10, t('drawings.plan.travel'), lbl);

  // What the two cameras see.
  const truckBack = before('truckBack');
  const truckFront = before('stopToArm');
  const truckHalf = (U * metres('truckWidth')) / 2;
  const backCamera = before('backCamera');
  g.poly([[backCamera, 128], [truckBack, MID - truckHalf - 7], [truckBack, MID + truckHalf + 7]], { closed: true, stroke: null, fill: COLOR.view });
  g.poly([[ARM - 8, 146], [truckFront, MID - truckHalf - 7], [truckFront, MID + truckHalf + 7]], { closed: true, stroke: null, fill: COLOR.view });

  // The longest F-150 where it stops, and a small car beside it, dashed.
  g.rect(truckBack, MID - truckHalf, truckFront - truckBack, 2 * truckHalf, { fill: COLOR.car, width: 1.2, radius: 10 });
  g.text(truckBack + 16, 222, t('drawings.plan.truck'), lbl);
  g.text(truckBack + 16, 236, t('drawings.plan.truckLong', { length: say('truckLength', t) }), soft);
  g.text(truckBack + 16, 250, t('drawings.plan.truckWide', { width: say('truckWidth', t) }), soft);
  const smallHalf = (U * metres('smallCarWidth')) / 2;
  g.rect(truckFront - U * metres('smallCarLength'), MID - smallHalf, U * metres('smallCarLength'), 2 * smallHalf, { width: 1.2, dash: [6, 4], radius: 10 });
  g.text(truckBack + 16, 318, t('drawings.plan.smallCar', { length: say('smallCarLength', t) }), soft);

  // The loops: L1 behind the truck, L2 at the pay station or pedestal, L3 under the arm, L4 and L5 past it.
  const loopW = U * metres('loopWidth');
  const loopL = U * metres('loopLength');
  const spacing = U * metres('loopSpacing');
  const l1 = before('thirdLoopNear') - loopW;
  const l2 = before('payStation') - loopW / 2;
  const l3 = ARM - loopW / 2;
  const l4 = l3 + loopW + spacing;
  const l5 = l4 + loopW + spacing;
  const loopTop = MID - loopL / 2;
  for (const [x, dash] of [[l1, [7, 4]], [l2], [l3], [l4], [l5]]) g.rect(x, loopTop, loopW, loopL, { stroke: COLOR.loop, width: 2, dash: dash ?? null });
  const loopText = { size: SIZE.text, bold: true, color: COLOR.loop };
  g.text(l1 + loopW / 2, loopTop - 7, t('drawings.plan.l1', { mark: MARK.L1 }), { ...loopText, anchor: 'middle' });
  g.text(l2 + loopW / 2, loopTop - 7, t('drawings.plan.l2', { mark: MARK.L2 }), { ...loopText, anchor: 'middle' });
  g.text(l3 + loopW + 4, loopTop - 7, t('drawings.plan.l3', { mark: MARK.L3 }), loopText);
  g.text(l4 + loopW / 2, loopTop - 7, MARK.L4, { ...loopText, anchor: 'middle' });
  g.text(l5 + loopW / 2, loopTop - 7, MARK.L5, { ...loopText, anchor: 'middle' });

  // The control panel, the arm, the display and the front camera.
  g.rect(742, 104, 36, 42, { stroke: null, fill: COLOR.ink });
  g.text(ARM - 10, 80, t('drawings.plan.panel', { mark: MARK.panel }), { ...lbl, anchor: 'end' });
  g.line(ARM, 146, ARM, laneBottom, { width: 4 });
  g.text(ARM + 8, laneBottom - 12, t('drawings.plan.arm'), soft);
  g.rect(726, 108, 12, 30, { stroke: null, fill: COLOR.gold });
  g.circle(ARM - 8, 146, 5, { fill: COLOR.paper, width: 1.5 });
  g.text(722, 100, t('drawings.plan.display', { mark: MARK.display }), { ...lbl, anchor: 'end' });
  g.text(722, 140, t('drawings.plan.frontCamera', { mark: MARK.frontCamera }), { ...lbl, anchor: 'end' });

  // The pay station (exit) or the pedestal (entry), at the driver's window.
  const pay = before('payStation');
  const station = kind === 'exit';
  if (station) g.rect(pay - 12, 112, 24, 30, { width: 2, fill: COLOR.paper });
  else g.rect(pay - 7, 118, 14, 18, { width: 2, fill: COLOR.paper });
  if (station && reader) g.circle(pay, 134, 3.5, { stroke: null, fill: COLOR.ink });
  const payLabel = station ? (reader ? 'drawings.plan.payReader' : 'drawings.plan.payNoReader') : kind === '2A' ? 'drawings.plan.pedestal2A' : 'drawings.plan.pedestal2B';
  g.text(pay + 16, islandTop - 8, t(payLabel, { mark: MARK.pay }), { ...lbl, anchor: 'end' });
  g.line(pay, 142, pay, loopTop, { width: 1, dash: [2, 3] });

  // The back camera.
  g.circle(backCamera, 128, 6, { fill: COLOR.paper, width: 1.5 });
  g.text(backCamera, 100, t('drawings.plan.backCamera', { mark: MARK.backCamera }), { ...lbl, anchor: 'middle' });
  g.text(backCamera, 86, t('drawings.plan.ceilingOrPost'), { ...soft, anchor: 'middle' });

  // Conduit runs.
  const conduit = { stroke: COLOR.conduit, width: 2, dash: [3, 4] };
  g.path([[742, 118], [pay + (station ? 12 : 7), 118]], conduit);
  g.path([[pay - 12, 118], [backCamera + 6, 118]], conduit);
  g.path([[ARM, 104], [ARM, 60], [900, 60]], conduit);
  g.path([[770, 146], [770, 160], [ARM, 160]], conduit);
  const cText = { size: SIZE.text, bold: true, color: COLOR.conduit };
  g.text((742 + pay) / 2, 113, MARK.C3, { ...cText, anchor: 'middle' });
  g.text((pay + backCamera) / 2, 134, MARK.C4, { ...cText, anchor: 'middle' });
  g.text(906, 56, t('drawings.plan.c1c2', { power: MARK.C1, network: MARK.C2 }), cText);
  g.text(800, 164, t('drawings.plan.c5', { mark: MARK.C5 }), cText);

  // Dimensions, measured back from the gate arm.
  const ext = (x, to) => g.line(x, 346, x, to, { width: 1 });
  ext(ARM, 476);
  ext(truckFront, 372);
  ext(pay, 406);
  ext(truckBack, 440);
  ext(l1 + loopW, 406);
  ext(backCamera, 476);
  const dim = (from, y, text, after) => {
    g.arrow(from, y, ARM, y, { both: true, width: 1 });
    g.text((from + ARM) / 2, y - 6, text, { ...num, anchor: 'middle' });
    if (after) g.text(ARM + 6, y + 4, after, soft);
  };
  g.arrow(truckFront, 366, ARM, 366, { both: true, width: 1 });
  const stop = say('stopToArm', t);
  g.text(ARM + 6, 370, stop, num);
  g.text(ARM + 6 + g.measure(stop, SIZE.text) / g.k + 6, 370, t('drawings.plan.stop'), soft);
  dim(pay, 400, say('payStation', t), t(station ? 'drawings.plan.payAt' : 'drawings.plan.pedestalAt', { mark: MARK.L2 }));
  g.line(l1 + loopW, 400, pay - 8, 400, { width: 1, dash: [2, 3] });
  g.text(l1 + loopW + 6, 394, t('drawings.plan.l1At', { mark: MARK.L1, length: say('thirdLoopNear', t) }), num);
  dim(truckBack, 434, say('truckBack', t), t('drawings.plan.truckBack'));
  dim(backCamera, 470, say('backCamera', t), t('drawings.plan.backCameraAt'));

  // The scale bar, from the table.
  const bar = U * metres('scaleBar');
  const marks = scaleMarks(t);
  marks.slice(0, -1).forEach((m, i) => {
    const x = 70 + m.at * bar;
    const w = (marks[i + 1].at - m.at) * bar;
    g.rect(x, 520, w, 8, { fill: i % 2 === 0 ? COLOR.ink : COLOR.paper, width: 1 });
  });
  for (const m of marks) g.text(70 + m.at * bar, 544, m.text, { ...num, anchor: m.at === 0 ? 'start' : 'middle', kind: 'mark' });
  g.text(1076, 540, t('drawings.plan.measured'), { ...soft, anchor: 'end' });
}
