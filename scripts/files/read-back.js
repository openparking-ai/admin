// Reading downloaded files back, for scripts/check-files.js and
// scripts/check-downloads.js. The reading is done by Python openpyxl and pypdf
// (read-files.py); the helpers here work out what the files should say
// independently of the screens' code.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
export const PYTHON = process.env.FILES_PYTHON || 'python3';

/** Every file read back: { [path]: { kind: 'xlsx', sheets, formulas } | { kind: 'pdf', pages } }. */
export function readBack(paths) {
  const r = spawnSync(PYTHON, [join(HERE, 'read-files.py'), ...paths], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`the readers could not read the files (${PYTHON}):\n${r.stderr}${r.error ? r.error.message : ''}`);
  return JSON.parse(r.stdout);
}

export const plain = (text) => String(text).replace(/[\s  ]+/g, ' ').trim();
export const count = (text, part) => text.split(part).length - 1;

/** The garage's clock at `iso`, as openpyxl gives a date-time back: "2026-03-08 01:30:00". */
export function garageClock(iso, timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:00`;
}

/** A zone as people say it in `language`, asked of Intl here; never its "America/..." name. */
export const zoneSaid = (timeZone, language, at) =>
  new Intl.DateTimeFormat(language === 'es' ? 'es-US' : 'en-US', { timeZone, timeZoneName: 'longGeneric' })
    .formatToParts(new Date(at))
    .find((p) => p.type === 'timeZoneName').value;

/** The rows of the list in an Excel sheet: those under the heading row, up to the first that is not a full row. */
export function tableOf(sheet, names) {
  const at = sheet.rows.findIndex((r) => names.every((n, i) => r[i]?.value === n));
  if (at === -1) return { heading: -1, rows: [], lines: [] };
  const rows = [];
  for (const r of sheet.rows.slice(at + 1)) {
    if (r.filter(Boolean).length < names.length) break;
    rows.push(r);
  }
  return { heading: at, rows, lines: sheet.rows.slice(0, at).map((r) => r?.[0]?.value).filter(Boolean) };
}
