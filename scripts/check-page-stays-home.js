#!/usr/bin/env node
// The page never touches the session, and asks only its own origin.
//
// Reads every file under src/ and index.html and refuses:
//   the session  - any read or write of the cookie (`document.cookie`,
//                  `cookieStore`); any use of sessionStorage or IndexedDB;
//                  any localStorage write other than the two kept choices
//                  (the look in theme.js, the language in i18n/index.js);
//                  any storage write that mentions a password, token or
//                  email; any console line at all, so nothing typed can
//                  reach a log;
//   the address  - any absolute address (`scheme://`) in code; any request
//                  made outside src/api.js; any query string built in api.js.
// Each finding is named with its file, line and what was found.
//
//   node scripts/check-page-stays-home.js

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(js|jsx|html|css)$/.test(e.name) ? [p] : [];
  });
}

const STORAGE_HOMES = { 'src/theme.js': 'THEME_KEY', 'src/i18n/index.js': 'LANGUAGE_KEY' };

const SESSION_RULES = [
  [/document\s*\.\s*cookie/, 'document.cookie'],
  [/\bcookieStore\b/, 'cookieStore'],
  [/\bsessionStorage\b/, 'sessionStorage'],
  [/\bindexedDB\b/, 'indexedDB'],
  [/\bconsole\s*\./, 'a console line'],
  [/setItem\s*\([^)]*(password|token|email|session)/i, 'a password, token or email written to storage'],
];

// Comments say what code does; only code is held to these rules.
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const scanned = [...files(join(ROOT, 'src')), join(ROOT, 'index.html')].filter((f) => !/[\\/]fonts[\\/]/.test(f));
const session = [];
const address = [];
const kept = [];
for (const path of scanned) {
  const name = relative(ROOT, path).split('\\').join('/');
  const lines = code(readFileSync(path, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    const at = `${name}:${i + 1}`;
    for (const [re, what] of SESSION_RULES) if (re.test(line)) session.push(`${at}: ${what}`);
    const setItem = /\.setItem\s*\(\s*([\w.]+)/.exec(line);
    if (setItem && STORAGE_HOMES[name] === setItem[1]) kept.push(at);
    if (setItem && STORAGE_HOMES[name] !== setItem[1]) session.push(`${at}: a storage write that is not one of the two kept choices (${setItem[1]})`);
    if (/localStorage/.test(line) && name !== 'src/main.jsx') session.push(`${at}: localStorage used outside main.jsx`);
    const absolute = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"`)]*/i.exec(line);
    if (absolute && !name.endsWith('.css')) address.push(`${at}: an absolute address ${absolute[0]}`);
    if (/\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|\bEventSource\b|sendBeacon/.test(line) && name !== 'src/api.js') address.push(`${at}: a request made outside src/api.js`);
    if (name === 'src/api.js' && /[?&][\w-]+=|URLSearchParams|searchParams/.test(line)) address.push(`${at}: a query string built in api.js`);
  });
}

// The scan's own positive control: it must see the two writes that ARE there.
if (kept.length !== 2) session.push(`the scan saw ${kept.length} of the 2 kept-choice writes it knows are there; it is not reading the files`);

const report = (title, list) => {
  console.error(`${title}:`);
  for (const p of list) console.error(`  ${p}`);
};
if (session.length) report('The page touches the session', session);
if (address.length) report('The page asks somewhere other than its own origin, or not by a relative address', address);
if (session.length || address.length) {
  console.error(`\nFiles scanned: ${scanned.length}.`);
  process.exit(1);
}
console.log(
  `page stays home — ${scanned.length} files scanned (src/ and index.html): 0 cookie reads or writes, 0 storage writes beyond the two ` +
    `kept choices (both seen: ${kept.join(', ')}), 0 console lines, 0 absolute addresses, every request from src/api.js.`,
);
