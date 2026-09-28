#!/usr/bin/env node
// Back up the two project records that are not in git (the Roundtable and the Legal Dossier).
// Copies go to "ER Triage App/backups/YYYY-MM-DD/". A copy is skipped when the file is
// unchanged since its latest backup. Safe to run any time, from the main folder or a worktree.
// Usage: node scripts/backup-records.mjs
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function mainDir(cwd = process.cwd()) {
  const common = execSync('git rev-parse --path-format=absolute --git-common-dir', { cwd })
    .toString().trim();
  return dirname(common);
}

const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

export function backupRecords(root = mainDir()) {
  const records = [
    join(root, 'ER Triage App', 'Cowork Roundtable.md'),
    join(root, 'CCT Legal Dossier.md'),
  ];
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, "0")}`;
  const backupRoot = join(root, 'ER Triage App', 'backups');
  const outDir = join(backupRoot, day);
  const done = [];

  for (const file of records) {
    if (!existsSync(file)) continue;
    const name = basename(file);
    // Find the newest existing backup of this file across all days.
    let latest = null;
    if (existsSync(backupRoot)) {
      for (const d of readdirSync(backupRoot).sort()) {
        const dir = join(backupRoot, d);
        let entries = [];
        try { entries = readdirSync(dir); } catch { continue; }
        for (const f of entries.sort()) if (f.endsWith(` ${name}`)) latest = join(dir, f);
      }
    }
    if (latest && hash(latest) === hash(file)) continue;
    mkdirSync(outDir, { recursive: true });
    const dest = join(outDir, `${time} ${name}`);
    copyFileSync(file, dest);
    done.push(dest);
  }
  return done;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const done = backupRecords();
  console.log(done.length ? `Backed up:\n${done.join('\n')}` : 'Records unchanged since last backup.');
}
