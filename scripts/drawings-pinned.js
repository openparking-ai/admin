// The texts scripts/check-drawings.js leans on, held here as approved and never
// read back from the dictionary (U5 fix 11, handover 2026-10-08 17:40).
//
// A check that takes an exception, a claim's lanes or a number's writing from
// t(key) follows whatever that string is edited to say: "No card reader."
// edited to "A card reader at the window." was still an exception, and stayed
// green. These texts follow only this file. check-drawings compares each
// dictionary string to its pin first, made alike as its group says, and names
// every key and language that differ; the checks then read the pins.
//
//   saysNone   4: the only texts on a pass-only set that may hold the card
//              reader's stem, each saying there is none. Read after squash().
//   everyLane  "Every lane": what each claim says (its lanes are the claim's
//              own, below), and the equipment words it is read for. Read after norm().
//   writing    1 and 3: how a number is written, and the title block's
//              "3 of 10". Read exactly: a digit is what these checks look for.
//
// Changing one of these strings means changing it here too, in the same
// commit, where a reviewer reads it as a change to what the check allows.

import { endOnce } from '../src/i18n/index.js';
import { norm, squash } from './drawings-text.js';

export const PINNED = {
  saysNone: {
    "drawings.stop.passOnly": {
      en: "This garage takes pass holders only: the exit pay station carries the scanner and the intercom and has no card reader. Cable {cable} and outlet {outlet} are left out.",
      es: "Este garaje recibe solo a quienes tienen pase: la estación de pago de salida lleva el escáner y el intercomunicador y no tiene lector de tarjetas. Se omiten el cable {cable} y el tomacorriente {outlet}.",
    },
    "drawings.entryType.passOnly": {
      en: "There are two kinds of entry lane. This garage takes pass holders only, so every entry lane here is type 2B: the driver shows a pass to get in. No exit lane here has a card reader.",
      es: "Hay dos clases de carril de entrada. Este garaje recibe solo a quienes tienen pase, así que cada carril de entrada aquí es del tipo 2B: el conductor muestra un pase para entrar. Ningún carril de salida aquí tiene lector de tarjetas.",
    },
    "drawings.type.exitNoReader": {
      en: "Exit, no card reader",
      es: "Salida, sin lector de tarjetas",
    },
    "drawings.how2B.noReader": {
      en: "No card reader.",
      es: "Sin lector de tarjetas.",
    },
  },
  everyLane: {
    "drawings.about.oneComputer": {
      en: "One computer sits in the garage's server room and runs every lane. Each lane has ordinary equipment: a gate, loops, two cameras, a display, an intercom and a small relay box, and one control panel that holds its wiring.",
      es: "Una computadora en la sala de servidores del garaje maneja todos los carriles. Cada carril tiene equipo común: una barrera, lazos, dos cámaras, una pantalla, un intercomunicador y una pequeña caja de relés, y un panel de control que reúne su cableado.",
    },
    "drawings.about.alsoAtExit": {
      en: "Each exit lane also has a scanner and a card reader.",
      es: "Cada carril de salida tiene además un escáner y un lector de tarjetas.",
    },
    "drawings.about.alsoEveryLane": {
      en: "Each lane also has a scanner.",
      es: "Cada carril tiene además un escáner.",
    },
    "drawings.wiring.scanner": {
      en: "{mark}  Scanner",
      es: "{mark}  Escáner",
    },
    "drawings.item.cardReader": {
      en: "Card reader",
      es: "Lector de tarjetas",
    },
    "drawings.wiring.intercom": {
      en: "{mark}  Intercom",
      es: "{mark}  Intercomunicador",
    },
  },
  writing: {
    "drawings.unit.ft": {
      en: "{n} ft",
      es: "{n} pies",
    },
    "drawings.unit.in": {
      en: "{n} in",
      es: "{n} pulg",
    },
    "drawings.unit.m": {
      en: "{n} m",
      es: "{n} m",
    },
    "drawings.unit.mm": {
      en: "{n} mm",
      es: "{n} mm",
    },
    "drawings.unit.length": {
      en: "{imperial} ({metric})",
      es: "{imperial} ({metric})",
    },
    "drawings.unit.turns": {
      en: "{n} turns",
      es: "{n} vueltas",
    },
    "drawings.unit.twist": {
      en: "{n} turns per foot",
      es: "{n} vueltas por pie",
    },
    "drawings.unit.category": {
      en: "Cat{n}",
      es: "Cat{n}",
    },
    "drawings.unit.volts": {
      en: "{n} V",
      es: "{n} V",
    },
    "drawings.unit.amps": {
      en: "{n} amps",
      es: "{n} amperios",
    },
    "drawings.unit.degrees": {
      en: "{n}°",
      es: "{n}°",
    },
    "drawings.tb.sheetOf": {
      en: "{n} of {of}",
      es: "{n} de {of}",
    },
  },
};

/** How each group's strings are made alike before they are compared to the pin. */
export const ALIKE = { saysNone: squash, everyLane: norm, writing: (text) => text };

/** The lanes each "Every lane" claim speaks of. Fixed with its pinned text: an edit to the text cannot move them. */
export const CLAIMS = [
  { key: 'drawings.about.oneComputer', on: () => true },
  { key: 'drawings.about.alsoAtExit', on: (plan) => plan.kind === 'exit' },
  { key: 'drawings.about.alsoEveryLane', on: () => true },
];

/**
 * A t() for one language that knows only the pinned keys, filled as the
 * dictionary fills them. Any other key throws: a check given this t reads
 * nothing the dictionary can change under it.
 */
export function pinnedWords(language) {
  const all = Object.assign({}, ...Object.values(PINNED));
  return (key, values) => {
    if (!all[key]) throw new Error(`"${key}" is not pinned: scripts/drawings-pinned.js`);
    const text = all[key][language];
    return values ? endOnce(text.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole))) : text;
  };
}
