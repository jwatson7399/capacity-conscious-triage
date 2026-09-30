import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseWeeklySchedule, getProvidersForShift } from './scheduleParser';

/** Helper: build a workbook from a 2D array */
function makeWorkbook(cells: (string | number | null)[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(cells);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

const FIXTURE_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__/schedule.xlsx');
const REAL_FILE = FIXTURE_FILE;

describe('scheduleParser — fixture xlsx (Feb 23 week)', () => {
  let result: ReturnType<typeof parseWeeklySchedule>;

  describe('parse results', () => {
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
      expect(result.pgyMap['intern_t1']).toEqual({ year: 1 });
      expect(result.pgyMap['junior_t2']).toEqual({ year: 2 });
      expect(result.pgyMap['senior_t3']).toEqual({ year: 4 });
      expect(result.pgyMap['jr_bside']).toEqual({ year: 2 });
    });

    it('Monday 9 AM: Team 1 has a day attending', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 9);
      const team1 = providers.filter(p => p.teamId === 1);
      const names = team1.map(p => p.name);
      expect(names).toContain('ATTENDING_T1_DAY');
      const attending = team1.find(p => p.name === 'ATTENDING_T1_DAY')!;
      expect(attending.type).toBe('attending');
      expect(attending.shiftStart).toBe('7A');
      expect(attending.shiftEnd).toBe('3P');
    });

    it('Monday 9 AM: Team 2 has a day attending', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 9);
      const team2 = providers.filter(p => p.teamId === 2);
      expect(team2.map(p => p.name)).toContain('ATTENDING_T2_DAY');
    });

    it('Monday 9 AM: Team 1 has a PA', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 9);
      const team1PAs = providers.filter(p => p.teamId === 1 && p.type === 'pa');
      expect(team1PAs.map(p => p.name)).toContain('PA_T1_DAY');
    });

    it('Monday 9 AM: Team 1 has an intern resident', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 9);
      const intern = providers.find(p => p.name === 'INTERN_T1' && p.teamId === 1);
      expect(intern).toBeDefined();
      expect(intern!.type).toBe('intern'); // PGY-1
    });

    it('Monday: no A-Side providers should appear on teams 1-4', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const aSideProviders = monday.providers.filter(p => p.name === 'ASIDE_SKIP');
      expect(aSideProviders).toHaveLength(0);
    });

    it('Monday: has morning and evening float attendings', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const floatNames = monday.floatAttendings.map(f => f.name);
      expect(floatNames).toContain('FLOAT_AM');
      expect(floatNames).toContain('FLOAT_PM');
      // Verify shift times are captured
      const morningFloat = monday.floatAttendings.find(f => f.name === 'FLOAT_AM')!;
      expect(morningFloat.shiftStart).toBe('10A');
      expect(morningFloat.shiftEnd).toBe('6P');
      const eveningFloat = monday.floatAttendings.find(f => f.name === 'FLOAT_PM')!;
      expect(eveningFloat.shiftStart).toBe('2P');
      expect(eveningFloat.shiftEnd).toBe('10P');
    });

    it('Monday: float attendings filtered by shift time', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      // FLOAT_AM is 10A-6P, FLOAT_PM is 2P-10P

      // At 9 AM: neither float should be present
      const am9 = getProvidersForShift(monday, 9);
      expect(am9.floatAttendings).not.toContain('FLOAT_AM');
      expect(am9.floatAttendings).not.toContain('FLOAT_PM');

      // At 11 AM: morning float yes, evening float no
      const am11 = getProvidersForShift(monday, 11);
      expect(am11.floatAttendings).toContain('FLOAT_AM');
      expect(am11.floatAttendings).not.toContain('FLOAT_PM');

      // At 3 PM: both present
      const pm3 = getProvidersForShift(monday, 15);
      expect(pm3.floatAttendings).toContain('FLOAT_AM');
      expect(pm3.floatAttendings).toContain('FLOAT_PM');

      // At 7 PM: evening float yes, morning float no
      const pm7 = getProvidersForShift(monday, 19);
      expect(pm7.floatAttendings).toContain('FLOAT_PM');
      expect(pm7.floatAttendings).not.toContain('FLOAT_AM');

      // At 11 PM: neither
      const pm11 = getProvidersForShift(monday, 23);
      expect(pm11.floatAttendings).not.toContain('FLOAT_AM');
      expect(pm11.floatAttendings).not.toContain('FLOAT_PM');
    });

    it('Monday 7 PM: evening attending is on Team 1', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 19);
      const team1Eve = providers.filter(p => p.teamId === 1 && p.type === 'attending');
      expect(team1Eve.map(p => p.name)).toContain('ATTENDING_T1_EVE');
      // Morning attending should NOT be present at 7PM
      expect(team1Eve.map(p => p.name)).not.toContain('ATTENDING_T1_DAY');
    });

    it('Friday: has providers in the right grid layout', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const friday = result.days.find(d => d.dayOfWeek === 'Friday');
      expect(friday).toBeDefined();
      expect(friday!.providers.length).toBeGreaterThan(0);
      const { providers } = getProvidersForShift(friday!, 9);
      const team1Names = providers.filter(p => p.teamId === 1).map(p => p.name);
      expect(team1Names).toContain('ATTENDING_T1_FRIDAY');
    });

    it('Thursday: Team 1 and Team 4 have expected attendings', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const thursday = result.days.find(d => d.dayOfWeek === 'Thursday')!;
      const { providers } = getProvidersForShift(thursday, 9);
      expect(providers.filter(p => p.teamId === 1 && p.type === 'attending').map(p => p.name)).toContain('ATTENDING_T1_THURSDAY');
      expect(providers.filter(p => p.teamId === 4 && p.type === 'attending').map(p => p.name)).toContain('ATTENDING_T4_THURSDAY');
    });

    it('Monday midnight: OVN attendings on Team 1 and Team 2 present', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 0); // midnight
      const names = providers.map(p => p.name);
      expect(names).toContain('OVN_ATT_T1');
      expect(names).toContain('OVN_ATT_T2');
      const ovnAttending = providers.find(p => p.name === 'OVN_ATT_T1');
      expect(ovnAttending?.teamId).toBe(1);
      expect(ovnAttending?.type).toBe('attending');
    });

    it('Monday midnight: PEDs overnight attending row is excluded', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 0);
      const pedsOvernight = providers.find(p => p.name === 'PEDS_OVN_SKIP');
      expect(pedsOvernight).toBeUndefined();
    });

    it('Monday midnight: OVN PAs mapped to correct teams (N-side=T1+T3, B-side=T2+T4, Swing=all)', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 0);
      const bSide = providers.filter(p => p.name === 'OVN_PA_BSIDE');
      expect(bSide.length).toBe(2);
      expect(bSide.map(p => p.teamId).sort()).toEqual([2, 4]);
      expect(bSide[0]?.type).toBe('pa');
      const nSide = providers.filter(p => p.name === 'OVN_PA_NSIDE');
      expect(nSide.length).toBe(2);
      expect(nSide.map(p => p.teamId).sort()).toEqual([1, 3]);
      expect(nSide[0]?.type).toBe('pa');
      const swing = providers.filter(p => p.name === 'OVN_PA_SWING');
      expect(swing.length).toBe(4);
      expect(swing.map(p => p.teamId).sort()).toEqual([1, 2, 3, 4]);
      const swing2 = providers.filter(p => p.name === 'OVN_PA_SWING2');
      expect(swing2.length).toBe(4);
    });

    it('Monday 9 AM: OVN providers should NOT appear', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const monday = result.days[0];
      const { providers } = getProvidersForShift(monday, 9);
      const names = providers.map(p => p.name);
      expect(names).not.toContain('OVN_ATT_T1');
      expect(names).not.toContain('OVN_ATT_T2');
      expect(names).not.toContain('OVN_PA_BSIDE');
    });

    it('Thursday midnight: OVN resident on B-Side (Teams 2 & 4)', () => {
      const buf = fs.readFileSync(REAL_FILE);
      result = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const thursday = result.days.find(d => d.dayOfWeek === 'Thursday')!;
      const { providers } = getProvidersForShift(thursday, 0);
      const resident = providers.filter(p => p.name === 'JR_BSIDE' && p.shiftStart === '8P');
      expect(resident.length).toBe(2);
      expect(resident.map(p => p.teamId).sort()).toEqual([2, 4]); // B-Side = Teams 2 & 4
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

describe('trial (live) reading, Roundtable Decisions 41 and 42', () => {
  // Made-up names. Layout as in the Aug to Sep 2026 sheets: level tags in brackets, times without a
  // colon, a PGY key headed "Resident Name", overnight side labels written as "T2 / B-side".
  const cells: (string | number | null)[][] = [
    [null, 'Team 1', null, 'Team 2', null, 'Team 3', null, 'Team 4', null, null, null, null, null, 'OVN'],
    ['Monday', 'Attending', null, 'Attending', null, 'Attending', null, 'Attending', null, null, null, null, null, 'Attending'],
    [46293, '7A-3P', 'DOCA', null, null, null, null, null, null, null, null, null, null, 'T1 11P-7A', 'NIGHTDOC'],
    [null, 'Resident', null, 'Resident', null, 'Resident', null, 'Resident', null, null, null, null, null, 'PA'],
    [null, '830A-5P', 'SMILE [DENTAL]', '9A-7P', 'WELLS [2]', '10A-8P', 'ROTA [IM]', '9A-7P', 'OPEN', null, null, null, 'T2 / B-side', '7P-7A', 'BEEPA'],
    [null, '9A-7P', 'HALVES [3] (Swing T1/T3)', '9A-7P', 'NOKEY', '9A-7P', 'KEYED', null, null, null, null, null, null, 'RESIDENT'],
    [null, null, null, null, null, null, null, null, null, null, null, null, 'T1 / N-side', '8P-6A', 'NRES [4]'],
    [],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'Resident Name', 'PGY'],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'KEYED', 1],
  ];
  const live = parseWeeklySchedule(makeWorkbook(cells), { live: true }).days[0];
  const legacy = parseWeeklySchedule(makeWorkbook(cells)).days[0];
  const find = (d: typeof live, name: string, team?: number) => d.providers.find(p => p.name === name && (team === undefined || p.teamId === team));

  it('gives the calendar date', () => {
    expect(live.isoDate).toBe('2026-09-28');
    expect(legacy.isoDate).toBeUndefined();
  });
  it('reads bracket levels, times without a colon, and dental at 0', () => {
    expect(find(live, 'WELLS')?.type).toBe('junior_resident');
    expect(find(live, 'ROTA')?.type).toBe('rotator');
    expect(find(live, 'SMILE')).toMatchObject({ countsZero: true, shiftStart: '830A', shiftEnd: '5P' });
  });
  it('finds a PGY key headed "Resident Name"', () => {
    expect(find(live, 'KEYED')?.type).toBe('intern');
  });
  it('flags a resident with no level instead of guessing', () => {
    expect(find(live, 'NOKEY')).toMatchObject({ unknownLevel: true });
  });
  it('skips an unfilled slot', () => {
    expect(find(live, 'OPEN')).toBeUndefined();
  });
  it('reads a day swing resident as covering two teams', () => {
    expect(find(live, 'HALVES')?.coverTeams).toEqual([1, 3]);
  });
  it('reads "T2 / B-side" and "T1 / N-side" overnight labels as side cover', () => {
    expect(find(live, 'BEEPA', 2)?.coverTeams).toEqual([2, 4]);
    expect(find(live, 'BEEPA', 4)?.coverTeams).toEqual([2, 4]);
    expect(find(live, 'NRES', 1)).toMatchObject({ type: 'senior_resident', coverTeams: [1, 3] });
    expect(find(live, 'NRES', 3)).toBeDefined();
  });
  it('the legacy reading used by the benchmark scripts is unchanged', () => {
    // No bracket levels, no colonless times, no "Resident Name" key, no flags.
    expect(find(legacy, 'KEYED')?.type).toBe('senior_resident');
    expect(find(legacy, 'SMILE')?.shiftStart).toBeUndefined();
    expect(find(legacy, 'NOKEY')?.unknownLevel).toBeUndefined();
    expect(find(legacy, 'HALVES')?.coverTeams).toBeUndefined();
  });
});
