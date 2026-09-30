// © 2026 New York University. All rights reserved.
// Local, aggregate-only sensitivity check. Run in an isolated checkout with copied private data:
// TZ=UTC node --import tsx scripts/shared-provider-check.ts
// Existing replay scripts and recorded figures are never written.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { parseWeeklySchedule, getProvidersForShift, type DaySchedule } from '../src/utils/scheduleParser';
import { buildSlots, datedDays, openTeams, rosterAt, TEAMS, type WeekDay } from '../src/schedule/week';
import { getRecommendation } from '../src/engine/recommendation';
import { countBackToBackHA, countSlams } from '../src/engine/fairness';
import { ACUITY_WEIGHTS, RED_ZONE_THRESHOLD } from '../src/constants';
import type { AcuityTier, Patient, ShadowEntry } from '../src/types';
import { excelSerialToWallMs, localDateToWallMs, parseWallClockString, wallDateStr, wallHour } from './lib/census-time';
import { coverKind, providersForRule, RULES, SCOPES, type Rule, type Scope } from './lib/shared-provider-rules';

// The app's calendar helpers use local getters. In this research process UTC represents workbook
// wall time, exactly like census-time.ts. This is not a conversion of clinical times to UTC.
process.env.TZ = 'UTC';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data/provider-schedules');
const OUT = join(ROOT, 'data/shared-provider-check');
const HOUR = 3600000;
const DAY = 24 * HOUR;
const hash = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const arrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const mainRoot = dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim());
if (realpathSync(ROOT) === realpathSync(mainRoot) || realpathSync(DATA) !== DATA) throw new Error('Use an isolated worktree with a copied data/provider-schedules directory.');
const inputHashes: Record<string, string> = {};
const days = new Map<string, WeekDay>();
const untimedDates = new Set<string>();
let correctedDates = 0;
let undatedDays = 0;

function auditLegacy(file: string, parsed: DaySchedule[]) {
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, duplicatePersonHours: 0, excessFullProviderHours: 0, twoTeamPersonHours: 0, fourTeamPersonHours: 0, otherPersonHours: 0 }));
  const unique = new Set<string>();
  let sampledRosterHours = 0;
  let hoursWithDuplicates = 0;
  for (const [dayIndex, d] of parsed.entries()) for (let q = 0; q < 96; q++) {
    const ps = getProvidersForShift(d, q / 4).providers;
    const people = new Map<string, Set<number>>();
    for (const p of ps) {
      const key = [p.name.trim().toLowerCase(), p.type, p.shiftStart, p.shiftEnd].join('|');
      const group = people.get(key) ?? new Set<number>();
      group.add(p.teamId);
      people.set(key, group);
    }
    sampledRosterHours += 0.25;
    let hasDuplicates = false;
    for (const [person, teams] of people) if (teams.size > 1) {
      hasDuplicates = true;
      unique.add(`${dayIndex}|${person}`);
      const bucket = byHour[Math.floor(q / 4)];
      bucket.duplicatePersonHours += 0.25;
      bucket.excessFullProviderHours += 0.25 * (teams.size - 1);
      if (teams.size === 2) bucket.twoTeamPersonHours += 0.25;
      else if (teams.size === 4) bucket.fourTeamPersonHours += 0.25;
      else bucket.otherPersonHours += 0.25;
    }
    if (hasDuplicates) hoursWithDuplicates += 0.25;
  }
  const sum = (k: keyof Omit<typeof byHour[number], 'hour'>) => byHour.reduce((s, h) => s + h[k], 0);
  return { file, days: parsed.length, sampledRosterHours, hoursWithDuplicates, duplicatedProviderShiftDays: unique.size,
    duplicatePersonHours: sum('duplicatePersonHours'), excessFullProviderHours: sum('excessFullProviderHours'),
    twoTeamPersonHours: sum('twoTeamPersonHours'), fourTeamPersonHours: sum('fourTeamPersonHours'), otherPersonHours: sum('otherPersonHours'), byHour };
}

const legacyAudit = [];
for (const folder of ['schedules', 'initially missing schedules']) {
  const dir = join(DATA, folder);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter(f => f.endsWith('.xlsx') && !f.startsWith('~$') && !f.includes('demo-schedule')).sort()) {
    const b = readFileSync(join(dir, file));
    inputHashes[`${folder}/${file}`] = hash(b);
    legacyAudit.push(auditLegacy(file, parseWeeklySchedule(arrayBuffer(b)).days));
    const parsed = datedDays(parseWeeklySchedule(arrayBuffer(b), { live: true }).days);
    correctedDates += parsed.corrected;
    undatedDays += parsed.undated;
    for (const d of parsed.days) {
      const old = days.get(d.isoDate);
      if (old && JSON.stringify(old) !== JSON.stringify(d)) throw new Error(`Conflicting schedules for ${d.isoDate}; choose the intended version explicitly.`);
      days.set(d.isoDate, d);
      if (buildSlots({ days: [d], roleFixes: {} }).untimed) untimedDates.add(d.isoDate);
    }
  }
}
const { slots } = buildSlots({ days: [...days.values()], roleFixes: {} });
// Audit slot conservation and flag same-name overlaps at roster transitions. Names can be
// surnames shared by different people, so overlaps are ambiguities, not confirmed duplicates.
let conservationChecks = 0;
let sameNameOverlapSnapshots = 0;
for (const t of [...new Set(slots.flatMap(s => [s.start, s.end]))].sort((a, b) => a - b)) {
  const perSlot = new Map<string, number>();
  const perPerson = new Map<string, number>();
  for (const e of rosterAt(slots, t)) {
    const k = e.scheduleKey.split('#')[0];
    perSlot.set(k, (perSlot.get(k) ?? 0) + e.share);
    perPerson.set(e.name.trim().toLowerCase(), (perPerson.get(e.name.trim().toLowerCase()) ?? 0) + e.share);
  }
  for (const v of perSlot.values()) if (v > 1 + 1e-9) throw new Error('Shared-slot conservation failed.');
  for (const v of perPerson.values()) if (v > 1 + 1e-9) sameNameOverlapSnapshots++;
  conservationChecks++;
}

interface Arrival { time: number; acuity: AcuityTier }
const censusName = 'Aside data Dec 2025–Mar 2026.xlsx';
const censusBytes = readFileSync(join(DATA, censusName));
inputHashes[censusName] = hash(censusBytes);
const wb = XLSX.read(censusBytes, { type: 'buffer' });
const sn = wb.SheetNames.find(s => /A-side|trauma/i.test(s));
if (!sn) throw new Error('Census sheet not found.');
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sn]);
const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
const column = (patterns: string[]) => patterns.map(p => keys.find(k => k.toLowerCase().includes(p))).find(Boolean);
const ca = column(['arrival_time', 'arrival']);
const ct = column(['team_assignment', 'team']);
const ce = column(['esi_level', 'esi']);
const cs = column(['acuity_source', 'source']);
if (!ca || !ct || !ce || !cs) throw new Error('Census is missing required arrival, team, ESI or source columns.');
const arrivals: Arrival[] = [];
let excludedTrauma = 0;
let invalidRows = 0;
let missingEsiMappedPurple = 0;
for (const row of rows) {
  const raw = row[ca];
  const time = typeof raw === 'number' ? excelSerialToWallMs(raw) : raw instanceof Date ? localDateToWallMs(raw) : typeof raw === 'string' ? parseWallClockString(raw) : NaN;
  const team = Number(String(row[ct] ?? '').match(/\d/)?.[0]);
  if (!Number.isFinite(time) || ![1, 2, 3, 4].includes(team)) { invalidRows++; continue; }
  if (team === 4 || ['trauma', 'both'].includes(String(row[cs]).trim().toLowerCase())) { excludedTrauma++; continue; }
  const esi = Number(row[ce]);
  if (![1, 2, 3, 4, 5].includes(esi)) missingEsiMappedPurple++;
  arrivals.push({ time, acuity: esi === 1 ? 'tier_one' : esi === 2 ? 'tier_two' : 'tier_three' });
}
arrivals.sort((a, b) => a.time - b.time);
if (!arrivals.length) throw new Error('No eligible census arrivals.');
const censusEnd = parseWallClockString(wallDateStr(arrivals.at(-1)!.time)) + DAY;
const groups = new Map<string, Arrival[]>();
for (const a of arrivals) {
  const shiftDate = wallDateStr(a.time - 7 * HOUR);
  const group = groups.get(shiftDate) ?? [];
  group.push(a);
  groups.set(shiftDate, group);
}

const fullRules: Rule[] = ['omit', 'equal', 'proportional'];
const newCounts = () => ({ n: 0, differs: Object.fromEntries(RULES.map(r => [r, 0])) as Record<Rule, number> });
const comparisons = Object.fromEntries(SCOPES.map(scope => [scope, { overall: newCounts(), byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, ...newCounts() })) }])) as Record<Scope, { overall: ReturnType<typeof newCounts>; byHour: ({ hour: number } & ReturnType<typeof newCounts>)[] }>;
const excluded: { date: string; arrivals: number; reasons: string[] }[] = [];
const replays: { date: string; arrivals: number; rules: Record<string, ReturnType<typeof metrics>> }[] = [];
let checkedNameOverlapSnapshots = 0;
function metrics(entries: ShadowEntry[], equal: ShadowEntry[]) {
  const finite = entries.map(e => e.ratioAtAssignment).filter(Number.isFinite);
  const counts = Object.fromEntries(TEAMS.map(t => [t, entries.filter(e => e.teamId === t).length]));
  const acuity = Object.fromEntries(TEAMS.map(t => [t, entries.filter(e => e.teamId === t).reduce((s, e) => s + ACUITY_WEIGHTS[e.acuity], 0)]));
  return { assigned: entries.length, differsFromEqual: entries.filter((e, i) => e.teamId !== equal[i].teamId).length, counts, acuity,
    backToBackHighAcuity: countBackToBackHA(entries), slams: countSlams(entries), redZoneEvents: entries.filter(e => e.ratioAtAssignment < RED_ZONE_THRESHOLD).length,
    zeroLoadPlacements: entries.length - finite.length, finiteRatioSum: finite.reduce((s, r) => s + r, 0), finiteRatioN: finite.length };
}
for (const [date, events] of groups) {
  const start = parseWallClockString(`${date}T07:00:00`);
  const end = start + DAY;
  const nextDate = wallDateStr(end);
  const reasons: string[] = [];
  if (!days.has(date) || !days.has(nextDate)) reasons.push('missing_schedule_day');
  if (end > censusEnd) reasons.push('partial_final_census_window');
  if (untimedDates.has(date) || untimedDates.has(nextDate)) reasons.push('untimed_provider');
  const windowSlots = slots.filter(s => s.start < end && s.end > start);
  if (windowSlots.some(s => s.unknownLevel)) reasons.push('unresolved_role');
  // Check all transitions and arrival times, including empty intervals, for ambiguous same-name entries
  // or missing dedicated staffing. Exclude the full window so all rules see the same complete stream.
  const times = [...new Set([start, ...windowSlots.flatMap(s => [s.start, s.end]).filter(t => start <= t && t < end), ...events.map(a => a.time)])];
  for (const t of times) {
    const open = openTeams(windowSlots, t);
    if (!open.has(1) || !open.has(2)) { reasons.push('incomplete_core_roster'); break; }
    const people = new Map<string, number>();
    for (const e of rosterAt(windowSlots, t)) people.set(e.name.toLowerCase(), (people.get(e.name.toLowerCase()) ?? 0) + e.share);
    if ([...people.values()].some(v => v > 1 + 1e-9)) { reasons.push('same_name_overlap'); break; }
    checkedNameOverlapSnapshots++;
  }
  if (reasons.length) { excluded.push({ date, arrivals: events.length, reasons: [...new Set(reasons)] }); continue; }
  const states = Object.fromEntries(fullRules.map(r => [r, [] as Patient[]])) as Record<Rule, Patient[]>;
  const entries = Object.fromEntries(fullRules.map(r => [r, [] as ShadowEntry[]])) as Record<Rule, ShadowEntry[]>;
  for (const [i, a] of events.entries()) {
    const open = openTeams(windowSlots, a.time);
    const closed = Object.fromEntries(TEAMS.filter(t => !open.has(t)).map(t => [t, a.time]));
    const sharedKinds = new Set(windowSlots.filter(s => s.start <= a.time && s.end > a.time).map(coverKind));
    const pick = (rule: Rule, patients: Patient[], scope: Scope = 'all') => getRecommendation(providersForRule(windowSlots, a.time, patients, rule, scope), patients, [], a.time, closed);
    const baseline = pick('equal', states.equal);
    // Every comparison sees exactly the same pre-arrival equal-split patient history.
    for (const scope of SCOPES) {
      if (scope !== 'all' && !sharedKinds.has(scope)) continue;
      for (const bucket of [comparisons[scope].overall, comparisons[scope].byHour[wallHour(a.time)]]) {
        bucket.n++;
        for (const rule of RULES) if (pick(rule, states.equal, scope).first !== baseline.first) bucket.differs[rule]++;
      }
    }
    // Compute all picks before mutating any history.
    const recommendations = fullRules.map(rule => ({ rule, rec: pick(rule, states[rule]) }));
    for (const { rule, rec } of recommendations) {
      const teamId = rec.first;
      if (teamId === null) throw new Error('No eligible team in a complete replay window.');
      entries[rule].push({ arrivalIndex: i, arrivalTime: a.time, acuity: a.acuity, teamId, ratioAtAssignment: rec.scores.find(s => s.teamId === teamId)!.capacityRatio });
      states[rule].push({ id: `${i}`, assignedAt: a.time, assignedTeamId: teamId, acuity: a.acuity });
    }
  }
  replays.push({ date, arrivals: events.length, rules: Object.fromEntries(fullRules.map(r => [r, metrics(entries[r], entries.equal)])) });
}

const totals = Object.fromEntries(fullRules.map(rule => {
  const ms = replays.map(r => r.rules[rule]);
  const sum = (key: 'assigned' | 'differsFromEqual' | 'backToBackHighAcuity' | 'slams' | 'redZoneEvents' | 'zeroLoadPlacements' | 'finiteRatioSum' | 'finiteRatioN') => ms.reduce((s, m) => s + m[key], 0);
  return [rule, { arrivals: sum('assigned'), differsFromEqual: sum('differsFromEqual'), teamCounts: Object.fromEntries(TEAMS.map(t => [t, ms.reduce((s, m) => s + m.counts[t], 0)])),
    backToBackHighAcuity: sum('backToBackHighAcuity'), slams: sum('slams'), redZoneEvents: sum('redZoneEvents'), zeroLoadPlacements: sum('zeroLoadPlacements'),
    meanFiniteRatio: sum('finiteRatioN') ? sum('finiteRatioSum') / sum('finiteRatioN') : null }];
}));
const codeFiles = ['scripts/shared-provider-check.ts', 'scripts/lib/shared-provider-rules.ts', 'src/utils/scheduleParser.ts', 'src/schedule/week.ts', 'src/engine/recommendation.ts', 'src/constants.ts'];
const report = { copyright: '© 2026 New York University', schema: 1, createdAt: new Date().toISOString(), baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  codeHashes: Object.fromEntries(codeFiles.map(f => [f, hash(readFileSync(join(ROOT, f)))])), inputHashes,
  protocol: {
    clock: 'Workbook wall time encoded as UTC; process TZ forced to UTC for schedule helpers.',
    windows: '07:00 to next 07:00; empty initial patient state; no carry-in, deaths, floor upgrades, float adjustments or manual closures. All input arrivals route as arrivals, as in historical replay.',
    stateComparison: 'Equal-split trajectory supplies identical pre-arrival states for all four rules. Scope analyses change only that category; other shared providers remain equal.',
    legacyDuplicates: 'Corrected dates, roles and eligibility held fixed; A-side omitted, other shared entries full weight. This isolates legacy sharing conventions, not an exact reproduction of old benchmarks.',
    proportional: 'Within current covered roster teams, share is modeled load / total covered load; all-zero pool uses equal shares. Research only.',
    exclusions: 'Whole 24-hour windows with unresolved roles, untimed entries on either calendar day, missing adjacent schedules, ambiguous same-name overlaps, missing core staffing, or a partial final census window.',
    audit: 'Legacy parser at 15-minute snapshots over every listed calendar day; grouped by name, role and shift window to avoid conflating different people with the same surname; duplicate-person hours and excess full-provider hours are sums of snapshot durations, not unique staff headcounts.',
    caveat: 'Ratios and red-zone counts change mechanically with numerator changes. These simulations cannot validate workload or patient outcomes; no composite winner.' },
  coverage: { scheduleFiles: legacyAudit.length, scheduleDays: days.size, correctedDates, undatedDays, untimedDates: [...untimedDates].sort(), conservationChecks, sameNameOverlapSnapshots, checkedNameOverlapSnapshots,
    rawCensusRows: rows.length, invalidRows, excludedTrauma, eligibleCensusArrivals: arrivals.length, missingEsiMappedPurple, candidateWindows: groups.size, includedWindows: replays.length, includedArrivals: replays.reduce((s, r) => s + r.arrivals, 0), excluded },
  legacyAudit, sameState: comparisons, fullReplayTotals: totals, fullReplays: replays };
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'results.json'), JSON.stringify(report, null, 2) + '\n');
const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(2)}%` : 'n/a';
const md = [
  '# Shared-provider bounded check', '', '© 2026 New York University', '', 'Unreviewed, generated by scripts/shared-provider-check.ts. Internal research comparison.', '',
  `Included ${report.coverage.includedArrivals} arrivals in ${replays.length} complete 24-hour windows out of ${arrivals.length} eligible census arrivals in ${groups.size} candidate windows.`, '',
  '## Same patient states', '', '| Scope | Arrivals compared | Omit differs | Proportional differs | Legacy sharing differs |', '|---|---:|---:|---:|---:|',
  ...SCOPES.map(s => { const b = comparisons[s].overall; return `| ${s} | ${b.n} | ${b.differs.omit} (${pct(b.differs.omit, b.n)}) | ${b.differs.proportional} (${pct(b.differs.proportional, b.n)}) | ${b.differs.legacy_duplicates} (${pct(b.differs.legacy_duplicates, b.n)}) |`; }), '',
  '## Full replays', '', '| Rule | Arrivals | Assignment differences vs equal | B2B high acuity | Slams | Red-zone events | Zero-load placements |', '|---|---:|---:|---:|---:|---:|---:|',
  ...fullRules.map(r => { const m = totals[r]; return `| ${r} | ${m.arrivals} | ${m.differsFromEqual} | ${m.backToBackHighAcuity} | ${m.slams} | ${m.redZoneEvents} | ${m.zeroLoadPlacements} |`; }), '',
  '## Legacy duplicate counting by week', '', '| Workbook | Hours with duplicates | Duplicate person-hours | Excess full-provider hours | 2-team person-hours | 4-team person-hours |', '|---|---:|---:|---:|---:|---:|',
  ...legacyAudit.map(r => `| ${r.file} | ${r.hoursWithDuplicates} | ${r.duplicatePersonHours} | ${r.excessFullProviderHours} | ${r.twoTeamPersonHours} | ${r.fourTeamPersonHours} |`), '',
  '## Assumptions and limits', '', ...Object.entries(report.protocol).map(([k, v]) => `- ${k}: ${v}`), '',
  'Per-hour disagreement denominators, per-hour duplicate counting, excluded windows and reasons, per-window replay metrics, source hashes and code hashes are in results.json.', '',
].join('\n');
writeFileSync(join(OUT, 'report.md'), md);
console.log(JSON.stringify({ output: OUT, coverage: { ...report.coverage, excluded: report.coverage.excluded.length }, sameState: Object.fromEntries(SCOPES.map(s => [s, comparisons[s].overall])), fullReplayTotals: totals }, null, 2));
