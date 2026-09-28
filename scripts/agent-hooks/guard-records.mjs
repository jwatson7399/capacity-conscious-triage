// PreToolUse hook: back up the Roundtable and Legal Dossier before any write to them,
// and ask Julian before any write to the Legal Dossier.
import { backupRecords } from '../backup-records.mjs';
import { DOSSIER, ROUNDTABLE, mainDir, readInput } from './common.mjs';

const input = readInput();
const tool = input.tool_name || '';
const ti = input.tool_input || {};

let target = '';
let writes = false;
if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
  target = String(ti.file_path || '');
  writes = true;
} else if (tool === 'Bash') {
  target = String(ti.command || '');
  // Only treat shell commands as writes when they look like one.
  writes = /(>|\btee\b|sed\s+-i|perl\s+-i|\bmv\b|\bcp\b|\brm\b|python|node\b|awk\b.*-i)/.test(target);
}

const touchesRoundtable = target.includes(ROUNDTABLE);
const touchesDossier = target.includes(DOSSIER);
if (!writes || (!touchesRoundtable && !touchesDossier)) process.exit(0);

try {
  backupRecords(mainDir(input.cwd || process.cwd()));
} catch (e) {
  console.error(`Backup failed, write blocked: ${e.message}`);
  process.exit(2);
}

if (touchesDossier) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason:
        'Legal Dossier edits need Julian\'s go (AGENTS.md section 2). Agents should draft in "ER Triage App/dossier-pending.md" instead.',
    },
  }));
}
process.exit(0);
