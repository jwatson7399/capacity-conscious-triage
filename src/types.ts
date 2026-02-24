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
}

export interface Buffer {
  id: string;
  teamId: TeamId;
  tier: AcuityTier;
  createdAt: number;
  expiresAt: number;
  mergedCount?: number;
}

export interface AssignmentOverride {
  patientId: string;
  recommendedTeamId: TeamId;
  assignedTeamId: TeamId;
  reason: string;
  overriddenAt: number;
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
}

export interface TeamScore {
  teamId: TeamId;
  capacity: number;
  load: number;
  bufferLoad: number;
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
  | { type: 'LOAD_DEMO' };
