// Stop hook (runs at the end of every turn). Blocks once, then lets the turn end:
// - files changed this session but no log entry since the session began -> ask for a START entry;
// - commits made this session but no log entry since the last commit -> ask for a DONE entry.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { logPath, markerPath, readInput } from './common.mjs';

const input = readInput();
if (input.stop_hook_active) process.exit(0);

const marker = markerPath(input.session_id);
if (!existsSync(marker)) process.exit(0);
const start = Number(readFileSync(marker, 'utf8')) || Date.now();
const cwd = input.cwd || process.cwd();

let lastEdit = 0;
let lastCommit = 0;
try {
  const top = execSync('git rev-parse --show-toplevel', { cwd }).toString().trim();
  // Tracked files changed during this session.
  const changed = execSync('git status --porcelain -uno', { cwd }).toString()
    .split('\n').filter(Boolean).map((l) => l.slice(3).split(' -> ').pop().replace(/^"|"$/g, ''));
  for (const f of changed) {
    try { lastEdit = Math.max(lastEdit, statSync(join(top, f)).mtimeMs); } catch { /* deleted */ }
  }
  // Commits on this branch during this session.
  const since = new Date(start).toISOString();
  const times = execSync(`git log HEAD --since="${since}" --format=%ct`, { cwd }).toString()
    .split('\n').filter(Boolean).map((t) => Number(t) * 1000);
  for (const t of times) lastCommit = Math.max(lastCommit, t);
} catch { process.exit(0); }

let logTime = 0;
try { logTime = statSync(logPath(cwd)).mtimeMs; } catch { /* missing */ }

if (lastCommit >= start && logTime < lastCommit) {
  console.error(
    'Before finishing: you committed this session but AGENT_LOG.md has no entry since the last '
    + 'commit. Append a DONE, PAUSED or ABANDONED entry (AGENTS.md section 1): files touched, '
    + 'commits, deployed or not, records updated. Update the Roundtable or METHODS too if a '
    + 'decision or method changed.',
  );
  process.exit(2);
}
if (lastEdit >= start && logTime < start) {
  console.error(
    'You changed files this session but AGENT_LOG.md has no entry from this session. Append a '
    + 'START entry now (AGENTS.md section 1): where, plan, why, files you expect to touch.',
  );
  process.exit(2);
}
process.exit(0);
