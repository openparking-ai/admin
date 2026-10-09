// The installer drawings as a PDF: 11 x 17 in (ANSI B, tabloid), landscape,
// drawn as lines, shapes and real text -- never a picture of a page -- in DM
// Sans, the font the lists' PDFs use (src/files/pdf.js).
//
// The set is laid out with this file's own font widths, so `makeDrawings`
// opens the document first, builds the set with its measures, then draws it.

import { jsPDF } from 'jspdf';
import { fontDraws } from '../files/pdf.js';
import { printable, visibleOnly } from '../files/text.js';
import { buildSet } from './sheets.js';

export const MIME = 'application/pdf';
export const SHEET = { format: 'tabloid', orientation: 'landscape' };
const TITLE_LIMIT = 120;

/** A document with the two fonts in it, and the measures a set is laid out with. */
export function openDocument(fonts) {
  const doc = new jsPDF({ unit: 'pt', format: SHEET.format, orientation: SHEET.orientation, compress: true });
  doc.addFileToVFS('DMSans-Regular.ttf', fonts.regular);
  doc.addFont('DMSans-Regular.ttf', 'DMSans', 'normal');
  doc.addFileToVFS('DMSans-Bold.ttf', fonts.bold);
  doc.addFont('DMSans-Bold.ttf', 'DMSans', 'bold');
  doc.setFont('DMSans', 'normal');
  const drawable = fontDraws(doc.internal.getFont());
  const missing = new Set();
  let hidden = false;
  const measures = {
    measure(text, size, bold) {
      doc.setFont('DMSans', bold ? 'bold' : 'normal');
      return doc.getStringUnitWidth(text) * size;
    },
    clean(text) {
      const made = printable(text, drawable);
      for (const ch of made.missing) missing.add(ch);
      hidden ||= made.hidden;
      return made.text;
    },
  };
  return { doc, measures, left: () => ({ missing: [...missing], hidden }) };
}

const hex = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));

/** Draw the sheets into `doc`, one page each. */
export function drawSheets(doc, sheets) {
  sheets.forEach((sheet, i) => {
    if (i > 0) doc.addPage(SHEET.format, SHEET.orientation);
    for (const item of sheet.items) drawItem(doc, item);
  });
}

function style(doc, item) {
  const stroke = item.stroke ?? null;
  const fill = item.fill ?? null;
  if (stroke) doc.setDrawColor(...hex(stroke));
  if (fill) doc.setFillColor(...hex(fill));
  doc.setLineWidth(item.width ?? 0.75);
  doc.setLineDashPattern(item.dash ?? [], 0);
  return stroke && fill ? 'FD' : fill ? 'F' : 'S';
}

function drawItem(doc, item) {
  switch (item.t) {
    case 'line':
      doc.setDrawColor(...hex(item.color));
      doc.setLineWidth(item.width);
      doc.setLineDashPattern(item.dash ?? [], 0);
      doc.line(item.x1, item.y1, item.x2, item.y2);
      return;
    case 'rect': {
      const how = style(doc, item);
      if (item.radius) doc.roundedRect(item.x, item.y, item.w, item.h, item.radius, item.radius, how);
      else doc.rect(item.x, item.y, item.w, item.h, how);
      return;
    }
    case 'poly': {
      const how = style(doc, item);
      const [first, ...rest] = item.points;
      const steps = rest.map(([x, y], i) => {
        const [px, py] = i === 0 ? first : rest[i - 1];
        return [x - px, y - py];
      });
      doc.lines(steps, first[0], first[1], [1, 1], how, item.closed);
      return;
    }
    case 'circle':
      doc.circle(item.cx, item.cy, item.r, style(doc, item));
      return;
    case 'text':
      if (!item.text) return;
      doc.setFont('DMSans', item.bold ? 'bold' : 'normal');
      doc.setFontSize(item.size);
      doc.setTextColor(...hex(item.color));
      doc.text(item.text, item.x, item.y, { align: { start: 'left', middle: 'center', end: 'right' }[item.anchor] });
      return;
    default:
      throw new Error(`a sheet item no drawing knows: ${item.t}`);
  }
}

/**
 * The set for one garage as a PDF: { bytes, sheets, needs, missing, hidden }.
 * `needs` is set, and there are no bytes, when the set cannot be made yet.
 */
export function makeDrawings({ fonts, t, language, garage, lanes, takesAnyDriver, madeAt }) {
  const { doc, measures, left } = openDocument(fonts);
  const set = buildSet({ t, language, garage, lanes, takesAnyDriver, madeAt, fonts: measures });
  if (set.needs) return { needs: set.needs, sheets: [], bytes: null, ...left() };
  const name = [...visibleOnly(garage.name)];
  const title = name.length > TITLE_LIMIT ? `${name.slice(0, TITLE_LIMIT - 1).join('').trimEnd()}…` : name.join('');
  doc.setProperties({ title: `${t('drawings.doc')} - ${title}` });
  drawSheets(doc, set.sheets);
  return { bytes: new Uint8Array(doc.output('arraybuffer')), sheets: set.sheets, needs: null, ...left() };
}
