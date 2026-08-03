/**
 * Predeploy guard: fail the build if real provider schedules are about to be published.
 *
 * Background: Vite copies public/ verbatim into dist/, and dist/ is what gets pushed to
 * the gh-pages branch. GitHub Pages serves that branch publicly even though this repo is
 * private, which is how 11 real NYU Langone Brooklyn departmental schedules ended up
 * publicly downloadable between 2026-03-11 and 2026-08-03.
 *
 * This check scans public/ and dist/ for anything that looks like a real schedule, and
 * for xlsx files carrying real provider names. Run automatically via the `predeploy`
 * npm script; also safe to run standalone:
 *
 *   npx tsx scripts/check-no-real-schedules.ts
 */
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { nameTokenOf } from './schedule-name-tokens';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/** Filenames matching the real departmental schedule naming conventions. */
const REAL_SCHEDULE_PATTERNS: RegExp[] = [
  /department\s+schedule\s+week/i,
  /weekly\s+schedule/i,
  /\bBK\s+ED\s+schedule\b/i,
  /week\s+of\s+\d/i,
];

/**
 * Files explicitly allowed to ship. Note that demo-schedule.xlsx is deliberately NOT
 * here: despite the name it contains 120 real provider names, and it lives under
 * data/provider-schedules/.
 */
const ALLOWLIST = new Set(['demo-week-schedule.xlsx']);

/** Recursively list files under a directory. */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const violations: string[] = [];

for (const dir of ['public', 'dist']) {
  const abs = join(ROOT, dir);
  for (const file of walk(abs)) {
    const name = basename(file);
    const rel = relative(ROOT, file);

    if (REAL_SCHEDULE_PATTERNS.some(re => re.test(name)) && !ALLOWLIST.has(name)) {
      violations.push(`${rel} — filename matches a real schedule pattern`);
      continue;
    }

    // Any shipped .xlsx must be on the allowlist; unknown workbooks are treated as
    // untrusted because they may carry real provider names.
    if (name.toLowerCase().endsWith('.xlsx') && !ALLOWLIST.has(name)) {
      violations.push(`${rel} — unrecognised .xlsx in a published directory`);
    }
  }
}

// Cross-check: no allowlisted workbook may contain a name from the real schedules.
const realNames = new Set<string>();
for (const d of ['schedules', 'initially missing schedules']) {
  const dir = join(ROOT, 'data', 'provider-schedules', d);
  for (const f of walk(dir)) {
    if (!f.toLowerCase().endsWith('.xlsx') || basename(f).startsWith('~$')) continue;
    if (basename(f).includes('demo-schedule')) continue;
    const wb = XLSX.read(readFileSync(f), { type: 'buffer' });
    for (const sn of wb.SheetNames) {
      const sheet = wb.Sheets[sn];
      for (const addr of Object.keys(sheet)) {
        if (addr.startsWith('!')) continue;
        const cell = sheet[addr];
        if (cell?.t !== 's') continue;
        const tok = nameTokenOf(String(cell.v ?? ''));
        if (tok) realNames.add(tok.toLowerCase());
      }
    }
  }
}

if (realNames.size > 0) {
  for (const dir of ['public', 'dist']) {
    for (const file of walk(join(ROOT, dir))) {
      if (!file.toLowerCase().endsWith('.xlsx')) continue;
      const wb = XLSX.read(readFileSync(file), { type: 'buffer' });
      const hits = new Set<string>();
      for (const sn of wb.SheetNames) {
        const sheet = wb.Sheets[sn];
        for (const addr of Object.keys(sheet)) {
          if (addr.startsWith('!')) continue;
          const cell = sheet[addr];
          if (cell?.t !== 's') continue;
          const tok = nameTokenOf(String(cell.v ?? ''));
          if (tok && realNames.has(tok.toLowerCase())) hits.add(tok);
        }
      }
      if (hits.size > 0) {
        violations.push(
          `${relative(ROOT, file)} — contains ${hits.size} name(s) found in the real schedules: ${[...hits].slice(0, 5).join(', ')}`,
        );
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\nBLOCKED: real provider data would be published.\n');
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error(
    '\nReal schedules belong in data/provider-schedules/, never under public/.' +
    '\nTo de-identify a schedule for demo use:' +
    '\n  npx tsx scripts/deidentify-schedule.ts <src.xlsx> public/schedules/demo-week-schedule.xlsx' +
    '\n  npx tsx scripts/verify-deidentified-schedule.ts <src.xlsx> public/schedules/demo-week-schedule.xlsx\n',
  );
  process.exit(1);
}

console.log(`check-no-real-schedules: OK (${realNames.size} real names known, none published)`);
