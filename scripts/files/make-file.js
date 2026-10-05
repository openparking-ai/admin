// Makes one file as the browser does, in a worker thread, so a check can stop
// it after a time limit: a file that is never made is a red result, not a hang.
//
//   const made = await makeFile({ list, format, language, garage, data, readAt, path }, ms)
//   -> { ms, name, missing, hidden, cut }, or { timedOut: true, ms, error? } when no file
//   came: stopped at the limit, or the maker failed (`error` says how)

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');

if (!isMainThread) {
  const { translate } = await import('../../src/i18n/index.js');
  const { FILES, fileName } = await import('../../src/files/model.js');
  const { makeExcel } = await import('../../src/files/excel.js');
  const { makePdf } = await import('../../src/files/pdf.js');
  const font = (name) => readFileSync(join(ROOT, 'src', 'files', 'fonts', name)).toString('binary');
  const fonts = { regular: font('DMSans-Regular.ttf'), bold: font('DMSans-Bold.ttf') };
  const { list, format, language, garage, data, readAt, path } = workerData;
  const t = (key, values) => translate(language, key, values);
  const started = performance.now();
  const file = FILES[list]({ t, language, garage, data, readAt: new Date(readAt) });
  let made;
  if (format === 'xlsx') made = { missing: [], hidden: false, ...makeExcel(file, { language, meaningsTitle: t('file.meanings') }) };
  else made = { cut: false, ...makePdf(file, { fonts, meaningsTitle: t('file.meanings'), pageWords: (page, pages) => t('file.page', { page, pages }) }) };
  const ms = Math.round(performance.now() - started);
  writeFileSync(path, made.bytes);
  parentPort.postMessage({ ms, name: fileName(file, garage, new Date(readAt), format), missing: made.missing, hidden: made.hidden, cut: made.cut });
}

export function makeFile(job, limitMs) {
  return new Promise((resolve) => {
    const started = performance.now();
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { ...job, readAt: new Date(job.readAt).toISOString() } });
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ timedOut: true, ms: Math.round(performance.now() - started) });
    }, limitMs);
    worker.once('message', (made) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(made);
    });
    worker.once('error', (error) => {
      clearTimeout(timer);
      resolve({ timedOut: true, ms: Math.round(performance.now() - started), error: error.message.split('\n')[0] });
    });
  });
}
