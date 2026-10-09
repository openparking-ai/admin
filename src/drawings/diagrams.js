// The two diagrams that are not plans: one lane's wiring, inside and out of
// its control panel, and the server room. Each is drawn in its own units and
// placed with `scaled` (src/drawings/layout.js).

import { COLOR, SIZE } from './layout.js';
import { say } from './numbers.js';
import { MARK } from './marks.js';

export const WIRING = { width: 1100, height: 600 };
export const ROOM = { left: -12, width: 1024, height: 250 };

const lbl = { size: SIZE.text, bold: true };
const soft = { size: SIZE.small, color: COLOR.soft };

/** A box with a name, and a smaller line under it if there is one. */
function box(g, x, y, w, name, under, o = {}) {
  g.rect(x, y, w, 44, { fill: COLOR.paper, width: 1.5 });
  if (under) {
    g.text(x + w / 2, y + 19, name, { ...lbl, anchor: 'middle', kind: o.nameKind });
    g.text(x + w / 2, y + 34, under, { ...soft, anchor: 'middle', kind: o.underKind });
  } else {
    g.text(x + w / 2, y + 26, name, { ...lbl, anchor: 'middle', kind: o.nameKind });
  }
}

/** `text` cut to fit `width` points, ending in "…" when it is cut. */
export function fit(g, text, width, size = SIZE.text, bold = true) {
  const chars = [...String(text)];
  if (g.measure(text, size, bold) <= width) return text;
  let n = chars.length;
  while (n > 1 && g.measure(`${chars.slice(0, n).join('').trimEnd()}…`, size, bold) > width) n -= 1;
  return `${chars.slice(0, n).join('').trimEnd()}…`;
}

/** One lane's wiring. `reader`: the exit lanes have a card reader. `scannerAt`: where scanners are, in words. */
export function drawWiring(g, t, { reader, scannerAt }) {
  const power = { stroke: COLOR.power, width: 3 };
  const net = { stroke: COLOR.conduit, width: 2, dash: [3, 4] };
  const loop = { stroke: COLOR.loop, width: 2 };
  const sig = { stroke: COLOR.ink, width: 1.2 };
  const tag = (x, y, text, color, o = {}) => g.text(x, y, text, { size: SIZE.text, bold: true, color, ...o });

  g.rect(240, 30, 460, 510, { fill: COLOR.shade, width: 1, dash: [8, 5] });
  g.text(252, 48, t('drawings.wiring.inside', { mark: MARK.panel }).toLocaleUpperCase(), { ...soft, bold: true });

  // Power.
  g.path([[190, 82], [270, 82]], power);
  g.path([[440, 75], [500, 75]], power);
  g.path([[440, 90], [462, 90], [462, 362], [440, 362]], power);
  g.path([[462, 222], [440, 222]], power);
  g.path([[462, 128], [760, 128], [760, 54], [880, 54]], power);
  if (reader) g.path([[760, 128], [760, 264], [880, 264]], power);
  tag(230, 74, MARK.W1, COLOR.power, { anchor: 'middle' });
  tag(470, 160, MARK.W2, COLOR.power);
  tag(800, 46, MARK.W4, COLOR.power);
  if (reader) tag(800, 256, MARK.W3, COLOR.power);

  // Network cable.
  g.path([[190, 222], [270, 222]], net);
  g.path([[440, 236], [730, 236]], net);
  g.path([[730, 70], [730, 420]], net);
  g.path([[400, 244], [400, 292], [500, 292]], net);
  const branches = [[70, MARK.N2], [140, MARK.N3], [210, MARK.N4], ...(reader ? [[280, MARK.N5]] : []), [350, MARK.N6], [420, MARK.N7]];
  for (const [y, mark] of branches) {
    g.path([[730, y], [880, y]], net);
    tag(838, y + 15, mark, COLOR.conduit);
  }
  tag(230, 214, MARK.N1, COLOR.conduit, { anchor: 'middle' });
  tag(408, 270, MARK.N8, COLOR.conduit);

  // Loop leads.
  g.path([[190, 362], [270, 362]], loop);
  g.path([[190, 462], [690, 462], [690, 82], [670, 82]], loop);
  tag(230, 354, MARK.S1, COLOR.loop, { anchor: 'middle' });
  tag(230, 454, MARK.S2, COLOR.loop, { anchor: 'middle' });

  // Signal wires.
  g.path([[440, 350], [480, 350], [480, 304], [500, 304]], sig);
  g.path([[585, 270], [585, 104]], sig);
  g.text(592, 190, t('drawings.wiring.openSignal', { mark: MARK.K1 }), soft);
  g.text(486, 342, MARK.K2, soft);

  // What is outside the control panel.
  const loops = [MARK.L1, MARK.L2, MARK.L4, MARK.L5].join(' ');
  box(g, 20, 60, 170, t('drawings.wiring.garagePanel'));
  box(g, 20, 200, 170, t('drawings.wiring.serverRoom'), t('drawings.wiring.serverRoomHolds'));
  box(g, 20, 340, 170, t('drawings.wiring.loops', { marks: loops }), t('drawings.wiring.inTheFloor'));
  box(g, 20, 440, 170, t('drawings.wiring.closingLoop', { mark: MARK.L3 }), t('drawings.wiring.underTheArm'));
  // Inside it.
  box(g, 270, 60, 170, t('drawings.item.terminal'), t('drawings.wiring.volts', { volts: say('supply', t) }));
  box(g, 500, 60, 170, t('drawings.item.gateControl'), t('drawings.wiring.opensCloses'));
  box(g, 270, 200, 170, t('drawings.item.switch'), t('drawings.wiring.powersByCable'));
  box(g, 500, 270, 170, t('drawings.item.relay'), t('drawings.wiring.readsLoops'));
  box(g, 270, 340, 170, t('drawings.item.detector'));
  // The lane's equipment.
  box(g, 880, 40, 200, t('drawings.plan.display', { mark: MARK.display }), t('drawings.wiring.ownOutlet'));
  box(g, 880, 110, 200, t('drawings.plan.frontCamera', { mark: MARK.frontCamera }));
  box(g, 880, 180, 200, t('drawings.plan.backCamera', { mark: MARK.backCamera }));
  if (reader) box(g, 880, 250, 200, t('drawings.item.cardReader'), t('drawings.wiring.readerAt'));
  box(g, 880, 320, 200, t('drawings.wiring.scanner', { mark: MARK.scanner }), scannerAt);
  box(g, 880, 390, 200, t('drawings.wiring.intercom', { mark: MARK.intercom }));

  // The key.
  const keyY = 570;
  g.path([[20, keyY], [70, keyY]], power);
  g.text(78, keyY + 4, t('drawings.wiring.keyPower'), { size: SIZE.text });
  g.path([[160, keyY], [210, keyY]], net);
  g.text(218, keyY + 4, t('drawings.wiring.keyNetwork'), { size: SIZE.text });
  g.path([[350, keyY], [400, keyY]], loop);
  g.text(408, keyY + 4, t('drawings.wiring.keyLoop'), { size: SIZE.text });
  g.path([[520, keyY], [570, keyY]], sig);
  g.text(578, keyY + 4, t('drawings.wiring.keySignal'), { size: SIZE.text });
}

/** The server room and a cable to each lane's control panel: the first two lanes by name, then "each further lane". */
export function drawRoom(g, t, lanes) {
  const net = { stroke: COLOR.conduit, width: 2, dash: [3, 4] };
  const power = { stroke: COLOR.power, width: 3 };
  g.rect(200, 20, 420, 210, { fill: COLOR.shade, width: 1, dash: [8, 5] });
  g.text(212, 38, t('drawings.title.room').toLocaleUpperCase(), { ...soft, bold: true });
  g.path([[170, 82], [230, 82]], net);
  g.path([[400, 82], [440, 82]], net);
  g.path([[525, 104], [525, 150]], net);
  g.path([[170, 172], [230, 172]], power);
  g.path([[400, 165], [440, 165]], power);
  g.path([[400, 180], [420, 180], [420, 120], [460, 120], [460, 104]], power);
  box(g, 0, 60, 170, t('drawings.room.internet'));
  box(g, 0, 150, 170, t('drawings.room.outlet'));
  box(g, 230, 60, 170, t('drawings.room.router'));
  box(g, 440, 60, 170, t('drawings.room.mainSwitch'));
  box(g, 440, 150, 170, t('drawings.room.computer'), t('drawings.room.runsEvery'));
  box(g, 230, 150, 170, t('drawings.room.backup'), t('drawings.room.battery'));

  const shown = lanes.length > 2 ? [...lanes.slice(0, 2), null] : lanes;
  const ys = [38, 108, 178];
  shown.forEach((lane, i) => {
    const y = ys[i];
    g.path([[610, i === 0 ? 82 : 90], [700, i === 0 ? 82 : 90], [700, y + 22], [780, y + 22]], net);
    if (lane) box(g, 780, y, 190, t('drawings.room.panel'), fit(g, lane.name, 178, SIZE.small, false), { underKind: 'data' });
    else box(g, 780, y, 190, t('drawings.room.furtherLanes'), t('drawings.room.panelLower'));
  });
  g.text(628, 70, MARK.N1, { size: SIZE.text, bold: true, color: COLOR.conduit });
}
