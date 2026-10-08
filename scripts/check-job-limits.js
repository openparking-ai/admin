#!/usr/bin/env node
// Every job in every workflow has a time limit (`timeout-minutes`), so a hang
// stops the job in minutes and is named, never GitHub's 6 hours (main's CI on
// ca917e0 hung 6 h in a browser download).
//
//   node scripts/check-job-limits.js

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(fileURLToPath(import.meta.url), '..', '..', '.github', 'workflows');
const missing = [];
let jobs = 0;
for (const file of readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).sort()) {
  const lines = readFileSync(join(DIR, file), 'utf8').split('\n');
  const start = lines.indexOf('jobs:');
  if (start < 0) continue;
  let job = null;
  let limited = false;
  const close = () => {
    if (job && !limited) missing.push(`${file}: job "${job}" has no timeout-minutes`);
  };
  for (const line of lines.slice(start + 1)) {
    const name = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (name) {
      close();
      job = name[1];
      limited = false;
      jobs += 1;
    } else if (/^ {4}timeout-minutes:\s*\d+\s*$/.test(line)) {
      limited = true;
    } else if (/^\S/.test(line)) {
      break;
    }
  }
  close();
}
for (const m of missing) console.log(`  FAIL ${m}`);
if (missing.length || jobs === 0) {
  console.error(`\njob limits — ${missing.length} of ${jobs} jobs have no time limit.`);
  process.exit(1);
}
console.log(`job limits — all ${jobs} jobs in .github/workflows have timeout-minutes.`);
