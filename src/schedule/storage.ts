// © 2026 New York University. All rights reserved.
// Parsed rosters, role picks and original workbook bytes stay on this device. No network calls.
import type { ProviderType } from '../types';
import { parseWeeklySchedule } from '../utils/scheduleParser';
import { datedDays, mergeWeek, unresolved, SCHEDULE_PARSER_VERSION, type OriginalSchedule, type StoredWeek, type WeekDay } from './week';

const KEY = 'cct-week-schedule-v1';
let memory: StoredWeek | null = null;
let lastRaw: string | null = null;
let memoryOnly = false;

export function storageWarning(): string | null {
  return memoryOnly ? 'This browser could not save the schedule. It is available for this visit only; keep this page open.' : null;
}

function encode(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
function decode(base64: string): ArrayBuffer {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
}

/** Re-read only the dates still owned by each upload, preserving role picks and resend precedence. */
export function upgradeWeek(week: StoredWeek): StoredWeek {
  if (week.parserVersion === SCHEDULE_PARSER_VERSION) return week;
  if ((week.parserVersion ?? 0) > SCHEDULE_PARSER_VERSION) return { ...week, migrationError: 'This schedule was saved by a newer app. Reload the app before starting.' };
  const originals = week.originals ?? [];
  const missing = 'This saved schedule needs the updated A-side reading, but its original file is missing. Upload the schedule again.';
  if (!originals.length || week.days.some(d => !originals.some(o => o.dates.includes(d.isoDate)))) return { ...week, migrationError: missing };
  try {
    const days = new Map<string, WeekDay>();
    for (const original of originals) {
      const read = readWeek(decode(original.base64), original.source, week.roleFixes);
      for (const d of read.days) if (original.dates.includes(d.isoDate)) days.set(d.isoDate, d);
    }
    if (week.days.some(d => !days.has(d.isoDate))) return { ...week, migrationError: missing };
    const upgraded: StoredWeek = { ...week, days: [...days.values()].sort((a, b) => a.isoDate.localeCompare(b.isoDate)), parserVersion: SCHEDULE_PARSER_VERSION };
    delete upgraded.migrationError;
    return upgraded;
  } catch {
    return { ...week, migrationError: 'The original saved schedule could not be read. Upload the schedule again before starting.' };
  }
}

export function loadWeek(): StoredWeek | null {
  if (memoryOnly) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) { memory = null; lastRaw = null; return null; }
    if (raw === lastRaw && memory) return memory;
    const w = JSON.parse(raw) as StoredWeek;
    if (!w || !Array.isArray(w.days)) return null;
    const normalized = { ...w, roleFixes: w.roleFixes ?? {}, sources: w.sources ?? [] };
    const upgraded = upgradeWeek(normalized);
    memory = upgraded;
    lastRaw = raw;
    if (upgraded !== normalized && !upgraded.migrationError) saveWeek(upgraded);
    return upgraded;
  } catch { return memory; }
}

export function saveWeek(w: StoredWeek): void {
  memory = w;
  try {
    const raw = JSON.stringify(w);
    localStorage.setItem(KEY, raw);
    lastRaw = raw;
    memoryOnly = false;
  } catch { memoryOnly = true; }
}

export function clearWeek(): void {
  memory = null; lastRaw = null; memoryOnly = false;
  try { localStorage.removeItem(KEY); } catch { /* unavailable */ }
}

export interface ReadWeek {
  source: string;
  days: WeekDay[];
  corrected: number;
  needsRole: string[];
  original: OriginalSchedule;
}

/** Parse and retain the file locally; caller resolves every unknown role before committing it. */
export function readWeek(data: ArrayBuffer, source: string, known: Record<string, ProviderType> = {}): ReadWeek {
  const parsed = parseWeeklySchedule(data, { live: true });
  if (parsed.days.length === 0) throw new Error('No days found in that file. Is it the weekly department schedule?');
  const { days, corrected, undated } = datedDays(parsed.days);
  if (days.length === 0 || undated === parsed.days.length) throw new Error('The days in that file have no dates the app can read.');
  return { source, days, corrected, needsRole: unresolved(days, known), original: { source, base64: encode(data), dates: days.map(d => d.isoDate) } };
}

export function storeRead(prev: StoredWeek | null, read: ReadWeek, roleFixes: Record<string, ProviderType>, now = Date.now()): StoredWeek {
  const fixes = { ...(prev?.roleFixes ?? {}), ...roleFixes };
  if (unresolved(read.days, fixes).length) throw new Error('Pick a role for every resident with no level before saving.');
  // An obsolete week without recoverable originals must not be relabeled as freshly parsed.
  const current = prev?.parserVersion === SCHEDULE_PARSER_VERSION && !prev.migrationError ? prev : null;
  const w = mergeWeek(current, read.days, read.source, fixes, now);
  const incoming = new Set(read.days.map(d => d.isoDate));
  const keptDates = new Set(w.days.map(d => d.isoDate));
  w.originals = [
    ...(current?.originals ?? []).map(o => ({ ...o, dates: o.dates.filter(d => keptDates.has(d) && !incoming.has(d)) })).filter(o => o.dates.length),
    read.original,
  ];
  saveWeek(w);
  return w;
}

export function saveRoleFixes(week: StoredWeek, fixes: Record<string, ProviderType>): StoredWeek {
  const updated = { ...week, roleFixes: { ...week.roleFixes, ...fixes } };
  if (unresolved(updated.days, updated.roleFixes).length) throw new Error('Pick a role for every resident with no level before starting.');
  saveWeek(updated);
  return updated;
}
