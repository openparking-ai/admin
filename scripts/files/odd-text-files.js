// The class of odd stored text, through the files, in node: every text the
// lists show × every case in scripts/files/odd-text.js × PDF, Excel, file name
// and the PDF's title, in English and Spanish, both lists. Each file is made in
// a worker and stopped at FILE_SECONDS. Every result is one cell of the table
// the receipt lists: text × output × case.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLUMNS } from '../../src/files/model.js';
import { translate } from '../../src/i18n/index.js';
import { makeFile } from './make-file.js';
import { readBack, tableOf } from './read-back.js';
import {
  CASES,
  FILE_SECONDS,
  LENGTHS,
  REFUSED_IN_NAMES,
  SPACES,
  columnText,
  columnX,
  fontCharacters,
  garageLines,
  isInvisible,
  longText,
  pdfExpect,
  plain,
  squash,
  token,
} from './odd-text.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
export const FONT = fontCharacters(readFileSync(join(ROOT, 'src', 'files', 'fonts', 'DMSans-Regular.ttf')));
const EXCEL_LIMIT = 32767;
const NOTHING = '–';

const at = (n, k) => `${k}${String(n).padStart(11, '0')}`;
const stay = (n, { plate, region, ticket, lane }) => ({
  id: `ff200000-0000-4000-8000-${at(n, 0).slice(-12)}`,
  entry_at: '2026-03-10T15:05:00Z',
  currency: 'USD',
  entry_confirmation: 'confirmed',
  plate,
  plate_region: region,
  ticket_ref: ticket,
  entry_lane: lane,
});
const lane = (n, { name, computer }, readAt) => ({
  id: `lf200000-0000-4000-8000-${at(n, 0).slice(-12)}`,
  name,
  direction: 'entry',
  reader: null,
  devices: [{ id: `df200000-0000-4000-8000-${at(n, 0).slice(-12)}`, name: computer, last_seen_at: new Date(readAt - 120000).toISOString(), revoked_at: null }],
});

/** The texts each list shows, the field each comes from, and its column in the files. */
export const TEXTS = {
  inside: [
    { text: 'plate', field: 'plate', column: 0, mark: 'P' },
    { text: 'plate region', field: 'region', column: 0, mark: 'R' },
    { text: 'ticket', field: 'ticket', column: 1, mark: 'T' },
    { text: 'lane name', field: 'lane', column: 3, mark: 'L' },
  ],
  lanes: [
    { text: 'lane name', field: 'name', column: 0, mark: 'L' },
    { text: 'lane computer name', field: 'computer', column: 2, mark: 'C' },
  ],
};

/** A list whose rows carry `rows` (one object of field texts per row), as the platform answers it. */
export function listOf(list, rows, readAt) {
  if (list === 'lanes') return rows.map((r, i) => lane(i + 1, r, readAt));
  const sessions = rows.map((r, i) => stay(i + 1, r));
  return { inside_count: sessions.length, unconfirmable_count: 0, open_count: sessions.length, sessions };
}

/** The cell a row's texts make in a column, as the file says it (src/files/model.js). */
export function cellOf(list, column, row) {
  if (list === 'inside' && column === 0) return [row.plate, row.region].filter(Boolean).join(' · ') || NOTHING;
  if (list === 'inside' && column === 1) return row.ticket || NOTHING;
  if (list === 'inside' && column === 3) return row.lane ?? NOTHING;
  if (list === 'lanes' && column === 0) return row.name;
  return row.computer;
}

/** The files the class needs for one list: each is a garage name and rows, with the cases they carry. */
export function classFiles(list) {
  const texts = TEXTS[list];
  const mixRows = CASES.map((c, i) => Object.fromEntries(texts.map((x) => [x.field, token(x.mark, i + 1, c.text)])));
  const mixGarage = CASES.map((c, i) => token('G', i + 1, c.text)).join(' ');
  return [
    { kind: 'cases', garage: mixGarage, rows: mixRows },
    { kind: 'only spaces', garage: SPACES, rows: [Object.fromEntries(texts.map((x) => [x.field, SPACES]))] },
    // A whole name in a right-to-left script, so the file name holds it (the
    // cases' garage name is cut before its Arabic and Hebrew are reached).
    ...[['Arabic name', 'مرآب الميناء 2'], ['Hebrew name', 'חניון הנמל 3']].map(([kind, name]) => ({ kind, garage: name, rows: [Object.fromEntries(texts.map((x) => [x.field, name]))] })),
    ...LENGTHS.map((n) => ({ kind: `${n.toLocaleString('en-US')} characters`, length: n, garage: longText(n), rows: [Object.fromEntries(texts.map((x) => [x.field, longText(n)]))] })),
  ];
}

const caseIds = (f) => (f.kind === 'cases' ? CASES.map((c) => c.id) : [f.kind]);

/** The file name's garage part, worked out here: refused and control characters out, spaces one. */
export const nameExpected = (name) =>
  String(name).replace(new RegExp(REFUSED_IN_NAMES.source, 'gu'), '').replace(/\s+/g, ' ').trim().replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');

/**
 * Judges one made PDF and one made Excel file of `f` against its texts. Calls
 * `cell(text, output, caseId, ok, detail)` for every cell. `told` is what the
 * owner was told the files left out: { letters, more, hidden } after the PDF
 * and { cut } after the Excel file; in node, what the makers report, in the
 * browser, what the notice on screen says (`noticeOutput` names which).
 */
export function judge({ list, language, f, pdf, xlsx, back, cell, told, noticeOutput = 'notice' }) {
  const t = (key, values) => translate(language, key, values);
  const texts = [{ text: 'garage name', field: 'garage' }, ...TEXTS[list]];
  const ids = caseIds(f);
  const where = `${list}, ${language}, ${f.kind}`;
  const columns = COLUMNS[list];

  // Time: a file not made within the limit fails every case it carries.
  for (const [format, made] of [['PDF', pdf], ['Excel', xlsx]]) {
    for (const x of texts) for (const id of ids) cell(x.text, format, id, !made.timedOut && made.ms <= FILE_SECONDS * 1000, made.timedOut ? `not made within ${FILE_SECONDS} s (${where})` : `${made.ms} ms`);
  }

  // What the maker says it left out must be exactly what was left out.
  const stored = [f.garage, ...f.rows.flatMap((r) => Object.values(r))];
  const want = stored.map((s) => pdfExpect(s, FONT));
  const wantLetters = [...new Set(want.flatMap((w) => w.letters))].sort();
  const wantHidden = want.some((w) => w.hidden);
  const said = told ?? { letters: pdf.missing ?? [], more: 0, hidden: pdf.hidden, cut: xlsx.cut };
  if (!pdf.timedOut && said.letters) {
    // Every letter named is one the PDF left out, none is invisible, and with
    // those counted ("and N more") they are all of them.
    const named = [...new Set(said.letters)];
    const wrong = named.filter((ch) => !wantLetters.includes(ch));
    const invisibleNamed = named.filter(isInvisible);
    const okLetters = wrong.length === 0 && invisibleNamed.length === 0 && named.length + (said.more ?? 0) === wantLetters.length;
    const okHidden = said.hidden === wantHidden;
    for (const x of texts)
      for (const id of ids)
        cell(x.text, `${noticeOutput} (PDF)`, id, okLetters && okHidden, okLetters && okHidden ? 'what the PDF left out is said' : `${where}: letters named ${JSON.stringify(named)} and ${said.more ?? 0} more, want ${JSON.stringify(wantLetters)}; invisible named ${invisibleNamed.length}; hidden told ${said.hidden}, want ${wantHidden}`);
  }
  if (!xlsx.timedOut && said.cut !== undefined) {
    const longest = Math.max(...stored.map((s) => s.length));
    const ok = said.cut === longest > EXCEL_LIMIT;
    for (const x of texts) for (const id of ids) cell(x.text, `${noticeOutput} (Excel)`, id, ok, ok ? (said.cut ? 'cut at the limit, and said' : 'nothing cut') : `${where}: cut told ${said.cut}, longest text ${longest}`);
  }

  // PDF: every text, as the font can print it, in its place.
  if (!pdf.timedOut) {
    const read = back[pdf.path];
    const pages = read.pages;
    const all = plain(pages.map((p) => p.text).join('\n'));
    const off = pages.flatMap((p) => p.off_page).length;
    const { whole, tops } = garageLines(pages);
    for (const x of texts) {
      if (f.kind === 'cases') {
        CASES.forEach((c, i) => {
          const text = x.field === 'garage' ? token('G', i + 1, c.text) : f.rows[i][x.field];
          const e = plain(pdfExpect(text, FONT).text);
          const found = all.split(e).length - 1;
          const ok = x.field === 'garage' ? found >= 1 && plain(whole).includes(e) : found === 1;
          cell(x.text, 'PDF', c.id, ok && off === 0, ok ? `"${e}"` : `${where}: "${e}" found ${found} times${x.field === 'garage' ? ' (page 1 holds the name whole: ' + plain(whole).includes(e) + ')' : ''}`);
        });
      } else {
        const text = x.field === 'garage' ? f.garage : null;
        const got = x.field === 'garage' ? whole : columnText(pages, columnX(columns, x.column));
        const expected = x.field === 'garage' ? pdfExpect(text, FONT).text : f.rows.map((r) => pdfExpect(cellOf(list, x.column, r), FONT).text).join('');
        // Read back from lines broken anywhere, so compared without white space;
        // a name of only spaces must leave its place holding nothing else.
        const ok = squash(got) === squash(expected);
        cell(x.text, 'PDF', f.kind, ok && off === 0, ok ? `${squash(got).length} characters back in order` : `${where}: ${squash(got).length} characters back of ${squash(expected).length}${off ? `, ${off} off the page` : ''}`);
      }
    }
    // Every later page's name is cut to two lines, ending in "…" when it was cut.
    const badTops = tops.filter((top) => top.length > 2 || (top.length === 2 && squash(whole).length > squash(top.join('')).length && !top[1].endsWith('…')));
    for (const id of ids) cell('garage name', 'PDF page tops', id, badTops.length === 0, badTops.length ? `${where}: ${badTops.length} of ${tops.length} later pages' name not cut to two lines with "…"` : `${tops.length} later pages, the name at most two lines`);
    // The PDF's title: the list and the garage's name, every visible character
    // kept and nothing invisible, a long name cut at 120 characters with "…".
    const title = read.title ?? '';
    const visible = [...String(f.garage)].map((ch) => (/\p{White_Space}/u.test(ch) ? ' ' : isInvisible(ch) ? '' : ch)).join('').replace(/ +/g, ' ').trim();
    const cut = [...visible].length > 120 ? `${[...visible].slice(0, 119).join('').trimEnd()}…` : visible;
    const wantTitle = `${t(`page.${list}.title`)} - ${cut}`;
    const titleOk = title === wantTitle;
    for (const id of ids) cell('garage name', 'PDF title', id, titleOk, titleOk ? `${[...title].length} characters` : `${where}: title ${JSON.stringify(title.slice(0, 60))} (${[...title].length}), want ${JSON.stringify(wantTitle.slice(0, 60))} (${[...wantTitle].length})`);
  }

  // Excel: every text as stored, or cut at a cell's limit.
  if (!xlsx.timedOut) {
    const sheet = back[xlsx.path].sheets[0];
    const names = columns.map((c) => t(c.key));
    const { rows } = tableOf(sheet, names);
    const fit = (s) => (s.length > EXCEL_LIMIT ? s.slice(0, EXCEL_LIMIT) : s);
    for (const x of texts) {
      const pairs =
        x.field === 'garage'
          ? [[ids[0], sheet.rows[0]?.[0]?.value, fit(f.garage)]]
          : f.rows.map((r, i) => [f.kind === 'cases' ? CASES[i].id : f.kind, rows[i]?.[x.column]?.value, fit(cellOf(list, x.column, r))]);
      if (x.field === 'garage' && f.kind === 'cases') {
        const ok = pairs[0][1] === pairs[0][2];
        for (const id of ids) cell(x.text, 'Excel', id, ok, ok ? 'as stored' : `${where}: the garage name differs`);
      } else {
        for (const [id, got, wantText] of pairs) cell(x.text, 'Excel', id, got === wantText, got === wantText ? (wantText.length === EXCEL_LIMIT ? 'cut at 32,767, as said' : 'as stored') : `${where}: ${JSON.stringify(String(got).slice(0, 40))} (${String(got ?? '').length}), want ${JSON.stringify(wantText.slice(0, 40))} (${wantText.length})`);
      }
    }
  }

  // The file name: "{list} - {date time} - {garage}" (the garage last: chat's
  // decision in the U3 fix round), nothing a computer refuses, and the
  // garage's name as far as it fits.
  for (const [format, made] of [['pdf', pdf], ['xlsx', xlsx]]) {
    if (made.timedOut) continue;
    const name = made.name;
    const body = name.slice(0, -format.length - 1);
    const title = t(`page.${list}.title`);
    const parts = body.startsWith(`${title} - `) ? /^\d{4}-\d\d-\d\d \d{4}(?: - (.*))?$/.exec(body.slice(title.length + 3)) : null;
    const garagePart = parts ? (parts[1] ?? '') : null;
    const ok = !REFUSED_IN_NAMES.test(body) && name.length <= 125 && garagePart !== null && nameExpected(f.garage).startsWith(garagePart);
    for (const id of ids) cell('garage name', `file name (${format})`, id, ok, ok ? JSON.stringify(name.length > 70 ? `${name.slice(0, 60)}…` : name) : `${where}: ${JSON.stringify(name)}`);
  }
}

/** Runs the whole class in node. `cell` records each result. */
export async function oddTextFiles({ dir, readAt, garage, cell, log }) {
  const jobs = [];
  for (const language of ['en', 'es']) {
    for (const list of ['inside', 'lanes']) {
      for (const f of classFiles(list)) {
        const g = { ...garage, name: f.garage };
        const data = listOf(list, f.rows, readAt);
        const tag = `${list}-${language}-${f.kind.replace(/\W+/g, '')}`;
        const pdf = { path: join(dir, `odd-${tag}.pdf`) };
        const xlsx = { path: join(dir, `odd-${tag}.xlsx`) };
        Object.assign(pdf, await makeFile({ list, format: 'pdf', language, garage: g, data, readAt, path: pdf.path }, FILE_SECONDS * 1000));
        Object.assign(xlsx, await makeFile({ list, format: 'xlsx', language, garage: g, data, readAt, path: xlsx.path }, FILE_SECONDS * 1000));
        log?.(`  made ${tag}: PDF ${pdf.timedOut ? `NOT MADE in ${FILE_SECONDS} s` : `${pdf.ms} ms`}, Excel ${xlsx.timedOut ? `NOT MADE in ${FILE_SECONDS} s` : `${xlsx.ms} ms`}`);
        jobs.push({ list, language, f, pdf, xlsx });
      }
    }
  }
  const paths = jobs.flatMap((j) => [j.pdf, j.xlsx].filter((m) => !m.timedOut).map((m) => m.path));
  const back = readBack(paths);
  for (const j of jobs) judge({ ...j, back, cell });
}
