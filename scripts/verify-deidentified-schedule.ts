/**
 * Verify a de-identified schedule is parse-equivalent to its source.
 *
 * Asserts that src/utils/scheduleParser.ts extracts the same structure from both
 * files — same days, same per-day provider counts, same provider types, teams and
 * shift windows — and that no real name survives in the de-identified copy.
 *
 * Usage:
 *   npx tsx scripts/verify-deidentified-schedule.ts <original.xlsx> <deidentified.xlsx>
 *
 * Exits non-zero on any mismatch or surviving real name.
 */
import { readFileSync } from 'node:fs';
import { parseWeeklySchedule } from '../src/utils/scheduleParser';

const [, , ORIG, DEID] = process.argv;
if (!ORIG || !DEID) {
  console.error('usage: tsx scripts/verify-deidentified-schedule.ts <original.xlsx> <deidentified.xlsx>');
  process.exit(1);
}

const toArrayBuffer = (p: string) => {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const a = parseWeeklySchedule(toArrayBuffer(ORIG));
const b = parseWeeklySchedule(toArrayBuffer(DEID));

const failures: string[] = [];
const check = (cond: boolean, msg: string) => { if (!cond) failures.push(msg); };

check(a.days.length === b.days.length,
  `day count differs: ${a.days.length} vs ${b.days.length}`);

/** Structural signature of a day, ignoring names. */
const sig = (d: typeof a.days[number]) =>
  d.providers
    .map(p => `${p.teamId}|${p.type}|${p.shiftStart ?? '-'}|${p.shiftEnd ?? '-'}`)
    .sort()
    .join(',');

const n = Math.min(a.days.length, b.days.length);
for (let i = 0; i < n; i++) {
  const da = a.days[i], db = b.days[i];
  check(da.date === db.date, `day ${i}: date differs (${da.date} vs ${db.date})`);
  check(da.dayOfWeek === db.dayOfWeek, `day ${i}: weekday differs (${da.dayOfWeek} vs ${db.dayOfWeek})`);
  check(da.providers.length === db.providers.length,
    `day ${i} (${da.date}): provider count differs (${da.providers.length} vs ${db.providers.length})`);
  check(da.floatAttendings.length === db.floatAttendings.length,
    `day ${i} (${da.date}): float count differs (${da.floatAttendings.length} vs ${db.floatAttendings.length})`);
  check(sig(da) === sig(db), `day ${i} (${da.date}): team/type/shift signature differs`);
}

// No real name may survive anywhere in the de-identified parse.
const realNames = new Set<string>();
for (const d of a.days) {
  for (const p of d.providers) realNames.add(p.name.toLowerCase());
  for (const f of d.floatAttendings) realNames.add(f.name.toLowerCase());
}
for (const k of Object.keys(a.pgyMap)) realNames.add(k.toLowerCase());

const leaked = new Set<string>();
for (const d of b.days) {
  for (const p of d.providers) if (realNames.has(p.name.toLowerCase())) leaked.add(p.name);
  for (const f of d.floatAttendings) if (realNames.has(f.name.toLowerCase())) leaked.add(f.name);
}
for (const k of Object.keys(b.pgyMap)) if (realNames.has(k.toLowerCase())) leaked.add(k);

check(leaked.size === 0, `real names survive in de-identified file: ${[...leaked].join(', ')}`);

const totalA = a.days.reduce((s, d) => s + d.providers.length, 0);
console.log(`days              : ${a.days.length} vs ${b.days.length}`);
console.log(`total providers   : ${totalA} vs ${b.days.reduce((s, d) => s + d.providers.length, 0)}`);
console.log(`pgy key entries   : ${Object.keys(a.pgyMap).length} vs ${Object.keys(b.pgyMap).length}`);
console.log(`distinct real names in source : ${realNames.size}`);
console.log(`real names leaked into copy   : ${leaked.size}`);

if (failures.length) {
  console.error(`\nFAIL (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nPASS — de-identified file is parse-equivalent and contains no real names.');
