/**
 * Shared vocabulary for telling schedule structure apart from person names.
 *
 * Used by scripts/deidentify-schedule.ts (decide what to rewrite) and
 * scripts/check-no-real-schedules.ts (decide what counts as a real name). Keeping one
 * definition means the guard can never disagree with the de-identifier about what a
 * name is.
 */

/** Tokens that are layout, roles, services or dates — never person names. */
export const STRUCTURAL: RegExp[] = [
  /^team$/i, /^attending$/i, /^attendings$/i, /^pa$/i, /^pas$/i,
  /^resident$/i, /^residents$/i, /^float$/i, /^floats$/i,
  /^a$/i, /^b$/i, /^n$/i, /^swing$/i, /^side$/i,
  /^a-side$/i, /^b-side$/i, /^n-side$/i,
  /^ovn$/i, /^aoc$/i, /^naoc$/i, /^em$/i, /^pem$/i, /^im$/i,
  /^pgy$/i, /^name$/i, /^fellow$/i, /^off-service$/i, /^off$/i, /^rotating$/i,
  /^monday$/i, /^tuesday$/i, /^wednesday$/i, /^thursday$/i, /^friday$/i,
  /^saturday$/i, /^sunday$/i,
  /^january$/i, /^february$/i, /^march$/i, /^april$/i, /^may$/i, /^june$/i,
  /^july$/i, /^august$/i, /^september$/i, /^october$/i, /^november$/i, /^december$/i,
  /^t[1-4]$/i, /^p$/i, /^week$/i, /^schedule$/i, /^weekly$/i, /^department$/i,
  /^tbd$/i, /^open$/i, /^none$/i, /^vacant$/i, /^holiday$/i, /^ml$/i,
  // Roles, services and locations — not people.
  /^peds$/i, /^ped$/i, /^np$/i, /^fhc$/i, /^provider$/i, /^providers$/i,
  /^md$/i, /^do$/i, /^rn$/i, /^nurse$/i, /^tech$/i, /^scribe$/i,
  /^students$/i, /^student$/i, /^fellows$/i, /^psych$/i, /^triage$/i,
  /^fast$/i, /^track$/i,
];

/** Cells that begin with a clock time, e.g. "7A-3P", "11P", "9:30A". Never names. */
export const TIMEY = /^\d{1,2}(?::\d{2})?\s*[AaPp][Mm]?\b/;

export const isStructural = (tok: string): boolean => STRUCTURAL.some(re => re.test(tok));

/** The leading alphabetic token of a cell, or null if it doesn't start with one. */
export function leadingToken(s: string): string | null {
  const m = s.match(/^([A-Za-z][A-Za-z'’.\-]*)/);
  return m ? m[1] : null;
}

/**
 * Whether a cell's leading token should be treated as a person name.
 * Conservative in the direction of privacy: unknown tokens count as names.
 */
export function nameTokenOf(cellValue: string): string | null {
  const trimmed = cellValue.trim();
  if (!trimmed || TIMEY.test(trimmed)) return null;
  const tok = leadingToken(trimmed);
  if (!tok || tok.length < 2 || isStructural(tok)) return null;
  return tok;
}
