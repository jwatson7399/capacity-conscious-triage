// © 2026 New York University. All rights reserved.
// Census time helpers must give the workbook's wall-clock time on any machine (METHODS.md section 10).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  atWallHour, dateStrDayOfWeek, excelSerialToWallMs, parseWallClockString, wallDateStr, wallHour, wallTimeLabel,
} from './census-time';

// Excel serials for known wall-clock times. On a New York machine the old local-time conversion read
// arrivals from 2026-03-08 onward (daylight time) one hour late; earlier ones were read correctly.
const CASES = [
  { serial: 46037.373611111114, date: '2026-01-15', hour: 8, label: '8:58 AM' },  // before the DST change
  { serial: 46101.354166666664, date: '2026-03-20', hour: 8, label: '8:30 AM' },  // after it; old NY reading 9:30, the wrong cohort
  { serial: 46064.001388888886, date: '2026-02-11', hour: 0, label: '12:02 AM' }, // just after midnight
  { serial: 46101.979166666664, date: '2026-03-20', hour: 23, label: '11:30 PM' }, // daylight time near midnight; old NY reading 12:30 AM on Mar 21
];

describe('census time helpers', () => {
  it('read Excel serials as wall-clock date and hour', () => {
    for (const c of CASES) {
      const ms = excelSerialToWallMs(c.serial);
      expect(wallDateStr(ms)).toBe(c.date);
      expect(wallHour(ms)).toBe(c.hour);
      expect(wallTimeLabel(ms)).toBe(c.label);
    }
  });

  it('anchor shift starts on the same wall-clock date', () => {
    const ms = excelSerialToWallMs(CASES[1].serial);
    expect(wallDateStr(atWallHour(ms, 9))).toBe('2026-03-20');
    expect(wallHour(atWallHour(ms, 9))).toBe(9);
    expect(atWallHour(ms, 0)).toBe(parseWallClockString('2026-03-20'));
  });

  it('read zone-less strings as wall clock and date strings for the day of week', () => {
    expect(parseWallClockString('2026-03-20 08:30')).toBe(excelSerialToWallMs(CASES[1].serial));
    expect(dateStrDayOfWeek('2026-01-05')).toBe(1); // Monday
    expect(dateStrDayOfWeek('2026-03-08')).toBe(0); // Sunday, the DST change
  });

  it('give identical results under different machine time zones', () => {
    const helper = join(dirname(fileURLToPath(import.meta.url)), 'census-time.ts');
    const code = `import * as t from ${JSON.stringify(helper)};
      const serials = ${JSON.stringify(CASES.map(c => c.serial))};
      console.log(JSON.stringify(serials.map(s => { const ms = t.excelSerialToWallMs(s);
        return [t.wallDateStr(ms), t.wallHour(ms), t.wallTimeLabel(ms), t.atWallHour(ms, 9), t.dateStrDayOfWeek(t.wallDateStr(ms))]; })));`;
    const run = (tz: string) =>
      execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }).trim();
    const utc = run('UTC');
    expect(JSON.parse(utc).map((r: unknown[]) => r[0])).toEqual(CASES.map(c => c.date));
    expect(run('America/New_York')).toBe(utc);
    expect(run('Asia/Kolkata')).toBe(utc);
  }, 30_000);
});
