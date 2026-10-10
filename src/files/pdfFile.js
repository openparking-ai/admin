// Download PDF: loaded only when it is clicked (src/ListActions.jsx), and the
// installer drawings' maker (src/DrawingsPage.jsx: Download PDF and Print).
// The two fonts travel inside this file, so making a PDF asks nothing of
// anywhere; one chunk holds the PDF library for both.

import { FILES, NAME_LIMIT, fileName } from './model.js';
import { MIME, makePdf } from './pdf.js';
import { makeDrawings } from '../drawings/pdf.js';
import regular from './fonts/DMSans-Regular.ttf?inline';
import bold from './fonts/DMSans-Bold.ttf?inline';

/** A font given as a data address, as the binary string the PDF maker reads. */
const binary = (dataAddress) => atob(dataAddress.slice(dataAddress.indexOf(',') + 1));
let fonts = null;

/**
 * The PDF file of `list`, built from the read just made:
 * { blob, name, missing, hidden, cut }: the letters the font could not draw,
 * and whether hidden characters were left out.
 */
export function make(list, { t, language, garage, data, readAt }) {
  fonts ??= { regular: binary(regular), bold: binary(bold) };
  const file = FILES[list]({ t, language, garage, data, readAt });
  const { bytes, missing, hidden } = makePdf(file, {
    fonts,
    meaningsTitle: t('file.meanings'),
    pageWords: (page, pages) => t('file.page', { page, pages }),
  });
  return { blob: new Blob([bytes], { type: MIME }), name: fileName(file, garage, readAt, 'pdf'), missing, hidden, cut: false };
}

/**
 * The installer drawings, made from the read just made: { blob, name, sheets,
 * needs, missing, hidden }. The printed page draws `sheets`; the PDF is `blob`.
 * `only`, a sheet's place in the set (U7b): that sheet alone, its file named
 * for the sheet and its lane.
 */
export function makeDrawingsFile({ t, language, garage, lanes, takesAnyDriver, madeAt, only = null }) {
  fonts ??= { regular: binary(regular), bold: binary(bold) };
  const made = makeDrawings({ fonts, t, language, garage, lanes, takesAnyDriver, madeAt, only });
  if (made.needs) return { ...made, blob: null, name: null };
  const title = only === null ? t('drawings.doc') : sheetTitle(t, made.sheets[0], garage);
  return { ...made, blob: new Blob([made.bytes], { type: MIME }), name: fileName({ title }, garage, madeAt, 'pdf') };
}

// In a sheet's file name the time always fits ("2026-10-10 0941", with the
// " - " either side of it), and so do the garage's name up to GARAGE_ROOM
// letters (beyond that it gives way, as in every file name: fileName); the
// lane's name and then the sheet's own are cut with "…" to make room.
const TITLE_ROOM = NAME_LIMIT - 21;
const GARAGE_ROOM = 24;
const LANE_ROOM = 32;
const cut = (text, room) => {
  const chars = [...text];
  return chars.length <= room ? text : `${chars.slice(0, Math.max(1, room - 1)).join('').trimEnd()}…`;
};

/** "Installer drawings - Exit lane, plan view - North Exit": the set, the sheet, and its lane when it has one. */
function sheetTitle(t, sheet, garage) {
  const doc = t('drawings.doc');
  const lane = sheet.lane ? cut(sheet.lane, LANE_ROOM) : '';
  const room = TITLE_ROOM - Math.min([...garage.name].length, GARAGE_ROOM) - [...doc].length - 3 - (lane ? [...lane].length + 3 : 0);
  return [doc, cut(sheet.title, room), lane].filter(Boolean).join(' - ');
}
