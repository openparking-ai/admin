// Download PDF: loaded only when it is clicked (src/ListActions.jsx), and the
// installer drawings' maker (src/DrawingsPage.jsx: Download PDF and Print).
// The two fonts travel inside this file, so making a PDF asks nothing of
// anywhere; one chunk holds the PDF library for both.

import { FILES, fileName } from './model.js';
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
 */
export function makeDrawingsFile({ t, language, garage, lanes, takesAnyDriver, madeAt }) {
  fonts ??= { regular: binary(regular), bold: binary(bold) };
  const made = makeDrawings({ fonts, t, language, garage, lanes, takesAnyDriver, madeAt });
  if (made.needs) return { ...made, blob: null, name: null };
  return { ...made, blob: new Blob([made.bytes], { type: MIME }), name: fileName({ title: t('drawings.doc') }, garage, madeAt, 'pdf') };
}
