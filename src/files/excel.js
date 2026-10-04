// A list as an Excel file (.xlsx), written here in full.
//
// An .xlsx file is a zip of a few XML files. It is written with fflate's
// zipSync: one pass, on the page, with no worker. (A library that zips in a
// worker it makes from a blob is refused by the page policy, so none is used.)
//
// Two sheets: the list, named after it, and "What each column means". Above
// the list's table: the lines of the file (garage, list, downloaded, time
// zone, counts). The heading row is frozen. Every name, plate and ticket is a
// TEXT cell, always: "007" stays "007", "1E5" stays "1E5", and "=1+1" is
// text. No cell is ever a formula: this file writes no <f> element at all.
// Times are real date-time cells holding the GARAGE'S clock, with a numeric
// format only, so no month name depends on the reader's Excel language.
//
// Every character of a name is kept as stored, controls too: the ones XML
// cannot hold are written as Excel itself writes them (_x0007_), and Excel
// reads them back as the character. A text longer than a cell holds (32,767
// characters) is cut at that limit, and `cut` says so for the screen.

import { strToU8, zipSync } from 'fflate';
import { excelCell } from './text.js';

export const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Numeric formats only: the order of day and month is the file's language's. */
export const TIME_FORMATS = { en: 'm/d/yyyy h:mm AM/PM', es: 'd/m/yyyy H:mm' };

// Styles, by their place in styles.xml's cellXfs.
const PLAIN = 0;
const BOLD = 1;
const TIME = 2;
const TITLE = 3;
const WRAP = 4;

// Characters XML 1.0 cannot hold at all.
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const xml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** For the file's own words (sheet names, formats): shown as U+FFFD, never dropped unseen. */
const escape = (text) => xml(String(text).replace(NOT_XML, '�'));
/**
 * For a cell's text, every character kept: what XML cannot hold, and a carriage
 * return (XML would read it back as a line break), is written _xHHHH_; a
 * stored "_x0041_" is written _x005F_x0041_ so it is not read as "A".
 * (Office Open XML, ECMA-376 Part 1, 22.4.2.4, ST_Xstring.)
 */
const hex = (ch) => `_x${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}_`;
const cellText = (text) =>
  xml(
    String(text)
      .replace(/_(?=x[0-9A-Fa-f]{4}_)/g, '_x005F_')
      .replace(NOT_XML, hex)
      .replace(/\r/g, hex),
  );

/** A sheet's name: at most 31 characters, none of the ones Excel refuses. */
const sheetName = (text) => [...String(text).replace(/[[\]:*?/\\]/g, '')].slice(0, 31).join('') || 'Sheet';

const column = (n) => {
  let s = '';
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

/** The garage's clock as Excel's day number: days since 30 Dec 1899, the fraction the time of day. */
export const excelDay = ({ year, month, day, hour, minute }) =>
  (Date.UTC(year, month - 1, day, hour, minute) - Date.UTC(1899, 11, 30)) / 86400000;

function sheetXml(strings, rows, { widths, frozenRows = 0 }) {
  const xmlRows = rows.map((cells, r) => {
    const xmlCells = cells.map((cell, c) => {
      if (cell === null) return '';
      const ref = `${column(c)}${r + 1}`;
      if (cell.number !== undefined) return `<c r="${ref}" s="${cell.style ?? PLAIN}"><v>${cell.number}</v></c>`;
      return `<c r="${ref}" s="${cell.style ?? PLAIN}" t="s"><v>${strings.index(cell.text)}</v></c>`;
    });
    return `<row r="${r + 1}">${xmlCells.join('')}</row>`;
  });
  const pane = frozenRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${frozenRows}" topLeftCell="A${frozenRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${frozenRows + 1}" sqref="A${frozenRows + 1}"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const cols = `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `${pane}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${xmlRows.join('')}</sheetData></worksheet>`
  );
}

function sharedStrings() {
  const list = [];
  const at = new Map();
  return {
    index(text) {
      const s = String(text);
      if (!at.has(s)) {
        at.set(s, list.length);
        list.push(s);
      }
      return at.get(s);
    },
    xml() {
      const items = list.map((s) => `<si><t xml:space="preserve">${cellText(s)}</t></si>`).join('');
      return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${list.length}" uniqueCount="${list.length}">${items}</sst>`
      );
    },
  };
}

const stylesXml = (language) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="${escape(TIME_FORMATS[language] ?? TIME_FORMATS.en)}"/></numFmts>` +
  '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="5">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

const workbookXml = (names) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  `<sheets>${names.map((n, i) => `<sheet name="${escape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;

const workbookRels = (count) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
  `<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `<Relationship Id="rId${count + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
  '</Relationships>';

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

const contentTypes = (count) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  Array.from({ length: count }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
  '</Types>';

const widthOf = (texts) => Math.min(60, Math.max(10, ...texts.map((s) => [...String(s)].length + 2)));

/** The list's sheet and the meanings sheet, as rows of cells, and whether any text was cut. Exported for the checks. */
export function sheets(file, meaningsTitle) {
  let cut = false;
  const fit = (text) => {
    const made = excelCell(text);
    cut ||= made.cut;
    return made.text;
  };
  const lines = file.lines.map((line, i) => [{ text: fit(line), style: i === 0 ? TITLE : i === 1 ? BOLD : PLAIN }]);
  const heading = file.columns.map((c) => ({ text: c.name, style: BOLD }));
  const body = file.rows.map((cells) =>
    cells.map((cell) => (cell.wall ? { number: excelDay(cell.wall), style: TIME } : { text: fit(cell.text) })),
  );
  const listRows = [...lines, [], heading, ...body, ...(file.empty ? [[{ text: file.empty }]] : [])];
  const listWidths = file.columns.map((c, i) =>
    widthOf([c.name, ...file.rows.map((r) => (r[i].wall ? '00/00/0000 00:00 AM' : r[i].text))]),
  );
  const meaningRows = [
    [{ text: meaningsTitle, style: TITLE }],
    [],
    ...file.columns.map((c) => [{ text: c.name, style: BOLD }, { text: c.about, style: WRAP }]),
  ];
  const all = [
    { name: sheetName(file.title), rows: listRows, widths: listWidths, frozenRows: lines.length + 2 },
    { name: sheetName(meaningsTitle), rows: meaningRows, widths: [widthOf(file.columns.map((c) => c.name)), 70] },
  ];
  return { sheets: all, cut };
}

/** The .xlsx file's bytes, and whether any text was cut at a cell's limit. */
export function makeExcel(file, { language, meaningsTitle }) {
  const strings = sharedStrings();
  const { sheets: all, cut } = sheets(file, meaningsTitle);
  const parts = {
    '[Content_Types].xml': contentTypes(all.length),
    '_rels/.rels': ROOT_RELS,
    'xl/workbook.xml': workbookXml(all.map((s) => s.name)),
    'xl/_rels/workbook.xml.rels': workbookRels(all.length),
    'xl/styles.xml': stylesXml(language),
  };
  all.forEach((s, i) => {
    parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(strings, s.rows, s);
  });
  parts['xl/sharedStrings.xml'] = strings.xml();
  const files = Object.fromEntries(Object.entries(parts).map(([name, xml]) => [name, strToU8(xml)]));
  return { bytes: zipSync(files, { level: 6 }), cut };
}
