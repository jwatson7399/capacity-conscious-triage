// © 2026 New York University. All rights reserved.
//
// Checks against the real weekly schedules in data/provider-schedules/schedules/. That folder holds
// real names, is kept out of git and never ships, so on a machine without it these tests are skipped.
// Only file names and hashes appear here, never a provider name.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseWeeklySchedule } from '../utils/scheduleParser';
import { buildSlots, datedDays, openTeams, rosterAt, unresolved } from './week';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/provider-schedules/schedules');
const files = existsSync(DIR) ? readdirSync(DIR).filter(f => f.endsWith('.xlsx') && f !== 'demo-schedule.xlsx').sort() : [];
const read = (f: string) => { const b = readFileSync(path.join(DIR, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

/**
 * The benchmark and replay scripts read schedules with the legacy parser (no options). These hashes
 * pin that reading as it was on main at e51714f, so the trial changes cannot move a recorded figure.
 */
const LEGACY: Record<string, string> = {
  "August_24_Weekly_Schedule.xlsx": "54f84c758ab75ec7",
  "August_31_Weekly_Schedule.xlsx": "65298abedd31194c",
  "Department Schedule Week December 1_Updated.xlsx": "4f6697d05007c113",
  "Department Schedule Week December 22.xlsx": "04f18b4debaa05f3",
  "Department Schedule Week December 29.xlsx": "07a9c24598c516a7",
  "Department Schedule Week December 8.xlsx": "05e1d0dbcc83afb9",
  "February 16_Weekly Schedule.xlsx": "cb0ecdf4fc67af82",
  "February 2_Weekly Schedule1 (1).xlsx": "f078f2aaaf447f7d",
  "February 9_Weekly Schedule_v2.xlsx": "8ccdb135afe28032",
  "January 12_Weekly Schedule.xlsx": "56f6467639c6b9b9",
  "January 26_Weekly Schedule (1).xlsx": "5d85fd5f98021c05",
  "March 2_Weekly Schedule.xlsx": "19b1e9be7e63bb85",
  "September_14_Weekly_Schedule.xlsx": "5376404b9ed1975d",
  "September_21_Weekly_Schedule.xlsx": "c66aec321634183e",
  "September_28_Weekly_Schedule.xlsx": "0541d159fad377f7",
  "September_7_Weekly_Schedule.xlsx": "8700422392039361",
  "Weekly Schedule Week December 15.xlsx": "5c339419b6e469dc"
};

describe.skipIf(files.length === 0)('real weekly schedules (local only)', () => {
  it.each(files.filter(f => f in LEGACY))('legacy reading unchanged: %s', f => {
    const h = createHash('sha256').update(JSON.stringify(parseWeeklySchedule(read(f)))).digest('hex').slice(0, 16);
    expect(h).toBe(LEGACY[f]);
  });

  it.each(files)('trial reading holds the shift rules: %s', f => {
    const parsed = parseWeeklySchedule(read(f), { live: true });
    const { days } = datedDays(parsed.days);
    expect(days).toHaveLength(7);
    // Every resident either has a level from the sheet or is flagged for a person to pick.
    const known = Object.fromEntries(unresolved(days, {}).map(n => [n.toLowerCase(), 'senior_resident' as const]));
    const { slots } = buildSlots({ days, roleFixes: known });
    expect(slots.every(s => !s.unknownLevel)).toBe(true);
    const t0 = new Date(`${days[0].isoDate}T07:00:00`).getTime();
    for (let t = t0; t < t0 + 6 * 86_400_000; t += 15 * 60_000) {
      const open = openTeams(slots, t);
      const h = new Date(t).getHours();
      expect(open.has(1) && open.has(2)).toBe(true);
      if (h >= 23 || h < 7) expect(open.has(3)).toBe(false);
      if (h < 7) expect(open.has(4)).toBe(false);
      // Nobody counts for more than one full provider, however many teams they cover.
      const per = new Map<string, number>();
      for (const e of rosterAt(slots, t)) per.set(e.scheduleKey.split('#')[0], (per.get(e.scheduleKey.split('#')[0]) ?? 0) + e.share);
      for (const v of per.values()) expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it.each(files)('the overnight crew at 3 AM is the one that started the evening before: %s', f => {
    const { days } = datedDays(parseWeeklySchedule(read(f), { live: true }).days);
    const { slots } = buildSlots({ days, roleFixes: {} });
    for (let i = 1; i < days.length; i++) {
      const t = new Date(`${days[i].isoDate}T03:00:00`).getTime();
      const on = new Set(rosterAt(slots, t).map(e => e.scheduleKey.split('#')[0]));
      const prevNight = slots.filter(s => s.key.startsWith(days[i - 1].isoDate) && s.start <= t && s.end > t);
      const laterToday = slots.filter(s => s.key.startsWith(days[i].isoDate) && s.start > t);
      expect(prevNight.length).toBeGreaterThan(0);
      for (const s of prevNight) expect(on.has(s.key)).toBe(true);
      for (const s of laterToday) expect(on.has(s.key)).toBe(false);
    }
  });
});
