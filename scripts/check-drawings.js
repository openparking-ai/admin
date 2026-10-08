#!/usr/bin/env node
// The installer drawings (U5), built for the test garages of
// test/drawings-fixtures.js in English and Spanish, then read two ways: the
// sheets as built (every text on every sheet) and the PDF read back by pypdf,
// a reader this project did not write.
//
//   0  pinned: the texts these checks lean on (4's exceptions, the "Every
//      lane" claims, how a number is written) are held approved in
//      scripts/drawings-pinned.js; each dictionary string equals its pin, or
//      its key and language are named. The checks read the pins, never t(key).
//   1  one table: every number on every sheet is the table's
//      (src/drawings/numbers.js), written by it; a mark (L1, N5, 2A) is a
//      label; a scale bar's mark is one of its marks; stored names, the date
//      and "3 of 10" are the garage's data, and the sheet's links are the
//      table's sources. Anything else with a digit in it is named.
//   2  Draft 7 carried over: each measurement Draft 7 printed
//      (test/draft7-numbers.js) is in the table with the same inches and the
//      same metric value; a number the table adds says why.
//   3  units: every length is feet and inches, then metres in brackets.
//   4  per garage: two ways in and one way out, any driver -> two 2A sheets
//      and an exit with a card reader; pass holders only -> 2B and no card
//      reader anywhere (no reader on the exit, no N5, no W3); no answer to the
//      drivers question, or no lanes -> no set.
//   5  words: no "gate box", no "lane computer", no owner's decision, no
//      person's name, in any sheet, either language.
//   4  also: on a garage for pass holders only, no text names the card reader
//      but to say there is none; and the "Every lane" sheet says each piece
//      of equipment is on exactly the lanes whose plan sheets draw it.
//   5  also: read made alike (case, accents, hyphens, spaces), so "gate-box"
//      and "Gate Box" are "gate box". A name typed anywhere a sheet is made
//      is caught by 8; no list of people's names is kept anywhere.
//   8  every text is the drawings' own: each paragraph, bullet, cell and
//      label is made only of the dictionary's drawing strings, the table's
//      numbers, the marks and this garage's names and date. A typed sentence,
//      a name, anything else is named.
//   9  nothing crosses a label: no text's box is crossed by a drawn line.
//   7  the plan agrees with itself: every loop, as drawn, sits within the
//      edge distance the sheet prints from each lane edge (12 to 20 in), and
//      the across-the-lane lengths the sheet prints are the lane less those
//      edge distances. Everything a driver uses (the pay station or
//      pedestal), as drawn, stands at least the table's distance from the
//      gate arm's sweep, on every plan.
//   6  the PDF: every page 11 x 17 in landscape (1224 x 792 points), its text
//      real text (read back), each sheet's title and title block on its page;
//      nothing drawn off its sheet or into the title block.
//
//   node scripts/check-drawings.js        (FILES_PYTHON names the Python with pypdf)

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DICTIONARIES, translate } from '../src/i18n/index.js';
import { NUMBERS, SOURCES, everyWriting, scaleMarks } from '../src/drawings/numbers.js';
import { MARK_SHAPE } from '../src/drawings/marks.js';
import { FRAME, PAGE } from '../src/drawings/layout.js';
import { madeOn } from '../src/drawings/sheets.js';
import { makeDrawings, openDocument } from '../src/drawings/pdf.js';
import { readBack } from './files/read-back.js';
import { ADDED, CHANGED, DRAFT7 } from '../test/draft7-numbers.js';
import { ANY_DRIVER, LONG_NAMES, MADE_AT, NO_LANES, PASS_ONLY, UNANSWERED } from '../test/drawings-fixtures.js';
import { MARK } from '../src/drawings/marks.js';
import { norm, ownWords, runsOf, squash } from './drawings-text.js';
import { ALIKE, CLAIMS, PINNED, pinnedWords } from './drawings-pinned.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIR = mkdtempSync(join(tmpdir(), 'admin-drawings-'));
const fontFile = (name) => readFileSync(join(ROOT, 'src', 'files', 'fonts', name)).toString('binary');
const FONTS = { regular: fontFile('DMSans-Regular.ttf'), bold: fontFile('DMSans-Bold.ttf') };
const LANGUAGES = ['en', 'es'];

const failures = [];
let passed = 0;
const check = (ok, what) => {
  if (ok) passed += 1;
  else failures.push(what);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};

const words = (language) => (key, values) => translate(language, key, values);
const build = (garage, language) => makeDrawings({ fonts: FONTS, t: words(language), language, ...garage, madeAt: MADE_AT });
const texts = (sheet) => sheet.items.filter((i) => i.t === 'text' && i.text);

// Every set, both languages, made once.
const GARAGES = { 'any driver': ANY_DRIVER, 'pass holders only': PASS_ONLY, 'long names': LONG_NAMES };
const SETS = [];
for (const [name, garage] of Object.entries(GARAGES)) {
  for (const language of LANGUAGES) SETS.push({ name, garage, language, made: build(garage, language) });
}

try {
  // ── 0 pinned ────────────────────────────────────────────────────────────
  console.log('0 pinned');
  for (const language of LANGUAGES) {
    for (const [group, texts] of Object.entries(PINNED)) {
      const alike = ALIKE[group];
      const moved = Object.entries(texts)
        .filter(([key, pin]) => alike(DICTIONARIES[language][key] ?? '') !== alike(pin[language]))
        .map(([key, pin]) => `${language} ${key}: "${DICTIONARIES[language][key]}", pinned "${pin[language]}"`);
      check(moved.length === 0, `${language}: the ${Object.keys(texts).length} ${group} texts are as pinned${moved.length ? `; changed:\n      ${moved.join('\n      ')}` : ''}`);
    }
  }

  // ── 1 one table ──────────────────────────────────────────────────────────
  console.log('1 one table');
  for (const { name, garage, language, made } of SETS) {
    // How a number is written, and "3 of 10", from the pins: a digit added to a unit's words is not the table's.
    const pinned = pinnedWords(language);
    const writings = everyWriting(pinned);
    const marks = new Set(scaleMarks(pinned).map((m) => m.text));
    const total = made.sheets.length;
    const data = new Set([garage.garage.name, ...garage.lanes.map((l) => l.name), madeOn(MADE_AT, garage.garage, language)]);
    for (let n = 1; n <= total; n += 1) data.add(pinned('drawings.tb.sheetOf', { n, of: total }));
    const links = new Set(Object.values(SOURCES).filter(Boolean));
    const strays = [];
    for (const sheet of made.sheets) {
      for (const item of texts(sheet)) {
        const where = `${language}, ${name}, "${sheet.title}"${sheet.lane ? ` (${sheet.lane})` : ''}`;
        if (item.kind === 'mark') {
          if (!marks.has(item.text)) strays.push(`${where}: "${item.text}" is no mark of the scale bar`);
          continue;
        }
        if (item.kind === 'link') {
          if (!links.has(item.text)) strays.push(`${where}: "${item.text}" is no source in the table`);
          continue;
        }
        if (item.kind === 'data') {
          // A stored name may be cut to fit, ending in "…": it is the start of one.
          const whole = item.text.replace(/…$/, '');
          if (![...data].some((d) => d === item.text || d.includes(whole))) strays.push(`${where}: "${item.text}" is not this garage's data`);
          continue;
        }
        let rest = item.text;
        for (const w of writings) rest = rest.split(w).join('§');
        rest = rest
          .split(/(\s|,|\(|\)|·|:)/)
          .map((token) => {
            const bare = token.replace(/[.;]+$/, '');
            return MARK_SHAPE.test(bare) || bare === 'F-150' ? '§' : token;
          })
          .join('');
        if (/[\d½⅛]/.test(rest)) strays.push(`${where}: "${item.text}" holds a number that is not the table's`);
      }
    }
    check(strays.length === 0, `${language}, ${name}: every number on ${total} sheets is the table's${strays.length ? `:\n      ${strays.join('\n      ')}` : ''}`);
  }

  // ── 2 Draft 7 carried over ──────────────────────────────────────────────
  console.log('2 Draft 7 carried over');
  for (const d of DRAFT7) {
    const n = NUMBERS[d.key];
    let ok;
    let said;
    if (!n) {
      ok = false;
      said = 'is not in the table';
    } else if (d.value !== undefined) {
      ok = n.value === d.value;
      said = `is ${n.value}`;
    } else {
      ok = Math.abs(n.inches - d.inches) < 1e-9 && (d.metric === null ? Object.hasOwn(ADDED, d.key) : n.metric === d.metric);
      said = `is ${n.inches} in (${n.metric})`;
    }
    check(ok, `Draft 7 "${d.wrote}" -> ${d.key}${ok ? '' : ` ${said}, not ${d.value ?? `${d.inches} in (${d.metric})`}`}`);
  }
  const fromDraft = new Set(DRAFT7.map((d) => d.key));
  const unexplained = Object.keys(NUMBERS).filter((k) => !fromDraft.has(k) && !Object.hasOwn(ADDED, k));
  check(unexplained.length === 0, `every number the table adds to Draft 7 says why${unexplained.length ? `: not ${unexplained.join(', ')}` : ` (${Object.keys(ADDED).length} added, ${CHANGED.length} of Draft 7's printed numbers changed, each with its reason)`}`);

  // ── 3 units ─────────────────────────────────────────────────────────────
  console.log('3 units');
  const IMPERIAL = '\\d+(?: \\d\\/\\d)? (?:ft|pies)(?: \\d+(?: \\d\\/\\d)? (?:in|pulg))?|\\d+(?: \\d\\/\\d)? (?:in|pulg)';
  const WHOLE = new RegExp(`(?:${IMPERIAL}) \\(\\d+(?:\\.\\d+)? (?:m|mm)\\)`, 'g');
  const BARE = /\d[\d.]*(?: \d\/\d)? (?:ft|in|m|mm|pies|pulg)(?![\p{L}])/u;
  for (const { name, language, made } of SETS) {
    const marks = new Set(scaleMarks(pinnedWords(language)).map((m) => m.text));
    const bare = [];
    let lengths = 0;
    for (const sheet of made.sheets) {
      for (const item of texts(sheet)) {
        if (item.kind !== 'words' && item.kind !== 'mark') continue;
        if (item.kind === 'mark' && marks.has(item.text) && !/[a-z]/.test(item.text)) continue;
        const found = item.text.match(WHOLE) ?? [];
        lengths += found.length;
        const rest = item.text.replace(WHOLE, '§');
        if (BARE.test(rest)) bare.push(`"${sheet.title}": "${item.text}"`);
      }
    }
    check(bare.length === 0 && lengths > 0, `${language}, ${name}: all ${lengths} lengths are feet and inches with metres in brackets${bare.length ? `; a length in one unit only:\n      ${[...new Set(bare)].join('\n      ')}` : ''}`);
  }

// The card reader's stems, both languages: "reader" (readers, cardreader) and "lector" (lectores, lector de tarjeta).
const READER_STEMS = ['reader', 'lector'];

  // ── 4 per garage ────────────────────────────────────────────────────────
  console.log('4 per garage');
  for (const language of LANGUAGES) {
    const t = words(language);
    const reader = t('drawings.item.cardReader');
    const allText = (made) => made.sheets.flatMap((s) => texts(s).map((i) => i.text));
    const any = build(ANY_DRIVER, language);
    const plans = any.sheets.filter((s) => s.key === 'plan');
    check(
      plans.map((s) => s.kind).join(' ') === '2A 2A exit' && plans.map((s) => s.lane).join(', ') === 'North Entry, South Entry, Main Exit',
      `${language}: any driver, two ways in and one out -> sheets ${plans.map((s) => `${s.kind} (${s.lane})`).join(', ')}; wanted 2A (North Entry), 2A (South Entry), exit (Main Exit)`,
    );
    const exit = plans.find((s) => s.kind === 'exit');
    check(exit?.reader === true && texts(exit).some((i) => i.text === t('drawings.plan.payReader', { mark: 'D' })), `${language}: any driver -> the exit's pay station has a card reader`);
    check(allText(any).includes(reader) && allText(any).includes('N5') && allText(any).includes('W3'), `${language}: any driver -> the card reader, cable N5 and outlet W3 are drawn`);
    check(any.sheets.length === 10 && any.bytes !== null, `${language}: any driver -> 10 sheets (3 lanes and 7 shared), ${any.sheets.length} made`);

    const pass = build(PASS_ONLY, language);
    const passPlans = pass.sheets.filter((s) => s.key === 'plan');
    check(passPlans.map((s) => s.kind).join(' ') === '2B exit', `${language}: pass holders only -> sheets ${passPlans.map((s) => s.kind).join(', ')}; wanted 2B, exit`);
    const words2 = allText(pass);
    const readerWords = words2.filter((w) => w === reader || w === t('drawings.eq.payReader') || w === 'N5' || w === 'W3' || w.includes(t('drawings.plan.payReader', { mark: 'D' })));
    check(passPlans.every((s) => !s.reader) && readerWords.length === 0, `${language}: pass holders only -> no card reader at the exit, no N5, no W3${readerWords.length ? `; found: ${readerWords.join(' | ')}` : ''}`);

    const none = build(UNANSWERED, language);
    check(none.needs?.join() === 'drivers' && none.bytes === null && none.sheets.length === 0, `${language}: no answer to the drivers question -> no set, the page asks for it (${none.needs?.join() ?? 'a set was made'})`);
    const noLanes = build(NO_LANES, language);
    check(noLanes.needs?.join() === 'lanes' && noLanes.bytes === null, `${language}: no lanes -> no set, the page asks for lanes (${noLanes.needs?.join() ?? 'a set was made'})`);

    // However it is worded: on a pass-only set, the card reader is named only to say there is none.
    // Matched as a stem after every non-letter is dropped (squash), so one word, a hyphen, a no-break
    // space, a plural or another ending are all caught. The only texts allowed to hold the stem are
    // the named exceptions: the four sentences that say there is no card reader, as PINNED (check 0),
    // never as the dictionary says them now. An exception covers its pinned text only, not its key.
    const pinned = pinnedWords(language);
    const saysNone = new Set(Object.keys(PINNED.saysNone).map((key) => squash(pinned(key, { cable: MARK.N5, outlet: MARK.W3 }))));
    const holdsReader = (text) => READER_STEMS.some((stem) => squash(text).includes(stem));
    const named = pass.sheets.flatMap((sheet) => runsOf(sheet).filter((r) => holdsReader(r.text) && !saysNone.has(squash(r.text))).map((r) => `"${sheet.title}": "${r.text}"`));
    check(named.length === 0, `${language}: pass holders only -> the card reader is named only to say there is none${named.length ? `; named:\n      ${named.join('\n      ')}` : ''}`);
  }

  // Every lane: each piece of equipment is said to be on exactly the lanes whose plan sheets draw it.
  // The claims and the equipment words are the pinned ones (check 0): a claim edited to speak of other lanes is not read as its key's.
  for (const { name, language, made } of SETS) {
    const t = pinnedWords(language);
    const kit = {
      scanner: norm(t('drawings.wiring.scanner', { mark: '' })),
      'card reader': norm(t('drawings.item.cardReader')),
      intercom: norm(t('drawings.wiring.intercom', { mark: '' })),
    };
    const plans = made.sheets.filter((x) => x.key === 'plan');
    // What each plan draws at the driver's window: its D label.
    const atWindow = plans.map((p) => norm(runsOf(p).find((r) => norm(r.text).startsWith(`${norm(MARK.pay)} `))?.text ?? ''));
    const every = made.sheets.find((x) => x.key === 'everyLane');
    const claims = CLAIMS.map((c) => ({ key: c.key, on: plans.map(c.on) }));
    const said = runsOf(every).map((r) => norm(r.text));
    const wrong = [];
    for (const [thing, word] of Object.entries(kit)) {
      const has = atWindow.map((d) => d.includes(word));
      const claimed = plans.map(() => false);
      for (const c of claims) {
        const text = norm(t(c.key));
        if (said.includes(text) && text.includes(word)) c.on.forEach((on, i) => (claimed[i] ||= on));
      }
      plans.forEach((p, i) => {
        if (claimed[i] !== has[i]) wrong.push(`${thing}: the sheet says ${claimed[i] ? 'it is' : 'nothing of it'} on ${p.lane} (${p.kind}), whose plan ${has[i] ? 'draws it' : 'has none'}`);
      });
    }
    check(wrong.length === 0, `${language}, ${name}: "Every lane" says what each lane has${wrong.length ? `:\n      ${wrong.join('\n      ')}` : ''}`);
  }

  // ── 5 words ─────────────────────────────────────────────────────────────
  console.log('5 words');
  // Stems, matched after every non-letter is dropped (squash): "gate box", "Gate-Box", "gatebox" and
  // "gate boxes" all hold "gatebox". A synonym no string uses is the strings review's to find, not this check's.
  const BANNED = ['gatebox', 'lanecomputer', 'ownersdecision', 'ownerdecision', 'cajadelabarrera', 'cajadebarrera', 'cajadecompuerta', 'cajadelacompuerta', 'computadoradecarril', 'computadoradelcarril', 'decisiondeldueno', 'decisionesdeldueno', 'decisiondelpropietario', 'decisionesdelpropietario'];
  // Proper names the sheets may hold: the project, the sources, the truck, the barrier's series.
  const NAMES = new Set(['Open', 'Parking', 'AI', 'Ford', 'F-150', 'Michigan', 'State', 'University', 'Magnetic', 'MHTM', 'DoorKing', 'Access', 'Stripe', "Stripe's", 'Cat6']);
  for (const { name, language, made } of SETS) {
    const found = [];
    for (const sheet of made.sheets) {
      // Read whole too, so a phrase a line break split in two is still read.
      // Every text, labels and cells too, each run whole and the sheet whole.
      const whole = squash(texts(sheet).map((i) => i.text).join(' '));
      for (const b of BANNED) if (whole.includes(b)) found.push(`"${sheet.title}": "${b}" on the sheet`);
      for (const r of runsOf(sheet)) for (const b of BANNED) if (squash(r.text).includes(b)) found.push(`"${sheet.title}": "${b}" in "${r.text}"`);
      for (const item of texts(sheet)) {
        if (item.kind !== 'words') continue;
        // A capital inside a sentence that is not a mark or a name above is a name: of a person, until said otherwise.
        const sentences = item.text.split(/(?<=[.:;?!])\s+|“|”|\(|\)/);
        for (const sentence of sentences) {
          // The first word of a sentence, and a label's mark ("A  Control panel"), start with a capital.
          const all = sentence.trim().split(/\s+/);
          while (all.length && MARK_SHAPE.test(all[0].replace(/[,.;:]+$/, ''))) all.shift();
          const tokens = all.slice(1);
          for (const token of tokens) {
            const bare = token.replace(/[,.;:]+$/, '');
            if (/^\p{Lu}/u.test(bare) && !MARK_SHAPE.test(bare) && !NAMES.has(bare) && bare !== bare.toLocaleUpperCase()) found.push(`"${sheet.title}": a name "${bare}" in "${item.text}"`);
          }
        }
      }
    }
    check(found.length === 0, `${language}, ${name}: no gate box, no lane computer, no owner's decision, no person's name${found.length ? `:\n      ${[...new Set(found)].join('\n      ')}` : ''}`);
  }

  // ── 7 the plan agrees with itself ────────────────────────────────────────
  console.log('7 the plan agrees with itself');
  const N = (key) => NUMBERS[key].inches;
  check(
    N('loopAcrossLeast') === N('laneWidth') - 2 * N('loopEdgeMax') && N('loopAcrossMost') === N('laneWidth') - 2 * N('loopEdgeMin'),
    `the table: across the lane, a loop is the lane less the edge distance at each side (${N('loopAcrossLeast')} and ${N('loopAcrossMost')} in, from a ${N('laneWidth')} in lane and ${N('loopEdgeMin')} to ${N('loopEdgeMax')} in)`,
  );
  for (const { name, language, made } of SETS) {
    const wrong = [];
    let loops = 0;
    for (const sheet of made.sheets.filter((x) => x.key === 'plan')) {
      const lane = sheet.items.find((i) => i.role === 'lane');
      const perInch = lane.h / N('laneWidth');
      for (const loop of sheet.items.filter((i) => i.role === 'loop')) {
        loops += 1;
        const edges = [(loop.y - lane.y) / perInch, (lane.y + lane.h - loop.y - loop.h) / perInch];
        for (const e of edges) {
          if (e < N('loopEdgeMin') - 0.01 || e > N('loopEdgeMax') + 0.01) wrong.push(`"${sheet.title}" (${sheet.lane}): a loop drawn ${e.toFixed(1)} in from the lane edge, not ${N('loopEdgeMin')} to ${N('loopEdgeMax')} in`);
        }
      }
    }
    check(wrong.length === 0 && loops > 0, `${language}, ${name}: all ${loops} loops drawn ${N('loopEdgeMin')} to ${N('loopEdgeMax')} in from each lane edge${wrong.length ? `:\n      ${[...new Set(wrong)].join('\n      ')}` : ''}`);
  }

  for (const { name, language, made } of SETS) {
    const near = [];
    let controls = 0;
    for (const sheet of made.sheets.filter((x) => x.key === 'plan')) {
      const lane = sheet.items.find((i) => i.role === 'lane');
      const perInch = lane.h / N('laneWidth');
      const arm = sheet.items.find((i) => i.role === 'arm');
      // The arm swings up in its own plane across the lane: its sweep, seen from above, is its own width at its line.
      const sweep = [Math.min(arm.x1, arm.x2) - arm.width / 2, Math.max(arm.x1, arm.x2) + arm.width / 2];
      for (const c of sheet.items.filter((i) => i.role === 'driver')) {
        controls += 1;
        const gap = Math.max(sweep[0] - (c.x + c.w), c.x - sweep[1], 0) / perInch;
        if (gap < N('controlsFromGate') - 0.01) near.push(`"${sheet.title}" (${sheet.lane}): a driver's control drawn ${gap.toFixed(1)} in from the arm's sweep, under ${N('controlsFromGate')} in`);
      }
    }
    check(near.length === 0 && controls > 0, `${language}, ${name}: all ${controls} drivers' controls drawn at least ${N('controlsFromGate')} in from the arm's sweep${near.length ? `:\n      ${[...new Set(near)].join('\n      ')}` : ''}`);
  }

  // ── 8 every text is the drawings' own ───────────────────────────────────
  console.log("8 every text is the drawings' own");
  for (const { name, garage, language, made } of SETS) {
    const t = words(language);
    const total = made.sheets.length;
    const own = ownWords({
      language,
      atoms: [
        ...everyWriting(t),
        ...Object.values(MARK),
        ...scaleMarks(t).map((m) => m.text),
        ...Array.from({ length: total }, (_, i) => String(i + 1)),
        garage.garage.name,
        ...garage.lanes.map((l) => l.name),
        madeOn(MADE_AT, garage.garage, language),
      ],
    });
    const stray = [];
    for (const sheet of made.sheets) {
      for (const r of runsOf(sheet)) {
        if (r.kind !== 'words') continue;
        if (!own(r.text)) stray.push(`"${sheet.title}": "${r.text}"`);
      }
    }
    check(stray.length === 0, `${language}, ${name}: every text on ${total} sheets is the drawings' own${stray.length ? `; not:\n      ${[...new Set(stray)].join('\n      ')}` : ''}`);
  }

  // ── 9 nothing crosses a label ────────────────────────────────────────────
  console.log('9 nothing crosses a label');
  // A text's box: its width in the PDF's font, from a little above the capitals to below the descenders.
  const boxOf = (i) => {
    const left = i.anchor === 'end' ? i.x - i.w : i.anchor === 'middle' ? i.x - i.w / 2 : i.x;
    return { x1: left, x2: left + i.w, y1: i.y - 0.74 * i.size, y2: i.y + 0.22 * i.size };
  };
  // Whether the segment (a)-(b), `width` wide, crosses the box: Liang-Barsky on the box grown by half the stroke.
  const crosses = (box, a, b, width) => {
    const g = width / 2;
    const [x1, y1, x2, y2] = [box.x1 - g, box.y1 - g, box.x2 + g, box.y2 + g];
    let t0 = 0;
    let t1 = 1;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    for (const [p, q] of [[-dx, a[0] - x1], [dx, x2 - a[0]], [-dy, a[1] - y1], [dy, y2 - a[1]]]) {
      if (p === 0) {
        if (q < 0) return false;
      } else {
        const r = q / p;
        if (p < 0) t0 = Math.max(t0, r);
        else t1 = Math.min(t1, r);
        if (t0 > t1) return false;
      }
    }
    return t1 - t0 > 1e-6;
  };
  const segmentsOf = (item) => {
    if (item.t === 'line') return [[[item.x1, item.y1], [item.x2, item.y2], item.width]];
    if (item.t === 'rect' && item.stroke) {
      const { x, y, w, h } = item;
      const c = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      return c.map((p, k) => [p, c[(k + 1) % 4], item.width]);
    }
    if (item.t === 'poly' && item.stroke) {
      const segs = item.points.slice(1).map((p, k) => [item.points[k], p, item.width]);
      if (item.closed) segs.push([item.points[item.points.length - 1], item.points[0], item.width]);
      return segs;
    }
    return [];
  };
  for (const { name, language, made } of SETS) {
    const crossed = [];
    for (const sheet of made.sheets) {
      const segs = sheet.items.flatMap(segmentsOf);
      for (const i of texts(sheet)) {
        const box = boxOf(i);
        if (segs.some(([a, b, w]) => crosses(box, a, b, w))) crossed.push(`"${sheet.title}": "${i.text}"`);
      }
    }
    check(crossed.length === 0, `${language}, ${name}: no label crossed by a line${crossed.length ? `; crossed:\n      ${[...new Set(crossed)].join('\n      ')}` : ''}`);
  }

  // ── 6 the PDF ───────────────────────────────────────────────────────────
  console.log('6 the PDF');
  const files = SETS.map((s) => {
    const path = join(DIR, `${s.name.replace(/ /g, '-')}-${s.language}.pdf`);
    writeFileSync(path, s.made.bytes);
    return { ...s, path };
  });
  const read = readBack(files.map((f) => f.path));
  const plain = (text) => String(text).replace(/\s+/g, ' ').trim();
  for (const f of files) {
    const t = words(f.language);
    const pdf = read[f.path];
    const sizes = pdf.pages.map((p) => `${Math.round(p.width)} x ${Math.round(p.height)}`);
    check(pdf.pages.length === f.made.sheets.length && sizes.every((s) => s === `${PAGE.width} x ${PAGE.height}`), `${f.language}, ${f.name}: ${pdf.pages.length} pages, each 11 x 17 in landscape (1224 x 792 points): ${[...new Set(sizes)].join(', ')}`);
    const missing = [];
    f.made.sheets.forEach((sheet, i) => {
      const text = plain(pdf.pages[i]?.text ?? '');
      const want = [
        sheet.title,
        t('drawings.tb.garage').toLocaleUpperCase(),
        t('drawings.tb.sheet').toLocaleUpperCase(),
        t('drawings.tb.date').toLocaleUpperCase(),
        t('drawings.status'),
        t('drawings.tb.sheetOf', { n: i + 1, of: f.made.sheets.length }),
        madeOn(MADE_AT, f.garage.garage, f.language),
        ...(sheet.lane && sheet.lane.length < 25 ? [sheet.lane] : []),
      ];
      for (const w of want) if (!text.includes(plain(w))) missing.push(`page ${i + 1}: "${w}"`);
    });
    check(missing.length === 0, `${f.language}, ${f.name}: every page's title and title block read back as text${missing.length ? `; not found:\n      ${missing.join('\n      ')}` : ''}`);
    check(pdf.title === `${t('drawings.doc')} - ${f.garage.garage.name.slice(0, 120).trim()}` || pdf.title?.startsWith(t('drawings.doc')), `${f.language}, ${f.name}: the file's title names the drawings and the garage`);
  }

  // Nothing off its sheet, and nothing but the title block in the title block.
  const { measures } = openDocument(FONTS);
  for (const { name, language, made } of SETS) {
    const out = [];
    for (const sheet of made.sheets) {
      const block = PAGE.height - FRAME.inset - 58;
      let inBlock = false;
      for (const item of texts(sheet)) {
        const w = measures.measure(item.text, item.size, item.bold);
        const left = item.anchor === 'end' ? item.x - w : item.anchor === 'middle' ? item.x - w / 2 : item.x;
        if (left < FRAME.inset || left + w > PAGE.width - FRAME.inset || item.y > PAGE.height - FRAME.inset || item.y - item.size < FRAME.inset) out.push(`"${sheet.title}": "${item.text}" runs off the sheet`);
        if (item.y > block && !inBlock) inBlock = true;
        else if (item.y > block && item.y < block + 4) out.push(`"${sheet.title}": "${item.text}" touches the title block`);
      }
      const body = texts(sheet).filter((i) => i.y > FRAME.top && i.y < block - 2);
      const over = body.filter((i) => i.y > FRAME.bottom + 4);
      for (const i of over) out.push(`"${sheet.title}": "${i.text}" runs into the title block`);
    }
    check(out.length === 0, `${language}, ${name}: nothing runs off a sheet or into its title block${out.length ? `:\n      ${[...new Set(out)].join('\n      ')}` : ''}`);
  }
} finally {
  rmSync(DIR, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\ncheck-drawings — ${failures.length} failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`\ncheck-drawings — all ${passed} passed.`);
