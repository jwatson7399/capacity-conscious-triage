import { useState, useEffect, useMemo } from 'react';
import { R2_MIN_RESPONSES } from '../constants';

const SHEETS_API = import.meta.env.VITE_DELPHI_SHEETS_URL || '';
const ACTIVE_ROUND_KEY = 'delphi-active-round';

const ROLES = [
  { key: 'senior_resident', sheet: 'Senior Resident', label: 'Sr Res' },
  { key: 'junior_resident', sheet: 'Junior Resident', label: 'Jr Res' },
  { key: 'intern', sheet: 'Intern', label: 'Intern' },
  { key: 'pa', sheet: 'PA', label: 'PA' },
  { key: 'rotator', sheet: 'Rotator', label: 'Rotator' },
];

type Row = Record<string, string | number>;

function getActiveRound(): 1 | 2 {
  const raw = localStorage.getItem(ACTIVE_ROUND_KEY);
  return raw === '2' ? 2 : 1;
}

function setActiveRound(round: 1 | 2) {
  localStorage.setItem(ACTIVE_ROUND_KEY, String(round));
  window.dispatchEvent(new Event('delphi-active-round-changed'));
}

function parseRound(v: unknown): 1 | 2 {
  return Number(v) === 2 ? 2 : 1;
}

function meansFor(rows: Row[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of ROLES) {
    if (rows.length === 0) { out[r.key] = 0; continue; }
    let sum = 0;
    for (const row of rows) sum += Number(row[r.sheet] ?? 0);
    out[r.key] = sum / rows.length;
  }
  return out;
}

export default function DelphiAdminPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [activeRound, setActiveRoundState] = useState<1 | 2>(getActiveRound);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!SHEETS_API) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(SHEETS_API);
        const data: Row[] = await res.json();
        if (cancelled) return;
        setRows(data.filter(r => r['Type'] !== 'attestation' && ROLES.some(role => {
          const v = r[role.sheet];
          return v !== '' && v != null && Number(v) !== 0;
        })));
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 30_000);
    const onSubmit = () => poll();
    window.addEventListener('delphi-submitted', onSubmit);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('delphi-submitted', onSubmit);
    };
  }, []);

  const r1 = useMemo(() => (rows ?? []).filter(r => parseRound(r['Round']) === 1), [rows]);
  const r2 = useMemo(() => (rows ?? []).filter(r => parseRound(r['Round']) === 2), [rows]);
  const r1Means = useMemo(() => meansFor(r1), [r1]);
  const r2Means = useMemo(() => meansFor(r2), [r2]);

  const promote = (round: 1 | 2) => {
    setActiveRound(round);
    setActiveRoundState(round);
  };

  const r2Ready = r2.length >= R2_MIN_RESPONSES;

  return (
    <div className="glass-card rounded-xl border border-slate-300 dark:border-white/10 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-3 active:bg-slate-100/50 dark:active:bg-white/5"
      >
        <div className="text-left">
          <div className="text-sm font-semibold text-slate-800 dark:text-white">Delphi Admin</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Active: Round {activeRound} · R1 n={r1.length} · R2 n={r2.length}
          </div>
        </div>
        <span className="text-slate-400 text-sm">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-3 border-t border-slate-200 dark:border-white/10 pt-3">
          <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 text-xs">
            <div className="font-semibold text-slate-500">Role</div>
            <div className="font-semibold text-slate-500 text-right">R1 mean</div>
            <div className="font-semibold text-slate-500 text-right">R2 mean</div>
            {ROLES.map(r => (
              <div key={r.key} className="contents">
                <div className="text-slate-700 dark:text-slate-300">{r.label}</div>
                <div className="text-right tabular-nums text-slate-600 dark:text-slate-400">
                  {r1.length > 0 ? r1Means[r.key].toFixed(1) : '—'}
                </div>
                <div className="text-right tabular-nums text-slate-900 dark:text-white font-semibold">
                  {r2.length > 0 ? r2Means[r.key].toFixed(1) : '—'}
                </div>
              </div>
            ))}
          </div>

          <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-white/10">
            <button
              onClick={() => promote(1)}
              className={`flex-1 py-2 text-xs font-semibold ${
                activeRound === 1
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 active:bg-slate-200'
              }`}
            >
              Use R1 weights
            </button>
            <button
              onClick={() => promote(2)}
              className={`flex-1 py-2 text-xs font-semibold ${
                activeRound === 2
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 active:bg-slate-200'
              }`}
            >
              Use R2 weights
            </button>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {activeRound === 1
              ? `Collecting R1 submissions. Switch to R2 to start collecting Round 2 responses${r2.length === 0 ? '' : ` (currently ${r2.length})`}.`
              : r2.length === 0
                ? 'Round 2 active — new submissions will be tagged R2. Weights fall back to R1 averages until R2 responses exist.'
                : r2Ready
                  ? `R2 has ${r2.length} responses (≥ ${R2_MIN_RESPONSES} recommended). Applying R2 weights.`
                  : `R2 has ${r2.length} responses. ${R2_MIN_RESPONSES}+ recommended; applying R2 weights now.`}
          </div>
        </div>
      )}
    </div>
  );
}
