import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { parseWeeklySchedule, getProvidersForShift, extractPgyKey } from './scheduleParser';

/** Helper: build a workbook from a 2D array */
function makeWorkbook(cells: (string | number | null)[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(cells);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

// ── Real file integration test ────────────────────────────────────────────────
const REAL_FILE = path.resolve(
  process.env.HOME ?? '',
  'Downloads/Week of 2.23.2026 - BK ED Schedule.xlsx',
);
const hasRealFile = fs.existsSync(REAL_FILE);

describe('scheduleParser — real xlsx (Feb 23 week)', () => {
  const describeReal = hasRealFile ? describe : describe.skip;

  let result: ReturnType<typeof parseWeeklySchedule>;

  describeReal('parse results', () => {
    it('parses without errors', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      expect(result).toBeDefined();
    });

    it('finds all 7 days', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      expect(result.days.length).toBe(7);
    });

    it('days are in calendar order Mon-Sun', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const dayNames = result.days.map(d => d.dayOfWeek);
      expect(dayNames).toEqual([
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
      ]);
    });

    it('Monday has correct date label', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      expect(result.days[0].date).toBe('February 23');
    });

    it('extracts PGY map', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      expect(result.pgyMap['luce']).toEqual({ year: 1 });
      expect(result.pgyMap['friend']).toEqual({ year: 2 });
      expect(result.pgyMap['fetterolf']).toEqual({ year: 4 });
      expect(result.pgyMap['jakupco']).toEqual({ year: 3 });
    });

    it('Monday 9 AM: Team 1 has SINDKAR (attending)', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 9);
      const team1 = providers.filter(p => p.teamId === 1);
      const names = team1.map(p => p.name);
      expect(names).toContain('SINDKAR');
      const sindkar = team1.find(p => p.name === 'SINDKAR')!;
      expect(sindkar.type).toBe('attending');
      expect(sindkar.shiftStart).toBe('7A');
      expect(sindkar.shiftEnd).toBe('3P');
    });

    it('Monday 9 AM: Team 2 has SENA (attending)', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 9);
      const team2 = providers.filter(p => p.teamId === 2);
      expect(team2.map(p => p.name)).toContain('SENA');
    });

    it('Monday 9 AM: Team 1 has Flores (PA)', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 9);
      const team1PAs = providers.filter(p => p.teamId === 1 && p.type === 'pa');
      expect(team1PAs.map(p => p.name)).toContain('Flores');
    });

    it('Monday 9 AM: Team 1 has LUCE (resident, intern PGY-1)', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 9);
      const luce = providers.find(p => p.name === 'LUCE' && p.teamId === 1);
      expect(luce).toBeDefined();
      expect(luce!.type).toBe('intern'); // PGY-1
    });

    it('Monday: no A-Side providers (GAZZOLA should not appear on teams 1-4)', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      // GAZZOLA is listed under A-Side — should be excluded
      const gazzola = monday.providers.filter(p => p.name === 'GAZZOLA');
      expect(gazzola).toHaveLength(0);
    });

    it('Monday: has float attendings PIRES and FRANCK', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const floatNames = monday.floatAttendings.map(f => f.name);
      expect(floatNames).toContain('PIRES');
      expect(floatNames).toContain('FRANCK');
      // Verify shift times are captured
      const pires = monday.floatAttendings.find(f => f.name === 'PIRES')!;
      expect(pires.shiftStart).toBe('10A');
      expect(pires.shiftEnd).toBe('6P');
      const franck = monday.floatAttendings.find(f => f.name === 'FRANCK')!;
      expect(franck.shiftStart).toBe('2P');
      expect(franck.shiftEnd).toBe('10P');
    });

    it('Monday: float attendings filtered by shift time', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      // PIRES is 10A-6P, FRANCK is 2P-10P

      // At 9 AM: neither float should be present
      const am9 = getProvidersForShift(monday, 9);
      expect(am9.floatAttendings).not.toContain('PIRES');
      expect(am9.floatAttendings).not.toContain('FRANCK');

      // At 11 AM: PIRES yes, FRANCK no
      const am11 = getProvidersForShift(monday, 11);
      expect(am11.floatAttendings).toContain('PIRES');
      expect(am11.floatAttendings).not.toContain('FRANCK');

      // At 3 PM: both present
      const pm3 = getProvidersForShift(monday, 15);
      expect(pm3.floatAttendings).toContain('PIRES');
      expect(pm3.floatAttendings).toContain('FRANCK');

      // At 7 PM: FRANCK yes, PIRES no
      const pm7 = getProvidersForShift(monday, 19);
      expect(pm7.floatAttendings).toContain('FRANCK');
      expect(pm7.floatAttendings).not.toContain('PIRES');

      // At 11 PM: neither
      const pm11 = getProvidersForShift(monday, 23);
      expect(pm11.floatAttendings).not.toContain('PIRES');
      expect(pm11.floatAttendings).not.toContain('FRANCK');
    });

    it('Monday 7 PM: evening attending CHU on Team 1', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 19);
      const team1Eve = providers.filter(p => p.teamId === 1 && p.type === 'attending');
      expect(team1Eve.map(p => p.name)).toContain('CHU');
      // Morning attending SINDKAR should NOT be present at 7PM
      expect(team1Eve.map(p => p.name)).not.toContain('SINDKAR');
    });

    it('Friday: has providers (right grid)', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const friday = result.days.find(d => d.dayOfWeek === 'Friday');
      expect(friday).toBeDefined();
      expect(friday!.providers.length).toBeGreaterThan(0);
      const { providers } = getProvidersForShift(friday!, 9);
      const team1Names = providers.filter(p => p.teamId === 1).map(p => p.name);
      expect(team1Names).toContain('WITTMAN');
    });

    it('Thursday: Team 1 has BEHAN attending, Team 4 has MARSHALL attending', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const thursday = result.days.find(d => d.dayOfWeek === 'Thursday')!;
      const { providers } = getProvidersForShift(thursday, 9);
      expect(providers.filter(p => p.teamId === 1 && p.type === 'attending').map(p => p.name)).toContain('BEHAN');
      expect(providers.filter(p => p.teamId === 4 && p.type === 'attending').map(p => p.name)).toContain('MARSHALL');
    });

    it('Monday midnight: OVN attendings ALBERT (T1) and BOWEN-SPINELLI (T2) present', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 0); // midnight
      const names = providers.map(p => p.name);
      expect(names).toContain('ALBERT');
      expect(names).toContain('BOWEN-SPINELLI');
      // OVN attending ALBERT should be on Team 1
      const albert = providers.find(p => p.name === 'ALBERT');
      expect(albert?.teamId).toBe(1);
      expect(albert?.type).toBe('attending');
    });

    it('Monday midnight: PEDs overnight attending (P 11P-7A LA) is excluded', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 0);
      // LA is PEDs overnight — should NOT appear
      const la = providers.find(p => p.name === 'LA');
      expect(la).toBeUndefined();
    });

    it('Monday midnight: OVN PAs mapped to correct teams (N-side=T1, Swing=T1+T2)', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 0);
      // B-side 7P-7A Moskowitz → Team 2
      const moskowitz = providers.find(p => p.name === 'Moskowitz');
      expect(moskowitz?.teamId).toBe(2);
      expect(moskowitz?.type).toBe('pa');
      // N-side 7P-7A Mohamed → Team 1
      const mohamed = providers.find(p => p.name === 'Mohamed');
      expect(mohamed?.teamId).toBe(1);
      expect(mohamed?.type).toBe('pa');
      // Swing 7P-7A Thaung → both teams
      const thaung = providers.filter(p => p.name === 'Thaung');
      expect(thaung.length).toBe(2);
      expect(thaung.map(p => p.teamId).sort()).toEqual([1, 2]);
      // Swing 7P-7A ZURICA → both teams
      const zurica = providers.filter(p => p.name === 'ZURICA');
      expect(zurica.length).toBe(2);
    });

    it('Monday 9 AM: OVN providers should NOT appear', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 9);
      const names = providers.map(p => p.name);
      expect(names).not.toContain('ALBERT');
      expect(names).not.toContain('BOWEN-SPINELLI');
      expect(names).not.toContain('Moskowitz');
    });

    it('Thursday midnight: OVN resident FRIEND on B-Side (Team 2)', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const thursday = result.days.find(d => d.dayOfWeek === 'Thursday')!;
      const { providers } = getProvidersForShift(thursday, 0);
      const friend = providers.find(p => p.name === 'FRIEND' && p.shiftStart === '8P');
      expect(friend).toBeDefined();
      expect(friend?.teamId).toBe(2); // B-Side = Team 2
    });

    it('each day has at least 4 providers at 9 AM', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      for (const day of result.days) {
        const { providers } = getProvidersForShift(day, 9);
        expect(providers.length).toBeGreaterThanOrEqual(4);
      }
    });

    it('prints summary for manual verification', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      for (const day of result.days) {
        const { providers, floatAttendings } = getProvidersForShift(day, 9);
        console.log(`\n=== ${day.dayOfWeek} ${day.date} (9 AM) ===`);
        for (let t = 1; t <= 4; t++) {
          const tp = providers.filter(p => p.teamId === t);
          console.log(`  Team ${t}: ${tp.map(p => `${p.name}(${p.type})`).join(', ')}`);
        }
        if (floatAttendings.length) {
          console.log(`  Floats: ${floatAttendings.join(', ')}`);
        }
      }
    });
  });
});

// ── Unit tests with synthetic data ──────────────────────────────────────────
describe('scheduleParser — synthetic data', () => {
  it('parses a minimal schedule with two-column layout', () => {
    // Mimics real layout: time in odd cols, name in even cols
    const cells: (string | number | null)[][] = [
      [null, 'Team 1', null, 'Team 2', null, 'Team 3', null, 'Team 4'],
      ['Monday', 'Attending', null, 'Attending', null, 'Attending', null, 'Attending'],
      [46076, '7A-3P', 'SINDKAR', '7A-3P', 'SENA', '8A-4P', 'PLOWE', '9A-5P', 'WATSON'],
      [null, '3P-11P', 'CHU', '3P-11P', 'MISHRA', null, null, null],
      [null, 'PA', null, 'PA', null, 'PA', null, 'PA'],
      [null, '7A-7P', 'Flores', '7A-7P', 'Chpatchev', null, null, null],
      [null, 'Resident', null, 'Resident', null, 'Resident', null, 'Resident'],
      [null, '9A-7P', 'LUCE', null, null, '9A-7P', 'LAD', null],
      [null, 'Float Attending', null, 'Float Attending', null, 'Float Attending', null, 'Float Attending'],
      [null, '10A-6P', 'PIRES', '10A-6P', 'PIRES', '10A-6P', 'PIRES', '10A-6P', 'PIRES'],
    ];

    const result = parseWeeklySchedule(makeWorkbook(cells));
    expect(result.days).toHaveLength(1);

    const day = result.days[0];
    expect(day.dayOfWeek).toBe('Monday');
    expect(day.date).toBe('February 23');

    const { providers } = getProvidersForShift(day, 9);
    const t1 = providers.filter(p => p.teamId === 1);
    expect(t1.map(p => p.name)).toContain('SINDKAR');
    expect(t1.map(p => p.name)).toContain('Flores');
    expect(t1.map(p => p.name)).toContain('LUCE');

    expect(day.floatAttendings.map(f => f.name)).toContain('PIRES');
  });

  it('skips A-Side rows', () => {
    const cells: (string | number | null)[][] = [
      [null, 'Team 1', null, 'Team 2', null, 'Team 3', null, 'Team 4'],
      ['Monday', 'Attending', null, 'Attending', null, 'Attending', null, 'Attending'],
      [46076, '7A-3P', 'DOC', null, null, null, null, null],
      [null, 'Resident', null, 'Resident', null, 'Resident', null, 'Resident'],
      [null, '9A-7P', 'RES1', null, null, null, null, null],
      [null, 'A-Side', null, 'A-Side', null, 'A-Side'],
      [null, '10A-8P', 'GAZZOLA', '10A-8P', 'GAZZOLA', '10A-8P', 'GAZZOLA'],
    ];

    const result = parseWeeklySchedule(makeWorkbook(cells));
    const names = result.days[0].providers.map(p => p.name);
    expect(names).toContain('DOC');
    expect(names).toContain('RES1');
    expect(names).not.toContain('GAZZOLA');
  });

  it('PGY key maps residents correctly', () => {
    const cells: (string | number | null)[][] = [
      [null, 'Team 1', null, 'Team 2', null, 'Team 3', null, 'Team 4'],
      ['Monday', 'Attending', null, 'Attending', null, 'Attending', null, 'Attending'],
      [46076, '7A-3P', 'DOC', null, null, null, null, null],
      [null, 'Resident', null, 'Resident', null, 'Resident', null, 'Resident'],
      [null, '9A-7P', 'Luce', '9A-7P', 'Friend', '9A-7P', 'Fetterolf', null],
      // PGY table
      [null, null, null, null, null, null, null, null],
      ['Residents', 'PGY'],
      ['Luce', '1'],
      ['Friend', '2'],
      ['Fetterolf', '4'],
    ];

    const result = parseWeeklySchedule(makeWorkbook(cells));
    const luce = result.days[0].providers.find(p => p.name === 'Luce');
    const friend = result.days[0].providers.find(p => p.name === 'Friend');
    const fetterolf = result.days[0].providers.find(p => p.name === 'Fetterolf');
    expect(luce?.type).toBe('intern');
    expect(friend?.type).toBe('junior_resident');
    expect(fetterolf?.type).toBe('senior_resident');
  });

  it('shift filter works correctly', () => {
    const cells: (string | number | null)[][] = [
      [null, 'Team 1', null, 'Team 2', null, 'Team 3', null, 'Team 4'],
      ['Monday', 'Attending', null, 'Attending', null, 'Attending', null, 'Attending'],
      [46076, '7A-3P', 'MORNING', '3P-11P', 'EVENING', null, null, null],
    ];

    const result = parseWeeklySchedule(makeWorkbook(cells));
    const day = result.days[0];

    const am = getProvidersForShift(day, 9);
    expect(am.providers.map(p => p.name)).toContain('MORNING');
    expect(am.providers.map(p => p.name)).not.toContain('EVENING');

    const pm = getProvidersForShift(day, 19);
    expect(pm.providers.map(p => p.name)).toContain('EVENING');
    expect(pm.providers.map(p => p.name)).not.toContain('MORNING');
  });
});
