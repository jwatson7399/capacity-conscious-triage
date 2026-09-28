/**
 * Census and schedule time helpers for the Node scripts, independent of the machine's time zone.
 *
 * The census workbook stores arrival times as Excel serial dates: days since 1899-12-30, with the
 * fraction giving the ED's wall-clock time. These helpers keep that wall-clock time exactly as
 * stored by encoding it as UTC milliseconds ("wall ms") and reading it back only with UTC getters.
 * No zone conversion happens anywhere, so the result is the same on any machine.
 *
 * Why (METHODS.md section 10): the scripts used `new Date(1899, 11, 30)` and local-time getters.
 * On a New York machine the 1899 epoch is at EST (UTC-5), so arrivals from 2026-03-08 onward
 * (daylight time, UTC-4) were read exactly one hour late, and YYYY-MM-DD strings (parsed as UTC
 * midnight) gave a day of week one day early. The UTC reading, which these helpers reproduce,
 * matches the workbook clock.
 *
 * Wall ms are for data only. Run-date stamps (when a report was generated) stay in local time.
 */

const MS_PER_DAY = 86_400_000;
const EXCEL_EPOCH_WALL_MS = Date.UTC(1899, 11, 30);

/** Excel serial date (1900 date system) to wall ms. */
export function excelSerialToWallMs(serial: number): number {
  return EXCEL_EPOCH_WALL_MS + serial * MS_PER_DAY;
}

/**
 * A date-time string to wall ms. A string without a zone ("2026-01-05 14:30", "2026-01-05") is
 * read as wall-clock time; a string with an explicit zone or "Z" is read as that instant.
 */
export function parseWallClockString(s: string): number {
  const t = s.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(t);
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', sec = '0', ms = '0'] = m;
    return Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec, +ms.padEnd(3, '0'));
  }
  return Date.parse(t);
}

/** A Date built by a parser in local time (for example a SheetJS cell date) to wall ms. */
export function localDateToWallMs(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

/** Wall-clock date as YYYY-MM-DD. */
export function wallDateStr(wallMs: number): string {
  const d = new Date(wallMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Wall-clock hour, 0 to 23. */
export function wallHour(wallMs: number): number {
  return new Date(wallMs).getUTCHours();
}

/** Wall-clock day of week, 0 = Sunday. */
export function wallDayOfWeek(wallMs: number): number {
  return new Date(wallMs).getUTCDay();
}

/** Day of week of a YYYY-MM-DD date string, 0 = Sunday. */
export function dateStrDayOfWeek(dateStr: string): number {
  return wallDayOfWeek(parseWallClockString(dateStr));
}

/** Wall ms of `hour`:00 on the same wall-clock date as `wallMs`. */
export function atWallHour(wallMs: number, hour: number): number {
  const d = new Date(wallMs);
  d.setUTCHours(hour, 0, 0, 0);
  return d.getTime();
}

/** Wall-clock time as "2:05 PM" (en-US, 12-hour), for printed examples. */
export function wallTimeLabel(wallMs: number): string {
  return new Date(wallMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
}
