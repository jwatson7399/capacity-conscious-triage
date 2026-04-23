/**
 * Decay Schedule Benchmark — Duration × Shape Sensitivity Analysis
 *
 * Tests 12 decay schedules (4 durations × 3 shapes) + 1 Actual baseline = 13 conditions.
 * All formula conditions use fixed 1:2:4 weights with buffers ON (35/25/15).
 * Purpose: determine whether performance is robust across reasonable decay schedules.
 *
 * Usage:
 *   cd er-triage-app && npx tsx scripts/decay-schedule-benchmark.ts
 *   cd er-triage-app && npx tsx scripts/decay-schedule-benchmark.ts --json
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import * as XLSX from 'xlsx';

import type { Provider, ProviderStatus, TeamId, AcuityTier, Patient, Buffer } from '../src/types';
import type { ScheduleProvider, DaySchedule } from '../src/utils/scheduleParser';
import { parseWeeklySchedule, getProvidersForShift } from '../src/utils/scheduleParser';
import { getDefaultOverrides } from '../src/engine/simulation';
import { getRecommendation, scoreTeam, createBuffer, getEffectiveCapacity, getDecayedAcuityWeight } from '../src/engine/recommendation';
import type { ScoringOverrides } from '../src/engine/recommendation';
import { ACUITY_WEIGHTS, ACUITY_DECAY } from '../src/constants';

// ── Paths ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const CENSUS_PATH = join(PROJECT_ROOT, 'data', 'provider-schedules', 'Aside data Dec 2025–Mar 2026.xlsx');
const SCHEDULE_DIR_1 = join(PROJECT_ROOT, 'data', 'provider-schedules', 'schedules');
const SCHEDULE_DIR_2 = join(PROJECT_ROOT, 'data', 'provider-schedules', 'initially missing schedules');

// ── Types ──────────────────────────────────────────────────────────

interface HistoricalArrival {
  arrivalTime: number;
  date: string;
  hour: number;
  esi: number | null;
  acuity: AcuityTier;
  actualTeam: TeamId;
  isAdmitted: boolean;
  disposition: string;
  doorToDispoMin: number | null;
  edLosMin: number | null;
}

interface ReplayEntry {
  arrivalIndex: number;
  arrivalTime: number;
  acuity: AcuityTier;
  teamId: TeamId;
  ratioAtAssignment: number;
  normalizedRatioAtAssignment: number;
}

interface DecayCondition {
  id: string;
  label: string;
  mode: 'formula' | 'actual';
  durationMultiplier: number;
  shape: 'stepped' | 'direct' | 'linear' | 'logBack';
  logBackK?: number;
  familyKey: string;                            // stepped | linear | logBack-k1 | ...
  familyLabel: string;                          // human-readable family name
  acuityWeights: Record<AcuityTier, number>;
  decaySteps: Record<AcuityTier, Array<{ afterMs: number; weight: number }>>;
  bufferDurations: Record<AcuityTier, number>;
}

interface DayResult {
  date: string;
  avgRatio: number;
  minRatio: number;
  avgNormRatio: number;
  minNormRatio: number;
  b2bHA: number;
  slams: number;
  giniCount: number;
  giniAcuity: number;
  countSpread: number;
  acuitySpread: number;
  loadMinutesSD: number;                  // routing-matched decay (condition's own scoringOv)
  normalizedLoadMinutesSD: number;
  loadMinutesSDFixed: number;             // fixed measurement decay = D6 (0.75x linear, 4:2:1)
  normalizedLoadMinutesSDFixed: number;
  // V3 ratio-cap diagnostics (per day; rolled up per condition)
  ratioClipCount: number;
  ratioSampleCount: number;
}

// ── Fixed measurement weights ────────────────────────────────────

const MEASUREMENT_WEIGHTS: Record<AcuityTier, number> = {
  tier_one: 5,
  tier_two: 4,
  tier_three: 3,
};

// ── Fixed routing config ─────────────────────────────────────────

const ROUTING_WEIGHTS = { t1: 4, t2: 2, t3: 1 };

// ── Capacity-ratio cap (V3) ──────────────────────────────────────
// V2 used `Infinity → 100` which only caught exact-zero loads. Near-zero
// decayed loads produced uncapped ratios in the thousands, contaminating
// Avg Ratio means for short-duration conditions (e.g. 357M).
// V3 uniformly caps at RATIO_CAP and reports clip rate per condition.
const RATIO_CAP = 1000;
const MIN_LOAD_EPSILON = 1e-6;

const BUFFERS_ON: Record<AcuityTier, number> = {
  tier_one: 35 * 60 * 1000,
  tier_two: 25 * 60 * 1000,
  tier_three: 15 * 60 * 1000,
};

// ── Reference decay schedule for normalized ratios ───────────────
// 1.0x Stepped (D7 / current production schedule) used as common yardstick
// so capacity ratios are comparable across duration levels.

const REFERENCE_DECAY: Record<AcuityTier, Array<{ afterMs: number; weight: number }>> = {
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

// ── Helper functions ─────────────────────────────────────────────

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

// ── Census loading ───────────────────────────────────────────────

function loadCensusData(): { all: HistoricalArrival[]; excludedCount: number; totalCount: number } {
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
  const colAdmit = findCol(['is_admitted', 'admitted', 'isadmitted']);
  const colDispo = findCol(['ed_disposition', 'disposition', 'dispo']);
  const colDoorDispo = findCol(['door_to_dispo', 'doortodispo']);
  const colEdLos = findCol(['ed_los', 'edlos', 'los_min']);

  if (!colArrival || !colTeam) {
    throw new Error(`Missing required columns. Found: ${keys.join(', ')}`);
  }

  console.log(`  Columns: arrival=${colArrival}, team=${colTeam}, esi=${colEsi}, source=${colSource}`);

  let excludedCount = 0;
  const arrivals: HistoricalArrival[] = [];

  for (const row of rows) {
    const rawArrival = row[colArrival];
    let arrivalMs: number;
    if (typeof rawArrival === 'number') {
      arrivalMs = excelDateToMs(rawArrival);
    } else if (rawArrival instanceof Date) {
      arrivalMs = rawArrival.getTime();
    } else if (typeof rawArrival === 'string') {
      arrivalMs = new Date(rawArrival).getTime();
    } else {
      continue;
    }
    if (isNaN(arrivalMs)) continue;

    const teamId = parseTeamId(String(row[colTeam] ?? ''));
    if (!teamId) continue;

    const source = String(row[colSource] ?? '').toLowerCase();
    if (source === 'trauma' || source === 'both') {
      excludedCount++;
      continue;
    }
    if (teamId === 4) {
      excludedCount++;
      continue;
    }

    const rawEsi = row[colEsi ?? ''];
    const esi = typeof rawEsi === 'number' ? rawEsi : (rawEsi ? parseInt(String(rawEsi)) : null);
    const validEsi = esi && esi >= 1 && esi <= 5 ? esi : null;

    const isAdmitted = row[colAdmit ?? ''] === 1 || row[colAdmit ?? ''] === true || row[colAdmit ?? ''] === '1';
    const disposition = String(row[colDispo ?? ''] ?? '');
    const doorToDispoMin = colDoorDispo && typeof row[colDoorDispo] === 'number' ? row[colDoorDispo] : null;
    const edLosMin = colEdLos && typeof row[colEdLos] === 'number' ? row[colEdLos] : null;

    const d = new Date(arrivalMs);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    arrivals.push({
      arrivalTime: arrivalMs,
      date: dateStr,
      hour: d.getHours(),
      esi: validEsi,
      acuity: esiToTier(validEsi),
      actualTeam: teamId as TeamId,
      isAdmitted,
      disposition,
      doorToDispoMin,
      edLosMin,
    });
  }

  arrivals.sort((a, b) => a.arrivalTime - b.arrivalTime);
  return { all: arrivals, excludedCount, totalCount: rows.length };
}

// ── Schedule loading ─────────────────────────────────────────────

interface ScheduleFile {
  filename: string;
  days: DaySchedule[];
}

function loadScheduleFile(filePath: string): ScheduleFile {
  const buf = readFileSync(filePath);
  const parsed = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { filename: basename(filePath), days: parsed.days };
}

function loadAllSchedules(): { scheduleMap: Map<string, DaySchedule>; fileCount: number; dayCount: number } {
  const scheduleFiles: ScheduleFile[] = [];

  for (const dir of [SCHEDULE_DIR_1, SCHEDULE_DIR_2]) {
    if (!existsSync(dir)) {
      console.warn(`  Warning: schedule directory not found: ${dir}`);
      continue;
    }
    for (const file of readdirSync(dir).sort()) {
      if (file.endsWith('.xlsx') && !file.startsWith('~$') && !file.includes('demo-schedule')) {
        scheduleFiles.push(loadScheduleFile(join(dir, file)));
      }
    }
  }

  console.log(`  Loaded ${scheduleFiles.length} schedule files`);

  const scheduleMap = new Map<string, DaySchedule>();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  for (const sf of scheduleFiles) {
    for (const day of sf.days) {
      if (day.providers.length === 0) continue;

      const parts = day.date.match(/^(\w+)\s+(\d+)$/);
      if (!parts) continue;
      const monthName = parts[1];
      const dayNum = parseInt(parts[2]);
      const monthIdx = monthNames.indexOf(monthName);
      if (monthIdx === -1) continue;

      const year = monthIdx === 11 ? 2025 : 2026;
      const isoDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

      scheduleMap.set(isoDate, day);
    }
  }

  console.log(`  Schedule coverage: ${scheduleMap.size} days mapped`);
  return { scheduleMap, fileCount: scheduleFiles.length, dayCount: scheduleMap.size };
}

// ── Provider helpers ─────────────────────────────────────────────

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

// ── Gini coefficient ─────────────────────────────────────────────

function gini(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const m = sorted.reduce((a, b) => a + b, 0) / n;
  if (m === 0) return 0;
  let sumAbsDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumAbsDiff += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return sumAbsDiff / (2 * n * n * m);
}

// ── Back-to-back high-acuity detection ───────────────────────────

const B2B_WINDOW_MS = 30 * 60 * 1000;

function countBackToBackHA(entries: ReplayEntry[]): number {
  let count = 0;
  const lastHA: Record<number, number> = {};

  for (const e of entries) {
    if (e.acuity === 'tier_one' || e.acuity === 'tier_two') {
      const prev = lastHA[e.teamId];
      if (prev !== undefined && (e.arrivalTime - prev) <= B2B_WINDOW_MS) {
        count++;
      }
      lastHA[e.teamId] = e.arrivalTime;
    }
  }
  return count;
}

// ── Slams: 2+ patients to same team within 1 hour ───────────────

const SLAM_WINDOW_MS = 60 * 60 * 1000;

function countSlams(entries: ReplayEntry[]): number {
  let count = 0;
  const teamTimes: Record<number, number[]> = {};

  for (const e of entries) {
    const times = teamTimes[e.teamId] ?? [];
    for (const prev of times) {
      if (e.arrivalTime - prev <= SLAM_WINDOW_MS) {
        count++;
        break;
      }
    }
    times.push(e.arrivalTime);
    teamTimes[e.teamId] = times;
  }
  return count;
}

// ── Team spread ──────────────────────────────────────────────────

function teamSpread(counts: Record<number, number>, eligibleTeams: TeamId[]): number {
  const vals = eligibleTeams.map(t => counts[t] ?? 0);
  if (vals.length === 0) return 0;
  return Math.max(...vals) - Math.min(...vals);
}

// ── Statistics ───────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function variance(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

function cohenD(a: number[], b: number[]): number {
  const pooledSD = Math.sqrt((variance(a) + variance(b)) / 2);
  return pooledSD === 0 ? 0 : (mean(a) - mean(b)) / pooledSD;
}

function pairedTTest(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 1;
  const diffs = a.map((v, i) => v - b[i]);
  const dMean = mean(diffs);
  const dVar = diffs.reduce((s, d) => s + (d - dMean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(dVar / n);
  if (se === 0) return dMean === 0 ? 1 : 0;
  const t = dMean / se;
  const df = n - 1;
  const p = 2 * tCDF(-Math.abs(t), df);
  return Math.max(0, Math.min(1, p));
}

function tCDF(t: number, df: number): number {
  const x = df / (df + t * t);
  if (t >= 0) return 1 - 0.5 * incompleteBeta(x, df / 2, 0.5);
  return 0.5 * incompleteBeta(x, df / 2, 0.5);
}

function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);
  let f = 1, c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d; f = d;
  for (let m = 1; m <= 200; m++) {
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= d * c;
    num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= d * c;
    if (Math.abs(d * c - 1) < 1e-10) break;
  }
  return front * f / a;
}

function lgamma(z: number): number {
  const g = 7;
  const coef = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) x += coef[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// Standard normal CDF (Abramowitz & Stegun 7.1.26). Accurate to ~7.5e-8.
function normalCDF(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

// Wilcoxon signed-rank test (two-sided) using normal approximation with
// tie-average ranks. Replaces paired t-test for V3 because day-level ratio
// distributions are skewed. Caveat: with many zero-differences or heavy ties
// (B2B HA/day, Slams/day), p-values can be slightly anti-conservative — see
// markdown pairwise preamble.
function wilcoxonSignedRank(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 1;
  const rawDiffs: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    if (d !== 0) rawDiffs.push(d);
  }
  const m = rawDiffs.length;
  if (m === 0) return 1;
  const absRanked = rawDiffs
    .map((d, i) => ({ abs: Math.abs(d), sign: Math.sign(d), i }))
    .sort((x, y) => x.abs - y.abs);
  const ranks = new Array<number>(m);
  let i = 0;
  while (i < m) {
    let j = i;
    while (j + 1 < m && absRanked[j + 1].abs === absRanked[i].abs) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }
  let W = 0;
  for (let k = 0; k < m; k++) W += absRanked[k].sign * ranks[k];
  const sigmaW = Math.sqrt(m * (m + 1) * (2 * m + 1) / 6);
  if (sigmaW === 0) return W === 0 ? 1 : 0;
  const z = W / sigmaW;
  const p = 2 * (1 - normalCDF(Math.abs(z)));
  return Math.max(0, Math.min(1, p));
}

// Benjamini-Hochberg step-up. Returns boolean[] aligned to input order,
// true = significant at FDR = alpha. Applied within a metric × comparison-family
// group (shape-effect, duration-effect, or vs-Actual).
function benjaminiHochberg(pvals: number[], alpha = 0.05): boolean[] {
  const n = pvals.length;
  const significant = new Array<boolean>(n).fill(false);
  if (n === 0) return significant;
  const indexed = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  let maxK = -1;
  for (let k = 0; k < n; k++) {
    if (indexed[k].p <= ((k + 1) / n) * alpha) maxK = k;
  }
  for (let k = 0; k <= maxK; k++) significant[indexed[k].i] = true;
  return significant;
}

// Capture git state for the reproducibility footer. No new dependency — uses
// execSync from child_process. Returns 'unknown' on failure (e.g. if git not
// present, which shouldn't happen but shouldn't crash the benchmark either).
function captureGitProvenance(): { sha: string; dirty: boolean; modifiedFiles: string[] } {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: PROJECT_ROOT }).toString().trim();
    // Do not .trim() — porcelain lines for unstaged modifications start with a
    // leading space that carries status semantics (" M file"). Strip the
    // trailing newline instead, then parse the XY status + filename per line.
    const statusRaw = execSync('git status --porcelain', { cwd: PROJECT_ROOT }).toString().replace(/\n+$/, '');
    const modifiedFiles = statusRaw ? statusRaw.split('\n').map(l => l.slice(3)) : [];
    return { sha, dirty: modifiedFiles.length > 0, modifiedFiles };
  } catch {
    return { sha: 'unknown', dirty: true, modifiedFiles: ['(git not available)'] };
  }
}

// ── Formatting helpers ───────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function rpad(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}

function fmt(v: number, dec = 1): string {
  return v.toFixed(dec);
}

// ── Build decay schedules ────────────────────────────────────────

// Continuous log back-loaded decay: w(t) = W0 * ln(1 + k(1 - t/T)) / ln(1 + k).
// At t=0 returns W0; at t=T returns 0 exactly (no epsilon floor).
// Larger k = more back-loaded (weight sustained longer before collapse).
export function logBackLoadedWeight(W0: number, tMs: number, TMs: number, k: number): number {
  if (tMs <= 0) return W0;
  if (tMs >= TMs) return 0;
  const frac = 1 - tMs / TMs;
  return W0 * Math.log(1 + k * frac) / Math.log(1 + k);
}

// Sample logBackLoadedWeight at 15-min grid into decaySteps.
// Engine does piecewise-linear interp between samples, so density must be high
// enough that PL approximation tracks the true curve. Endpoint is pinned to 0.
export function buildLogBackSteps(W0: number, zeroMin: number, k: number): Array<{ afterMs: number; weight: number }> {
  const STEP_MIN = 15;
  const steps: Array<{ afterMs: number; weight: number }> = [];
  const numSteps = Math.floor(zeroMin / STEP_MIN);
  const TMs = zeroMin * 60 * 1000;
  for (let i = 1; i <= numSteps; i++) {
    const tMs = i * STEP_MIN * 60 * 1000;
    steps.push({ afterMs: tMs, weight: logBackLoadedWeight(W0, tMs, TMs, k) });
  }
  const last = steps[steps.length - 1];
  if (!last || last.afterMs !== TMs) {
    steps.push({ afterMs: TMs, weight: 0 });
  } else {
    last.weight = 0;
  }
  return steps;
}

export function buildDecaySchedule(
  weights: { t1: number; t2: number; t3: number },
  multiplier: number,
  shape: 'stepped' | 'direct' | 'linear' | 'logBack',
  logBackK?: number,
): Record<AcuityTier, Array<{ afterMs: number; weight: number }>> {
  const ms = (min: number) => min * 60 * 1000;
  const { t1, t2, t3 } = weights;

  // Base zero-out times (from current schedule)
  const zeroT1 = 240 * multiplier;
  const zeroT2 = 240 * multiplier;
  const zeroT3 = 120 * multiplier;

  if (shape === 'direct') {
    // Retained for historical/audit use. Note: single endpoint decays linearly to 0
    // under the engine's piecewise-linear interpolation — mathematically identical to 'linear'.
    // Not used in V3 (dropped from SHAPE_FAMILIES); see DECAY_SCHEDULE_BENCHMARK_RESULTS_V2.md.
    return {
      tier_one:   [{ afterMs: ms(zeroT1), weight: 0 }],
      tier_two:   [{ afterMs: ms(zeroT2), weight: 0 }],
      tier_three: [{ afterMs: ms(zeroT3), weight: 0 }],
    };
  }

  if (shape === 'stepped') {
    // Scale intermediate timepoints proportionally
    const step1T1 = 90 * multiplier;   // first step-down
    const step2T1 = 180 * multiplier;  // second step-down
    const step1T2 = 90 * multiplier;
    return {
      tier_one: [
        { afterMs: ms(step1T1), weight: t2 },
        { afterMs: ms(step2T1), weight: t3 },
        { afterMs: ms(zeroT1), weight: 0 },
      ],
      tier_two: [
        { afterMs: ms(step1T2), weight: t3 },
        { afterMs: ms(zeroT2), weight: 0 },
      ],
      tier_three: [
        { afterMs: ms(zeroT3), weight: 0 },
      ],
    };
  }

  if (shape === 'linear') {
    // 15-minute granularity steps from initial weight to 0
    const STEP_MIN = 15;
    const buildLinear = (initialWeight: number, zeroMin: number) => {
      const steps: Array<{ afterMs: number; weight: number }> = [];
      const numSteps = Math.floor(zeroMin / STEP_MIN);
      for (let i = 1; i <= numSteps; i++) {
        const t = i * STEP_MIN;
        const w = initialWeight * (1 - i / numSteps);
        steps.push({ afterMs: ms(t), weight: Math.max(0, w) });
      }
      return steps;
    };
    return {
      tier_one:   buildLinear(t1, zeroT1),
      tier_two:   buildLinear(t2, zeroT2),
      tier_three: buildLinear(t3, zeroT3),
    };
  }

  if (shape === 'logBack') {
    if (logBackK === undefined) {
      throw new Error('logBackK required when shape === logBack');
    }
    return {
      tier_one:   buildLogBackSteps(t1, zeroT1, logBackK),
      tier_two:   buildLogBackSteps(t2, zeroT2, logBackK),
      tier_three: buildLogBackSteps(t3, zeroT3, logBackK),
    };
  }

  throw new Error(`Unknown shape: ${shape}`);
}

// ── Build all 21 conditions (V3) ─────────────────────────────────

type DurationLevel = { multiplier: number; label: string };

// Shape families define the family × duration factorial. V3 drops Direct Drop
// (engine interpolation made it mathematically identical to Linear) and adds
// a log back-loaded family swept across k ∈ {1, 3, 9}.
type ShapeFamily = {
  key: string;                            // 'stepped' | 'linear' | 'logBack-k1' | ...
  label: string;                          // human-readable family name
  shape: 'stepped' | 'linear' | 'logBack';
  logBackK?: number;
};

const DURATION_LEVELS: DurationLevel[] = [
  { multiplier: 0.5, label: '0.5x' },
  { multiplier: 0.75, label: '0.75x' },
  { multiplier: 1.0, label: '1.0x' },
  { multiplier: 1.5, label: '1.5x' },
];

const SHAPE_FAMILIES: ShapeFamily[] = [
  { key: 'stepped',    label: 'Stepped',     shape: 'stepped' },
  { key: 'linear',     label: 'Linear',      shape: 'linear'  },
  { key: 'logBack-k1', label: 'LogBack k=1', shape: 'logBack', logBackK: 1 },
  { key: 'logBack-k3', label: 'LogBack k=3', shape: 'logBack', logBackK: 3 },
  { key: 'logBack-k9', label: 'LogBack k=9', shape: 'logBack', logBackK: 9 },
];

function buildAllConditions(): DecayCondition[] {
  const conditions: DecayCondition[] = [];
  let idx = 1;

  const acuityWeights: Record<AcuityTier, number> = {
    tier_one: ROUTING_WEIGHTS.t1,
    tier_two: ROUTING_WEIGHTS.t2,
    tier_three: ROUTING_WEIGHTS.t3,
  };

  for (const dur of DURATION_LEVELS) {
    for (const fam of SHAPE_FAMILIES) {
      const decaySteps = buildDecaySchedule(ROUTING_WEIGHTS, dur.multiplier, fam.shape, fam.logBackK);
      conditions.push({
        id: `D${idx}`,
        label: `${dur.label} ${fam.label}`,
        mode: 'formula',
        durationMultiplier: dur.multiplier,
        shape: fam.shape,
        logBackK: fam.logBackK,
        familyKey: fam.key,
        familyLabel: fam.label,
        acuityWeights,
        decaySteps,
        bufferDurations: BUFFERS_ON,
      });
      idx++;
    }
  }

  // Actual baseline
  conditions.push({
    id: 'A1',
    label: 'Actual',
    mode: 'actual',
    durationMultiplier: 1.0,
    shape: 'stepped',
    familyKey: 'actual',
    familyLabel: 'Actual',
    acuityWeights: { ...ACUITY_WEIGHTS },
    decaySteps: { ...ACUITY_DECAY },
    bufferDurations: { tier_one: 0, tier_two: 0, tier_three: 0 },
  });

  return conditions;
}

// ── Build ScoringOverrides from a condition ──────────────────────

function conditionToOverrides(cond: DecayCondition): ScoringOverrides {
  const base = getDefaultOverrides();
  return {
    capacityWeights: base.capacityWeights,
    statusMultipliers: base.statusMultipliers,
    acuityWeights: cond.acuityWeights,
    decaySteps: cond.decaySteps,
    bufferDurations: cond.bufferDurations,
  };
}

// ── Replay one day for one condition ─────────────────────────────

function replayDay(
  arrivals: HistoricalArrival[],
  day: DaySchedule,
  eligibleTeams: TeamId[],
  condition: DecayCondition,
): DayResult {
  const scoringOv = conditionToOverrides(condition);
  const referenceOv: ScoringOverrides = {
    capacityWeights: scoringOv.capacityWeights,
    statusMultipliers: scoringOv.statusMultipliers,
    acuityWeights: { tier_one: 4, tier_two: 2, tier_three: 1 },
    decaySteps: REFERENCE_DECAY,
    bufferDurations: BUFFERS_ON,
  };
  const closedTeams: Record<number, number> = {};

  let patients: Patient[] = [];
  let buffers: Buffer[] = [];
  const entries: ReplayEntry[] = [];
  let ratioClipCount = 0;
  let ratioSampleCount = 0;

  for (let i = 0; i < arrivals.length; i++) {
    const arr = arrivals[i];
    const now = arr.arrivalTime;
    const hourOfDay = arr.hour;

    const { providers: scheduledProviders } = getProvidersForShift(day, hourOfDay);
    const simProviders = toProviders(scheduledProviders);

    let teamId: TeamId;

    if (condition.mode === 'actual') {
      teamId = arr.actualTeam;
    } else {
      // formula
      buffers = buffers.filter(b => b.expiresAt > now);
      const rec = getRecommendation(simProviders, patients, buffers, now, closedTeams, scoringOv, undefined);
      teamId = rec.first ?? eligibleTeams[0];
    }

    // Score at assignment time — condition ratio (engine's own view).
    // V3 ratio cap: uniform clamp at RATIO_CAP with epsilon-floored denominator.
    const score = scoreTeam(teamId, simProviders, patients, buffers, now, scoringOv);
    const rawRatio = score.capacity / Math.max(score.load, MIN_LOAD_EPSILON);
    const clipped = rawRatio > RATIO_CAP;
    const ratio = Math.min(rawRatio, RATIO_CAP);
    ratioClipCount += clipped ? 1 : 0;
    ratioSampleCount += 1;

    // Normalized ratio — common yardstick using reference decay (1.0x stepped).
    // No clip tracking on the normalized path — clip rate is per-condition diagnostic.
    const normScore = scoreTeam(teamId, simProviders, patients, buffers, now, referenceOv);
    const rawNormRatio = normScore.capacity / Math.max(normScore.load, MIN_LOAD_EPSILON);
    const normRatio = Math.min(rawNormRatio, RATIO_CAP);

    const patient: Patient = {
      id: `${condition.id}-${String(i + 1).padStart(3, '0')}`,
      acuity: arr.acuity,
      assignedTeamId: teamId,
      assignedAt: now,
    };

    // Buffer merge logic (formula only, buffers always on for formula conditions)
    if (condition.mode !== 'actual') {
      const newBuffer = createBuffer(teamId, arr.acuity, now, scoringOv);
      const existingTeamBuffers = buffers.filter(b => b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId);
      const otherBuffers = buffers.filter(b => !(b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId));
      if (existingTeamBuffers.length > 0) {
        const allBufs = [...existingTeamBuffers, newBuffer];
        const currentExpiry = Math.max(...existingTeamBuffers.map(b => b.expiresAt));
        const newDuration = newBuffer.expiresAt - newBuffer.createdAt;
        const latestExpiry = Math.max(currentExpiry, now) + newDuration;
        const tierRank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
        const bestTier = allBufs.reduce((best, b) => tierRank[b.tier] < tierRank[best.tier] ? b : best).tier;
        const totalCount = allBufs.reduce((sum, b) => sum + (b.mergedCount ?? 1), 0);
        buffers = [...otherBuffers, {
          id: newBuffer.id, teamId, tier: bestTier,
          createdAt: Math.min(...allBufs.map(b => b.createdAt)),
          expiresAt: latestExpiry, mergedCount: totalCount,
        }];
      } else {
        buffers = [...buffers, newBuffer];
      }
    }

    patients = [...patients, patient];
    entries.push({ arrivalIndex: i, arrivalTime: now, acuity: arr.acuity, teamId, ratioAtAssignment: ratio, normalizedRatioAtAssignment: normRatio });
  }

  // Compute the 10 metrics
  const ratios = entries.map(e => e.ratioAtAssignment);
  const avgRatio = ratios.length > 0 ? mean(ratios) : 0;
  const minRatio = ratios.length > 0 ? Math.min(...ratios) : 0;
  const normRatios = entries.map(e => e.normalizedRatioAtAssignment);
  const avgNormRatio = normRatios.length > 0 ? mean(normRatios) : 0;
  const minNormRatio = normRatios.length > 0 ? Math.min(...normRatios) : 0;
  const b2bHA = countBackToBackHA(entries);
  const slams = countSlams(entries);

  // Gini on raw counts
  const counts: Record<number, number> = {};
  for (const t of eligibleTeams) counts[t] = 0;
  for (const e of entries) counts[e.teamId] = (counts[e.teamId] ?? 0) + 1;
  const countVals = eligibleTeams.map(t => counts[t] ?? 0);
  const giniCount = gini(countVals);
  const countSpread = countVals.length > 0 ? Math.max(...countVals) - Math.min(...countVals) : 0;

  // Gini on MEASUREMENT_WEIGHTS-weighted loads
  const acuityLoads: Record<number, number> = {};
  for (const t of eligibleTeams) acuityLoads[t] = 0;
  for (const e of entries) {
    acuityLoads[e.teamId] = (acuityLoads[e.teamId] ?? 0) + MEASUREMENT_WEIGHTS[e.acuity];
  }
  const acuityLoadValues = eligibleTeams.map(t => acuityLoads[t] ?? 0);
  const giniAcuity = gini(acuityLoadValues);
  const acuitySpread = acuityLoadValues.length > 0 ? Math.max(...acuityLoadValues) - Math.min(...acuityLoadValues) : 0;

  // ── Load-minutes: integrate acuity-weighted load and capacity across the shift ──
  // Routing-matched: uses this condition's own scoringOv (retained for transparency; mechanically
  // scales with decay duration). Fixed-measurement: uses D6 (0.75x linear, 4:2:1) as a common yardstick
  // across all conditions so variation reflects routing choice rather than integrand magnitude.
  const { loadMinutesSD, normalizedLoadMinutesSD } = computeLoadMinutesSDs(
    patients, arrivals, day, eligibleTeams, scoringOv,
  );
  const { loadMinutesSD: loadMinutesSDFixed, normalizedLoadMinutesSD: normalizedLoadMinutesSDFixed } = computeLoadMinutesSDs(
    patients, arrivals, day, eligibleTeams, MEASUREMENT_OV,
  );

  return {
    date: arrivals[0]?.date ?? '',
    avgRatio,
    minRatio,
    avgNormRatio,
    minNormRatio,
    b2bHA,
    slams,
    giniCount,
    giniAcuity,
    countSpread,
    acuitySpread,
    loadMinutesSD,
    normalizedLoadMinutesSD,
    loadMinutesSDFixed,
    normalizedLoadMinutesSDFixed,
    ratioClipCount,
    ratioSampleCount,
  };
}

// Fixed-measurement ScoringOverrides: D6 (0.75x linear, 4:2:1 weights).
// Used for load-minutes post-measurement so all 13 conditions are integrated on the same yardstick,
// decoupling routing decay from measurement decay.
const MEASUREMENT_OV: ScoringOverrides = (() => {
  const base = getDefaultOverrides();
  const aw: Record<AcuityTier, number> = {
    tier_one: ROUTING_WEIGHTS.t1,
    tier_two: ROUTING_WEIGHTS.t2,
    tier_three: ROUTING_WEIGHTS.t3,
  };
  return {
    capacityWeights: base.capacityWeights,
    statusMultipliers: base.statusMultipliers,
    acuityWeights: aw,
    decaySteps: buildDecaySchedule(ROUTING_WEIGHTS, 0.75, 'linear'),
    bufferDurations: BUFFERS_ON,
  };
})();

function computeLoadMinutesSDs(
  patients: Patient[],
  arrivals: HistoricalArrival[],
  day: DaySchedule,
  eligibleTeams: TeamId[],
  scoringOv: ScoringOverrides,
): { loadMinutesSD: number; normalizedLoadMinutesSD: number } {
  if (arrivals.length === 0 || patients.length === 0) return { loadMinutesSD: 0, normalizedLoadMinutesSD: 0 };
  const firstArrivalMs = arrivals[0].arrivalTime;
  const anchor = new Date(firstArrivalMs);
  const isThreeTeam = eligibleTeams.length >= 3;
  anchor.setHours(isThreeTeam ? 9 : 0, 0, 0, 0);
  const shiftStartMs = anchor.getTime();
  const shiftEndMs = shiftStartMs + (isThreeTeam ? 15 : 9) * 3_600_000;
  const windowStartMs = Math.min(firstArrivalMs, shiftStartMs);
  const STEP_MS = 60_000;

  const loadMins: Record<number, number> = {};
  const capMins: Record<number, number> = {};
  for (const t of eligibleTeams) { loadMins[t] = 0; capMins[t] = 0; }

  for (let now = windowStartMs; now < shiftEndMs; now += STEP_MS) {
    const hourOfDay = new Date(now).getHours();
    const { providers: scheduledProviders } = getProvidersForShift(day, hourOfDay);
    const simProviders = toProviders(scheduledProviders);
    for (const team of eligibleTeams) {
      let load = 0;
      for (const p of patients) {
        if (p.assignedTeamId !== team) continue;
        if (p.assignedAt > now) continue;
        load += getDecayedAcuityWeight(p, now, scoringOv);
      }
      loadMins[team] += load;
      const teamProviders = simProviders.filter(p => p.teamId === team);
      capMins[team] += getEffectiveCapacity(teamProviders, now, scoringOv);
    }
  }

  const loadVals = eligibleTeams.map(t => loadMins[t]);
  const normVals = eligibleTeams.map(t => capMins[t] > 0 ? loadMins[t] / capMins[t] : 0);
  return { loadMinutesSD: sdLM(loadVals), normalizedLoadMinutesSD: sdLM(normVals) };
}

function sdLM(a: number[]): number {
  if (a.length === 0) return 0;
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(80));
  console.log('  DECAY SCHEDULE BENCHMARK — Duration x Shape Sensitivity Analysis');
  console.log('='.repeat(80));
  console.log();

  // Load data
  console.log('Loading data...');
  const { all: allArrivals, excludedCount, totalCount } = loadCensusData();
  console.log(`  ${allArrivals.length} A-side arrivals (${excludedCount} trauma/team4 excluded from ${totalCount} total)`);

  const { scheduleMap, fileCount, dayCount } = loadAllSchedules();

  // Group arrivals by date
  const byDate = new Map<string, HistoricalArrival[]>();
  for (const a of allArrivals) {
    const arr = byDate.get(a.date) ?? [];
    arr.push(a);
    byDate.set(a.date, arr);
  }

  // Find three-team days (hour 9-23 filter)
  const threeTeamDates: string[] = [];
  for (const [date, dayArrivals] of byDate) {
    const schedule = scheduleMap.get(date);
    if (!schedule) continue;

    const filtered = dayArrivals.filter(a => a.hour >= 9 && a.hour <= 23);
    if (filtered.length === 0) continue;

    const teamsWithProviders = new Set<number>();
    for (let h = 9; h <= 23; h++) {
      const { providers } = getProvidersForShift(schedule, h);
      for (const p of providers) {
        if (p.teamId !== 4) teamsWithProviders.add(p.teamId);
      }
    }

    if (teamsWithProviders.size === 3) {
      threeTeamDates.push(date);
    }
  }

  threeTeamDates.sort();
  console.log(`\n  Three-team days: ${threeTeamDates.length}`);

  // Build conditions
  const conditions = buildAllConditions();
  console.log(`  Conditions: ${conditions.length}`);
  console.log(`  Total replay passes: ${conditions.length * threeTeamDates.length}`);

  // Print condition summary
  console.log('\n  Condition matrix:');
  for (const c of conditions) {
    if (c.mode === 'actual') {
      console.log(`    ${c.id}: ${c.label}`);
    } else {
      const t1Steps = c.decaySteps.tier_one;
      const t3Steps = c.decaySteps.tier_three;
      const t1Summary = t1Steps.length <= 3
        ? `4${t1Steps.map(s => `->${s.weight}@${Math.round(s.afterMs/60000)}m`).join('')}`
        : `4->...->0@${Math.round(t1Steps[t1Steps.length - 1].afterMs/60000)}m`;
      const t3Summary = `1->0@${Math.round(t3Steps[t3Steps.length - 1].afterMs/60000)}m`;
      console.log(`    ${c.id}: ${pad(c.label, 16)} T1: ${pad(t1Summary, 30)} T3: ${t3Summary}`);
    }
  }

  // Run replay for each condition on each date
  const allResults: Map<string, DayResult[]> = new Map();
  for (const cond of conditions) {
    allResults.set(cond.id, []);
  }

  const startTime = Date.now();
  let passCount = 0;

  for (const date of threeTeamDates) {
    const dayArrivals = (byDate.get(date) ?? []).filter(a => a.hour >= 9 && a.hour <= 23);
    const schedule = scheduleMap.get(date)!;

    const teamsWithProviders = new Set<number>();
    for (let h = 9; h <= 23; h++) {
      const { providers } = getProvidersForShift(schedule, h);
      for (const p of providers) {
        if (p.teamId !== 4) teamsWithProviders.add(p.teamId);
      }
    }
    const eligibleTeams = [...teamsWithProviders].sort() as TeamId[];

    for (const cond of conditions) {
      const result = replayDay(dayArrivals, schedule, eligibleTeams, cond);
      allResults.get(cond.id)!.push(result);
      passCount++;
    }

    if (passCount % (conditions.length * 10) === 0) {
      process.stdout.write(`\r  Progress: ${Math.round(passCount / (conditions.length * threeTeamDates.length) * 100)}%`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\r  Completed ${passCount} replay passes in ${elapsed}s`);

  // ── Compute means and stddevs per condition ────────────────────

  type MetricKey = keyof Omit<DayResult, 'date' | 'ratioClipCount' | 'ratioSampleCount'>;
  // "D6 meas." refers to the V2 D6 schedule (0.75x linear, 4:2:1), pinned by
  // construction via MEASUREMENT_OV. This column label stays stable even as V3
  // condition IDs no longer include a condition labelled D6 — it's a proper noun
  // referring to the measurement schedule, not a condition identifier.
  const METRICS: { key: MetricKey; label: string; dec: number; lowerBetter: boolean }[] = [
    { key: 'avgRatio',      label: 'Avg Ratio',             dec: 1, lowerBetter: false },
    { key: 'minRatio',      label: 'Min Ratio',             dec: 1, lowerBetter: false },
    { key: 'avgNormRatio',  label: 'Norm Avg Ratio',        dec: 1, lowerBetter: false },
    { key: 'minNormRatio',  label: 'Norm Min Ratio',        dec: 1, lowerBetter: false },
    { key: 'b2bHA',         label: 'B2B HA/day',            dec: 1, lowerBetter: true },
    { key: 'slams',         label: 'Slams/day',             dec: 1, lowerBetter: true },
    { key: 'giniCount',     label: 'Gini (count)',          dec: 3, lowerBetter: true },
    { key: 'giniAcuity',    label: 'Gini (acuity 5:4:3)',   dec: 3, lowerBetter: true },
    { key: 'countSpread',   label: 'Count Spread',          dec: 1, lowerBetter: true },
    { key: 'acuitySpread',  label: 'Acuity Spread',         dec: 1, lowerBetter: true },
    { key: 'loadMinutesSD', label: 'LM SD (routing decay)', dec: 1, lowerBetter: true },
    { key: 'normalizedLoadMinutesSD', label: 'Norm LM SD (routing)', dec: 4, lowerBetter: true },
    { key: 'loadMinutesSDFixed', label: 'LM SD (D6 meas.)', dec: 1, lowerBetter: true },
    { key: 'normalizedLoadMinutesSDFixed', label: 'Norm LM SD (D6 meas.)', dec: 4, lowerBetter: true },
  ];

  const condMeans: Map<string, Record<MetricKey, number>> = new Map();
  const condStddevs: Map<string, Record<MetricKey, number>> = new Map();
  // V3 clip-rate rollup: diagnostic, not a METRICS entry.
  const condClipRate: Map<string, number> = new Map();
  for (const cond of conditions) {
    const results = allResults.get(cond.id)!;
    const means: Record<string, number> = {};
    const sds: Record<string, number> = {};
    for (const m of METRICS) {
      const vals = results.map(r => r[m.key]);
      means[m.key] = mean(vals);
      sds[m.key] = stddev(vals);
    }
    condMeans.set(cond.id, means as Record<MetricKey, number>);
    condStddevs.set(cond.id, sds as Record<MetricKey, number>);

    const totalClips = results.reduce((s, r) => s + r.ratioClipCount, 0);
    const totalSamples = results.reduce((s, r) => s + r.ratioSampleCount, 0);
    condClipRate.set(cond.id, totalSamples > 0 ? totalClips / totalSamples : 0);
  }

  // ── Print console table ────────────────────────────────────────

  console.log(`\n${'='.repeat(120)}`);
  console.log('  RESULTS (mean across days, * = best)');
  console.log('='.repeat(120));

  // Column order: D1-D20 grouped by duration, then A1
  const formulaIds = conditions.filter(c => c.mode === 'formula').map(c => c.id);
  const colOrder = [...formulaIds, 'A1'];

  const COL_W = 8;
  const LABEL_W = 22;
  const familyAbbr = (key: string): string => {
    if (key === 'stepped') return 'Step';
    if (key === 'linear') return 'Lin';
    if (key === 'logBack-k1') return 'LBk1';
    if (key === 'logBack-k3') return 'LBk3';
    if (key === 'logBack-k9') return 'LBk9';
    return key.slice(0, 4);
  };

  // Header row 1: duration group labels (each covers |SHAPE_FAMILIES| columns)
  let header1 = pad('', LABEL_W);
  for (const dur of DURATION_LEVELS) {
    const groupW = COL_W * SHAPE_FAMILIES.length;
    const label = `-- ${dur.label} --`;
    const leftPad = Math.floor((groupW - label.length) / 2);
    header1 += ' '.repeat(Math.max(0, leftPad)) + label + ' '.repeat(Math.max(0, groupW - leftPad - label.length));
  }
  header1 += pad('', COL_W);
  console.log(header1);

  // Header row 2: shape family labels
  let header2 = pad('Metric', LABEL_W);
  for (const _dur of DURATION_LEVELS) {
    for (const fam of SHAPE_FAMILIES) {
      header2 += rpad(familyAbbr(fam.key), COL_W);
    }
  }
  header2 += rpad('Act', COL_W);
  console.log(header2);
  console.log('-'.repeat(LABEL_W + COL_W * colOrder.length));

  // Data rows
  for (const m of METRICS) {
    const allVals = colOrder.map(id => condMeans.get(id)![m.key]);
    const bestVal = m.lowerBetter ? Math.min(...allVals) : Math.max(...allVals);

    let row = pad(m.label, LABEL_W);
    for (const id of colOrder) {
      const v = condMeans.get(id)![m.key];
      let cell = fmt(v, m.dec);
      if (v === bestVal) cell += '*';
      row += rpad(cell, COL_W);
    }
    console.log(row);
  }

  // Clip rate diagnostic row (separate from METRICS since not a routing-quality metric)
  let clipRow = pad('Clip Rate (%)', LABEL_W);
  for (const id of colOrder) {
    const rate = condClipRate.get(id) ?? 0;
    const flag = rate > 0.05 ? '!' : '';
    clipRow += rpad(`${fmt(rate * 100, 2)}${flag}`, COL_W);
  }
  console.log(clipRow);

  // ── Best in class summary ──────────────────────────────────────

  console.log(`\n${'='.repeat(80)}`);
  console.log('  BEST IN CLASS (top 3 per metric)');
  console.log('='.repeat(80));

  for (const m of METRICS) {
    const ranked = colOrder
      .map(id => {
        const cond = conditions.find(c => c.id === id)!;
        return { id, label: cond.label, val: condMeans.get(id)![m.key] };
      })
      .sort((a, b) => m.lowerBetter ? a.val - b.val : b.val - a.val);
    const top3 = ranked.slice(0, 3);
    console.log(`  ${m.label}:`);
    for (let i = 0; i < top3.length; i++) {
      console.log(`    ${i + 1}. ${pad(`${top3[i].id} (${top3[i].label})`, 24)} ${fmt(top3[i].val, m.dec)}`);
    }
  }

  // ── Statistical tests (V3: Wilcoxon signed-rank + BH correction) ──

  console.log(`\n${'='.repeat(80)}`);
  console.log('  STATISTICAL TESTS (Wilcoxon signed-rank + BH-corrected, with Cohen\'s d)');
  console.log('='.repeat(80));

  type ComparisonFamily = 'shape' | 'duration' | 'vs-actual';
  interface Comparison {
    a: string;
    b: string;
    label: string;
    family: ComparisonFamily;
  }

  const comparisons: Comparison[] = [];

  // 1. Shape effect: within each duration, all unordered family pairs.
  //    C(5,2)=10 pairs × 4 durations = 40 per metric.
  for (const dur of DURATION_LEVELS) {
    for (let i = 0; i < SHAPE_FAMILIES.length; i++) {
      for (let j = i + 1; j < SHAPE_FAMILIES.length; j++) {
        const a = conditions.find(c => c.durationMultiplier === dur.multiplier && c.familyKey === SHAPE_FAMILIES[i].key && c.mode === 'formula')!;
        const b = conditions.find(c => c.durationMultiplier === dur.multiplier && c.familyKey === SHAPE_FAMILIES[j].key && c.mode === 'formula')!;
        comparisons.push({
          a: a.id, b: b.id, family: 'shape',
          label: `shape: ${SHAPE_FAMILIES[i].label} vs ${SHAPE_FAMILIES[j].label} (${dur.label})`,
        });
      }
    }
  }

  // 2. Duration effect: within each family, all duration pairs.
  //    C(4,2)=6 pairs × 5 families = 30 per metric.
  for (const fam of SHAPE_FAMILIES) {
    for (let i = 0; i < DURATION_LEVELS.length; i++) {
      for (let j = i + 1; j < DURATION_LEVELS.length; j++) {
        const a = conditions.find(c => c.durationMultiplier === DURATION_LEVELS[i].multiplier && c.familyKey === fam.key && c.mode === 'formula')!;
        const b = conditions.find(c => c.durationMultiplier === DURATION_LEVELS[j].multiplier && c.familyKey === fam.key && c.mode === 'formula')!;
        comparisons.push({
          a: a.id, b: b.id, family: 'duration',
          label: `duration: ${DURATION_LEVELS[i].label} vs ${DURATION_LEVELS[j].label} (${fam.label})`,
        });
      }
    }
  }

  // 3. Formula vs Actual: 20 comparisons
  for (const cond of conditions) {
    if (cond.mode === 'formula') {
      comparisons.push({
        a: cond.id, b: 'A1', family: 'vs-actual',
        label: `${cond.label} vs Actual`,
      });
    }
  }

  interface PairwiseResult {
    condA: string;
    condB: string;
    metric: string;
    family: ComparisonFamily;
    delta: number;
    pValue: number;
    cohenD: number;
    bhSignificant: boolean;
  }
  const pairwiseResults: PairwiseResult[] = [];

  // Compute raw tests first, then apply BH within each (metric × family) bucket.
  for (const m of METRICS) {
    const rawForMetric: Array<{ comp: Comparison; p: number; d: number; delta: number }> = [];
    for (const comp of comparisons) {
      const aResults = allResults.get(comp.a)!;
      const bResults = allResults.get(comp.b)!;
      const aVals = aResults.map(r => r[m.key]);
      const bVals = bResults.map(r => r[m.key]);
      const p = wilcoxonSignedRank(aVals, bVals);
      const d = cohenD(aVals, bVals);
      const delta = mean(aVals) - mean(bVals);
      rawForMetric.push({ comp, p, d, delta });
    }

    // BH within each family for this metric
    const bhSigByIdx = new Array<boolean>(rawForMetric.length).fill(false);
    for (const fam of ['shape', 'duration', 'vs-actual'] as ComparisonFamily[]) {
      const idxs = rawForMetric.map((r, i) => ({ i, fam: r.comp.family })).filter(x => x.fam === fam).map(x => x.i);
      const pvs = idxs.map(i => rawForMetric[i].p);
      const sig = benjaminiHochberg(pvs, 0.05);
      for (let k = 0; k < idxs.length; k++) bhSigByIdx[idxs[k]] = sig[k];
    }

    const sigResults: string[] = [];
    for (let i = 0; i < rawForMetric.length; i++) {
      const r = rawForMetric[i];
      pairwiseResults.push({
        condA: r.comp.a, condB: r.comp.b, metric: m.key, family: r.comp.family,
        delta: r.delta, pValue: r.p, cohenD: r.d, bhSignificant: bhSigByIdx[i],
      });
      if (bhSigByIdx[i]) {
        const dir = r.delta > 0 ? '>' : '<';
        const pStr = r.p < 0.001 ? '<0.001' : r.p.toFixed(3);
        sigResults.push(`    ${r.comp.a} ${dir} ${r.comp.b}: D=${fmt(Math.abs(r.delta), m.dec)}, p=${pStr}, d=${fmt(Math.abs(r.d), 2)} [${r.comp.label}]`);
      }
    }

    if (sigResults.length > 0) {
      console.log(`\n  ${m.label}:`);
      for (const r of sigResults) console.log(r);
    }
  }

  // ── Robustness assessment ──────────────────────────────────────

  console.log(`\n${'='.repeat(80)}`);
  console.log('  ROBUSTNESS ASSESSMENT');
  console.log('='.repeat(80));

  console.log('\n  Range of formula conditions (min..max, % variation):');
  for (const m of METRICS) {
    const formulaVals = formulaIds.map(id => condMeans.get(id)![m.key]);
    const minVal = Math.min(...formulaVals);
    const maxVal = Math.max(...formulaVals);
    const midpoint = (minVal + maxVal) / 2;
    const pctVariation = midpoint === 0 ? 0 : ((maxVal - minVal) / midpoint) * 100;
    console.log(`    ${pad(m.label, 20)} ${fmt(minVal, m.dec)} .. ${fmt(maxVal, m.dec)}  (${fmt(pctVariation, 1)}% variation)`);
  }

  // ── Shape effect summary ───────────────────────────────────────

  console.log('\n  Shape effect (within each duration, best family per metric):');
  for (const m of METRICS) {
    const shapeBests: string[] = [];
    for (const dur of DURATION_LEVELS) {
      const shapeConds = conditions.filter(c => c.durationMultiplier === dur.multiplier && c.mode === 'formula');
      const ranked = shapeConds
        .map(c => ({ familyKey: c.familyKey, val: condMeans.get(c.id)![m.key] }))
        .sort((a, b) => m.lowerBetter ? a.val - b.val : b.val - a.val);
      shapeBests.push(`${dur.label}:${familyAbbr(ranked[0].familyKey)}`);
    }
    console.log(`    ${pad(m.label, 20)} ${shapeBests.join('  ')}`);
  }

  // ── Duration effect summary ────────────────────────────────────

  console.log('\n  Duration effect (within each family, best duration per metric):');
  for (const m of METRICS) {
    const durBests: string[] = [];
    for (const fam of SHAPE_FAMILIES) {
      const durConds = conditions.filter(c => c.familyKey === fam.key && c.mode === 'formula');
      const ranked = durConds
        .map(c => ({ dur: c.durationMultiplier, val: condMeans.get(c.id)![m.key] }))
        .sort((a, b) => m.lowerBetter ? a.val - b.val : b.val - a.val);
      durBests.push(`${familyAbbr(fam.key)}:${ranked[0].dur}x`);
    }
    console.log(`    ${pad(m.label, 20)} ${durBests.join('  ')}`);
  }

  // ── Generate markdown results file (V3) ────────────────────────

  const totalEncounters = threeTeamDates.reduce((sum, d) => sum + (byDate.get(d) ?? []).filter(a => a.hour >= 9 && a.hour <= 23).length, 0);

  const runDate = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const timestampSlug = `${runDate.getFullYear()}${pad2(runDate.getMonth() + 1)}${pad2(runDate.getDate())}-${pad2(runDate.getHours())}${pad2(runDate.getMinutes())}${pad2(runDate.getSeconds())}`;
  const runDateStr = `${runDate.getFullYear()}-${pad2(runDate.getMonth() + 1)}-${pad2(runDate.getDate())} ${pad2(runDate.getHours())}:${pad2(runDate.getMinutes())}:${pad2(runDate.getSeconds())}`;

  const prov = captureGitProvenance();

  const md: string[] = [];
  md.push('# Decay Schedule Benchmark Results — V3');
  md.push('');
  md.push('## Configuration');
  md.push('');
  md.push(`- **Encounters:** ${totalEncounters} (primary, three-team, 9A-midnight)`);
  md.push(`- **Days:** ${threeTeamDates.length}`);
  md.push(`- **Date range:** ${threeTeamDates[0]} to ${threeTeamDates[threeTeamDates.length - 1]}`);
  md.push(`- **Routing weights:** 4:2:1 (tier_one:tier_two:tier_three)`);
  md.push(`- **Buffers:** ON (35/25/15 min for Red/Yellow/Purple)`);
  md.push(`- **Measurement weights:** 5:4:3 (tier_one:tier_two:tier_three)`);
  md.push(`- **Reference decay (for normalized ratios):** 1.0x Stepped (V2 D7 schedule)`);
  md.push(`- **Conditions:** 20 formula (4 durations × 5 shape families) + 1 Actual = 21 total`);
  md.push(`- **Ratio cap:** ${RATIO_CAP} (MIN_LOAD_EPSILON = ${MIN_LOAD_EPSILON})`);
  md.push(`- **Pairwise test:** Wilcoxon signed-rank (two-sided, normal approx.); BH correction (FDR=0.05) per metric × comparison family`);
  md.push('');
  md.push('### Shape families tested');
  md.push('');
  md.push('- **Stepped:** multi-step plateau schedule (V2 stepped).');
  md.push('- **Linear:** 15-min-granularity linear ramp to 0 (V2 linear).');
  md.push('- **LogBack k∈{1,3,9}:** `w(t) = W0 · ln(1 + k(1 − t/T)) / ln(1 + k)`, sampled at 15-min granularity with endpoint pinned to 0. Larger k = more back-loaded (weight sustained longer before collapse).');
  md.push('- **Excluded from V3:** Direct Drop. Under the engine\'s piecewise-linear interpolation, a single-endpoint schedule (V2 Direct) is mathematically identical to Linear. V2\'s Direct column was never a distinct condition; see `DECAY_SCHEDULE_BENCHMARK_RESULTS_V2.md` for audit baseline.');
  md.push('');
  md.push('### Caveats');
  md.push('');
  md.push('- Wilcoxon normal-approximation p-values can be slightly anti-conservative in the presence of heavy ties (affects count-valued metrics: B2B HA/day, Slams/day, Count Spread). Cohen\'s d is reported alongside for effect-size context.');
  md.push('- "LM SD (D6 meas.)" refers to the V2 D6 schedule (0.75x linear, 4:2:1), pinned by construction as the common measurement yardstick. It does NOT refer to a V3 condition ID.');
  md.push('');

  // Condition matrix
  md.push('## Condition Matrix (21 conditions)');
  md.push('');
  md.push('| ID | Duration | Family | Tier 1 Summary | Tier 3 Summary |');
  md.push('|----|----------|--------|----------------|----------------|');
  const summarizeSteps = (steps: Array<{ afterMs: number; weight: number }>, initial: number, shape: 'stepped' | 'linear' | 'logBack'): string => {
    const last = steps[steps.length - 1];
    const lastMin = Math.round(last.afterMs / 60000);
    if (shape === 'stepped') {
      return `${initial}${steps.map(s => `->${s.weight}@${Math.round(s.afterMs / 60000)}m`).join('')}`;
    }
    if (shape === 'linear') {
      return `${initial}->...->0@${lastMin}m`;
    }
    return `${initial}->(log-back)->0@${lastMin}m`;
  };
  for (const c of conditions) {
    if (c.mode === 'actual') {
      md.push(`| ${c.id} | — | Actual | (historical assignments) | |`);
    } else {
      const t1Steps = c.decaySteps.tier_one;
      const t3Steps = c.decaySteps.tier_three;
      const t1Summary = summarizeSteps(t1Steps, 4, c.shape as 'stepped' | 'linear' | 'logBack');
      const t3Summary = summarizeSteps(t3Steps, 1, c.shape as 'stepped' | 'linear' | 'logBack');
      md.push(`| ${c.id} | ${c.durationMultiplier}x | ${c.familyLabel} | ${t1Summary} | ${t3Summary} |`);
    }
  }
  md.push('');

  // Full results table
  md.push('## Results (Mean ± SD across days)');
  md.push('');
  const mdColHeaders = conditions.map(c => c.id);
  md.push(`| Metric | ${mdColHeaders.join(' | ')} |`);
  md.push(`|--------|${mdColHeaders.map(() => '------').join('|')}|`);
  for (const m of METRICS) {
    const allVals = conditions.map(c => condMeans.get(c.id)![m.key]);
    const bestVal = m.lowerBetter ? Math.min(...allVals) : Math.max(...allVals);
    const cells = conditions.map(c => {
      const v = condMeans.get(c.id)![m.key];
      const sd = condStddevs.get(c.id)![m.key];
      const star = v === bestVal ? '*' : '';
      return `${fmt(v, m.dec)}±${fmt(sd, m.dec)}${star}`;
    });
    md.push(`| ${m.label} | ${cells.join(' | ')} |`);
  }
  // Clip rate row (diagnostic)
  const clipCells = conditions.map(c => {
    const rate = condClipRate.get(c.id) ?? 0;
    const flag = rate > 0.05 ? ' ⚑' : '';
    return `${fmt(rate * 100, 2)}%${flag}`;
  });
  md.push(`| Clip Rate | ${clipCells.join(' | ')} |`);
  md.push('');

  // Robustness assessment
  md.push('## Robustness Assessment');
  md.push('');
  md.push('Range across all 20 formula conditions. Excludes the Actual baseline.');
  md.push('');
  md.push('| Metric | Min | Max | % Variation |');
  md.push('|--------|-----|-----|-------------|');
  for (const m of METRICS) {
    const formulaVals = formulaIds.map(id => condMeans.get(id)![m.key]);
    const minVal = Math.min(...formulaVals);
    const maxVal = Math.max(...formulaVals);
    const midpoint = (minVal + maxVal) / 2;
    const pctVariation = midpoint === 0 ? 0 : ((maxVal - minVal) / midpoint) * 100;
    md.push(`| ${m.label} | ${fmt(minVal, m.dec)} | ${fmt(maxVal, m.dec)} | ${fmt(pctVariation, 1)}% |`);
  }
  md.push('');

  // Shape effect summary
  md.push('## Shape Effect Summary');
  md.push('');
  md.push('Best shape family within each duration level.');
  md.push('');
  md.push(`| Metric | ${DURATION_LEVELS.map(d => d.label).join(' | ')} |`);
  md.push(`|--------|${DURATION_LEVELS.map(() => '------').join('|')}|`);
  for (const m of METRICS) {
    const cells = DURATION_LEVELS.map(dur => {
      const shapeConds = conditions.filter(c => c.durationMultiplier === dur.multiplier && c.mode === 'formula');
      const ranked = shapeConds
        .map(c => ({ familyLabel: c.familyLabel, val: condMeans.get(c.id)![m.key] }))
        .sort((a, b) => m.lowerBetter ? a.val - b.val : b.val - a.val);
      return ranked[0].familyLabel;
    });
    md.push(`| ${m.label} | ${cells.join(' | ')} |`);
  }
  md.push('');

  // Duration effect summary
  md.push('## Duration Effect Summary');
  md.push('');
  md.push('Best duration within each shape family.');
  md.push('');
  md.push(`| Metric | ${SHAPE_FAMILIES.map(f => f.label).join(' | ')} |`);
  md.push(`|--------|${SHAPE_FAMILIES.map(() => '------').join('|')}|`);
  for (const m of METRICS) {
    const cells = SHAPE_FAMILIES.map(fam => {
      const durConds = conditions.filter(c => c.familyKey === fam.key && c.mode === 'formula');
      const ranked = durConds
        .map(c => ({ dur: c.durationMultiplier, val: condMeans.get(c.id)![m.key] }))
        .sort((a, b) => m.lowerBetter ? a.val - b.val : b.val - a.val);
      return `${ranked[0].dur}x`;
    });
    md.push(`| ${m.label} | ${cells.join(' | ')} |`);
  }
  md.push('');

  // BH-significant pairwise comparisons, grouped by comparison family
  md.push('## Pairwise Comparisons (BH-significant, FDR = 0.05)');
  md.push('');
  md.push('Wilcoxon signed-rank with BH correction applied separately within each metric × comparison family (shape / duration / vs-Actual). Full pairwise matrix — including non-significant rows and raw p-values — is in the JSON output.');
  md.push('');
  const bhSig = pairwiseResults.filter(p => p.bhSignificant);
  if (bhSig.length === 0) {
    md.push('No comparisons reached BH-significance.');
  } else {
    for (const family of ['shape', 'duration', 'vs-actual'] as const) {
      const familySig = bhSig.filter(p => p.family === family);
      if (familySig.length === 0) continue;
      const familyTitle = family === 'shape' ? 'Shape Effect' : family === 'duration' ? 'Duration Effect' : 'Formula vs Actual';
      md.push(`### ${familyTitle}`);
      md.push('');
      md.push('| Metric | Cond A | Cond B | Delta | p-value | Cohen\'s d |');
      md.push('|--------|--------|--------|-------|---------|-----------|');
      for (const p of familySig) {
        const m = METRICS.find(m => m.key === p.metric)!;
        const pStr = p.pValue < 0.001 ? '<0.001' : p.pValue.toFixed(3);
        md.push(`| ${m.label} | ${p.condA} | ${p.condB} | ${fmt(p.delta, m.dec)} | ${pStr} | ${fmt(Math.abs(p.cohenD), 2)} |`);
      }
      md.push('');
    }
  }

  // Clip rate report
  md.push('## Clip Rate Report');
  md.push('');
  md.push(`Per-condition ratio-clip rate (rawRatio > ${RATIO_CAP} triggers a clip). Flagged rows exceed the 5% threshold and should have Avg Ratio interpreted with caution — their mean is pulled toward the cap.`);
  md.push('');
  md.push('| Condition | Label | Clip Rate | Flag |');
  md.push('|-----------|-------|-----------|------|');
  for (const c of conditions) {
    const rate = condClipRate.get(c.id) ?? 0;
    const flag = rate > 0.05 ? '⚑ (>5%)' : '';
    md.push(`| ${c.id} | ${c.label} | ${fmt(rate * 100, 2)}% | ${flag} |`);
  }
  md.push('');

  // Reproducibility footer
  md.push('---');
  md.push('');
  md.push('## Run Provenance');
  md.push('');
  md.push(`- **Run date:** ${runDateStr} (local TZ)`);
  md.push(`- **Git SHA:** ${prov.sha}`);
  md.push(`- **Git status:** ${prov.dirty ? `dirty (${prov.modifiedFiles.length} modified file${prov.modifiedFiles.length === 1 ? '' : 's'})` : 'clean'}`);
  if (prov.dirty) {
    md.push('');
    md.push('<details><summary>Modified files</summary>');
    md.push('');
    md.push('```');
    for (const f of prov.modifiedFiles) md.push(f);
    md.push('```');
    md.push('');
    md.push('</details>');
  }
  md.push(`- **RNG seed:** N/A (deterministic replay)`);
  md.push(`- **Sample size:** ${totalEncounters} encounters, ${threeTeamDates.length} days, ${conditions.length} conditions`);
  md.push(`- **Script:** \`scripts/decay-schedule-benchmark.ts\``);
  md.push(`- **Output JSON:** \`data/decay-benchmark-runs/decay-benchmark-results-v3-${timestampSlug}.json\``);
  md.push('');

  // Write outputs
  const mdOutDir = join(PROJECT_ROOT, 'docs', 'results');
  if (!existsSync(mdOutDir)) mkdirSync(mdOutDir, { recursive: true });
  const mdPath = join(mdOutDir, 'DECAY_SCHEDULE_BENCHMARK_RESULTS_V3.md');
  writeFileSync(mdPath, md.join('\n'));
  console.log(`\n  Markdown results written to ${mdPath}`);

  const jsonOutDir = join(PROJECT_ROOT, 'data', 'decay-benchmark-runs');
  if (!existsSync(jsonOutDir)) mkdirSync(jsonOutDir, { recursive: true });
  const jsonPath = join(jsonOutDir, `decay-benchmark-results-v3-${timestampSlug}.json`);

  const jsonOutput = {
    meta: {
      version: 'v3',
      runDate: runDateStr,
      git: prov,
      seed: 'deterministic (no RNG)',
      encounters: totalEncounters,
      days: threeTeamDates.length,
      dateRange: { start: threeTeamDates[0], end: threeTeamDates[threeTeamDates.length - 1] },
      baseConfig: { weights: '4:2:1', buffers: 'on (35/25/15)' },
      ratioCap: RATIO_CAP,
      minLoadEpsilon: MIN_LOAD_EPSILON,
      referenceDecay: '1.0x stepped (V2 D7)',
      measurementWeights: { tier_one: 5, tier_two: 4, tier_three: 3 },
      pairwiseTest: 'wilcoxon-signed-rank',
      multipleComparisons: 'benjamini-hochberg (FDR=0.05, per metric × family)',
      conditions: conditions.map(c => ({
        id: c.id,
        label: c.label,
        mode: c.mode,
        durationMultiplier: c.durationMultiplier,
        shape: c.shape,
        logBackK: c.logBackK,
        familyKey: c.familyKey,
        familyLabel: c.familyLabel,
      })),
    },
    results: Object.fromEntries(
      conditions.map(c => [
        c.id,
        {
          daily: allResults.get(c.id)!,
          mean: condMeans.get(c.id)!,
          stddev: condStddevs.get(c.id)!,
          clipRate: condClipRate.get(c.id) ?? 0,
        },
      ]),
    ),
    pairwise: pairwiseResults,
  };
  writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`  JSON written to ${jsonPath}`);

  console.log('\nDone.');
}

// Only run when invoked as a script, not when imported by the test harness.
const invokedPath = process.argv[1] ?? '';
if (invokedPath.endsWith('decay-schedule-benchmark.ts') || invokedPath.endsWith('decay-schedule-benchmark.js')) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
