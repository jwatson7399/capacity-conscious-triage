import { useState } from 'react';

type DelphiRole = { key: string; label: string; color: string; accent: string };

const ROLES: DelphiRole[] = [
  { key: 'senior_resident', label: 'PGY 3–4 (Senior Resident)', color: 'bg-emerald-500', accent: '#10b981' },
  { key: 'junior_resident', label: 'PGY 1–2 (Junior Resident)', color: 'bg-amber-500', accent: '#f59e0b' },
  { key: 'pa', label: 'PA / NP', color: 'bg-violet-500', accent: '#8b5cf6' },
  { key: 'rotator', label: 'Off-Service Rotator', color: 'bg-rose-500', accent: '#f43f5e' },
];

const CSV_HEADERS = ['Timestamp', 'Senior Resident', 'Junior Resident', 'PA', 'Rotator'];
const ROLE_KEYS = ['senior_resident', 'junior_resident', 'pa', 'rotator'];

type ResponseEntry = { timestamp: string; responses: Record<string, number> };

function downloadCSV(responses: ResponseEntry[]) {
  const rows = [CSV_HEADERS.join(',')];
  for (const entry of responses) {
    const ts = new Date(entry.timestamp).toLocaleString();
    const vals = ROLE_KEYS.map(k => entry.responses[k] ?? '');
    rows.push([ts, ...vals].join(','));
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'delphi-responses.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function computeAverages(responses: ResponseEntry[]): Record<string, number> {
  if (responses.length === 0) return {};
  const sums: Record<string, number> = {};
  for (const key of ROLE_KEYS) sums[key] = 0;
  for (const entry of responses) {
    for (const key of ROLE_KEYS) sums[key] += entry.responses[key] ?? 0;
  }
  const avgs: Record<string, number> = {};
  for (const key of ROLE_KEYS) avgs[key] = sums[key] / responses.length;
  return avgs;
}

function loadResponses(): ResponseEntry[] {
  try { return JSON.parse(localStorage.getItem('delphi-responses') || '[]'); }
  catch { return []; }
}

export default function DelphiSurvey({ onCancel }: { onCancel: () => void }) {
  const [allResponses, setAllResponses] = useState<ResponseEntry[]>(loadResponses);
  const [ratings, setRatings] = useState<Record<string, number>>(
    Object.fromEntries(ROLES.map(r => [r.key, 10]))
  );
  const [submitted, setSubmitted] = useState(false);
  const [hasAlreadySubmitted] = useState(() => localStorage.getItem('delphi-submitted') === 'true');
  const [showResults, setShowResults] = useState(false);

  const submissionCount = allResponses.length;
  const averages = computeAverages(allResponses);

  const handleSubmit = () => {
    const entry: ResponseEntry = { timestamp: new Date().toISOString(), responses: { ...ratings } };
    const updated = [...allResponses, entry];
    localStorage.setItem('delphi-responses', JSON.stringify(updated));
    localStorage.setItem('delphi-submitted', 'true');
    setAllResponses(updated);
    setSubmitted(true);
  };

  // Results view — shown after submit or when viewing results from already-submitted screen
  const ResultsView = () => (
    <div className="dashboard-bg flex flex-col items-center justify-center p-6">
      <div className="glass-card rounded-xl p-8 max-w-sm w-full text-center">
        <div className="text-3xl mb-3">✓</div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Thank You</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {submissionCount} response{submissionCount !== 1 ? 's' : ''} collected
        </p>

        {/* Average scores table */}
        {submissionCount > 0 && (
          <div className="text-left mb-5 space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Average Scores</h3>
            {ROLES.map(r => (
              <div key={r.key} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${r.color} shrink-0`} />
                <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{r.label}</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                  {averages[r.key]?.toFixed(1)}
                </span>
                <div className="w-16 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${((averages[r.key] ?? 0) / 20) * 100}%`, backgroundColor: r.accent }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => downloadCSV(allResponses)}
          className="w-full min-h-[44px] bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl px-4 py-2.5 font-semibold text-sm mb-3 active:bg-slate-200 dark:active:bg-slate-600 transition-colors"
        >
          Download All Responses (CSV)
        </button>
        <button
          onClick={onCancel}
          className="w-full min-h-[44px] bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl px-4 py-2.5 font-semibold text-sm active:from-blue-700 active:to-indigo-700 transition-colors"
        >
          Back to Menu
        </button>
      </div>
    </div>
  );

  // Post-submission results
  if (submitted) return <ResultsView />;

  // Already submitted — show block screen
  if (hasAlreadySubmitted) {
    return (
      <div className="dashboard-bg flex flex-col items-center justify-center p-6">
        <div className="glass-card rounded-xl p-8 max-w-sm w-full text-center">
          <div className="text-3xl mb-3">📋</div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Already Submitted</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            You've already submitted your ratings.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
            {submissionCount} response{submissionCount !== 1 ? 's' : ''} collected
          </p>
          {!showResults ? (
            <button
              onClick={() => setShowResults(true)}
              className="w-full min-h-[44px] bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl px-4 py-2.5 font-semibold text-sm mb-3 active:from-blue-700 active:to-indigo-700 transition-colors"
            >
              View Results
            </button>
          ) : (
            submissionCount > 0 && (
              <div className="text-left mb-5 space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Average Scores</h3>
                {ROLES.map(r => (
                  <div key={r.key} className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${r.color} shrink-0`} />
                    <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{r.label}</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      {averages[r.key]?.toFixed(1)}
                    </span>
                    <div className="w-16 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${((averages[r.key] ?? 0) / 20) * 100}%`, backgroundColor: r.accent }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
          <button
            onClick={() => downloadCSV(allResponses)}
            className="w-full min-h-[44px] bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl px-4 py-2.5 font-semibold text-sm mb-3 active:bg-slate-200 dark:active:bg-slate-600 transition-colors"
          >
            Download CSV
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
  }

  // Survey form
  return (
    <div className="dashboard-bg flex flex-col items-center p-6 overflow-y-auto">
      <button
        onClick={onCancel}
        className="self-start text-sm text-slate-500 dark:text-slate-400 mb-4 active:text-slate-700"
      >
        ← Back
      </button>

      <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Provider Strength Survey</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-sm mb-3">
        How strong is each role clinically? Drag each slider to score independence from 0 (fully supervised) to 20 (attending-level autonomy).
      </p>

      {/* Submission count badge */}
      <span className="inline-block bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium px-3 py-1 rounded-full mb-4">
        {submissionCount} response{submissionCount !== 1 ? 's' : ''} collected
      </span>

      {/* Reference scale */}
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

      {/* Slider cards */}
      <div className="w-full max-w-sm space-y-4 mb-6">
        {ROLES.map(r => (
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
        ))}
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
