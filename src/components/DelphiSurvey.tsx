import { useState, useEffect, useMemo } from 'react';
import { CURRENT_ROUND } from '../constants';

type DelphiRole = { key: string; label: string; color: string; accent: string };

const ROLES: DelphiRole[] = [
  { key: 'senior_resident', label: 'PGY 3–4 (Senior Resident)', color: 'bg-emerald-500', accent: '#10b981' },
  { key: 'junior_resident', label: 'PGY-2 (Junior Resident)', color: 'bg-amber-500', accent: '#f59e0b' },
  { key: 'intern', label: 'PGY-1 (Intern)', color: 'bg-orange-500', accent: '#f97316' },
  { key: 'pa', label: 'PA / NP', color: 'bg-violet-500', accent: '#8b5cf6' },
  { key: 'rotator', label: 'Off-Service Rotator', color: 'bg-rose-500', accent: '#f43f5e' },
];

const CSV_HEADERS = ['Timestamp', 'Senior Resident', 'Junior Resident', 'Intern', 'PA', 'Rotator', 'Round'];
const ROLE_KEYS = ['senior_resident', 'junior_resident', 'intern', 'pa', 'rotator'] as const;
const SHEET_COL: Record<string, string> = {
  senior_resident: 'Senior Resident',
  junior_resident: 'Junior Resident',
  intern: 'Intern',
  pa: 'PA',
  rotator: 'Rotator',
};

const SHEETS_API = import.meta.env.VITE_DELPHI_SHEETS_URL || '';

type ResponseEntry = { timestamp: string; responses: Record<string, number>; round: 1 | 2 };

function parseRound(val: unknown): 1 | 2 {
  const n = Number(val);
  return n === 2 ? 2 : 1;
}

async function fetchSheetResponses(): Promise<ResponseEntry[] | null> {
  if (!SHEETS_API) return null;
  try {
    const res = await fetch(SHEETS_API);
    const rows: Record<string, string | number>[] = await res.json();
    return rows
      .filter(row => {
        if (row['Type'] === 'attestation') return false;
        return ROLE_KEYS.some(k => {
          const v = row[SHEET_COL[k]];
          return v !== '' && v != null && Number(v) !== 0;
        });
      })
      .map(row => ({
        timestamp: String(row['Timestamp'] ?? ''),
        round: parseRound(row['Round']),
        responses: {
          senior_resident: Number(row['Senior Resident'] ?? 0),
          junior_resident: Number(row['Junior Resident'] ?? 0),
          intern: Number(row['Intern'] ?? 0),
          pa: Number(row['PA'] ?? 0),
          rotator: Number(row['Rotator'] ?? 0),
        },
      }));
  } catch {
    return null;
  }
}

async function submitToSheet(entry: ResponseEntry): Promise<void> {
  if (!SHEETS_API) return;
  try {
    await fetch(SHEETS_API, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date(entry.timestamp).toLocaleString(),
        senior_resident: entry.responses.senior_resident,
        junior_resident: entry.responses.junior_resident,
        intern: entry.responses.intern,
        pa: entry.responses.pa,
        rotator: entry.responses.rotator,
        round: entry.round,
      }),
    });
  } catch {
    // silent fail — localStorage is the backup
  }
}

function downloadCSV(responses: ResponseEntry[]) {
  const rows = [CSV_HEADERS.join(',')];
  for (const entry of responses) {
    const ts = new Date(entry.timestamp).toLocaleString();
    const vals = ROLE_KEYS.map(k => entry.responses[k] ?? '');
    rows.push([ts, ...vals, entry.round].join(','));
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'delphi-responses.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo]);
}

function computeStats(responses: ResponseEntry[]): Record<string, { mean: number; p25: number; p75: number; n: number }> {
  const out: Record<string, { mean: number; p25: number; p75: number; n: number }> = {};
  for (const key of ROLE_KEYS) {
    const vals = responses.map(r => r.responses[key] ?? 0).filter(v => !Number.isNaN(v));
    const sorted = [...vals].sort((a, b) => a - b);
    out[key] = {
      mean: mean(vals),
      p25: percentile(sorted, 0.25),
      p75: percentile(sorted, 0.75),
      n: vals.length,
    };
  }
  return out;
}

function loadResponses(): ResponseEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem('delphi-responses') || '[]');
    return (raw as ResponseEntry[]).map(r => ({ ...r, round: parseRound(r.round) }));
  } catch {
    return [];
  }
}

export default function DelphiSurvey({ onCancel, startOnResults }: { onCancel: () => void; startOnResults?: boolean }) {
  const [allResponses, setAllResponses] = useState<ResponseEntry[]>(loadResponses);
  const [ratings, setRatings] = useState<Record<string, number>>(
    Object.fromEntries(ROLES.map(r => [r.key, 10]))
  );
  const [submitted, setSubmitted] = useState(startOnResults ?? false);
  const [delphiInfoOpen, setDelphiInfoOpen] = useState(false);

  useEffect(() => {
    if (!SHEETS_API) return;
    const poll = () => fetchSheetResponses().then(rows => {
      if (rows) setAllResponses(rows);
    });
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  const r1Responses = useMemo(() => allResponses.filter(r => r.round === 1), [allResponses]);
  const r2Responses = useMemo(() => allResponses.filter(r => r.round === 2), [allResponses]);
  const r1Stats = useMemo(() => computeStats(r1Responses), [r1Responses]);
  const r2Stats = useMemo(() => computeStats(r2Responses), [r2Responses]);

  const showR1Feedback = CURRENT_ROUND === 2 && r1Responses.length >= 3;
  const currentCount = CURRENT_ROUND === 2 ? r2Responses.length : r1Responses.length;

  const handleSubmit = async () => {
    const entry: ResponseEntry = {
      timestamp: new Date().toISOString(),
      responses: { ...ratings },
      round: CURRENT_ROUND,
    };
    const updated = [...allResponses, entry];
    localStorage.setItem('delphi-responses', JSON.stringify(updated));
    setAllResponses(updated);
    setSubmitted(true);
    await submitToSheet(entry);
    const fresh = await fetchSheetResponses();
    if (fresh) setAllResponses(fresh);
    window.dispatchEvent(new Event('delphi-submitted'));
  };

  const ResultsView = () => (
    <div className="dashboard-bg flex flex-col items-center justify-center p-6">
      <div className="glass-card rounded-xl p-8 max-w-sm w-full text-center">
        <div className="text-3xl mb-3">✓</div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Thank You</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          R1: {r1Responses.length} · R2: {r2Responses.length}
        </p>

        <div className="text-left mb-5 space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Average Scores (R1 vs R2)
          </h3>
          {ROLES.map(r => {
            const r1 = r1Stats[r.key];
            const r2 = r2Stats[r.key];
            return (
              <div key={r.key} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${r.color} shrink-0`} />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{r.label}</span>
                </div>
                <div className="flex items-center gap-2 pl-4 text-xs">
                  <span className="w-6 text-slate-500">R1</span>
                  <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full opacity-60" style={{ width: `${(r1.mean / 20) * 100}%`, backgroundColor: r.accent }} />
                  </div>
                  <span className="w-8 text-right tabular-nums text-slate-700 dark:text-slate-300">{r1.n > 0 ? r1.mean.toFixed(1) : '—'}</span>
                </div>
                <div className="flex items-center gap-2 pl-4 text-xs">
                  <span className="w-6 text-slate-500 font-semibold">R2</span>
                  <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(r2.mean / 20) * 100}%`, backgroundColor: r.accent }} />
                  </div>
                  <span className="w-8 text-right tabular-nums text-slate-900 dark:text-white font-semibold">{r2.n > 0 ? r2.mean.toFixed(1) : '—'}</span>
                </div>
              </div>
            );
          })}
        </div>

        <details
          className="text-left mb-5 glass-card rounded-lg p-3"
          open={delphiInfoOpen}
          onToggle={(e) => setDelphiInfoOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide cursor-pointer select-none">
            About the Delphi Method
          </summary>
          <div className="mt-3 space-y-3 text-xs text-slate-600 dark:text-slate-400">
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">What is the Delphi Method?</p>
              <p>A structured expert consensus technique that uses iterative anonymous rounds to converge on agreement. Participants independently provide ratings, then refine their responses after seeing aggregate results.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Why it works here</p>
              <p>In Round 1 you rated each role blind. In Round 2 you re-rate each role after seeing the R1 group mean and interquartile range, driving convergence toward shared consensus.</p>
            </div>
          </div>
        </details>

        <button
          onClick={() => {
            setSubmitted(false);
            setRatings(Object.fromEntries(ROLES.map(r => [r.key, 10])));
          }}
          className="w-full min-h-[44px] bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl px-4 py-2.5 font-semibold text-sm mb-3 active:from-blue-700 active:to-indigo-700 transition-colors"
        >
          Submit Another Response
        </button>
        <button
          onClick={() => downloadCSV(allResponses)}
          className="w-full min-h-[44px] bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl px-4 py-2.5 font-semibold text-sm mb-3 active:bg-slate-200 dark:active:bg-slate-600 transition-colors"
        >
          Download All Responses (CSV)
        </button>
        <button
          onClick={onCancel}
          className="w-full min-h-[44px] text-slate-500 dark:text-slate-400 text-sm active:text-slate-700 transition-colors"
        >
          Back to Menu
        </button>
      </div>
    </div>
  );

  if (submitted) return <ResultsView />;

  const headerTitle = CURRENT_ROUND === 2 ? 'Provider Strength Survey, Round 2' : 'Provider Strength Survey';
  const headerSub = CURRENT_ROUND === 2
    ? 'Re-rate each role after seeing the Round 1 group mean and interquartile range. Aim for your honest calibrated judgment. Convergence is not required.'
    : 'How strong is each role clinically? Drag each slider to score independence from 0 (fully supervised) to 20 (attending-level autonomy).';

  return (
    <div className="dashboard-bg flex flex-col items-center p-6 overflow-y-auto">
      <button
        onClick={onCancel}
        className="self-start text-sm text-slate-500 dark:text-slate-400 mb-4 active:text-slate-700"
      >
        ← Back
      </button>

      <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{headerTitle}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-sm mb-3">{headerSub}</p>

      <span className="inline-block bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium px-3 py-1 rounded-full mb-4">
        Round {CURRENT_ROUND}: {currentCount} response{currentCount !== 1 ? 's' : ''} collected
      </span>

      <div className="w-full max-w-sm mb-6">
        <div className="relative h-4 rounded-full bg-gradient-to-r from-slate-300 to-blue-500 dark:from-slate-600 dark:to-blue-400">
          {[0, 5, 10, 15].map(v => (
            <div
              key={v}
              className="absolute top-0 w-0.5 h-4 bg-white/70"
              style={{ left: `${(v / 20) * 100}%` }}
            />
          ))}
          {ROLES.map(r => (
            <div
              key={r.key}
              className={`absolute top-0.5 w-3 h-3 rounded-full ${r.color} ring-2 ring-white dark:ring-slate-800 z-10 transition-all`}
              style={{ left: `${(ratings[r.key] / 20) * 100}%`, transform: 'translateX(-50%)' }}
            />
          ))}
        </div>
        <div className="relative text-[10px] text-slate-400 dark:text-slate-500 mt-1 h-4">
          <span className="absolute left-0">0 — No Clinical Independence</span>
          <span className="absolute right-0">Attending-Level — 20</span>
        </div>
      </div>

      {showR1Feedback && (
        <div className="w-full max-w-sm text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-snug">
          <span className="font-semibold text-slate-600 dark:text-slate-300">IQR</span> (interquartile range) = the middle 50% of Round 1 responses (25th–75th percentile). The colored band shows this spread; the tick shows the group mean. <span className="text-slate-600 dark:text-slate-300">Wider band = more disagreement · tighter band = stronger consensus.</span>
        </div>
      )}

      <div className="w-full max-w-sm space-y-4 mb-6">
        {ROLES.map(r => {
          const s = r1Stats[r.key];
          const showBand = showR1Feedback && s.n >= 3;
          const p25Pct = (s.p25 / 20) * 100;
          const p75Pct = (s.p75 / 20) * 100;
          const meanPct = (s.mean / 20) * 100;
          return (
            <div key={r.key} className="glass-card rounded-xl px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white text-sm">
                  <span className={`w-2.5 h-2.5 rounded-full ${r.color} shrink-0`} />
                  {r.label}
                </span>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums w-8 text-right">
                  {ratings[r.key]}
                </span>
              </div>

              {showBand && (
                <div className="relative h-4 mb-1 rounded-full bg-slate-100 dark:bg-slate-800/60">
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full opacity-25"
                    style={{
                      left: `${p25Pct}%`,
                      width: `${Math.max(p75Pct - p25Pct, 1)}%`,
                      backgroundColor: r.accent,
                    }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-1 rounded-sm"
                    style={{ left: `calc(${meanPct}% - 2px)`, backgroundColor: r.accent }}
                  />
                  <div
                    className="absolute -top-1 text-[11px] font-bold tabular-nums"
                    style={{
                      left: `${meanPct}%`,
                      transform: 'translateX(-50%)',
                      color: r.accent,
                      top: '-14px',
                    }}
                  >
                    {s.mean.toFixed(1)}
                  </div>
                </div>
              )}
              {showBand && (
                <div className="text-[10px] text-slate-400 dark:text-slate-500 mb-2 tabular-nums">
                  R1 mean (n={s.n}) · IQR {s.p25.toFixed(1)}–{s.p75.toFixed(1)}
                </div>
              )}

              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={ratings[r.key]}
                onChange={e => setRatings(prev => ({ ...prev, [r.key]: Number(e.target.value) }))}
                className="w-full"
                style={{ accentColor: r.accent }}
              />
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSubmit}
        className="w-full max-w-sm min-h-[48px] bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl px-5 py-3 font-semibold text-base active:from-blue-700 active:to-indigo-700 transition-colors"
      >
        Submit Ratings
      </button>
    </div>
  );
}
