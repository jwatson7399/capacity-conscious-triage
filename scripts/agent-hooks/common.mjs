// Shared helpers for the Claude Code hooks in .claude/settings.json (see AGENTS.md section 4).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function readInput() {
  try { return JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

export function mainDir(cwd = process.cwd()) {
  const common = execSync('git rev-parse --path-format=absolute --git-common-dir', { cwd })
    .toString().trim();
  return dirname(common);
}

export const logPath = (cwd) => join(mainDir(cwd), 'AGENT_LOG.md');
export const markerPath = (sessionId) =>
  join(tmpdir(), `cct-session-${String(sessionId || 'unknown').replace(/[^\w-]/g, '')}`);

export const ROUNDTABLE = 'Cowork Roundtable.md';
export const DOSSIER = 'CCT Legal Dossier.md';
