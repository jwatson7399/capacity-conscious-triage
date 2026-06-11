export type Role = 'triage_nurse' | 'charge_nurse' | 'attending';

export type FloatModifier = 'none' | 'float_supervising' | 'float_primary';

export type ProviderType = 'attending' | 'senior_resident' | 'junior_resident' | 'intern' | 'pa' | 'rotator';

export type ProviderStatus = 'active' | 'in_procedure' | 'taking_signout' | 'off_floor';

export type AcuityTier = 'tier_one' | 'tier_two' | 'tier_three';

export type TeamId = 1 | 2 | 3 | 4;

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  status: ProviderStatus;
  statusExpiresAt: number | null;
  teamId: TeamId;
}

export interface Patient {
  id: string;
  acuity: AcuityTier;
  assignedTeamId: TeamId;
  assignedAt: number;
  upgradedAt?: number;
  originalAcuity?: AcuityTier;
  deceased?: boolean;
  floatModifier?: FloatModifier;
  floatAttendingName?: string;
}

export interface Buffer {
  id: string;
  teamId: TeamId;
  tier: AcuityTier;
  createdAt: number;
  expiresAt: number;
  mergedCount?: number;
  deceasedPatientId?: string;
}

export interface AssignmentOverride {
  patientId: string;
  recommendedTeamId: TeamId;
  assignedTeamId: TeamId;
  reason: string;
  overriddenAt: number;
}

export interface DecayStep {
  afterMs: number;
  weight: number;
}

export interface SimOverrides {
  capacityWeights: Record<ProviderType, number>;
  statusMultipliers: Record<ProviderStatus, number>;
  acuityWeights: Record<AcuityTier, number>;
  bufferDurations: Record<AcuityTier, number>;
  decaySteps: Record<AcuityTier, DecayStep[]>;
  arrivalRatePerHour: number;
  acuityDistribution: { tier_one: number; tier_two: number; tier_three: number };
  floorUpgradeChance: number;
  procedureChancePerHour: number;
  procedureDurationMs: number;
  signoutWindows: { startMinutes: number; endMinutes: number };
}

export interface SimTimelineEntry {
  arrivalTime: number;
  acuity: AcuityTier;
  isFloor: boolean;
}

export interface SimStatusChangeEntry {
  time: number;
  providerId: string;
  status: ProviderStatus;
  durationMs: number;
}

export interface SimSnapshot {
  state: ShiftState;
  simTime: number;
}

export interface ShadowEntry {
  arrivalIndex: number;
  arrivalTime: number;
  acuity: AcuityTier;
  teamId: TeamId;
  ratioAtAssignment: number;
}

export interface ShadowResult {
  mode: 'round_robin' | 'formula';
  entries: ShadowEntry[];
  teamPatientCounts: Record<number, number>;
  teamAcuityLoad: Record<number, { tier_one: number; tier_two: number; tier_three: number }>;
  avgRatioPerTeam: Record<number, number>;
  minRatioPerTeam: Record<number, number>;
  redZoneEvents: Record<number, number>;
}

export interface SimulationState {
  active: boolean;
  baseTime: number;
  speed: number;
  paused: boolean;
  seed: number;
  shiftDurationMs: number;
  timeline: SimTimelineEntry[];
  statusChanges: SimStatusChangeEntry[];
  nextArrivalIndex: number;
  nextStatusChangeIndex: number;
  snapshots: SimSnapshot[];
  overrides: SimOverrides;
  permanentlyClosedTeams: number[];
  roundRobin?: boolean;
  roundRobinNext?: number;
  shadow?: ShadowResult;
  liveShadow?: ShadowResult;  // pre-computed stats for the live mode (same algo as shadow but for live mode)
  initialProviders: Provider[];
}

export interface ScheduleDemoData {
  days: { date: string; dayOfWeek: string; providers: import('./utils/scheduleParser').ScheduleProvider[]; floatAttendings: import('./utils/scheduleParser').FloatAttending[] }[];
  selectedDayIdx: number;
  currentHour: number;
}

export interface ShiftState {
  providers: Provider[];
  patients: Patient[];
  buffers: Buffer[];
  overrides: AssignmentOverride[];
  patientCounter: { C: number; F: number };
  currentRole: Role | null;
  shiftStarted: boolean;
  now: number;
  closedTeams: Record<number, number>;
  simulation?: SimulationState;
  floatAttendings: string[];
  scheduleData?: ScheduleDemoData;
  demoMode?: 'sandbox' | 'real-schedule';
}

export interface TeamScore {
  teamId: TeamId;
  capacity: number;
  load: number;
  capacityRatio: number;
  lastAssigned: number;
  isBuffered: boolean;
}

export interface Recommendation {
  first: TeamId | null;
  second: TeamId | null;
  allAtCapacity: boolean;
  scores: TeamScore[];
}

export type ShiftAction =
  | { type: 'SET_ROLE'; role: Role | null }
  | { type: 'START_SHIFT'; providers: Provider[] }
  | { type: 'TICK' }
  | { type: 'ASSIGN_PATIENT'; tier: AcuityTier; teamId: TeamId; source: 'critical' | 'floor'; overrideReason?: string; recommendedTeamId?: TeamId }
  | { type: 'SET_PROVIDER_STATUS'; providerId: string; status: ProviderStatus }
  | { type: 'UPGRADE_PATIENT'; patientId: string }
  | { type: 'REASSIGN_PATIENT'; patientId: string; toTeamId: TeamId; reason: string }
  | { type: 'SWAP_PROVIDER'; outProviderId: string; incoming: Omit<Provider, 'id' | 'status' | 'statusExpiresAt'> }
  | { type: 'CLOSE_TEAM'; teamId: TeamId }
  | { type: 'SIGNOUT_PATIENTS'; fromTeamId: TeamId; toTeamId: TeamId }
  | { type: 'DECEASE_PATIENT'; patientId: string }
  | { type: 'DOWNGRADE_PATIENT'; patientId: string; reason?: string }
  | { type: 'LOAD_DEMO' }
  | { type: 'LOAD_SCHEDULE_DEMO'; providers: Provider[]; floatAttendings: string[]; scheduleData: ScheduleDemoData; seed: number; shiftDurationMs: number; overrides: SimOverrides }
  | { type: 'LOAD_TOUR_DEMO' }
  | { type: 'START_SIMULATION'; providers: Provider[]; seed: number; shiftDurationMs: number; overrides: SimOverrides; closedTeams?: Record<number, number>; roundRobin?: boolean; presetStatusChanges?: SimStatusChangeEntry[] }
  | { type: 'SET_SIM_SPEED'; speed: number }
  | { type: 'TOGGLE_SIM_PAUSE' }
  | { type: 'SIM_REWIND'; snapshotIndex: number }
  | { type: 'SET_SIM_OVERRIDE'; overrides: Partial<SimOverrides> }
  | { type: 'SIM_SKIP_TO_NEXT' }
  | { type: 'RESET' }
  | { type: 'ADD_PROVIDERS'; providers: Provider[] }
  | { type: 'SET_FLOAT_MODIFIER'; patientId: string; modifier: FloatModifier; floatName?: string }
  | { type: 'SET_FLOAT_ATTENDINGS'; names: string[] }
  | { type: 'SCHEDULE_CHANGE_HOUR'; hour: number };
