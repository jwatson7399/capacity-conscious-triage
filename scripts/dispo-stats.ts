/**
 * Disposition Time Statistics
 *
 * Analyzes door-to-disposition times from the primary cohort (A-side,
 * non-trauma/Team 4, three-team hours 9AM–midnight) to derive timeout
 * values for the decay schedule.
 *
 * Usage:
 *   cd er-triage-app && npx tsx scripts/dispo-stats.ts
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import * as XLSX from 'xlsx';

import type { AcuityTier } from '../src/types';
import { excelSerialToWallMs, localDateToWallMs, parseWallClockString, wallHour } from './lib/census-time';

// ── Paths ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const CENSUS_PATH = join(PROJECT_ROOT, 'data', 'provider-schedules', 'Aside data Dec 2025–Mar 2026.xlsx');

// ── Types ──────────────────────────────────────────────────────────

interface Encounter {
  arrivalTime: number;
  hour: number;
  esi: number | null;
  acuity: AcuityTier;
  teamId: number;
  doorToDispoMin: number | null;
  isTrauma: boolean;
}

// ── ESI → Acuity mapping ──────────────────────────────────────────

function esiToTier(esi: number | null): AcuityTier {
  if (esi === 1) return 'tier_one';
  if (esi === 2) return 'tier_two';
  return 'tier_three';
}

// ── Census parser ─────────────────────────────────────────────────

function parseTeamId(teamStr: string | null | undefined): number | null {
  if (!teamStr) return null;
  const match = teamStr.match(/(\d)/);
  if (!match) return null;
  const n = parseInt(match[1]);
  if (n >= 1 && n <= 4) return n;
  return null;
}

function excelDateToMs(serial: number): number {
  // Wall-clock time, independent of the machine time zone (scripts/lib/census-time.ts).
  return excelSerialToWallMs(serial);
}

function loadCensus(): Encounter[] {
  console.log(`  Loading census: ${basename(CENSUS_PATH)}`);
  const buf = readFileSync(CENSUS_PATH);
  const wb = XLSX.read(buf, { type: 'buffer' });

  const sheetName = wb.SheetNames.find(s => s.includes('A-side') || s.includes('trauma'));
  if (!sheetName) throw new Error(`Cannot find census sheet. Available: ${wb.SheetNames.join(', ')}`);
  console.log(`  Sheet: "${sheetName}"`);

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
  console.log(`  Raw rows: ${rows.length}`);

  const firstRow = rows[0];
  const keys = Object.keys(firstRow);

  const findCol = (patterns: string[]): string | null => {
    for (const p of patterns) {
      const found = keys.find(k => k.toLowerCase().includes(p.toLowerCase()));
      if (found) return found;
    }
    return null;
  };

  const colArrival = findCol(['arrival_time', 'arrival', 'arrivaltime']);
  const colTeam = findCol(['team_assignment', 'team', 'teamassignment']);
  const colEsi = findCol(['esi_level', 'esi', 'esilevel']);
  const colSource = findCol(['acuity_source', 'source', 'acuitysource']);
  const colDoorDispo = findCol(['door_to_dispo', 'doortodispo']);

  if (!colArrival || !colTeam) {
    throw new Error(`Missing required columns. Found: ${keys.join(', ')}`);
  }

  console.log(`  Columns: arrival=${colArrival}, team=${colTeam}, esi=${colEsi}, source=${colSource}, doorDispo=${colDoorDispo}`);

  const encounters: Encounter[] = [];

  for (const row of rows) {
    const rawArrival = row[colArrival];
    let arrivalMs: number;
    if (typeof rawArrival === 'number') {
      arrivalMs = excelDateToMs(rawArrival);
    } else if (rawArrival instanceof Date) {
      arrivalMs = localDateToWallMs(rawArrival);
    } else if (typeof rawArrival === 'string') {
      arrivalMs = parseWallClockString(rawArrival);
    } else {
      continue;
    }
    if (isNaN(arrivalMs)) continue;

    const teamId = parseTeamId(String(row[colTeam] ?? ''));
    if (!teamId) continue;

    const source = String(row[colSource] ?? '').toLowerCase();
    const isTrauma = source === 'trauma' || source === 'both';

    const rawEsi = row[colEsi ?? ''];
    const esi = typeof rawEsi === 'number' ? rawEsi : (rawEsi ? parseInt(String(rawEsi)) : null);
    const validEsi = esi && esi >= 1 && esi <= 5 ? esi : null;

    const doorToDispoMin = colDoorDispo && typeof row[colDoorDispo] === 'number' ? row[colDoorDispo] : null;


    encounters.push({
      arrivalTime: arrivalMs,
      hour: wallHour(arrivalMs),
      esi: validEsi,
      acuity: esiToTier(validEsi),
      teamId,
      doorToDispoMin,
      isTrauma,
    });
  }

  return encounters;
}

// ── Stats helpers ─────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

interface DistStats {
  count: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  p90: number;
  p95: number;
  max: number;
}

function computeStats(values: number[]): DistStats {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    mean: Math.round(mean(sorted) * 10) / 10,
    median: Math.round(percentile(sorted, 50) * 10) / 10,
    p25: Math.round(percentile(sorted, 25) * 10) / 10,
    p75: Math.round(percentile(sorted, 75) * 10) / 10,
    p90: Math.round(percentile(sorted, 90) * 10) / 10,
    p95: Math.round(percentile(sorted, 95) * 10) / 10,
    max: sorted[sorted.length - 1],
  };
}

function printStats(label: string, stats: DistStats) {
  console.log(`  ${label} (n=${stats.count}):`);
  console.log(`    Mean:   ${stats.mean} min`);
  console.log(`    p25:    ${stats.p25} min`);
  console.log(`    Median: ${stats.median} min`);
  console.log(`    p75:    ${stats.p75} min`);
  console.log(`    p90:    ${stats.p90} min`);
  console.log(`    p95:    ${stats.p95} min`);
  console.log(`    Max:    ${stats.max} min`);
}

function printDecayRates(label: string, values: number[]) {
  const thresholds = [60, 90, 120, 180, 240];
  const n = values.length;
  console.log(`  ${label} — Decay activation rates (n=${n}):`);
  for (const t of thresholds) {
    const still = values.filter(v => v > t).length;
    const pct = ((still / n) * 100).toFixed(1);
    console.log(`    Still present at ${String(t).padStart(3)}m: ${String(still).padStart(5)} / ${n}  (${pct}%)`);
  }
}

// ── Main ──────────────────────────────────────────────────────────

console.log('\n  ╔══════════════════════════════════════════════════════╗');
console.log('  ║        Door-to-Disposition Statistics                ║');
console.log('  ╚══════════════════════════════════════════════════════╝\n');

const allEncounters = loadCensus();
console.log(`  Total parsed encounters: ${allEncounters.length}`);

// Filter to primary cohort: A-side, non-trauma, non-Team 4, hours 9-23
const primaryCohort = allEncounters.filter(e =>
  !e.isTrauma && e.teamId !== 4 && e.hour >= 9 && e.hour <= 23
);
console.log(`  Primary cohort (A-side, non-trauma, teams 1-3, 9AM-midnight): ${primaryCohort.length}`);

// Filter to those with valid doorToDispoMin
const withDispo = primaryCohort.filter(e => e.doorToDispoMin !== null && e.doorToDispoMin > 0);
console.log(`  With valid door-to-dispo times: ${withDispo.length}`);
const missingDispo = primaryCohort.length - withDispo.length;
console.log(`  Missing door-to-dispo: ${missingDispo} (${((missingDispo / primaryCohort.length) * 100).toFixed(1)}%)\n`);

const dispoValues = withDispo.map(e => e.doorToDispoMin!);

// ── Overall distribution ──────────────────────────────────────────

console.log('  ═══ OVERALL DISTRIBUTION ═══\n');
const overall = computeStats(dispoValues);
printStats('All encounters', overall);

// ── By acuity tier ────────────────────────────────────────────────

console.log('\n  ═══ BY ACUITY TIER ═══\n');

const tiers: AcuityTier[] = ['tier_one', 'tier_two', 'tier_three'];
const tierLabels: Record<AcuityTier, string> = {
  tier_one: 'Tier One (ESI 1)',
  tier_two: 'Tier Two (ESI 2)',
  tier_three: 'Tier Three (ESI 3-5)',
};

const tierStats: Record<AcuityTier, DistStats> = {} as any;

for (const tier of tiers) {
  const values = withDispo.filter(e => e.acuity === tier).map(e => e.doorToDispoMin!);
  if (values.length === 0) {
    console.log(`  ${tierLabels[tier]}: no data\n`);
    continue;
  }
  const stats = computeStats(values);
  tierStats[tier] = stats;
  printStats(tierLabels[tier], stats);
  console.log('');
}

// ── Decay activation rates ────────────────────────────────────────

console.log('  ═══ DECAY ACTIVATION RATES ═══\n');

printDecayRates('Overall', dispoValues);
console.log('');

for (const tier of tiers) {
  const values = withDispo.filter(e => e.acuity === tier).map(e => e.doorToDispoMin!);
  if (values.length > 0) {
    printDecayRates(tierLabels[tier], values);
    console.log('');
  }
}

// ── Prominent summary for timeout values ──────────────────────────

console.log('  ╔══════════════════════════════════════════════════════╗');
console.log('  ║        KEY VALUES FOR TIMEOUT CONFIGURATION         ║');
console.log('  ╠══════════════════════════════════════════════════════╣');
console.log(`  ║  Overall    Median: ${String(overall.median).padStart(6)} min    p75: ${String(overall.p75).padStart(6)} min  ║`);
for (const tier of tiers) {
  if (tierStats[tier]) {
    const s = tierStats[tier];
    const label = tier === 'tier_one' ? 'Tier One  ' : tier === 'tier_two' ? 'Tier Two  ' : 'Tier Three';
    console.log(`  ║  ${label}  Median: ${String(s.median).padStart(6)} min    p75: ${String(s.p75).padStart(6)} min  ║`);
  }
}
console.log('  ╚══════════════════════════════════════════════════════╝\n');
