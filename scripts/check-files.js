#!/usr/bin/env node
// The downloaded files hold the list, read back by readers we did not write.
//
// Builds the Excel and PDF files of both lists, in English and Spanish, from
// the lists in test/files-fixtures.js, with this computer in TOKYO time while
// the garage is in New York. Then reads every file back with Python openpyxl
// and pypdf (scripts/files/read-files.py) and requires:
//   1  the file is the list: every Excel row equals the list's row, cell by
//      cell, as many rows as the list has; in the PDF every plate and every
//      lane computer is on a page exactly once;
//   2  garage time: times are the garage's clock, one stay on each side of a
//      clock change, and the zone sentence names the garage's zone;
//   3  text stays text: "007", "1E5", "=1+1" and "@..." come back as those
//      exact strings, and the workbook holds 0 formulas;
//   4  both languages, every character: Spanish words in the Spanish files;
//      "Garaje Peña Ñandú – Café ¿?" back exactly; a letter the font cannot
//      draw is named;
//   5  long lists and long words: 250 stays run to several pages, the
//      headings and "Page X of Y" on every page, every plate once, nothing
//      off the page; a 60-character garage and lane name come back whole;
//  10  the file name holds no character a computer refuses;
//  12  every column's description, in both files, both languages;
//  F1-F3  the gate's cases (U3 fix round): a tab, vertical tab, form feed,
//      DEL, NUL or BEL never cuts off the text after it; the check-10 garage
//      prints its H and the screen is told hidden characters were left out;
//      "Exit<TAB>2 West" and "TAB<TAB>999" print whole; garage names of 3,000
//      and 8,000 characters make a PDF within 5 seconds;
//  odd text  the class: every text the lists show x every case in
//      scripts/files/odd-text.js x PDF, Excel, file name, PDF title and what
//      the maker says it left out, both languages, both lists, 5 s a file.
//
//   node scripts/check-files.js           (FILES_PYTHON names the Python with the readers)
//   node scripts/check-files.js --matrix FILE   ...and write every odd-text cell to FILE (JSON)

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translate } from '../src/i18n/index.js';
import { FILES, fileName } from '../src/files/model.js';
import { TIME_FORMATS, makeExcel } from '../src/files/excel.js';
import { makePdf } from '../src/files/pdf.js';
import { PYTHON, count, garageClock as clockIn, plain, readBack, tableOf, zoneSaid as zoneIn } from './files/read-back.js';
import { makeFile } from './files/make-file.js';
import { FONT, listOf, oddTextFiles } from './files/odd-text-files.js';
import { FILE_SECONDS, garageLines, pdfExpect } from './files/odd-text.js';
import {
  GARAGE,
  LONG_NAME,
  READ_AT,
  TEXT_CASES,
  insideData,
  lanesData,
  manyStays,
} from '../test/files-fixtures.js';

// The computer making the files is in another zone than the garage.
process.env.TZ = 'Asia/Tokyo';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIR = mkdtempSync(join(tmpdir(), 'admin-files-'));
const fontFile = (name) => readFileSync(join(ROOT, 'src', 'files', 'fonts', name)).toString('binary');
const FONTS = { regular: fontFile('DMSans-Regular.ttf'), bold: fontFile('DMSans-Bold.ttf') };

const failures = [];
let passed = 0;
const check = (ok, what) => {
  if (ok) passed += 1;
  else failures.push(what);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};

/** Build one file as the browser does, and save it here. */
function build(list, format, { language, garage = GARAGE, data, readAt = READ_AT }) {
  const t = (key, values) => translate(language, key, values);
  const file = FILES[list]({ t, language, garage, data, readAt });
  let bytes;
  let missing = [];
  if (format === 'xlsx') ({ bytes } = makeExcel(file, { language, meaningsTitle: t('file.meanings') }));
  else ({ bytes, missing } = makePdf(file, { fonts: FONTS, meaningsTitle: t('file.meanings'), pageWords: (page, pages) => t('file.page', { page, pages }) }));
  const name = fileName(file, garage, readAt, format);
  const path = join(DIR, `${list}-${language}-${Math.random().toString(36).slice(2)}.${format}`);
  writeFileSync(path, bytes);
  return { path, name, missing, file };
}

const zoneSaid = (language) => zoneIn(GARAGE.timezone, language, READ_AT);

const words = (language) => (key, values) => translate(language, key, values);

/** What each row of Cars inside says, worked out here from the list. */
const insideRows = (data) =>
  data.sessions.map((s) => [
    ['text', [s.plate, s.plate_region].filter(Boolean).join(' · ') || '–'],
    ['date', clockIn(s.entry_at, GARAGE.timezone)],
    ['text', s.entry_lane],
  ]);

try {
  // ── 1, 2, 3, 4, 12: both lists, both languages ─────────────────────────────
  const made = [];
  for (const language of ['en', 'es']) {
    const t = words(language);
    for (const [list, data] of [['inside', insideData()], ['lanes', lanesData()]]) {
      for (const format of ['xlsx', 'pdf']) made.push({ language, list, format, data, t, ...build(list, format, { language, data }) });
    }
  }
  const back = readBack(made.map((m) => m.path));

  for (const m of made) {
    const got = back[m.path];
    const where = `${m.list} ${m.format} (${m.language})`;
    const names = m.file.columns.map((c) => c.name);
    const zone = m.t('file.zone', { zone: zoneSaid(m.language) });

    if (m.format === 'xlsx') {
      const [sheet, meanings] = got.sheets;
      const { heading, rows } = tableOf(sheet, names);
      const cells = rows.flat().filter(Boolean);
      // 1: row for row, cell for cell, against the file's own rows.
      const expected = m.file.rows.map((r) => r.map((c) => (c.wall ? ['date', null] : ['text', c.text])));
      const wrong = [];
      expected.forEach((row, i) =>
        row.forEach(([kind, text], c) => {
          const cell = rows[i]?.[c];
          if (!cell || cell.kind !== kind || (text !== null && cell.value !== text)) wrong.push(`row ${i + 1} column ${c + 1}: ${JSON.stringify(cell)}`);
        }),
      );
      const listCount = m.list === 'inside' ? m.data.sessions.length : m.file.rows.length;
      check(heading !== -1 && rows.length === listCount && wrong.length === 0, `1 the file is the list: ${where}: ${rows.length} rows read back of the list's ${listCount}, every cell equal${wrong.length ? `; ${wrong.slice(0, 3).join('; ')}` : ''}`);
      if (m.list === 'inside') {
        const independent = insideRows(m.data);
        const bad = independent.filter(([plate, time, lane], i) => rows[i]?.[0]?.value !== plate[1] || rows[i]?.[2]?.value !== time[1] || rows[i]?.[3]?.value !== lane[1]);
        check(bad.length === 0, `1 the file is the list: ${where}: plate, let-in time and lane worked out from the list itself, ${independent.length - bad.length} of ${independent.length}`);
      }
      // 2
      const lines = sheet.rows.slice(0, heading).map((r) => r?.[0]?.value).filter(Boolean);
      if (m.list === 'inside') {
        const before = rows[0]?.[2]?.value;
        const after = rows[1]?.[2]?.value;
        check(before === '2026-03-08 01:30:00' && after === '2026-03-08 03:30:00', `2 garage time: ${where}: before and after the clock change, ${before} and ${after} (garage clock 01:30 and 03:30)`);
        const formats = rows.map((r) => r[2]?.format);
        check(formats.every((f) => f === TIME_FORMATS[m.language]), `2 garage time: ${where}: every time cell has the numeric format ${TIME_FORMATS[m.language]}`);
      }
      check(lines.includes(zone) && !/America|\//.test(zone), `2 garage time: ${where}: the zone sentence "${zone}" (lines: ${lines.join(' | ')})`);
      check(sheet.frozen === `A${heading + 2}`, `${where}: the heading row is frozen (${sheet.frozen}, heading on row ${heading + 1})`);
      // 3
      const texts = cells.filter((c) => c.kind === 'text').map((c) => c.value);
      const cases = m.list === 'inside' ? [TEXT_CASES.ticket, TEXT_CASES.plate, TEXT_CASES.formula, TEXT_CASES.at] : [TEXT_CASES.at];
      const lost = cases.filter((v) => !texts.includes(v));
      check(lost.length === 0 && got.formulas === 0, `3 text stays text: ${where}: ${cases.length - lost.length} of ${cases.length} come back as text, exactly (${cases.join(', ')}); formulas in the workbook: ${got.formulas}${lost.length ? `; not text: ${lost.join(', ')}` : ''}`);
      // 4
      check(sheet.rows[0]?.[0]?.value === GARAGE.name, `4 every character: ${where}: the garage name comes back exactly ("${sheet.rows[0]?.[0]?.value}")`);
      check(sheet.name === m.t(`page.${m.list}.title`) && names.every((n, i) => sheet.rows[heading]?.[i]?.value === n), `4 the file's language: ${where}: sheet "${sheet.name}", headings ${names.join(' · ')}`);
      // 12
      const meant = m.file.columns.filter((c) => meanings?.rows.some((r) => r?.[0]?.value === c.name && r?.[1]?.value === c.about));
      check(meanings?.name === m.t('file.meanings') && meant.length === m.file.columns.length, `12 descriptions: ${where}: sheet "${meanings?.name}" describes ${meant.length} of ${m.file.columns.length} columns`);
    } else {
      const pages = got.pages.map((p) => plain(p.text));
      const all = pages.join(' ');
      const offPage = got.pages.flatMap((p) => p.off_page);
      // 1
      const items = m.list === 'inside' ? m.data.sessions.map((s) => [s.plate, s.plate_region].filter(Boolean).join(' · ') || null).filter(Boolean) : m.data.flatMap((l) => (l.devices ?? []).map((d) => d.name));
      const notOnce = items.filter((p) => count(all, p) !== 1 && !items.some((o) => o !== p && o.includes(p)));
      check(notOnce.length === 0 && offPage.length === 0, `1 the file is the list: ${where}: ${items.length - notOnce.length} of ${items.length} ${m.list === 'inside' ? 'plates' : 'lane computers'} on a page exactly once; text off the page: ${offPage.length}${notOnce.length ? `; not once: ${notOnce.join(', ')}` : ''}`);
      // 2 + 4
      check(all.includes(plain(zone)), `2 garage time: ${where}: the zone sentence "${zone}"`);
      check(all.includes(GARAGE.name) && m.missing.length === 0, `4 every character: ${where}: "${GARAGE.name}" comes back exactly; letters the font could not draw: ${m.missing.length}`);
      check(names.every((n) => pages[0].includes(plain(n))), `4 the file's language: ${where}: the headings ${names.join(' · ')}`);
      // 12
      const meant = m.file.columns.filter((c) => pages[0].includes(plain(`${c.name}: ${c.about}`)));
      check(pages[0].includes(m.t('file.meanings')) && meant.length === m.file.columns.length, `12 descriptions: ${where}: page 1, under "${m.t('file.meanings')}", describes ${meant.length} of ${m.file.columns.length} columns`);
    }
  }

  // ── 4: a letter the font cannot draw is named ──────────────────────────────
  const strange = { ...GARAGE, name: 'Garaje 東 Norte' };
  const pdfStrange = build('inside', 'pdf', { language: 'en', garage: strange, data: insideData() });
  const xlsxStrange = build('inside', 'xlsx', { language: 'en', garage: strange, data: insideData() });
  const strangeBack = readBack([xlsxStrange.path]);
  check(pdfStrange.missing.join('') === '東', `4 a letter the font cannot draw is named, not dropped unseen: [${pdfStrange.missing.join(', ')}]`);
  check(strangeBack[xlsxStrange.path].sheets[0].rows[0][0].value === strange.name, '4 ...and the Excel file has it');

  // ── 5: long lists and long words ───────────────────────────────────────────
  const long = manyStays(250);
  long.sessions[3].entry_lane = LONG_NAME;
  const longGarage = { ...GARAGE, name: `${LONG_NAME.slice(0, 59)}Ñ` };
  const longFiles = ['en', 'es'].map((language) => ({ language, ...build('inside', 'pdf', { language, garage: longGarage, data: long }) }));
  const longXlsx = build('inside', 'xlsx', { language: 'en', garage: longGarage, data: long });
  const longBack = readBack([...longFiles.map((f) => f.path), longXlsx.path]);
  for (const f of longFiles) {
    const t = words(f.language);
    const pages = longBack[f.path].pages;
    const texts = pages.map((p) => plain(p.text));
    const all = texts.join(' ');
    const names = f.file.columns.map((c) => plain(c.name));
    const offPage = pages.flatMap((p) => p.off_page);
    const missingHead = texts.map((p, i) => (names.every((n) => p.includes(n)) && p.includes(plain(longGarage.name)) ? null : i + 1)).filter(Boolean);
    const numbers = texts.map((p, i) => (count(p, t('file.page', { page: i + 1, pages: pages.length })) === 1 ? null : i + 1)).filter(Boolean);
    const plates = long.sessions.map((s) => `${s.plate} · ${s.plate_region}`);
    const notOnce = plates.filter((p) => count(all, p) !== 1);
    check(pages.length >= 3, `5 a long list (${f.language}): 250 stays run to ${pages.length} pages`);
    check(missingHead.length === 0, `5 a long list (${f.language}): the garage and the column headings on every page${missingHead.length ? `; missing on page ${missingHead.join(', ')}` : ` (${pages.length} of ${pages.length})`}`);
    check(numbers.length === 0, `5 a long list (${f.language}): "${t('file.page', { page: 1, pages: pages.length })}" … on every page, each once${numbers.length ? `; wrong on page ${numbers.join(', ')}` : ''}`);
    check(notOnce.length === 0 && offPage.length === 0, `5 a long list (${f.language}): ${plates.length - notOnce.length} of ${plates.length} plates on a page exactly once; text off the page: ${offPage.length}${notOnce.length ? `; not once: ${notOnce.slice(0, 5).join(', ')}…` : ''}`);
    check(all.includes(LONG_NAME) && all.includes(plain(longGarage.name)), `5 long words (${f.language}): the 60-character lane and garage names wrap and come back whole`);
  }
  const longRows = tableOf(longBack[longXlsx.path].sheets[0], longXlsx.file.columns.map((c) => c.name)).rows;
  check(longRows.length === 250, `5 a long list: the Excel file holds ${longRows.length} of 250 rows`);

  // ── 10: the file name ──────────────────────────────────────────────────────
  const nasty = { ...GARAGE, name: 'A/B:C*D?"E<F>|G\u0007H‮' };
  const refused = /[/\\:*?"<>|\p{Cc}\p{Cf}]/u;
  for (const format of ['xlsx', 'pdf']) {
    const { name } = build('lanes', format, { language: 'en', garage: nasty, data: lanesData() });
    check(!refused.test(name.slice(0, -format.length - 1)) && name === `Lanes and equipment - 2026-03-10 1141 - ABCDEFGH.${format}`, `10 the file name (${format}): "${name}" holds none of / \\ : * ? " < > | or a control character`);
  }
  const { name: longName } = build('inside', 'pdf', { language: 'es', garage: { ...GARAGE, name: 'Ñ'.repeat(400) }, data: insideData() });
  check(longName.length <= 125 && longName.startsWith('Carros adentro - 2026-03-10 1141 - Ñ') && longName.endsWith('Ñ.pdf'), `10 the file name: a 400-letter garage name is cut, the list and the time kept (${longName.length} characters)`);

  // ── F1-F3: the gate's cases, each read back from the PDF ───────────────────
  const shown = (s) => JSON.stringify(s).slice(1, -1).replace(/\\t/g, '<TAB>');
  const gateChars = { TAB: '\t', VT: '\v', FF: '\f', DEL: '\x7f', NUL: '\0', BEL: '\x07', LF: '\n', CR: '\r', NBSP: '\u00a0', 'U+2028': '\u2028', ZWJ: '\u200d', 'U+202E': '\u202e', '東': '東', '🚗': '🚗' };
  // Each case in a file of its own, so no other lane can stand in for it.
  const gateFile = async (tag, list, language, garage, rows) => {
    const made = { path: join(DIR, `gate-${tag}.pdf`) };
    Object.assign(made, await makeFile({ list, format: 'pdf', language, garage, data: listOf(list, rows, READ_AT), readAt: READ_AT, path: made.path }, FILE_SECONDS * 1000));
    made.text = made.timedOut ? '' : plain(readBack([made.path])[made.path].pages.map((p) => p.text).join('\n'));
    return made;
  };
  for (const [label, ch] of Object.entries(gateChars)) {
    const made = await gateFile(`char-${[...label].map((c) => c.codePointAt(0)).join('')}`, 'lanes', 'en', GARAGE, [{ name: `Gx${ch}H2`, computer: 'Computadora' }]);
    const want = plain(pdfExpect(`Gx${ch}H2`, FONT).text);
    const lost = !made.text.includes(want);
    check(!lost, `F2 a lane named "Gx<${label}>H2" prints as "${want}"${lost ? `; the PDF has "${made.text.match(/Gx\S*/g)?.join(' ') ?? ''}": the text after <${label}> was lost` : ''}`);
  }
  const exit = await gateFile('exit', 'lanes', 'es', GARAGE, [{ name: 'Exit\t2 West', computer: 'Computadora' }]);
  check(exit.text.includes('Exit 2 West'), `F2 a lane named "${shown('Exit\t2 West')}" prints as "Exit 2 West"${exit.text.includes('Exit 2 West') ? '' : `; the PDF has "${exit.text.match(/Exit\S*/g)?.join(' ')}"`}`);
  const check10 = { ...GARAGE, name: 'A/B:C*D?"E<F>|G\u0007\u202eH' };
  const gateRows = Object.values(gateChars).map((ch) => ({ name: `Gx${ch}H2`, computer: 'Computadora' }));
  const gatePdf = { path: join(DIR, 'gate-lanes.pdf') };
  Object.assign(gatePdf, await makeFile({ list: 'lanes', format: 'pdf', language: 'en', garage: check10, data: listOf('lanes', gateRows, READ_AT), readAt: READ_AT, path: gatePdf.path }, FILE_SECONDS * 1000));
  const tabPdf = { path: join(DIR, 'gate-tab.pdf') };
  Object.assign(tabPdf, await makeFile({ list: 'inside', format: 'pdf', language: 'es', garage: GARAGE, data: listOf('inside', [{ plate: 'TAB\t999', region: null, ticket: null, lane: 'Entrada' }], READ_AT), readAt: READ_AT, path: tabPdf.path }, FILE_SECONDS * 1000));
  const gateBack = readBack([gatePdf, tabPdf].filter((m) => !m.timedOut).map((m) => m.path));
  const tabText = tabPdf.timedOut ? '' : plain(gateBack[tabPdf.path].pages.map((p) => p.text).join('\n'));
  check(tabText.includes('TAB 999'), `F2 a plate "${shown('TAB\t999')}" prints as "TAB 999"${tabText.includes('TAB 999') ? '' : `; the PDF has "${tabText.match(/TAB\S*/g)?.join(' ')}"`}`);
  const check10Name = gatePdf.timedOut ? '' : plain(garageLines(gateBack[gatePdf.path].pages).whole);
  check(check10Name === 'A/B:C*D?"E<F>|GH', `F2 the check-10 garage prints as "A/B:C*D?"E<F>|GH", its H kept (prints "${check10Name}")`);
  const named = (gatePdf.missing ?? []).map((ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase()}`);
  check(gatePdf.hidden === true && named.join(' ') === 'U+6771 U+1F697', `F1/F2 the screen is told: hidden characters left out (${gatePdf.hidden}); letters named only the visible ones the font lacks: ${named.join(' ') || 'none'}`);
  for (const n of [3000, 8000]) {
    const made = await makeFile({ list: 'inside', format: 'pdf', language: 'en', garage: { ...GARAGE, name: 'Ñ'.repeat(n) }, data: insideData(), readAt: READ_AT, path: join(DIR, `gate-${n}.pdf`) }, FILE_SECONDS * 1000);
    check(!made.timedOut, `F3 a garage name of ${n.toLocaleString('en-US')} characters: the PDF is made within ${FILE_SECONDS} s (${made.timedOut ? `not made in ${FILE_SECONDS} s` : `${made.ms} ms`})`);
  }

  // ── The class: every text x every case x every output ─────────────────────
  const cells = [];
  await oddTextFiles({
    dir: DIR,
    readAt: READ_AT,
    garage: GARAGE,
    log: (line) => console.log(line),
    cell: (text, output, id, ok, detail) => cells.push({ text, output, case: id, ok, detail }),
  });
  const groups = new Map();
  for (const c of cells) {
    const key = `${c.text} × ${c.output}`;
    const g = groups.get(key) ?? { ok: 0, bad: [] };
    if (c.ok) g.ok += 1;
    else g.bad.push(c);
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    const cases = [...new Set(g.bad.map((c) => c.case))];
    check(g.bad.length === 0, `odd text: ${key}: ${g.ok} of ${g.ok + g.bad.length} cells${g.bad.length ? `; failing cases ${cases.slice(0, 8).join(', ')}${cases.length > 8 ? ` and ${cases.length - 8} more` : ''}: ${g.bad[0].detail}` : ''}`);
  }
  const matrixAt = process.argv.indexOf('--matrix');
  if (matrixAt > 0) writeFileSync(process.argv[matrixAt + 1], JSON.stringify(cells, null, 1));
} catch (error) {
  failures.push(`the check stopped: ${error.message.split('\n')[0]}`);
  console.error(error);
} finally {
  rmSync(DIR, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`\nfiles — ${passed} checks passed; read back with ${PYTHON} (openpyxl, pypdf); this computer in ${process.env.TZ}, the garage in ${GARAGE.timezone}.`);
