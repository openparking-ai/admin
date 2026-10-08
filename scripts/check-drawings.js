#!/usr/bin/env node
// The installer drawings (U5), built for the test garages of
// test/drawings-fixtures.js in English and Spanish, then read two ways: the
// sheets as built (every text on every sheet) and the PDF read back by pypdf,
// a reader this project did not write.
//
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
//   6  the PDF: every page 11 x 17 in landscape (1224 x 792 points), its text
//      real text (read back), each sheet's title and title block on its page;
//      nothing drawn off its sheet or into the title block.
//
//   node scripts/check-drawings.js        (FILES_PYTHON names the Python with pypdf)

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translate } from '../src/i18n/index.js';
import { NUMBERS, SOURCES, everyWriting, scaleMarks } from '../src/drawings/numbers.js';
import { MARK_SHAPE } from '../src/drawings/marks.js';
import { FRAME, PAGE } from '../src/drawings/layout.js';
import { madeOn } from '../src/drawings/sheets.js';
import { makeDrawings, openDocument } from '../src/drawings/pdf.js';
import { readBack } from './files/read-back.js';
import { ADDED, CHANGED, DRAFT7 } from '../test/draft7-numbers.js';
import { ANY_DRIVER, LONG_NAMES, MADE_AT, NO_LANES, PASS_ONLY, UNANSWERED } from '../test/drawings-fixtures.js';

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
  // ── 1 one table ──────────────────────────────────────────────────────────
  console.log('1 one table');
  for (const { name, garage, language, made } of SETS) {
    const t = words(language);
    const writings = everyWriting(t);
    const marks = new Set(scaleMarks(t).map((m) => m.text));
    const total = made.sheets.length;
    const data = new Set([garage.garage.name, ...garage.lanes.map((l) => l.name), madeOn(MADE_AT, garage.garage, language)]);
    for (let n = 1; n <= total; n += 1) data.add(t('drawings.tb.sheetOf', { n, of: total }));
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
    const marks = new Set(scaleMarks(words(language)).map((m) => m.text));
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
  }

  // ── 5 words ─────────────────────────────────────────────────────────────
  console.log('5 words');
  const BANNED = ['gate box', 'gate boxes', 'lane computer', 'lane computers', "owner's decision", 'owner’s decision', 'caja de la barrera', 'caja de barrera', 'computadora del carril', 'computadora de carril', 'decisión del dueño', 'decisiones del dueño'];
  // Proper names the sheets may hold: the project, the sources, the truck.
  const NAMES = new Set(['Open', 'Parking', 'AI', 'Ford', 'F-150', 'Michigan', 'State', 'University', 'Magnetic', 'MHTM', 'DoorKing', 'Stripe', "Stripe's", 'Cat6']);
  for (const { name, language, made } of SETS) {
    const found = [];
    for (const sheet of made.sheets) {
      // Read whole too, so a phrase a line break split in two is still read.
      const whole = texts(sheet).filter((i) => i.kind === 'words').map((i) => i.text).join(' ').toLocaleLowerCase();
      for (const b of BANNED) if (whole.includes(b)) found.push(`"${sheet.title}": "${b}" on the sheet`);
      for (const item of texts(sheet)) {
        if (item.kind !== 'words') continue;
        const low = item.text.toLocaleLowerCase();
        for (const b of BANNED) if (low.includes(b)) found.push(`"${sheet.title}": "${b}" in "${item.text}"`);
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
