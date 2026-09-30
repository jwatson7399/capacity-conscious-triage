import * as XLSX from 'xlsx';
import type { ProviderType, TeamId } from '../types';

// Trust boundary: xlsx inputs are local user/bundled files; revisit this before accepting third-party workbooks.

export interface ScheduleProvider {
  name: string;
  type: ProviderType;
  teamId: TeamId;
  shiftStart?: string; // e.g. "7A"
  shiftEnd?: string;   // e.g. "3P"
  /** Live mode only: a resident whose level the sheet does not give. `type` is a placeholder until someone picks one. */
  unknownLevel?: boolean;
  /** Live mode only: listed on the team but adds no strength (dental residents, Decision 42). */
  countsZero?: boolean;
  /** Live mode only: shared coverage (A-side, overnight side or day swing). */
  coverTeams?: TeamId[];
  /** Source of shared coverage, retained for audits even when a day swing ends at midnight. */
  coverSource?: 'a_side' | 'overnight' | 'day_swing';
}

/**
 * Options for parseWeeklySchedule. The benchmark and replay scripts call it without options and get
 * exactly the reading their recorded figures used. The app passes { live: true } for the trial
 * reading (Roundtable Decisions 41 and 42): level tags in brackets, any PGY key header, dental at 0,
 * a flag instead of a silent default for unknown residents, overnight cover teams and calendar dates.
 */
export interface ParseOptions {
  live?: boolean;
}

export interface FloatAttending {
  name: string;
  shiftStart?: string;
  shiftEnd?: string;
}

export interface DaySchedule {
  date: string; // e.g. "February 23"
  dayOfWeek: string;
  providers: ScheduleProvider[];
  floatAttendings: FloatAttending[];
  /** Live mode only: the calendar date, YYYY-MM-DD, read from the sheet's date cell. */
  isoDate?: string;
}

export interface ParsedSchedule {
  days: DaySchedule[];
  pgyMap: Record<string, PgyInfo>;
}

export interface PgyInfo {
  year?: number;
  role?: string;
  isOffService?: boolean;
}

/** Map PGY info to app ProviderType */
export function mapPgyToProviderType(info: PgyInfo): ProviderType {
  if (info.isOffService || info.role?.toLowerCase().includes('pem') || info.role?.toLowerCase().includes('off-service')) {
    return 'rotator';
  }
  if (info.role?.toLowerCase().includes('pa')) return 'pa';
  if (info.year === 4 || info.year === 3) return 'senior_resident';
  if (info.year === 2) return 'junior_resident';
  if (info.year === 1) return 'intern';
  return 'senior_resident';
}

/** Parse a time string like "7A", "3P", "11P", "7:30A" into 24h hour number */
export function parseTimeToHour(t: string): number {
  const cleaned = t.trim().toUpperCase();
  // "7A", "7:30A" and, in newer sheets, "730A" or "1030P" (no colon).
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(A|P|AM|PM)$/) ?? cleaned.match(/^(\d{1,2})(\d{2})\s*(A|P|AM|PM)$/);
  if (!match) return -1;
  let hour = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3][0];
  if (period === 'P' && hour !== 12) hour += 12;
  if (period === 'A' && hour === 12) hour = 0;
  return hour + minutes / 60;
}

/** Check if a target hour falls within a shift window (handles overnight) */
function isWithinShift(shiftStart: string | undefined, shiftEnd: string | undefined, targetHour: number): boolean {
  if (!shiftStart || !shiftEnd) return true;
  const start = parseTimeToHour(shiftStart);
  const end = parseTimeToHour(shiftEnd);
  if (start < 0 || end < 0) return true;
  if (start <= end) {
    return targetHour >= start && targetHour < end;
  } else {
    return targetHour >= start || targetHour < end;
  }
}

/**
 * One clock time in a shift cell. Legacy: "7A" or "7:30A". Live also reads "730A" / "1030P"
 * (no colon), which newer sheets use; the legacy reading skips those cells as before.
 */
const TIME_LEGACY = '\\d{1,2}(?::\\d{2})?\\s*[AaPp][Mm]?';
const TIME_LIVE = '(?:\\d{3,4}|\\d{1,2}(?::\\d{2})?)\\s*[AaPp][Mm]?';
function shiftRegexes(live: boolean) {
  const T = live ? TIME_LIVE : TIME_LEGACY;
  return {
    whole: new RegExp(`^${T}\\s*[-–]\\s*${T}$`),
    parts: new RegExp(`(${T})\\s*[-–]\\s*(${T})`),
    team: new RegExp(`^T([1-4])\\s+(${T})\\s*[-–]\\s*(${T})$`),
  };
}
const RX = { legacy: shiftRegexes(false), live: shiftRegexes(true) };
const rx = (live?: boolean) => (live ? RX.live : RX.legacy);

/** Check if a cell value is a shift time pattern like "7A-3P" */
function isShiftTime(val: string, live?: boolean): boolean {
  return rx(live).whole.test(val.trim());
}

/** Parse shift time string "7A-3P" into start/end components */
function parseShiftTime(cell: string, live?: boolean): { shiftStart: string; shiftEnd: string } | null {
  const m = cell.match(rx(live).parts);
  if (!m) return null;
  return { shiftStart: m[1], shiftEnd: m[2] };
}

/** Read a cell value as trimmed string */
function cellStr(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  if (!cell) return '';
  return String(cell.v ?? '').trim();
}

/** Read raw cell value */
function cellRaw(sheet: XLSX.WorkSheet, row: number, col: number): unknown {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  if (!cell) return undefined;
  return cell.v;
}

/** Convert Excel serial date to formatted string */
function excelSerialToDate(serial: number): { formatted: string; dayOfWeek: string; iso: string } {
  const date = new Date((serial - 25569) * 86400000);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return {
    formatted: `${months[date.getUTCMonth()]} ${date.getUTCDate()}`,
    dayOfWeek: days[date.getUTCDay()],
    iso: date.toISOString().slice(0, 10),
  };
}

/** Clean a provider name: strip annotations like (ML), (Swing T1/T3), etc. */
function cleanProviderName(raw: string, live?: boolean): string {
  // Remove parenthetical annotations; live also removes bracketed level tags ("WELLS [1]")
  let name = live
    ? raw.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*\[.*?\]\s*/g, ' ').trim()
    : raw.replace(/\s*\(.*?\)\s*/g, '').trim();
  // Take first word (last name) if multiple words remain
  name = name.split(/\s+/)[0];
  return name;
}

/**
 * Extract the PGY key table.
 * Format: "Residents" in col X, "PGY" in col X+1, then name/year pairs below.
 */
export function extractPgyKey(sheet: XLSX.WorkSheet, opts: ParseOptions = {}): Record<string, PgyInfo> {
  // Newer sheets head the key "Resident Name", "Name" or "RESIDENT" instead of "Residents".
  const header = opts.live ? /^(Residents?|Resident\s*Name|Name)$/i : /^Residents?$/i;
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  const pgyMap: Record<string, PgyInfo> = {};

  for (let r = 0; r <= range.e.r; r++) {
    for (let c = 0; c <= range.e.c - 1; c++) {
      const val = cellStr(sheet, r, c);
      const valRight = cellStr(sheet, r, c + 1);

      if (header.test(val) && /^PGY$/i.test(valRight)) {
        for (let rr = r + 1; rr <= Math.min(r + 40, range.e.r); rr++) {
          const name = cellStr(sheet, rr, c);
          const yearVal = cellStr(sheet, rr, c + 1);
          if (!name) continue;
          if (/^(Residents?|Resident\s*Name|PGY|Name)$/i.test(name)) continue;

          if (/^\d$/.test(yearVal)) {
            pgyMap[name.toLowerCase()] = { year: parseInt(yearVal, 10) };
          } else if (/PEM\s*Fellow/i.test(yearVal)) {
            pgyMap[name.toLowerCase()] = { role: 'PEM Fellow', isOffService: true };
          } else if (/Off[- ]?Service|Rotating/i.test(yearVal)) {
            pgyMap[name.toLowerCase()] = { role: yearVal, isOffService: true };
          } else if (/PA.*Fellow/i.test(yearVal)) {
            pgyMap[name.toLowerCase()] = { role: yearVal };
          } else if (/PA/i.test(yearVal)) {
            pgyMap[name.toLowerCase()] = { role: yearVal };
          } else if (/IM$/i.test(yearVal)) {
            pgyMap[name.toLowerCase()] = { role: yearVal, isOffService: true };
          } else if (yearVal) {
            pgyMap[name.toLowerCase()] = { role: yearVal };
          }
        }
        if (Object.keys(pgyMap).length > 0) return pgyMap;
      }
    }
  }

  return pgyMap;
}

/*
 * SCHEDULE LAYOUT (from real xlsx analysis):
 *
 * The sheet has repeating day blocks. Each block spans ~20 rows:
 *
 * Row 0 (relative): Team headers — C1="Team 1", C3="Team 2", C5="Team 3", C7="Team 4", ...
 *                    Right grid:     C16="Team 1", C18="Team 2", C20="Team 3", C22="Team 4"
 * Row 1: Day name in C0 (left) or C15 (right), role labels "Attending" in team time cols
 * Row 2: Date (Excel serial) in C0/C15, first attending shift+name pairs
 * Row 3: Second attending shift+name pairs
 * Row ~5: "PA" label row, then PA shift+name pairs below
 * Row ~10: "Resident" label row, then resident shift+name pairs below
 * Row ~14: "A-Side" label row: shared resident in live mode, skipped in legacy mode
 * Row ~17: "Float Attending" label row, then float shift+name pairs below
 *
 * Each team uses TWO columns: odd col = shift time, even col = provider name
 * Left grid teams: cols 1/2, 3/4, 5/6, 7/8
 * Right grid teams: cols 16/17, 18/19, 20/21, 22/23
 */

interface DayBlock {
  dayOfWeek: string;
  dateLabel: string;
  dateSortKey: number;
  isoDate?: string;
  /** Column pairs for teams 1-4: [[timeCol, nameCol], ...] */
  teamColPairs: [number, number][];
  /** OVN column pair [timeCol, nameCol] if present */
  ovnColPair?: [number, number];
  /** Row where "Team 1" header appears */
  headerRow: number;
  /** Row range to scan for this block [startRow, endRow) */
  startRow: number;
  endRow: number;
}

/**
 * Find all day blocks by locating "Team 1" header rows,
 * then finding day names and dates nearby.
 */
function findDayBlocks(sheet: XLSX.WorkSheet): DayBlock[] {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  const blocks: DayBlock[] = [];

  // Find all "Team 1" header positions
  const teamHeaderRows: Array<{ row: number; col: number }> = [];
  for (let r = 0; r <= range.e.r; r++) {
    for (let c = 0; c <= range.e.c; c++) {
      if (/^Team\s*1$/i.test(cellStr(sheet, r, c))) {
        teamHeaderRows.push({ row: r, col: c });
      }
    }
  }

  for (const { row: headerRow, col: t1Col } of teamHeaderRows) {
    // Determine team column pairs — teams are at t1Col, t1Col+2, t1Col+4, t1Col+6
    // Each team: time in teamCol, name in teamCol+1
    const teamColPairs: [number, number][] = [];
    for (let i = 0; i < 4; i++) {
      const tc = t1Col + i * 2;
      teamColPairs.push([tc, tc + 1]);
    }

    // Find day name: check row below header, in col before the teams
    // Left grid: day in col 0, right grid: day in col 15
    const dayRow = headerRow + 1;
    const dateRow = headerRow + 2;

    // Determine label column — scan a few cols to the left of t1Col
    let dayOfWeek = '';
    let dateLabel = '';
    let dateSortKey = 0;
    let isoDate: string | undefined;
    let labelCol = -1;

    for (let c = Math.max(0, t1Col - 2); c <= t1Col; c++) {
      const dv = cellStr(sheet, dayRow, c);
      if (/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(dv)) {
        dayOfWeek = dv.charAt(0).toUpperCase() + dv.slice(1).toLowerCase();
        labelCol = c;
        break;
      }
    }

    // Also check the header row itself for day name (fallback)
    if (!dayOfWeek) {
      for (let c = Math.max(0, t1Col - 2); c <= t1Col; c++) {
        const dv = cellStr(sheet, headerRow, c);
        if (/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(dv)) {
          dayOfWeek = dv.charAt(0).toUpperCase() + dv.slice(1).toLowerCase();
          labelCol = c;
          break;
        }
      }
    }

    if (!dayOfWeek) continue; // Can't identify this block

    // Find date (Excel serial number in the row below day name)
    if (labelCol >= 0) {
      const raw = cellRaw(sheet, dateRow, labelCol);
      if (typeof raw === 'number' && raw > 40000 && raw < 60000) {
        const parsed = excelSerialToDate(raw);
        dateLabel = parsed.formatted;
        dateSortKey = raw;
        isoDate = parsed.iso;
      } else {
        const dv = cellStr(sheet, dateRow, labelCol);
        if (dv) dateLabel = dv;
      }
    }

    // Determine end row: next "Team 1" header in the same column region, or +25
    const sameRegionHeaders = teamHeaderRows.filter(h =>
      h.row > headerRow && Math.abs(h.col - t1Col) < 3
    );
    const endRow = sameRegionHeaders.length > 0
      ? sameRegionHeaders[0].row
      : headerRow + 25;

    // Find OVN column: scan the header row for "OVN"
    let ovnColPair: [number, number] | undefined;
    for (let c = t1Col; c <= Math.min(t1Col + 20, range.e.c); c++) {
      if (/^OVN$/i.test(cellStr(sheet, headerRow, c))) {
        ovnColPair = [c, c + 1];
        break;
      }
    }

    blocks.push({
      dayOfWeek,
      dateLabel: dateLabel || 'Unknown',
      dateSortKey,
      isoDate,
      teamColPairs,
      ovnColPair,
      headerRow,
      startRow: dayRow,
      endRow: Math.min(endRow, range.e.r + 1),
    });
  }

  // Sort by date
  blocks.sort((a, b) => (a.dateSortKey || 99999) - (b.dateSortKey || 99999));

  // Deduplicate by date (same day appearing from left+right grid overlap shouldn't happen,
  // but guard against it)
  const seen = new Set<number>();
  return blocks.filter(b => {
    if (b.dateSortKey && seen.has(b.dateSortKey)) return false;
    if (b.dateSortKey) seen.add(b.dateSortKey);
    return true;
  });
}

/** Live: names that mean an unfilled slot, not a person. */
const PLACEHOLDER = /^(OPEN|TBD|TBA|VACANT|NONE|N\/A)$/i;

/** Live: the two teams a day swing resident covers, from "(Swing T1/T3)" or "(T2 / T4 Swing)". */
function gridSwingTeams(raw: string): TeamId[] | undefined {
  const m = raw.match(/Swing\s*T?\s*([1-4])\s*\/\s*T?\s*([1-4])/i) ?? raw.match(/T\s*([1-4])\s*\/\s*T?\s*([1-4])\s*Swing/i);
  if (!m || m[1] === m[2]) return undefined;
  return [Number(m[1]) as TeamId, Number(m[2]) as TeamId];
}

interface Level {
  type: ProviderType;
  flags: Pick<ScheduleProvider, 'unknownLevel' | 'countsZero'>;
  unknownLevel?: boolean;
  countsZero?: boolean;
}

/**
 * A resident's level. Legacy reading (no options): the PGY key, else senior resident, exactly as the
 * recorded benchmarks used it. Live reading: the bracket tag in the name cell first ("[2]", "[IM]",
 * "[DENTAL]", "[3 - ML]"), then the PGY key, and an unknown level is flagged instead of guessed.
 */
function residentLevel(rawName: string, cleanName: string, pgyMap: Record<string, PgyInfo>, opts: ParseOptions): Level {
  const info = pgyMap[cleanName.toLowerCase()];
  if (!opts.live) return { type: info ? mapPgyToProviderType(info) : 'senior_resident', flags: {} };
  const tag = rawName.match(/\[([^\]]+)\]/)?.[1]?.trim() ?? '';
  const fromTag = tag ? levelFromText(tag) : null;
  if (fromTag) return fromTag;
  if (info) {
    const fromKey = info.year ? levelFromText(String(info.year)) : levelFromText(info.role ?? '');
    if (fromKey) return fromKey;
    if (info.isOffService) return { type: 'rotator', flags: {} };
  }
  return { type: 'senior_resident', unknownLevel: true, flags: { unknownLevel: true } };
}

/** Read a level from a tag or key cell. Null when the text says nothing the app can use. */
function levelFromText(text: string): Level | null {
  const t = text.trim();
  const year = t.match(/^([1-5])(?!\d)/);
  if (year) return { type: mapPgyToProviderType({ year: Number(year[1]) }), flags: {} };
  // Dental residents are listed on teams but add no strength (Julian, Decision 42).
  if (/dental/i.test(t)) return { type: 'rotator', countsZero: true, flags: { countsZero: true } };
  if (/^(IM|PEM)\b|PEM\s*Fellow|Off[- ]?Service|Rotat/i.test(t)) return { type: 'rotator', flags: {} };
  if (/^PA\b/i.test(t)) return { type: 'pa', flags: {} };
  return null;
}

/**
 * Extract providers from a day block.
 * Scans rows within the block, identifies role sections by label,
 * reads time/name column pairs for each team.
 */
function extractDayProviders(
  sheet: XLSX.WorkSheet,
  block: DayBlock,
  pgyMap: Record<string, PgyInfo>,
  opts: ParseOptions = {},
): { providers: ScheduleProvider[]; floatAttendings: FloatAttending[] } {
  const providers: ScheduleProvider[] = [];
  const floatAttendings: FloatAttending[] = [];
  const seen = new Set<string>(); // "teamId-NAME" for dedup

  // Scan for role label rows within the block
  // Role labels appear in the time columns (odd cols) of each team
  // The A-side section is read only by the trial parser.
  type RoleSection = {
    role: 'attending' | 'pa' | 'resident' | 'float_attending' | 'a_side' | 'skip';
    row: number;
  };
  const roleSections: RoleSection[] = [];

  for (let r = block.startRow; r < block.endRow; r++) {
    // Check ALL team time columns for role labels (not just first team)
    for (const [timeCol] of block.teamColPairs) {
      const val = cellStr(sheet, r, timeCol);

      if (/^Attending$/i.test(val)) {
        if (!roleSections.some(s => s.row === r)) roleSections.push({ role: 'attending', row: r });
        break;
      } else if (/^PA$/i.test(val)) {
        if (!roleSections.some(s => s.row === r)) roleSections.push({ role: 'pa', row: r });
        break;
      } else if (/^Resident/i.test(val)) {
        if (!roleSections.some(s => s.row === r)) roleSections.push({ role: 'resident', row: r });
        break;
      } else if (/^Float\s*Attend/i.test(val)) {
        if (!roleSections.some(s => s.row === r)) roleSections.push({ role: 'float_attending', row: r });
        break;
      } else if (/^A-Side/i.test(val)) {
        if (!roleSections.some(s => s.row === r)) roleSections.push({ role: opts.live ? 'a_side' : 'skip', row: r });
        break;
      }
    }
  }

  // Sort by row to ensure correct ordering
  roleSections.sort((a, b) => a.row - b.row);

  // For each role section, scan from that row to the next role section
  for (let si = 0; si < roleSections.length; si++) {
    const section = roleSections[si];
    if (section.role === 'skip') continue; // Preserve the legacy reading.

    const nextRow = si + 1 < roleSections.length
      ? roleSections[si + 1].row
      : block.endRow;

    // Data rows start 1 below the label row
    for (let r = section.row + 1; r < nextRow; r++) {

      for (let ti = 0; ti < block.teamColPairs.length; ti++) {
        const [timeCol, nameCol] = block.teamColPairs[ti];
        const teamId = (ti + 1) as TeamId;
        if (section.role === 'a_side' && teamId === 4) continue;
        const timeVal = cellStr(sheet, r, timeCol);
        const nameVal = cellStr(sheet, r, nameCol);

        // Skip if this row has another role label (e.g. we hit "PA" for this team)
        if (/^(Attending|PA|Resident|Float|A-Side|B-Side|N-side|Swing|Team)/i.test(timeVal) && !isShiftTime(timeVal, opts.live)) {
          continue;
        }

        if (!nameVal || nameVal.length < 2) continue;

        // Skip B-side, N-side, Swing annotations in names
        if (/^(B-side|N-side|Swing)/i.test(nameVal)) continue;

        const cleanName = cleanProviderName(nameVal, opts.live);
        if (!cleanName || cleanName.length < 2) continue;
        // Live: an unfilled slot ("OPEN", "TBD") is nobody.
        if (opts.live && PLACEHOLDER.test(cleanName)) continue;
        // Live: a day swing resident covers two teams ("WELLS [3] (Swing T1/T3)").
        const swingPair: TeamId[] | undefined = section.role === 'a_side'
          ? [1, 2, 3]
          : opts.live ? gridSwingTeams(nameVal) : undefined;

        // Parse shift time
        let shiftStart: string | undefined;
        let shiftEnd: string | undefined;
        if (isShiftTime(timeVal, opts.live)) {
          const parsed = parseShiftTime(timeVal, opts.live);
          if (parsed) {
            shiftStart = parsed.shiftStart;
            shiftEnd = parsed.shiftEnd;
          }
        }

        if (section.role === 'float_attending') {
          // Float attendings: collect uniquely, not per-team
          // Skip values that look like section headers or PGY table content
          if (/^(Residents?|PGY|AOC|NAOC|EM|PEM|Name|RESIDENT)$/i.test(cleanName)) continue;
          if (!floatAttendings.some(f => f.name === cleanName)) {
            floatAttendings.push({ name: cleanName, shiftStart, shiftEnd });
          }
          continue;
        }

        const dedupKey = `${teamId}-${cleanName.toLowerCase()}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        let type: ProviderType;
        if (section.role === 'attending') {
          type = 'attending';
        } else if (section.role === 'pa') {
          type = 'pa';
        } else if (section.role === 'resident' || section.role === 'a_side') {
          const lv = residentLevel(nameVal, cleanName, pgyMap, opts);
          if (lv.unknownLevel || lv.countsZero) {
            providers.push({ name: cleanName, type: lv.type, teamId, shiftStart, shiftEnd, ...lv.flags, ...(swingPair ? { coverTeams: swingPair, coverSource: section.role === 'a_side' ? 'a_side' as const : 'day_swing' as const } : {}) });
            continue;
          }
          type = lv.type;
        } else {
          type = 'senior_resident';
        }

        providers.push({ name: cleanName, type, teamId, shiftStart, shiftEnd, ...(swingPair ? { coverTeams: swingPair, coverSource: section.role === 'a_side' ? 'a_side' as const : 'day_swing' as const } : {}) });
      }
    }
  }

  // Parse OVN column: overnight providers assigned to specific teams
  // OVN column layout:
  //   "T1 11P-7A" / "T2 11P-7A" → team-specific overnight attending
  //   "P 11P-7A" → PEDs overnight attending (IGNORE — not ER team)
  //   PA section: "N-side" = Team 1, "B-side" = Team 2, "Swing" = both teams
  //   RESIDENT section: "B-Side 8P-6A" with name, same side mapping
  if (block.ovnColPair) {
    const [ovnTimeCol, ovnNameCol] = block.ovnColPair;
    let ovnRole: 'attending' | 'pa' | 'resident' | null = null;
    // Track current side assignment from labels like "N-side", "B-side", "Swing"
    let currentSide: 'n-side' | 'b-side' | 'swing' | null = null;

    for (let r = block.startRow; r < block.endRow; r++) {
      const timeVal = cellStr(sheet, r, ovnTimeCol);
      const nameVal = cellStr(sheet, r, ovnNameCol);

      // Track role sections within OVN
      if (/^Attending$/i.test(timeVal)) { ovnRole = 'attending'; currentSide = null; continue; }
      if (/^PA$/i.test(timeVal)) { ovnRole = 'pa'; currentSide = null; continue; }
      if (/^RESIDENT$/i.test(timeVal)) { ovnRole = 'resident'; currentSide = null; continue; }

      // Skip non-provider rows
      if (/^(OVN|AOC|EM|PEM|NAOC)/i.test(timeVal)) continue;

      // Track side labels — can appear in time col, name col, or col before time col
      // N-side = Teams 1 & 3, B-side = Teams 2 & 4, Swing = all teams
      const prevColVal = ovnTimeCol > 0 ? cellStr(sheet, r, ovnTimeCol - 1) : '';
      const sideVals = [timeVal, nameVal, prevColVal];
      for (const sv of sideVals) {
        if (/^N-side/i.test(sv)) { currentSide = 'n-side'; break; }
        if (/^B-[Ss]ide/i.test(sv)) { currentSide = 'b-side'; break; }
        if (/^Swing/i.test(sv)) { currentSide = 'swing'; break; }
      }
      // Live: newer sheets write the side with a home team, "T2 / B-side", "T3 / N-side", "T2 / Swing".
      // N-side covers Teams 1 and 3, B-side Teams 2 and 4 (Julian, Decision 42). "Tn / Swing" is read
      // as a swing on that team's side (an assumption, flagged for Julian).
      if (opts.live) {
        for (const sv of sideVals) {
          const m = sv.match(/^T([1-4])\s*\/\s*(N-?\s*side|B-?\s*side|Swing)/i);
          if (!m) continue;
          const word = m[2].toLowerCase();
          currentSide = word.startsWith('n') ? 'n-side' : word.startsWith('b') ? 'b-side' : ([1, 3].includes(Number(m[1])) ? 'n-side' : 'b-side');
          break;
        }
      }

      // Team-specific overnight attending: "T1 11P-7A" or "T2 11P-7A"
      const teamShiftMatch = timeVal.match(rx(opts.live).team);
      if (teamShiftMatch && nameVal && nameVal.length >= 2) {
        const ovnTeamId = parseInt(teamShiftMatch[1], 10) as TeamId;
        const cleanName = cleanProviderName(nameVal, opts.live);
        if (!cleanName || cleanName.length < 2) continue;
        if (/^\d{3}/.test(cleanName)) continue;

        const dedupKey = `${ovnTeamId}-${cleanName.toLowerCase()}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          providers.push({
            name: cleanName,
            type: 'attending',
            teamId: ovnTeamId,
            shiftStart: teamShiftMatch[2],
            shiftEnd: teamShiftMatch[3],
          });
        }
        continue;
      }

      // "P 11P-7A" = PEDs overnight attending → SKIP (not ER team)
      if (/^P\s+\d/i.test(timeVal)) continue;

      // Regular OVN shift rows: time in ovnTimeCol, name in ovnNameCol
      // The name may be in the same cell as a side label (e.g. "B-Side" in nameCol with shift in timeCol)
      // or on a row following the side label
      const targetName = nameVal;
      // If name column has a side label, the actual name might be after it
      if (/^(N-side|B-[Ss]ide|Swing)$/i.test(targetName)) {
        // Side label only — no name on this row, skip
        continue;
      }

      if (targetName && targetName.length >= 2 && isShiftTime(timeVal, opts.live)) {
        const cleanName = cleanProviderName(targetName, opts.live);
        if (!cleanName || cleanName.length < 2) continue;
        if (opts.live && PLACEHOLDER.test(cleanName)) continue;
        if (/^\d{3}/.test(cleanName)) continue;

        const shift = parseShiftTime(timeVal, opts.live);
        if (!shift) continue;

        let type: ProviderType;
        let ovnFlags: Pick<ScheduleProvider, 'unknownLevel' | 'countsZero'> = {};
        if (ovnRole === 'pa') {
          type = 'pa';
        } else if (ovnRole === 'resident') {
          const lv = residentLevel(targetName, cleanName, pgyMap, opts);
          type = lv.type;
          ovnFlags = lv.flags;
        } else {
          type = 'attending';
        }

        // Map side to team: N-side=Teams 1&3, B-side=Teams 2&4, Swing=all
        const teams: TeamId[] = currentSide === 'n-side' ? [1, 3]
          : currentSide === 'b-side' ? [2, 4]
          : currentSide === 'swing' ? [1, 2, 3, 4]
          : [1]; // default to team 1 if no side specified

        for (const tid of teams) {
          const dedupKey = `${tid}-${cleanName.toLowerCase()}`;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
          providers.push({
            name: cleanName,
            type,
            teamId: tid,
            shiftStart: shift.shiftStart,
            shiftEnd: shift.shiftEnd,
            ...(opts.live ? { ...ovnFlags, ...(currentSide ? { coverTeams: teams, coverSource: 'overnight' as const } : {}) } : {}),
          });
        }
      }
    }
  }

  // Deduplicate float attendings by name
  const seenFloats = new Set<string>();
  const dedupedFloats = floatAttendings.filter(f => {
    if (seenFloats.has(f.name)) return false;
    seenFloats.add(f.name);
    return true;
  });
  return { providers, floatAttendings: dedupedFloats };
}

/**
 * Parse a weekly schedule workbook.
 */
export function parseWeeklySchedule(data: ArrayBuffer, opts: ParseOptions = {}): ParsedSchedule {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('No sheet found in workbook');

  const pgyMap = extractPgyKey(sheet, opts);
  const dayBlocks = findDayBlocks(sheet);

  const days: DaySchedule[] = dayBlocks.map(block => {
    const { providers, floatAttendings } = extractDayProviders(sheet, block, pgyMap, opts);
    return {
      date: block.dateLabel,
      dayOfWeek: block.dayOfWeek,
      providers,
      floatAttendings,
      ...(opts.live && block.isoDate ? { isoDate: block.isoDate } : {}),
    };
  });

  return { days, pgyMap };
}

/**
 * Filter providers by target time (hour of day, 0-23).
 */
export function getProvidersForShift(
  daySchedule: DaySchedule,
  targetHour: number,
): { providers: ScheduleProvider[]; floatAttendings: string[] } {
  const filtered = daySchedule.providers.filter(p =>
    isWithinShift(p.shiftStart, p.shiftEnd, targetHour)
  );
  const filteredFloats = daySchedule.floatAttendings
    .filter(f => isWithinShift(f.shiftStart, f.shiftEnd, targetHour))
    .map(f => f.name);
  return { providers: filtered, floatAttendings: filteredFloats };
}
