// SessionStart hook: note the start time and show the agent the recent log.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { logPath, markerPath, readInput } from './common.mjs';

const input = readInput();
const cwd = input.cwd || process.cwd();
writeFileSync(markerPath(input.session_id), String(Date.now()));

let recent = '(AGENT_LOG.md does not exist yet. Create it with your first START entry.)';
try {
  const log = logPath(cwd);
  if (existsSync(log)) {
    const entries = readFileSync(log, 'utf8').split(/\n(?=## \[)/).filter((e) => e.startsWith('## ['));
    recent = entries.slice(-10).join('\n').trim() || '(no entries yet)';
  }
} catch { /* not a git folder; skip */ }

console.log(`CCT project rules: read AGENTS.md before changing anything.
Before any change, append a START entry to AGENT_LOG.md in the main repo folder; append DONE,
PAUSED or ABANDONED when you finish. Get the time with: date "+%Y-%m-%d %H:%M %Z".
Update the Roundtable and METHODS as you go (marked unreviewed); draft Legal Dossier items in
"ER Triage App/dossier-pending.md". Check the entries below for open work on the same files.

Last entries in AGENT_LOG.md:
${recent}`);
