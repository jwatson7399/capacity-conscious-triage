export type Role = 'triage_nurse' | 'charge_nurse' | 'attending';

export type ProviderType = 'attending' | 'senior_resident' | 'junior_resident' | 'pa' | 'rotator';

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
}

export interface SimTimelineEntry {
  arrivalTime: number;
  acuity: AcuityTier;
  isFloor: boolean;
}

export interface SimSnapshot {
  state: ShiftState;
  simTime: number;
}

export interface SimulationState {
  active: boolean;
  baseTime: number;
  speed: number;
  paused: boolean;
  seed: number;
  shiftDurationMs: number;
  timeline: SimTimelineEntry[];
  nextArrivalIndex: number;
  snapshots: SimSnapshot[];
  overrides: SimOverrides;
  permanentlyClosedTeams: number[];
  roundRobin?: boolean;
  roundRobinNext?: number;
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
  | { type: 'DOWNGRADE_PATIENT'; patientId: string }
  | { type: 'LOAD_DEMO' }
  | { type: 'LOAD_TOUR_DEMO' }
  | { type: 'START_SIMULATION'; providers: Provider[]; seed: number; shiftDurationMs: number; overrides: SimOverrides; closedTeams?: Record<number, number>; roundRobin?: boolean }
  | { type: 'SET_SIM_SPEED'; speed: number }
  | { type: 'TOGGLE_SIM_PAUSE' }
  | { type: 'SIM_REWIND'; snapshotIndex: number }
  | { type: 'SET_SIM_OVERRIDE'; overrides: Partial<SimOverrides> }
  | { type: 'SIM_SKIP_TO_NEXT' };
