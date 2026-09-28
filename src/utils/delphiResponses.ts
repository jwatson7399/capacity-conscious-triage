// © 2026 New York University. All rights reserved.
//
// Missing-value policy for Delphi survey responses (research only; the app scores
// with the frozen constants.ts weights and never reads the survey).
//
// - A blank, missing or non-numeric cell is a non-response for that role. It is left
//   out of that role's mean, quartiles and n; it is never read as 0.
// - 0 is a valid rating. The survey scale runs 0 to 20 and a 0 counts like any other value.
// - A value outside 0 to 20 is not a rating on the survey scale and is treated as missing.
// - A row is a survey response when it is not an attestation row and has at least one
//   valid rating. A row of all zeros is a response; a row of all blanks is not.
//
// Missingness is decided on the raw cell, before numeric conversion, because
// Number('') and Number(null) are both 0.

export const DELPHI_MIN_RATING = 0;
export const DELPHI_MAX_RATING = 20;

export type SheetRow = Record<string, string | number | null | undefined>;

/** The rating in a raw cell, or null when the cell is a non-response. */
export function parseRating(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < DELPHI_MIN_RATING || n > DELPHI_MAX_RATING) return null;
  return n;
}

/** True when the row is a survey response (not an attestation, at least one rating). */
export function isSurveyResponse(row: SheetRow, columns: string[]): boolean {
  if (row['Type'] === 'attestation') return false;
  return columns.some(c => parseRating(row[c]) !== null);
}

/** The valid ratings for one column, skipping non-responses. */
export function ratingsFor(rows: SheetRow[], column: string): number[] {
  const out: number[] = [];
  for (const row of rows) {
    const r = parseRating(row[column]);
    if (r !== null) out.push(r);
  }
  return out;
}

/** Mean of the ratings, or null when there are none. */
export function meanRating(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
