// © 2026 New York University. All rights reserved.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { clearWeek, loadWeek, readWeek, saveRoleFixes, saveWeek, storageWarning, storeRead } from './storage';
import { SCHEDULE_PARSER_VERSION, unresolved } from './week';
import { scheduleReadiness } from './start';

const now = new Date(2026, 8, 28, 12).getTime();
const KEY = 'cct-week-schedule-v1';
let saved: Map<string, string>;
function workbook(name = 'DOCTOR', aside = 'ASIDE [3]', dates = [28]): ArrayBuffer {
  const cells: (string | number | null)[][] = [];
  for (const d of dates) cells.push(
    [null, 'Team 1', null, 'Team 2', null, 'Team 3', null, 'Team 4'],
    [d === 28 ? 'Monday' : 'Tuesday', 'Attending', null, 'Attending', null, 'Attending'],
    [46293 + d - 28, '7A-11P', name, '7A-11P', 'DOCB', '7A-11P', 'DOCC'],
    [null, 'A-Side', null, 'A-Side', null, 'A-Side'],
    [null, '10A-8P', aside, '10A-8P', aside, '10A-8P', aside],
    [],
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cells), 'Schedule');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

beforeEach(() => {
  saved = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => saved.set(k, v),
    removeItem: (k: string) => saved.delete(k),
  });
  clearWeek();
});
afterEach(() => { clearWeek(); vi.unstubAllGlobals(); });

describe('saved original schedules', () => {
  it('keeps the original workbook and parser version on the device', () => {
    const read = readWeek(workbook(), 'week.xlsx');
    const w = storeRead(null, read, { remembered: 'intern' }, now);
    expect(w.parserVersion).toBe(SCHEDULE_PARSER_VERSION);
    expect(w.originals?.[0].base64).toBe(read.original.base64);
    expect(loadWeek()?.roleFixes).toEqual({ remembered: 'intern' });
    expect(JSON.parse(saved.get(KEY)!).originals).toEqual(w.originals);
  });

  it('re-reads an older saved original, gains A-side coverage and preserves role picks', () => {
    const current = storeRead(null, readWeek(workbook('DOCTOR', 'ASIDE'), 'week.xlsx'), { aside: 'senior_resident' }, now);
    const old = { ...current, parserVersion: 1, days: current.days.map(d => ({ ...d, providers: d.providers.filter(p => p.name !== 'ASIDE') })) };
    saved.set(KEY, JSON.stringify(old));
    const upgraded = loadWeek()!;
    expect(upgraded.parserVersion).toBe(SCHEDULE_PARSER_VERSION);
    expect(upgraded.days[0].providers.filter(p => p.name === 'ASIDE')).toHaveLength(3);
    expect(upgraded.roleFixes).toEqual({ aside: 'senior_resident' });
    expect(unresolved(upgraded.days, upgraded.roleFixes)).toEqual([]);
    expect(scheduleReadiness(upgraded, now).canStart).toBe(true);
    expect(JSON.parse(saved.get(KEY)!).parserVersion).toBe(SCHEDULE_PARSER_VERSION);
  });

  it('newly discovered unknown roles block starting until picked', () => {
    const current = storeRead(null, readWeek(workbook('DOCTOR', 'ASIDE'), 'week.xlsx'), { aside: 'senior_resident' }, now);
    saved.set(KEY, JSON.stringify({ ...current, parserVersion: 1, roleFixes: { prior: 'pa' }, days: current.days.map(d => ({ ...d, providers: d.providers.filter(p => p.name !== 'ASIDE') })) }));
    const upgraded = loadWeek()!;
    expect(scheduleReadiness(upgraded, now).needsRole).toEqual(['ASIDE']);
    expect(scheduleReadiness(upgraded, now).canStart).toBe(false);
    const fixed = saveRoleFixes(upgraded, { aside: 'junior_resident' });
    expect(fixed.roleFixes).toEqual({ prior: 'pa', aside: 'junior_resident' });
    expect(scheduleReadiness(fixed, now).canStart).toBe(true);
  });

  it('requires an upload only when an older original is absent or unreadable', () => {
    const current = storeRead(null, readWeek(workbook(), 'week.xlsx'), {}, now);
    for (const originals of [undefined, [{ ...current.originals![0], base64: 'broken!' }]]) {
      saved.set(KEY, JSON.stringify({ ...current, parserVersion: 1, originals }));
      const old = loadWeek()!;
      expect(old.days).toEqual(current.days);
      expect(scheduleReadiness(old, now).needsOriginal).toBe(true);
      expect(scheduleReadiness(old, now).canStart).toBe(false);
      expect(old.migrationError).toMatch(/Upload/);
    }
  });

  it('a resend retains only its owned dates and migration cannot revive the old Monday', () => {
    const first = storeRead(null, readWeek(workbook('OLD', 'ASIDE [3]', [28, 29]), 'first.xlsx'), {}, now);
    const second = storeRead(first, readWeek(workbook('NEW'), 'resend.xlsx'), {}, now);
    expect(second.originals?.map(o => o.dates)).toEqual([['2026-09-29'], ['2026-09-28']]);
    saved.set(KEY, JSON.stringify({ ...second, parserVersion: 1 }));
    const reread = loadWeek()!;
    expect(reread.days[0].providers.some(p => p.name === 'NEW')).toBe(true);
    expect(reread.days[0].providers.some(p => p.name === 'OLD')).toBe(false);
    expect(reread.days[1].providers.some(p => p.name === 'OLD')).toBe(true);
  });

  it('refuses an unresolved upload without replacing the saved week', () => {
    const current = storeRead(null, readWeek(workbook(), 'good.xlsx'), {}, now);
    expect(() => storeRead(current, readWeek(workbook('DOC', 'UNKNOWN'), 'unknown.xlsx'), {}, now)).toThrow(/Pick a role/);
    expect(loadWeek()?.sources).toEqual(['good.xlsx']);
  });

  it('replacing a missing-original week preserves roles without blessing its old parsed days', () => {
    const current = storeRead(null, readWeek(workbook(), 'old.xlsx'), { remembered: 'pa' }, now);
    const old = { ...current, parserVersion: 1, originals: undefined };
    const next = storeRead(old, readWeek(workbook('NEW', 'ASIDE [3]', [29]), 'new.xlsx'), {}, now);
    expect(next.days.map(d => d.isoDate)).toEqual(['2026-09-29']);
    expect(next.roleFixes).toEqual({ remembered: 'pa' });
  });

  it('a storage failure uses the new in-memory week instead of silently reloading stale disk data', () => {
    const old = storeRead(null, readWeek(workbook(), 'old.xlsx'), {}, now);
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('full'); });
    const fresh = { ...old, sources: ['new.xlsx'] };
    saveWeek(fresh);
    expect(loadWeek()).toBe(fresh);
    expect(storageWarning()).toMatch(/this visit only/);
  });
});
