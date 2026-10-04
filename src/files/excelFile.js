// Download Excel: loaded only when it is clicked (src/ListActions.jsx).

import { FILES, fileName } from './model.js';
import { MIME, makeExcel } from './excel.js';

/** The Excel file of `list`, built from the read just made: { blob, name, missing }. */
export function make(list, { t, language, garage, data, readAt }) {
  const file = FILES[list]({ t, language, garage, data, readAt });
  const bytes = makeExcel(file, { language, meaningsTitle: t('file.meanings') });
  return { blob: new Blob([bytes], { type: MIME }), name: fileName(file, garage, readAt, 'xlsx'), missing: [] };
}
