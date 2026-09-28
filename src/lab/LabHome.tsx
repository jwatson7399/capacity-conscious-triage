// © 2026 New York University. All rights reserved.
//
// Research tools, reached only through the hidden ?lab route (Roundtable 2026-09-28,
// Decision 5). This was the old RoleSelection splash; the role picker, tour, sandbox and
// schedule demo moved to the Carbon Home, demo and tour. What stays here: the simulation
// lab, the benchmark reports, the Delphi survey and admin panel, and the attestation.
import { useState, useEffect } from 'react';
import SimulationSetup from '../components/SimulationSetup';
import BenchmarkReport from '../components/BenchmarkReport';
import RealScheduleBenchmarkReport from '../components/RealScheduleBenchmarkReport';
import DelphiSurvey from '../components/DelphiSurvey';
import DelphiAdminPanel from '../components/DelphiAdminPanel';
import { CURRENT_ROUND } from '../constants';

export default function LabHome({ darkMode, onToggleDarkMode }: { darkMode: boolean; onToggleDarkMode: () => void }) {
  const [activeRound, setActiveRound] = useState<1 | 2>(() => {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('delphi-active-round') : null;
    if (raw === '1') return 1;
    if (raw === '2') return 2;
    return CURRENT_ROUND;
  });
  useEffect(() => {
    const update = () => {
      const raw = localStorage.getItem('delphi-active-round');
      if (raw === '1') setActiveRound(1);
      else if (raw === '2') setActiveRound(2);
      else setActiveRound(CURRENT_ROUND);
    };
    window.addEventListener('delphi-active-round-changed', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('delphi-active-round-changed', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  const [showSimSetup, setShowSimSetup] = useState(false);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [showRealBenchmark, setShowRealBenchmark] = useState(false);
  const [showDelphi, setShowDelphi] = useState<false | 'survey' | 'results'>(false);
  const [showAttestation, setShowAttestation] = useState(false);
  const [attestationCounts, setAttestationCounts] = useState<{ yes: number; no: number } | null>(null);
  const [attestationSubmitted, setAttestationSubmitted] = useState(false);
  const [attestationId, setAttestationId] = useState('');
  const [attestationLoading, setAttestationLoading] = useState(false);

  if (showSimSetup) return <SimulationSetup onCancel={() => setShowSimSetup(false)} />;
  if (showBenchmark) return <BenchmarkReport onBack={() => setShowBenchmark(false)} />;
  if (showRealBenchmark) return <RealScheduleBenchmarkReport onBack={() => setShowRealBenchmark(false)} />;
  if (showDelphi) return <DelphiSurvey onCancel={() => setShowDelphi(false)} startOnResults={showDelphi === 'results'} />;

  return (
    <div className="dashboard-bg flex flex-col items-center justify-center p-6">
      <div className="mb-6 text-center">
        <h1 className="text-center leading-none text-slate-900 dark:text-white text-5xl sm:text-6xl" style={{ fontWeight: 500, letterSpacing: "-0.02em" }}>
          <span className="block">CCT Lab</span>
        </h1>
      </div>
      <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
        Research tools. Not part of the shift board. <a className="underline" href={import.meta.env.BASE_URL}>Back to the app</a>
      </p>
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={() => setShowSimSetup(true)}
          className="w-full min-h-[48px] bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl px-5 py-3 font-semibold text-sm active:bg-slate-300 dark:active:bg-white/20 border border-slate-300 dark:border-white/10"
        >
          <div>Start Simulation</div>
          <div className="text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">Tune weighted parameters in a simulated shift</div>
        </button>
        <button
          onClick={() => setShowDelphi('survey')}
          className="w-full min-h-[48px] bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl px-5 py-3 font-semibold text-sm active:bg-slate-300 dark:active:bg-white/20 border border-slate-300 dark:border-white/10"
        >
          <div>Provider Strength Survey</div>
          <div className="text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
            {activeRound === 2 ? (
              <>
                <div>Rate provider independence</div>
                <div>Round 2 Delphi (re-rate with R1 feedback)</div>
              </>
            ) : (
              <>
                <div>Rate provider independence</div>
                <div>Round 1 Delphi</div>
              </>
            )}
          </div>
        </button>
        <button
          onClick={() => setShowAttestation(true)}
          className="w-full text-sm text-blue-600 dark:text-blue-400 font-medium -mt-1 active:text-blue-700 dark:active:text-blue-300"
        >
          Attending Attestation →
        </button>

        {/* Attending Attestation */}
        {showAttestation && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={() => { setShowAttestation(false); setAttestationSubmitted(false); setAttestationId(''); setAttestationLoading(false); }}>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Attending Attestation</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
                Are you okay with potentially seeing more A-side patients when you have a stronger team, knowing that you'll also potentially see less A-side patients when you have a weaker team?
              </p>
              {attestationSubmitted ? (
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Response recorded. Thank you!</p>
                  {attestationCounts && (
                    <div className="flex justify-center gap-6 mb-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-emerald-600">{attestationCounts.yes}</div>
                        <div className="text-xs text-slate-500">Yes</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-500">{attestationCounts.no}</div>
                        <div className="text-xs text-slate-500">No</div>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => { setShowAttestation(false); setAttestationSubmitted(false); setAttestationId(''); setAttestationLoading(false); }}
                    className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl px-6 py-2.5 font-semibold text-sm"
                  >
                    Close
                  </button>
                </div>
              ) : attestationLoading ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">Submitting...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={attestationId}
                    onChange={e => setAttestationId(e.target.value)}
                    placeholder="Enter your ID"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-4 py-2.5 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-3">
                    <button
                      disabled={!attestationId.trim()}
                      onClick={async () => {
                        setAttestationLoading(true);
                        const url = import.meta.env.VITE_DELPHI_SHEETS_URL;
                        if (url) {
                          try {
                            await fetch(url, {
                              method: 'POST', mode: 'no-cors',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ type: 'attestation', response: 'no', id: attestationId.trim(), timestamp: new Date().toLocaleString() }),
                            });
                            const res = await fetch(url);
                            const rows: Record<string, string>[] = await res.json();
                            const attestRows = rows.filter(r => r['Type'] === 'attestation');
                            setAttestationCounts({
                              yes: attestRows.filter(r => r['Response'] === 'yes').length,
                              no: attestRows.filter(r => r['Response'] === 'no').length,
                            });
                          } catch { /* ignore */ }
                        }
                        setAttestationLoading(false);
                        setAttestationSubmitted(true);
                      }}
                      className="flex-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-xl py-3 font-semibold text-sm active:bg-red-200 dark:active:bg-red-900/50 disabled:opacity-40"
                    >
                      No
                    </button>
                    <button
                      disabled={!attestationId.trim()}
                      onClick={async () => {
                        setAttestationLoading(true);
                        const url = import.meta.env.VITE_DELPHI_SHEETS_URL;
                        if (url) {
                          try {
                            await fetch(url, {
                              method: 'POST', mode: 'no-cors',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ type: 'attestation', response: 'yes', id: attestationId.trim(), timestamp: new Date().toLocaleString() }),
                            });
                            const res = await fetch(url);
                            const rows: Record<string, string>[] = await res.json();
                            const attestRows = rows.filter(r => r['Type'] === 'attestation');
                            setAttestationCounts({
                              yes: attestRows.filter(r => r['Response'] === 'yes').length,
                              no: attestRows.filter(r => r['Response'] === 'no').length,
                            });
                          } catch { /* ignore */ }
                        }
                        setAttestationLoading(false);
                        setAttestationSubmitted(true);
                      }}
                      className="flex-1 bg-emerald-600 text-white rounded-xl py-3 font-semibold text-sm active:bg-emerald-700 disabled:opacity-40"
                    >
                      Yes
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <DelphiAdminPanel />
        <div className="flex items-center justify-center pt-2 text-xs text-slate-500">
          <button
            onClick={() => setShowBenchmark(true)}
            className="flex-1 text-right hover:text-slate-600 dark:hover:text-slate-400"
          >
            Formula vs Round-Robin
          </button>
          <span className="mx-1.5">|</span>
          <button
            onClick={() => setShowRealBenchmark(true)}
            className="flex-1 text-left hover:text-slate-600 dark:hover:text-slate-400"
          >
            Real Week Backtest
          </button>
        </div>
        <div className="flex items-center justify-center gap-3 pt-4">
          <span className="text-sm text-slate-500 dark:text-slate-400">{darkMode ? 'Dark' : 'Light'} Mode</span>
          <button
            onClick={onToggleDarkMode}
            className={`relative w-12 h-7 rounded-full transition-colors ${darkMode ? 'bg-blue-600' : 'bg-slate-300'}`}
            aria-label="Toggle dark mode"
          >
            <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform flex items-center justify-center text-sm ${darkMode ? 'translate-x-5' : ''}`}>
            </span>
          </button>
        </div>
        <p className="pt-4 text-center text-xs text-slate-400 dark:text-slate-500">
          © 2026 New York University
        </p>
      </div>
    </div>
  );
}
