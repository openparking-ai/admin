// Download PDF: loaded only when it is clicked (src/ListActions.jsx). The two
// fonts travel inside this file, so making a PDF asks nothing of anywhere.

import { FILES, fileName } from './model.js';
import { MIME, makePdf } from './pdf.js';
import regular from './fonts/DMSans-Regular.ttf?inline';
import bold from './fonts/DMSans-Bold.ttf?inline';

/** A font given as a data address, as the binary string the PDF maker reads. */
const binary = (dataAddress) => atob(dataAddress.slice(dataAddress.indexOf(',') + 1));
let fonts = null;

/** The PDF file of `list`, built from the read just made: { blob, name, missing }. */
export function make(list, { t, language, garage, data, readAt }) {
  fonts ??= { regular: binary(regular), bold: binary(bold) };
  const file = FILES[list]({ t, language, garage, data, readAt });
  const { bytes, missing } = makePdf(file, {
    fonts,
    meaningsTitle: t('file.meanings'),
    pageWords: (page, pages) => t('file.page', { page, pages }),
  });
  return { blob: new Blob([bytes], { type: MIME }), name: fileName(file, garage, readAt, 'pdf'), missing };
}
