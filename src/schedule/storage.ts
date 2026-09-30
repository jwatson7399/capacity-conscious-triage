// © 2026 New York University. All rights reserved.
//
// The uploaded schedule, kept in this browser's storage so it is loaded once a week and used for
// every shift. It holds provider names and shift times only, the same content as the weekly email;
// no patient information. It never leaves the device. If storage is unavailable, the schedule
// lives in memory for this visit only.
import type { ProviderType } from '../types';
import { parseWeeklySchedule } from '../utils/scheduleParser';
import { datedDays, mergeWeek, unresolved, type StoredWeek, type WeekDay } from './week';

const KEY = 'cct-week-schedule-v1';
let memory: StoredWeek | null = null;

export function loadWeek(): StoredWeek | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return memory;
    const w = JSON.parse(raw) as StoredWeek;
    return w && Array.isArray(w.days) ? { ...w, roleFixes: w.roleFixes ?? {}, sources: w.sources ?? [] } : memory;
  } catch { return memory; }
}

export function saveWeek(w: StoredWeek): void {
  memory = w;
  try { localStorage.setItem(KEY, JSON.stringify(w)); } catch { /* storage unavailable: keep in memory */ }
}

export function clearWeek(): void {
  memory = null;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** What an uploaded file contains, before it is saved. */
export interface ReadWeek {
  source: string;
  days: WeekDay[];
  /** Days whose year was moved to match the weekday. */
  corrected: number;
  /** Residents with no level on the sheet, needing a role before the week can be saved. */
  needsRole: string[];
}

/** Read an uploaded workbook with the trial (live) rules. Throws with a plain message. */
export function readWeek(data: ArrayBuffer, source: string, known: Record<string, ProviderType> = {}): ReadWeek {
  const parsed = parseWeeklySchedule(data, { live: true });
  if (parsed.days.length === 0) throw new Error('No days found in that file. Is it the weekly department schedule?');
  const { days, corrected, undated } = datedDays(parsed.days);
  if (days.length === 0 || undated === parsed.days.length) throw new Error('The days in that file have no dates the app can read.');
  return { source, days, corrected, needsRole: unresolved(days, known) };
}

export function storeRead(prev: StoredWeek | null, read: ReadWeek, roleFixes: Record<string, ProviderType>): StoredWeek {
  const w = mergeWeek(prev, read.days, read.source, roleFixes, Date.now());
  saveWeek(w);
  return w;
}
