// © 2026 New York University. All rights reserved.
//
// The shift setup draft, kept in this browser's storage as a convenience so a half-built
// roster survives a trip back to Home. Nothing else depends on it; if storage is
// unavailable the draft simply lives in memory.
import type { ProviderType, TeamId } from '../types';

/** Team 0 in the draft means float attending. */
export type DraftTeam = TeamId | 0;
export interface DraftEntry {
  id: string;
  name: string;
  type: ProviderType;
  team: DraftTeam;
  /** From the uploaded schedule (see src/schedule/week.ts). */
  scheduleKey?: string;
  share?: number;
  endsAt?: number;
  note?: string;
  /** A scheduled entry deleted from the draft: kept hidden so the schedule does not add it back. */
  dropped?: boolean;
}

const DRAFT_KEY = 'cct-shift-draft-v1';

export function loadDraft(): DraftEntry[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DraftEntry[];
    return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.name === 'string') : [];
  } catch { return []; }
}
export function saveDraft(d: DraftEntry[]) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage unavailable: keep in memory */ }
}
export function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}
export function draftCount(): number {
  return loadDraft().filter(e => e.name.trim()).length;
}

