// © 2026 New York University. All rights reserved.
//
// Shift activity events. Plain, JSON-safe objects so a server can take them later
// without a rewrite. Events are append-only: an undo is its own event that points at
// the assignment it reversed; nothing is erased.

import type { AcuityTier, FloatModifier, ProviderType, TeamId } from './types';

/** A ratio in JSON-safe form. 'infinity' means the team had no load. */
export type RatioValue = number | 'infinity';

export interface TeamSnapshot {
  teamId: TeamId;
  capacity: number;
  load: number;
  ratio: RatioValue;
  closed: boolean;
  /** True while a deceased buffer applies (the team is ranked last). */
  buffered: boolean;
}

export type OverrideReasonCode = 'continuity' | 'team_request' | 'other';

export const OVERRIDE_REASONS: { code: OverrideReasonCode; label: string; hint: string }[] = [
  { code: 'continuity', label: 'Continuity / bounce-back', hint: 'Known to that team, seen earlier today' },
  { code: 'team_request', label: 'Team or attending request', hint: '' },
  { code: 'other', label: 'Other', hint: 'Add a short note' },
];

interface EventBase {
  id: string;
  /** Order within this shift, starting at 1. */
  seq: number;
  /** Model clock (ms). In a demo this is simulated time. */
  at: number;
  /** Device wall clock (ms) when the event was recorded. */
  recordedAt: number;
}

export interface AssignEvent extends EventBase {
  kind: 'assign';
  patientId: string;
  acuity: AcuityTier;
  source: 'critical' | 'floor';
  recommendedTeamId: TeamId | null;
  nextRankedTeamId: TeamId | null;
  chosenTeamId: TeamId;
  followed: boolean;
  override: { reasonCode: OverrideReasonCode; reasonLabel: string; note: string } | null;
  /** Every team, the moment before this patient was placed. */
  snapshot: TeamSnapshot[];
  /** True when the demo or simulator placed the patient, not a person. */
  auto: boolean;
}

/**
 * A patient already on a team got sicker and stays on that team. It adds load at the new
 * color's full weight but is not an assignment: no recommendation was followed or overridden.
 */
export interface FloorUpgradeEvent extends EventBase {
  kind: 'floor_upgrade';
  patientId: string;
  acuity: AcuityTier;
  teamId: TeamId;
  /** True when the demo clock added it, not a person. */
  auto: boolean;
}

export interface UndoEvent extends EventBase {
  kind: 'undo';
  patientId: string;
  undoesEventId: string | null;
}

export interface PatientEvent extends EventBase {
  kind: 'reassign' | 'upgrade' | 'downgrade' | 'deceased';
  patientId: string;
  /** Acuity before the action. For an upgrade, toAcuity is the new color. */
  acuity: AcuityTier;
  toAcuity?: AcuityTier;
  teamId: TeamId;
  toTeamId?: TeamId;
  reason?: string;
}

export interface FloatEvent extends EventBase {
  kind: 'float';
  patientId: string;
  teamId: TeamId;
  modifier: FloatModifier;
  floatName: string | null;
}

export interface ProviderEvent extends EventBase {
  kind: 'provider_add' | 'provider_remove' | 'provider_swap';
  teamId: TeamId;
  name: string;
  providerType: ProviderType;
  replacedName?: string;
  replacedType?: ProviderType;
}

export interface TeamEvent extends EventBase {
  kind: 'team_close' | 'team_reopen' | 'signout';
  teamId: TeamId;
  toTeamId?: TeamId;
  patientCount?: number;
}

export interface ShiftEvent extends EventBase {
  kind: 'shift_start';
  providerCount: number;
}

export type ActivityEvent =
  | AssignEvent
  | FloorUpgradeEvent
  | UndoEvent
  | PatientEvent
  | FloatEvent
  | ProviderEvent
  | TeamEvent
  | ShiftEvent;

export type ActivityKind = ActivityEvent['kind'];

/** Distributive Omit so each event variant keeps its own fields. */
export type NewEvent = ActivityEvent extends infer E
  ? E extends ActivityEvent ? Omit<E, 'id' | 'seq' | 'at' | 'recordedAt'> : never
  : never;

/** Assignment ids that were later undone. */
export function undoneAssignIds(events: ActivityEvent[]): Set<string> {
  const s = new Set<string>();
  for (const e of events) if (e.kind === 'undo' && e.undoesEventId) s.add(e.undoesEventId);
  return s;
}
