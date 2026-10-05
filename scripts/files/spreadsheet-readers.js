// Spreadsheet apps reading the Excel files back, beside openpyxl
// (read-files.py): two that this project did not write and that people open
// .xlsx files with. The U3 fix re-gate found that Numbers cuts a cell at the
// first control or format character while openpyxl read it whole, so one
// reader is not enough.
//
//   libreoffice  LibreOffice headless, `soffice --convert-to csv` (installed in CI)
//   numbers      Numbers on a Mac, through its own AppleScript export to CSV
//                (never a screenshot)
//
// SPREADSHEET_READERS names the readers a run uses, beside openpyxl
// (comma-separated; none by default). A reader named and not installed fails
// the run: it is never skipped without a word.
//
//   readSpreadsheets(paths) -> { [reader]: { [path]: { sheets: [{ rows }] } } }
//   each row a list of cells, { value } or null, as read-files.py gives them.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { translate } from '../../src/i18n/index.js';

export const READERS = (process.env.SPREADSHEET_READERS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const KNOWN = ['libreoffice', 'numbers'];
for (const r of READERS) if (!KNOWN.includes(r)) throw new Error(`SPREADSHEET_READERS: no reader "${r}" (known: ${KNOWN.join(', ')})`);

/** CSV (RFC 4180, any line ending) as rows of cells; an empty cell is null. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const end = () => {
    row.push(cell === '' ? null : { value: cell });
    cell = '';
  };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (ch === '"') quoted = false;
      else cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') end();
    else if (ch === '\r' || ch === '\n') {
      end();
      rows.push(row);
      row = [];
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
    } else cell += ch;
    i += 1;
  }
  if (cell !== '' || row.length) {
    end();
    rows.push(row);
  }
  return rows;
}

const asSheet = (text) => ({ sheets: [{ rows: parseCsv(text.replace(/^﻿/, '')) }] });

function libreOffice(paths, dir) {
  // A profile of its own, so a run never touches (or waits on) anyone's.
  const profile = join(dir, 'profile');
  const r = spawnSync(
    'soffice',
    ['--headless', '--norestore', `-env:UserInstallation=file://${profile}`, '--convert-to', 'csv:Text - txt - csv (StarCalc):44,34,76,1', '--outdir', dir, ...paths],
    { encoding: 'utf8', timeout: 600000 },
  );
  if (r.error || r.status !== 0) throw new Error(`LibreOffice could not read the files: ${r.error?.message ?? r.stderr}`);
  const out = {};
  for (const p of paths) {
    const csv = join(dir, `${basename(p, '.xlsx')}.csv`);
    if (!existsSync(csv)) throw new Error(`LibreOffice made no CSV of ${basename(p)}:\n${r.stdout}${r.stderr}`);
    out[p] = asSheet(readFileSync(csv, 'utf8'));
  }
  return out;
}

// Numbers exports a workbook as a folder, one CSV per table: "{sheet}-Table 1.csv".
// The list's sheet is the first; its name is the file's list title.
const NUMBERS_SCRIPT = `on run argv
	repeat with i from 1 to (count of argv) by 2
		set src to POSIX file (item i of argv)
		set dst to POSIX file (item (i + 1) of argv)
		tell application "Numbers"
			set d to open src
			export d to dst as CSV
			close d saving no
		end tell
	end repeat
end run
`;

const MEANINGS = ['en', 'es'].map((language) => translate(language, 'file.meanings'));

function numbers(paths, dir) {
  if (process.platform !== 'darwin' || !existsSync('/Applications/Numbers.app')) throw new Error('Numbers is not on this computer');
  const script = join(dir, 'export.applescript');
  writeFileSync(script, NUMBERS_SCRIPT);
  const pairs = paths.map((p, i) => [p, join(dir, `n${i}`)]);
  const r = spawnSync('osascript', [script, ...pairs.flat()], { encoding: 'utf8', timeout: 1200000 });
  if (r.error || r.status !== 0) throw new Error(`Numbers could not read the files: ${r.error?.message ?? r.stderr}`);
  const out = {};
  for (const [p, folder] of pairs) {
    const csvs = existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.csv')) : [];
    // The meanings sheet has its own name; the list's is the other one.
    // (A Mac keeps file names decomposed: "é" as e + U+0301.)
    const list = csvs.filter((f) => !MEANINGS.some((m) => f.normalize('NFC').startsWith(`${m}-`)));
    if (list.length !== 1) throw new Error(`Numbers' export of ${basename(p)} holds ${csvs.join(', ') || 'nothing'}`);
    out[p] = asSheet(readFileSync(join(folder, list[0]), 'utf8'));
  }
  return out;
}

/** Every .xlsx in `paths`, read by each reader in SPREADSHEET_READERS. */
export function readSpreadsheets(paths) {
  const xlsx = paths.filter((p) => p.endsWith('.xlsx'));
  const out = {};
  if (READERS.length === 0 || xlsx.length === 0) return out;
  const dir = mkdtempSync(join(tmpdir(), 'admin-readers-'));
  try {
    for (const reader of READERS) {
      const sub = join(dir, reader);
      mkdirSync(sub);
      out[reader] = reader === 'libreoffice' ? libreOffice(xlsx, sub) : numbers(xlsx, sub);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}
