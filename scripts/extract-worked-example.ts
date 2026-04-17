/**
 * Extract patient-by-patient data for a single day's replay.
 * Used to generate the WORKED_EXAMPLE.md document.
 *
 * Usage:
 *   cd er-triage-app && npx tsx scripts/extract-worked-example.ts
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import * as XLSX from 'xlsx';

import type {
  Provider, ProviderType, ProviderStatus, TeamId, AcuityTier,
  Patient, Buffer,
} from '../src/types';
import type { ScheduleProvider, DaySchedule } from '../src/utils/scheduleParser';
import { parseWeeklySchedule, getProvidersForShift } from '../src/utils/scheduleParser';
import { getDefaultOverrides } from '../src/engine/simulation';
import {
  getRecommendation, scoreTeam, createBuffer, getEffectiveCapacity, getCurrentLoad,
} from '../src/engine/recommendation';
import type { ScoringOverrides } from '../src/engine/recommendation';
import { CAPACITY_WEIGHTS, ACUITY_WEIGHTS } from '../src/constants';
import { uid } from '../src/uid';

// ── Config ───────────────────────────────────────────────────────

const TARGET_DATE = '2026-02-09';
const WEIGHT_SCHEME = '4:2:1';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const CENSUS_PATH = join(PROJECT_ROOT, 'data', 'provider-schedules', 'Aside data Dec 2025–Mar 2026.xlsx');
const SCHEDULE_DIR_1 = join(PROJECT_ROOT, 'data', 'provider-schedules', 'schedules');
const SCHEDULE_DIR_2 = join(PROJECT_ROOT, 'data', 'provider-schedules', 'initially missing schedules');

// ── Acuity weights (4:2:1) ────────────────────────────────────────

const customAcuityWeights: Record<AcuityTier, number> = { tier_one: 4, tier_two: 2, tier_three: 1 };
const customDecay: Record<AcuityTier, Array<{ afterMs: number; weight: number }>> = {
  tier_one: [
    { afterMs: 90 * 60 * 1000, weight: 2 },
    { afterMs: 180 * 60 * 1000, weight: 1 },
    { afterMs: 240 * 60 * 1000, weight: 0 },
  ],
  tier_two: [
    { afterMs: 90 * 60 * 1000, weight: 1 },
    { afterMs: 240 * 60 * 1000, weight: 0 },
  ],
  tier_three: [
    { afterMs: 120 * 60 * 1000, weight: 0 },
  ],
};

const overrides = getDefaultOverrides();
const scoringOv: ScoringOverrides = {
  capacityWeights: overrides.capacityWeights,
  statusMultipliers: overrides.statusMultipliers,
  acuityWeights: customAcuityWeights,
  decaySteps: customDecay,
  bufferDurations: overrides.bufferDurations,
};

// ── Helpers (from historical-replay.ts) ──────────────────────────

interface HistoricalArrival {
  arrivalTime: number;
  date: string;
  hour: number;
  esi: number | null;
  acuity: AcuityTier;
  actualTeam: TeamId;
}

function esiToTier(esi: number | null): AcuityTier {
  if (esi === 1) return 'tier_one';
  if (esi === 2) return 'tier_two';
  return 'tier_three';
}

function parseTeamId(teamStr: string | null | undefined): TeamId | null {
  if (!teamStr) return null;
  const match = teamStr.match(/(\d)/);
  if (!match) return null;
  const n = parseInt(match[1]);
  if (n >= 1 && n <= 4) return n as TeamId;
  return null;
}

function excelDateToMs(serial: number): number {
  const msPerDay = 86400000;
  const excelEpoch = new Date(1899, 11, 30).getTime();
  return excelEpoch + serial * msPerDay;
}

function stableProviderId(sp: ScheduleProvider): string {
  return `${sp.name.toLowerCase()}-t${sp.teamId}`;
}

function toProviders(sps: ScheduleProvider[]): Provider[] {
  return sps.map(sp => ({
    id: stableProviderId(sp),
    name: sp.name,
    type: sp.type,
    status: 'active' as ProviderStatus,
    statusExpiresAt: null,
    teamId: sp.teamId,
  }));
}

const tierLabel: Record<AcuityTier, string> = {
  tier_one: 'Red (ESI 1)',
  tier_two: 'Yellow (ESI 2)',
  tier_three: 'Purple (ESI 3+)',
};

const typeLabel: Record<ProviderType, string> = {
  attending: 'Attending',
  senior_resident: 'Senior Resident',
  junior_resident: 'Junior Resident',
  intern: 'Intern',
  pa: 'PA',
  rotator: 'Rotator',
};

// ── Load census ──────────────────────────────────────────────────

function loadCensusForDate(): HistoricalArrival[] {
  const buf = readFileSync(CENSUS_PATH);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames.find(s => s.includes('A-side') || s.includes('trauma'))!;
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

  const keys = Object.keys(rows[0]);
  const findCol = (patterns: string[]): string | null => {
    for (const p of patterns) {
      const found = keys.find(k => k.toLowerCase().includes(p.toLowerCase()));
      if (found) return found;
    }
    return null;
  };

  const colArrival = findCol(['arrival_time', 'arrival', 'arrivaltime'])!;
  const colTeam = findCol(['team_assignment', 'team', 'teamassignment'])!;
  const colEsi = findCol(['esi_level', 'esi', 'esilevel']);
  const colSource = findCol(['acuity_source', 'source', 'acuitysource']);

  const arrivals: HistoricalArrival[] = [];
  for (const row of rows) {
    const rawArrival = row[colArrival];
    let arrivalMs: number;
    if (typeof rawArrival === 'number') arrivalMs = excelDateToMs(rawArrival);
    else if (rawArrival instanceof Date) arrivalMs = rawArrival.getTime();
    else if (typeof rawArrival === 'string') arrivalMs = new Date(rawArrival).getTime();
    else continue;
    if (isNaN(arrivalMs)) continue;

    const teamId = parseTeamId(String(row[colTeam] ?? ''));
    if (!teamId) continue;

    const source = String(row[colSource ?? ''] ?? '').toLowerCase();
    if (source === 'trauma' || source === 'both') continue;
    if (teamId === 4) continue;

    const d = new Date(arrivalMs);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (dateStr !== TARGET_DATE) continue;

    const rawEsi = row[colEsi ?? ''];
    const esi = typeof rawEsi === 'number' ? rawEsi : (rawEsi ? parseInt(String(rawEsi)) : null);
    const validEsi = esi && esi >= 1 && esi <= 5 ? esi : null;

    // Three-team hours only (9A–midnight)
    if (d.getHours() < 9) continue;

    arrivals.push({
      arrivalTime: arrivalMs,
      date: dateStr,
      hour: d.getHours(),
      esi: validEsi,
      acuity: esiToTier(validEsi),
      actualTeam: teamId as TeamId,
    });
  }

  arrivals.sort((a, b) => a.arrivalTime - b.arrivalTime);
  return arrivals;
}

// ── Load schedule ────────────────────────────────────────────────

function loadScheduleForDate(): DaySchedule | null {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  for (const dir of [SCHEDULE_DIR_1, SCHEDULE_DIR_2]) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith('.xlsx') || file.startsWith('~$') || file.includes('demo-schedule')) continue;
      const buf = readFileSync(join(dir, file));
      const parsed = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      for (const day of parsed.days) {
        if (day.providers.length === 0) continue;
        const parts = day.date.match(/^(\w+)\s+(\d+)$/);
        if (!parts) continue;
        const monthIdx = monthNames.indexOf(parts[1]);
        if (monthIdx === -1) continue;
        const year = monthIdx === 11 ? 2025 : 2026;
        const isoDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(parseInt(parts[2])).padStart(2, '0')}`;
        if (isoDate === TARGET_DATE) {
          console.log(`  Schedule file: ${file}`);
          return day;
        }
      }
    }
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────

const arrivals = loadCensusForDate();
console.log(`\n  ${TARGET_DATE}: ${arrivals.length} A-side arrivals (9A–midnight, non-trauma)\n`);

const day = loadScheduleForDate();
if (!day) { console.error('No schedule found!'); process.exit(1); }

// Print all providers for the day
console.log('  ═══ FULL DAY ROSTER ═══\n');
for (const teamId of [1, 2, 3] as TeamId[]) {
  const teamProviders = day.providers.filter(p => p.teamId === teamId);
  console.log(`  Team ${teamId}:`);
  for (const p of teamProviders) {
    const weight = CAPACITY_WEIGHTS[p.type] ?? 0;
    const shift = p.shiftStart && p.shiftEnd ? `${p.shiftStart}–${p.shiftEnd}` : 'all day';
    console.log(`    ${p.name.padEnd(15)} ${typeLabel[p.type].padEnd(18)} weight=${weight.toString().padEnd(5)} shift=${shift}`);
  }
  console.log();
}

if (day.floatAttendings?.length > 0) {
  console.log('  Float Attendings:');
  for (const f of day.floatAttendings) {
    console.log(`    ${f.name.padEnd(15)} shift=${f.shiftStart ?? '?'}–${f.shiftEnd ?? '?'}`);
  }
  console.log();
}

// Replay with verbose output
console.log('  ═══ PATIENT-BY-PATIENT REPLAY ═══\n');

const eligibleTeams: TeamId[] = [1, 2, 3];
const closedTeams: Record<number, number> = { 4: 0 };
const permanentlyClosedTeams = [4];

// Three independent simulation states
let actualPatients: Patient[] = [];
let formulaPatients: Patient[] = [];
let formulaBuffers: Buffer[] = [];
let rrPatients: Patient[] = [];
let rrBuffers: Buffer[] = [];
let rrNext = 0;

const actualCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
const formulaCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
const rrCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };

for (let i = 0; i < arrivals.length; i++) {
  const arr = arrivals[i];
  const now = arr.arrivalTime;
  const timeStr = new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const hourOfDay = arr.hour;

  // Get providers for this hour
  const { providers: scheduledProviders } = getProvidersForShift(day, hourOfDay);
  const simProviders = toProviders(scheduledProviders);

  console.log(`  ─── Patient ${i + 1} of ${arrivals.length} ───`);
  console.log(`  Arrival: ${timeStr} | ESI ${arr.esi} (${tierLabel[arr.acuity]}) | Actual Team: ${arr.actualTeam}`);

  // Show team capacities and loads at this moment
  console.log(`  State before assignment:`);
  for (const t of eligibleTeams) {
    const teamProvs = simProviders.filter(p => p.teamId === t);
    const cap = getEffectiveCapacity(teamProvs, now, scoringOv);
    const actualLoad = getCurrentLoad(actualPatients, t, now, scoringOv);
    const formulaLoad = getCurrentLoad(formulaPatients, t, now, scoringOv);
    const rrLoad = getCurrentLoad(rrPatients, t, now, scoringOv);

    const actualRatio = actualLoad === 0 ? Infinity : cap / actualLoad;
    const formulaRatio = formulaLoad === 0 ? Infinity : cap / formulaLoad;
    const rrRatio = rrLoad === 0 ? Infinity : cap / rrLoad;

    const fmtRatio = (r: number) => r === Infinity ? '∞ (no load)' : r.toFixed(1);

    // Check buffer status
    const fBuf = formulaBuffers.filter(b => b.teamId === t && b.expiresAt > now);
    const rBuf = rrBuffers.filter(b => b.teamId === t && b.expiresAt > now);
    const fBufStr = fBuf.length > 0 ? ` [BUFFERED ${Math.round((fBuf[0].expiresAt - now) / 60000)}m left]` : '';
    const rBufStr = rBuf.length > 0 ? ` [BUFFERED ${Math.round((rBuf[0].expiresAt - now) / 60000)}m left]` : '';

    console.log(`    Team ${t}: capacity=${cap} | providers=${teamProvs.length}`);
    console.log(`      Actual:  load=${actualLoad.toFixed(1)}, ratio=${fmtRatio(actualRatio)}, patients=${actualCounts[t]}`);
    console.log(`      Formula: load=${formulaLoad.toFixed(1)}, ratio=${fmtRatio(formulaRatio)}, patients=${formulaCounts[t]}${fBufStr}`);
    console.log(`      RR:      load=${rrLoad.toFixed(1)}, ratio=${fmtRatio(rrRatio)}, patients=${rrCounts[t]}${rBufStr}`);
  }

  // ── ACTUAL MODE ──
  {
    const teamId = arr.actualTeam;
    const score = scoreTeam(teamId, simProviders, actualPatients, [], now, scoringOv);
    const ratio = score.capacityRatio === Infinity ? 100 : score.capacityRatio;
    actualPatients = [...actualPatients, {
      id: `H-${String(i + 1).padStart(3, '0')}`,
      acuity: arr.acuity,
      assignedTeamId: teamId,
      assignedAt: now,
    }];
    actualCounts[teamId]++;
    console.log(`  → ACTUAL:  Team ${teamId} (ratio after: ${ratio === 100 ? '∞' : ratio.toFixed(1)})`);
  }

  // ── FORMULA MODE ──
  {
    formulaBuffers = formulaBuffers.filter(b => b.expiresAt > now);
    const rec = getRecommendation(simProviders, formulaPatients, formulaBuffers, now, closedTeams, scoringOv);
    const teamId = rec.first ?? eligibleTeams[0];
    const score = scoreTeam(teamId, simProviders, formulaPatients, formulaBuffers, now, scoringOv);
    const ratio = score.capacityRatio === Infinity ? 100 : score.capacityRatio;

    const patient: Patient = {
      id: `F-${String(i + 1).padStart(3, '0')}`,
      acuity: arr.acuity,
      assignedTeamId: teamId,
      assignedAt: now,
    };

    // Buffer merge
    const newBuffer = createBuffer(teamId, arr.acuity, now, scoringOv);
    const existingTeamBuffers = formulaBuffers.filter(b => b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId);
    const otherBuffers = formulaBuffers.filter(b => !(b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId));
    if (existingTeamBuffers.length > 0) {
      const allBufs = [...existingTeamBuffers, newBuffer];
      const currentExpiry = Math.max(...existingTeamBuffers.map(b => b.expiresAt));
      const newDuration = newBuffer.expiresAt - newBuffer.createdAt;
      const latestExpiry = Math.max(currentExpiry, now) + newDuration;
      const tierRank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
      const bestTier = allBufs.reduce((best, b) => tierRank[b.tier] < tierRank[best.tier] ? b : best).tier;
      const totalCount = allBufs.reduce((sum, b) => sum + (b.mergedCount ?? 1), 0);
      formulaBuffers = [...otherBuffers, {
        id: newBuffer.id, teamId, tier: bestTier,
        createdAt: Math.min(...allBufs.map(b => b.createdAt)),
        expiresAt: latestExpiry, mergedCount: totalCount,
      }];
    } else {
      formulaBuffers = [...formulaBuffers, newBuffer];
    }

    formulaPatients = [...formulaPatients, patient];
    formulaCounts[teamId]++;

    const bufDurMin = Math.round((newBuffer.expiresAt - newBuffer.createdAt) / 60000);
    const agreed = teamId === arr.actualTeam ? ' ✓ AGREES' : ' ✗ DIFFERS';
    console.log(`  → FORMULA: Team ${teamId} (ratio after: ${ratio === 100 ? '∞' : ratio.toFixed(1)}, buffer: ${bufDurMin}m)${agreed}`);
  }

  // ── ROUND-ROBIN MODE ──
  {
    rrBuffers = rrBuffers.filter(b => b.expiresAt > now);
    const teamId = eligibleTeams[rrNext % eligibleTeams.length];
    rrNext++;
    const score = scoreTeam(teamId, simProviders, rrPatients, rrBuffers, now, scoringOv);
    const ratio = score.capacityRatio === Infinity ? 100 : score.capacityRatio;

    const patient: Patient = {
      id: `R-${String(i + 1).padStart(3, '0')}`,
      acuity: arr.acuity,
      assignedTeamId: teamId,
      assignedAt: now,
    };

    const newBuffer = createBuffer(teamId, arr.acuity, now, scoringOv);
    const existingTeamBuffers = rrBuffers.filter(b => b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId);
    const otherBuffers = rrBuffers.filter(b => !(b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId));
    if (existingTeamBuffers.length > 0) {
      const allBufs = [...existingTeamBuffers, newBuffer];
      const currentExpiry = Math.max(...existingTeamBuffers.map(b => b.expiresAt));
      const newDuration = newBuffer.expiresAt - newBuffer.createdAt;
      const latestExpiry = Math.max(currentExpiry, now) + newDuration;
      const tierRank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
      const bestTier = allBufs.reduce((best, b) => tierRank[b.tier] < tierRank[best.tier] ? b : best).tier;
      const totalCount = allBufs.reduce((sum, b) => sum + (b.mergedCount ?? 1), 0);
      rrBuffers = [...otherBuffers, {
        id: newBuffer.id, teamId, tier: bestTier,
        createdAt: Math.min(...allBufs.map(b => b.createdAt)),
        expiresAt: latestExpiry, mergedCount: totalCount,
      }];
    } else {
      rrBuffers = [...rrBuffers, newBuffer];
    }

    rrPatients = [...rrPatients, patient];
    rrCounts[teamId]++;
    console.log(`  → RR:      Team ${teamId} (ratio after: ${ratio === 100 ? '∞' : ratio.toFixed(1)})`);
  }

  console.log(`  Running totals — Actual: ${actualCounts[1]}/${actualCounts[2]}/${actualCounts[3]} | Formula: ${formulaCounts[1]}/${formulaCounts[2]}/${formulaCounts[3]} | RR: ${rrCounts[1]}/${rrCounts[2]}/${rrCounts[3]}`);
  console.log();
}

console.log('  ═══ FINAL TEAM COUNTS ═══');
console.log(`  Actual:     Team 1: ${actualCounts[1]}, Team 2: ${actualCounts[2]}, Team 3: ${actualCounts[3]}`);
console.log(`  Formula:    Team 1: ${formulaCounts[1]}, Team 2: ${formulaCounts[2]}, Team 3: ${formulaCounts[3]}`);
console.log(`  Round-Robin: Team 1: ${rrCounts[1]}, Team 2: ${rrCounts[2]}, Team 3: ${rrCounts[3]}`);
console.log();
