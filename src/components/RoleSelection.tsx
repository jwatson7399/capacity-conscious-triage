import { useState } from 'react';
import { useShift } from '../context/ShiftContext';
import type { Role } from '../types';
import SimulationSetup from './SimulationSetup';
import BenchmarkReport from './BenchmarkReport';
import DelphiSurvey from './DelphiSurvey';

const roles: { role: Role; label: string; desc: string }[] = [
  { role: 'charge_nurse', label: 'Charge / Triage Nurse', desc: 'Set up shift, manage providers, assign patients' },
  { role: 'attending', label: 'Attending', desc: 'View team status, manage patient acuity' },
];

export default function RoleSelection({ onStartTour, darkMode, onToggleDarkMode }: { onStartTour?: () => void; darkMode: boolean; onToggleDarkMode: () => void }) {
  const { dispatch } = useShift();
  const [showSimSetup, setShowSimSetup] = useState(false);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [showDelphi, setShowDelphi] = useState<false | 'survey' | 'results'>(false);
  const [showDelphiPrompt, setShowDelphiPrompt] = useState(false);

  if (showSimSetup) return <SimulationSetup onCancel={() => setShowSimSetup(false)} />;
  if (showBenchmark) return <BenchmarkReport onBack={() => setShowBenchmark(false)} />;
  if (showDelphi) return <DelphiSurvey onCancel={() => setShowDelphi(false)} startOnResults={showDelphi === 'results'} />;

  return (
    <div className="dashboard-bg flex flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">ER Triage</h1>
      <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm text-center">
        Not sure? Most users start as <strong className="text-slate-700 dark:text-slate-300">Charge / Triage Nurse</strong>. Pick <strong className="text-slate-700 dark:text-slate-300">Attending</strong> if you only need to view teams and manage acuity.
      </p>
      <div className="w-full max-w-sm space-y-4">
        {roles.map(r => (
          <button
            key={r.role}
            onClick={() => dispatch({ type: 'SET_ROLE', role: r.role })}
            className="w-full min-h-[64px] glass-card rounded-xl px-5 py-4 text-left active:bg-white/90 transition-colors"
            aria-label={`Select role: ${r.label}`}
          >
            <div className="font-semibold text-gray-900 dark:text-gray-100 text-lg">{r.label}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{r.desc}</div>
          </button>
        ))}
      </div>
      <div className="w-full max-w-sm mt-8 pt-6 border-t border-slate-300 dark:border-white/10 space-y-3">
        {onStartTour && (
          <button
            onClick={onStartTour}
            className="w-full min-h-[56px] bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl px-5 py-4 font-semibold text-base active:from-blue-700 active:to-indigo-700 transition-colors"
          >
            <div>Take a Guided Tour</div>
            <div className="text-xs font-normal opacity-80 mt-0.5">New here? Start with a walkthrough</div>
          </button>
        )}
        <button
          onClick={() => dispatch({ type: 'LOAD_DEMO' })}
          className="w-full min-h-[48px] bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white rounded-xl px-5 py-3 font-semibold text-base active:bg-slate-300 dark:active:bg-white/20 transition-colors border border-slate-300 dark:border-white/10"
        >
          <div>Quick Demo</div>
          <div className="text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">See a pre-loaded shift dashboard</div>
        </button>
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
          <div className="text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">Rate provider independence — Round 1 Delphi</div>
        </button>
        <button
          onClick={() => setShowDelphiPrompt(true)}
          className="w-full text-sm text-blue-600 dark:text-blue-400 font-medium -mt-1 active:text-blue-700 dark:active:text-blue-300"
        >
          See ongoing survey averages →
        </button>

        {/* "Have you submitted?" prompt */}
        {showDelphiPrompt && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={() => setShowDelphiPrompt(false)}>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-xs w-full shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Have you submitted a response yet?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Please submit your own ratings before viewing group averages.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDelphiPrompt(false); setShowDelphi('survey'); }}
                  className="flex-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl py-3 font-semibold text-sm active:bg-slate-300 dark:active:bg-slate-600"
                >
                  No, take survey
                </button>
                <button
                  onClick={() => { setShowDelphiPrompt(false); setShowDelphi('results'); }}
                  className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-semibold text-sm active:bg-blue-700"
                >
                  Yes, show results
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="text-center pt-2">
          <button
            onClick={() => setShowBenchmark(true)}
            className="text-xs text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
          >
            Formula vs Round-Robin: 1,000-Run Review →
            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">See how they compare</div>
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
              {darkMode ? '🌙' : '☀️'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
