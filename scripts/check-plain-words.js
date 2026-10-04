#!/usr/bin/env node
// No technical language on any screen, in either language.
//
// Every entry of both dictionaries is split into words (accents removed,
// lowercased) and compared with BANNED, whole word against whole word, and
// with BANNED_PHRASES as runs of whole words. A standalone number from 100 to
// 599 is refused too: that is the shape of a status number. A failure names
// the language, the entry and the word.

import { pathToFileURL } from 'node:url';
import { DICTIONARIES } from '../src/i18n/index.js';

export const BANNED = [
  // The brief's list.
  'token', 'tokens', 'api', 'apis', 'endpoint', 'endpoints', 'payload', 'payloads',
  'null', 'undefined', 'json', 'http', 'https', 'id', 'ids', 'tenant', 'tenants',
  'session', 'sessions', 'sync', 'synced', 'syncing', 'webhook', 'webhooks',
  'config', 'schema', 'schemas', 'database', 'databases', 'boolean', 'booleans',
  'string', 'strings', 'timeout', 'timeouts',
  // The same family, which a person would also not say.
  'nan', 'url', 'urls', 'uri', 'uuid', 'configure', 'configuration', 'backend',
  'frontend', 'server', 'servers', 'cache', 'query', 'queries', 'request',
  'requests', 'response', 'responses', 'exception', 'stack', 'parameter',
  'parameters', 'integer', 'array', 'object', 'localhost', 'admin', 'login',
  'credential', 'credentials', 'deploy', 'deployment',
  // Spanish, written without accents because the text is compared that way.
  'sesion', 'sesiones', 'sincronizar', 'sincronizacion', 'servidor', 'servidores',
  'esquema', 'booleano', 'nulo', 'indefinido', 'inquilino', 'inquilinos',
  'parametro', 'parametros', 'credencial', 'credenciales',
  // U2c: a garage owner says "equipment" or "computer", and "the day it opens".
  'device', 'devices', 'dispositivo', 'dispositivos',
];

export const BANNED_PHRASES = [
  'base de datos', 'status code', 'error code', 'codigo de estado', 'codigo de error',
  // U2c
  'go live', 'goes live', 'going live',
];

const STATUS_NUMBER = /^[1-5]\d\d$/;

const fold = (text) => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const wordsOf = (text) => fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export function findTechWords(dictionaries) {
  const banned = new Set(BANNED);
  const phrases = BANNED_PHRASES.map(wordsOf);
  const problems = [];
  const counts = {};
  for (const [language, dictionary] of Object.entries(dictionaries)) {
    counts[language] = 0;
    for (const [key, value] of Object.entries(dictionary)) {
      counts[language] += 1;
      const words = wordsOf(value);
      for (const word of words) {
        if (banned.has(word)) problems.push({ language, key, word });
        else if (STATUS_NUMBER.test(word)) problems.push({ language, key, word: `${word} (a status number)` });
      }
      for (const phrase of phrases) {
        for (let i = 0; i + phrase.length <= words.length; i += 1) {
          if (phrase.every((w, j) => words[i + j] === w)) problems.push({ language, key, word: phrase.join(' ') });
        }
      }
    }
  }
  return { problems, counts };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { problems, counts } = findTechWords(DICTIONARIES);
  const scanned = Object.entries(counts).map(([l, n]) => `${l} ${n}`).join(', ');
  if (problems.length) {
    console.error('Technical words in the dictionaries:\n');
    for (const p of problems) console.error(`  ${p.language}: ${p.key}: "${p.word}"`);
    console.error(`\nEntries scanned: ${scanned}. Say it the way a garage owner would.`);
    process.exit(1);
  }
  console.log(
    `plain words — entries scanned: ${scanned}; ${BANNED.length} banned words, ` +
      `${BANNED_PHRASES.length} banned phrases and status numbers 100-599; none found.`,
  );
}
