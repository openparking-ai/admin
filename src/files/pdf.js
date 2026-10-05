// A list as a PDF file, Letter size, in DM Sans, the site's own font.
//
// The table is laid out here, not by a plug-in: columns by their share of the
// page, every cell wrapped to its column (long text wraps, it is never cut
// off), a row that does not fit carried on to the next page line by line,
// and on every page the garage, the list, when it was downloaded, the time
// zone, the column headings and "Page X of Y". On every page after the first
// the garage's name is cut to two lines, ending in "…"; page 1 carries it
// whole, running over pages if it must, then the counts and "What each column
// means". A row that cannot fit on an empty page is carried on, never retried,
// so making a file always ends.
//
// The PDF carries the same text as the Excel file (src/files/text.js, `kept`),
// and of that only characters the font really draws reach the PDF. A letter
// it cannot draw is named in `missing`; a hidden character left out is said by
// `hidden`. The screen tells the owner both.

import { jsPDF } from 'jspdf';
import { printable, visibleOnly } from './text.js';

export const MIME = 'application/pdf';

const PAGE = { width: 612, height: 792 }; // Letter, in points
const MARGIN = 40;
const WIDTH = PAGE.width - 2 * MARGIN;
const FOOT = PAGE.height - 24;
const BOTTOM = FOOT - 18;
const PAD = 4;
const SIZE = { garage: 13, list: 11, line: 9.5, meaning: 8.5, heading: 8.5, cell: 9, foot: 8 };
const LEAD = 1.25;
const NAME_LINES = 2; // the garage's name at the top of every page after the first
const TITLE_LIMIT = 120; // characters of the garage's name in the file's title
const INK = 20;
const RULE = 170;

const SPACE_LIKE = /\p{White_Space}/u;

/**
 * Whether the font gives a character a real shape, for a font jsPDF has read:
 * its character map names a glyph other than glyph 0 (the font's "no such
 * character" box, which jsPDF also reads for the map's end marker, U+FFFF), and
 * that glyph has an outline, unless the character is a space.
 */
export function fontDraws(font) {
  const codeMap = font.metadata?.cmap?.unicode?.codeMap ?? {};
  const loca = font.metadata?.loca;
  return (ch) => {
    const glyph = codeMap[ch.codePointAt(0)];
    if (!glyph) return false;
    return SPACE_LIKE.test(ch) || loca.lengthOf(glyph) > 0;
  };
}

/**
 * The PDF file's bytes; the letters the font could not draw; and whether any
 * hidden character was left out. `fonts` holds DM Sans Regular and Bold as
 * binary strings.
 */
export function makePdf(file, { fonts, meaningsTitle, pageWords }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  doc.addFileToVFS('DMSans-Regular.ttf', fonts.regular);
  doc.addFont('DMSans-Regular.ttf', 'DMSans', 'normal');
  doc.addFileToVFS('DMSans-Bold.ttf', fonts.bold);
  doc.addFont('DMSans-Bold.ttf', 'DMSans', 'bold');
  const titleName = [...visibleOnly(file.garage)];
  const title = titleName.length > TITLE_LIMIT ? `${titleName.slice(0, TITLE_LIMIT - 1).join('').trimEnd()}…` : titleName.join('');
  doc.setProperties({ title: `${file.title} - ${title}` });
  doc.setTextColor(INK);
  doc.setDrawColor(RULE);
  doc.setLineWidth(0.5);

  const missing = new Set();
  let hidden = false;
  doc.setFont('DMSans', 'normal');
  const drawable = fontDraws(doc.internal.getFont());
  /** What of `text` the PDF prints; anything left out is noted for the screen. */
  const print = (text) => {
    const made = printable(text, drawable);
    for (const ch of made.missing) missing.add(ch);
    hidden ||= made.hidden;
    return made.text;
  };

  const style = (weight, size) => {
    doc.setFont('DMSans', weight);
    doc.setFontSize(size);
  };
  const lineHeight = (size) => size * LEAD;
  const wrap = (text, width) => doc.splitTextToSize(print(text), width);

  const columns = file.columns.map((c) => ({ ...c, w: c.width * WIDTH }));
  const xs = columns.reduce((acc, c, i) => [...acc, i === 0 ? MARGIN : acc[i - 1] + columns[i - 1].w], []);

  let y = 0;
  const TOP = MARGIN - lineHeight(SIZE.garage) + SIZE.garage;

  /** Lines at the left margin; a line that would run past the bottom starts a new page. */
  const lines = (list, weight, size, gap = 0) => {
    for (const line of list) {
      if (y + lineHeight(size) > BOTTOM) newPage({ headings: false });
      style(weight, size);
      y += lineHeight(size);
      doc.text(line, MARGIN, y);
    }
    y += gap;
  };
  /** Text at the left margin, wrapped to the page. */
  const paragraph = (text, weight, size, gap = 0) => {
    style(weight, size);
    lines(wrap(text, WIDTH), weight, size, gap);
  };

  // The garage's name: whole on page 1; on the others, cut to NAME_LINES lines.
  style('bold', SIZE.garage);
  const fullName = wrap(file.lines[0], WIDTH);
  const shortName = (() => {
    if (fullName.length <= NAME_LINES) return fullName;
    const kept = fullName.slice(0, NAME_LINES);
    let last = [...kept[NAME_LINES - 1]];
    while (last.length && doc.getTextWidth(`${last.join('').trimEnd()}…`) > WIDTH) last = last.slice(0, -1);
    kept[NAME_LINES - 1] = `${last.join('').trimEnd()}…`;
    return kept;
  })();

  const headingRow = () => {
    style('bold', SIZE.heading);
    const cells = columns.map((c) => wrap(c.name, c.w - 2 * PAD));
    const tallest = Math.max(...cells.map((l) => l.length));
    doc.line(MARGIN, y + 2, MARGIN + WIDTH, y + 2);
    for (let i = 0; i < tallest; i += 1) {
      y += lineHeight(SIZE.heading);
      cells.forEach((lines, c) => lines[i] !== undefined && doc.text(lines[i], xs[c] + PAD, y + 2));
    }
    y += 6;
    doc.line(MARGIN, y, MARGIN + WIDTH, y);
  };

  /** The rest of the top of every page: the list, when it was downloaded, the time zone. */
  const pageHead = () => {
    paragraph(file.lines[1], 'bold', SIZE.list, 2);
    for (const line of file.lines.slice(2, 4)) paragraph(line, 'normal', SIZE.line);
  };

  // Every page after the first: the name cut short, the head, and (once the
  // table has begun) the column headings. Drawn at the top of an empty page, so
  // it always fits: the name is at most NAME_LINES lines, the rest is the
  // dictionaries' words.
  function newPage({ headings }) {
    doc.addPage('letter', 'portrait');
    y = TOP;
    lines(shortName, 'bold', SIZE.garage);
    pageHead();
    if (headings) {
      y += 10;
      headingRow();
    }
  }

  // Page 1: the name whole, the head, the counts, what each column means. A
  // name that ran on past page 1 ends on a page whose top already has the head.
  y = TOP;
  lines(fullName, 'bold', SIZE.garage);
  if (doc.getNumberOfPages() === 1) pageHead();
  y += 4;
  for (const line of file.lines.slice(4)) paragraph(line, 'normal', SIZE.line);
  y += 8;
  paragraph(meaningsTitle, 'bold', SIZE.line, 1);
  for (const c of columns) paragraph(`${c.name}: ${c.about}`, 'normal', SIZE.meaning);
  // The headings start the table where there is room for them and a line under them.
  style('bold', SIZE.heading);
  const headingHeight = Math.max(...columns.map((c) => wrap(c.name, c.w - 2 * PAD).length)) * lineHeight(SIZE.heading) + 8;
  const cellLead = lineHeight(SIZE.cell);
  let fresh = false; // nothing drawn yet under this page's headings
  if (y + 10 + headingHeight + cellLead + 6 > BOTTOM) {
    newPage({ headings: true });
    fresh = true;
  } else {
    y += 10;
    headingRow();
  }
  for (const row of file.rows) {
    style('normal', SIZE.cell);
    let cells = row.map((cell, c) => wrap(cell.text, columns[c].w - 2 * PAD));
    // A row is drawn cell by cell, each cell's lines together, so a wrapped
    // name reads back whole. A row that does not fit goes to the next page;
    // one taller than a whole page is carried on, a page at a time. On an
    // empty page a row always draws what fits, at least one line: it is
    // never sent on to yet another page.
    while (cells.some((lines) => lines.length > 0)) {
      const room = Math.floor((BOTTOM - y - 6) / cellLead);
      const tallest = Math.max(...cells.map((l) => l.length));
      if (!fresh && (room < Math.min(tallest, 1) || (room < tallest && tallest * cellLead <= BOTTOM - MARGIN - 200))) {
        newPage({ headings: true });
        fresh = true;
        continue;
      }
      const take = Math.max(1, Math.min(room, tallest));
      const top = y + 2;
      style('normal', SIZE.cell);
      cells.forEach((lines, c) =>
        lines.slice(0, take).forEach((line, i) => doc.text(line, xs[c] + PAD, top + (i + 1) * cellLead)),
      );
      y = top + take * cellLead + 4;
      doc.line(MARGIN, y, MARGIN + WIDTH, y);
      fresh = false;
      cells = cells.map((lines) => lines.slice(take));
      if (cells.some((lines) => lines.length > 0)) {
        newPage({ headings: true });
        fresh = true;
      }
    }
  }
  if (file.empty) {
    y += 6;
    paragraph(file.empty, 'normal', SIZE.cell);
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    style('normal', SIZE.foot);
    doc.text(print(pageWords(p, pages)), PAGE.width / 2, FOOT, { align: 'center' });
  }

  return { bytes: new Uint8Array(doc.output('arraybuffer')), missing: [...missing], hidden };
}
