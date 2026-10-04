// A list as a PDF file, Letter size, in DM Sans, the site's own font.
//
// The table is laid out here, not by a plug-in: columns by their share of the
// page, every cell wrapped to its column (long text wraps, it is never cut
// off), a row that does not fit carried on to the next page line by line,
// and on every page the garage, the list, when it was downloaded, the time
// zone, the column headings and "Page X of Y". Page 1 also carries the
// counts and "What each column means" under the heading.
//
// A letter the font cannot draw is named in `missing`, never dropped unseen;
// the screen says which letters, and that the Excel file has them.

import { jsPDF } from 'jspdf';

export const MIME = 'application/pdf';

const PAGE = { width: 612, height: 792 }; // Letter, in points
const MARGIN = 40;
const WIDTH = PAGE.width - 2 * MARGIN;
const FOOT = PAGE.height - 24;
const BOTTOM = FOOT - 18;
const PAD = 4;
const SIZE = { garage: 13, list: 11, line: 9.5, meaning: 8.5, heading: 8.5, cell: 9, foot: 8 };
const LEAD = 1.25;
const INK = 20;
const RULE = 170;

/**
 * The PDF file's bytes, and the letters the font could not draw.
 * `fonts` holds DM Sans Regular and Bold as binary strings.
 */
export function makePdf(file, { fonts, meaningsTitle, pageWords }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  doc.addFileToVFS('DMSans-Regular.ttf', fonts.regular);
  doc.addFont('DMSans-Regular.ttf', 'DMSans', 'normal');
  doc.addFileToVFS('DMSans-Bold.ttf', fonts.bold);
  doc.addFont('DMSans-Bold.ttf', 'DMSans', 'bold');
  doc.setProperties({ title: `${file.title} - ${file.garage}` });
  doc.setTextColor(INK);
  doc.setDrawColor(RULE);
  doc.setLineWidth(0.5);

  const missing = new Set();
  const drawable = (() => {
    doc.setFont('DMSans', 'normal');
    const codeMap = doc.internal.getFont().metadata?.cmap?.unicode?.codeMap ?? {};
    return (ch) => /\s/u.test(ch) || codeMap[ch.codePointAt(0)] !== undefined;
  })();
  const note = (text) => {
    for (const ch of String(text)) if (!drawable(ch)) missing.add(ch);
  };

  const style = (weight, size) => {
    doc.setFont('DMSans', weight);
    doc.setFontSize(size);
  };
  const lineHeight = (size) => size * LEAD;
  const wrap = (text, width) => {
    note(text);
    return doc.splitTextToSize(String(text), width);
  };

  const columns = file.columns.map((c) => ({ ...c, w: c.width * WIDTH }));
  const xs = columns.reduce((acc, c, i) => [...acc, i === 0 ? MARGIN : acc[i - 1] + columns[i - 1].w], []);

  let y = 0;

  /** Lines of text at the left margin, wrapped to the page. */
  const paragraph = (text, weight, size, gap = 0) => {
    style(weight, size);
    for (const line of wrap(text, WIDTH)) {
      y += lineHeight(size);
      doc.text(line, MARGIN, y);
    }
    y += gap;
  };

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

  /** The top of every page: garage, list, downloaded, time zone; then the column headings. */
  const pageTop = (first) => {
    y = MARGIN - lineHeight(SIZE.garage) + SIZE.garage;
    paragraph(file.lines[0], 'bold', SIZE.garage);
    paragraph(file.lines[1], 'bold', SIZE.list, 2);
    for (const line of file.lines.slice(2, 4)) paragraph(line, 'normal', SIZE.line);
    if (first) {
      y += 4;
      for (const line of file.lines.slice(4)) paragraph(line, 'normal', SIZE.line);
      y += 8;
      paragraph(meaningsTitle, 'bold', SIZE.line, 1);
      for (const c of columns) paragraph(`${c.name}: ${c.about}`, 'normal', SIZE.meaning);
    }
    y += 10;
    headingRow();
  };

  const newPage = () => {
    doc.addPage('letter', 'portrait');
    pageTop(false);
  };

  pageTop(true);
  const cellLead = lineHeight(SIZE.cell);
  for (const row of file.rows) {
    style('normal', SIZE.cell);
    let cells = row.map((cell, c) => wrap(cell.text, columns[c].w - 2 * PAD));
    // A row is drawn cell by cell, each cell's lines together, so a wrapped
    // name reads back whole. A row that does not fit goes to the next page;
    // one taller than a whole page is carried on, a page at a time.
    while (cells.some((lines) => lines.length > 0)) {
      const room = Math.floor((BOTTOM - y - 6) / cellLead);
      const tallest = Math.max(...cells.map((l) => l.length));
      if (room < Math.min(tallest, 1) || (room < tallest && tallest * cellLead <= BOTTOM - MARGIN - 200)) {
        newPage();
        continue;
      }
      const take = Math.min(room, tallest);
      const top = y + 2;
      style('normal', SIZE.cell);
      cells.forEach((lines, c) =>
        lines.slice(0, take).forEach((line, i) => doc.text(line, xs[c] + PAD, top + (i + 1) * cellLead)),
      );
      y = top + take * cellLead + 4;
      doc.line(MARGIN, y, MARGIN + WIDTH, y);
      cells = cells.map((lines) => lines.slice(take));
      if (cells.some((lines) => lines.length > 0)) newPage();
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
    const words = pageWords(p, pages);
    note(words);
    doc.text(words, PAGE.width / 2, FOOT, { align: 'center' });
  }

  return { bytes: new Uint8Array(doc.output('arraybuffer')), missing: [...missing] };
}
