import { useState } from 'react';
import { useShift } from '../context/ShiftContext';
import type { Role } from '../types';
import SimulationSetup from './SimulationSetup';

const roles: { role: Role; label: string; desc: string }[] = [
  { role: 'triage_nurse', label: 'Triage Nurse', desc: 'Assign incoming critical patients to teams' },
  { role: 'charge_nurse', label: 'Charge Nurse', desc: 'Set up shift, manage providers and teams' },
  { role: 'attending', label: 'Attending', desc: 'View team status, manage patient acuity' },
];

export default function RoleSelection({ onStartTour }: { onStartTour?: () => void }) {
  const { dispatch } = useShift();
  const [showSimSetup, setShowSimSetup] = useState(false);

  if (showSimSetup) return <SimulationSetup onCancel={() => setShowSimSetup(false)} />;

  return (
    <div className="dashboard-bg flex flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-bold text-white mb-2">ER Triage</h1>
      <p className="text-slate-400 mb-8">Select your role to continue</p>
      <div className="w-full max-w-sm space-y-4">
        {roles.map(r => (
          <button
            key={r.role}
            onClick={() => dispatch({ type: 'SET_ROLE', role: r.role })}
            className="w-full min-h-[64px] glass-card rounded-xl px-5 py-4 text-left active:bg-white/90 transition-colors"
            aria-label={`Select role: ${r.label}`}
          >
            <div className="font-semibold text-gray-900 text-lg">{r.label}</div>
            <div className="text-sm text-gray-500">{r.desc}</div>
          </button>
        ))}
      </div>
      <div className="w-full max-w-sm mt-8 pt-6 border-t border-white/10">
        {onStartTour && (
          <button
            onClick={onStartTour}
            className="w-full min-h-[48px] bg-blue-600/80 text-white rounded-xl px-5 py-3 font-semibold text-base active:bg-blue-700 transition-colors"
          >
            Take a Guided Tour
          </button>
        )}
        <button
          onClick={() => setShowSimSetup(true)}
          className={`w-full min-h-[56px] bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl px-5 py-4 font-semibold text-base active:from-blue-700 active:to-indigo-700 transition-colors ${onStartTour ? 'mt-3' : ''}`}
        >
          Start Simulation
        </button>
        <p className="text-xs text-slate-500 text-center mt-2">Watch the triage system handle a simulated shift with configurable parameters</p>
        <button
          onClick={() => dispatch({ type: 'LOAD_DEMO' })}
          className="w-full mt-3 min-h-[48px] bg-white/10 text-white rounded-xl px-5 py-3 font-semibold text-base active:bg-white/20 transition-colors border border-white/10"
        >
          Quick Demo (static snapshot)
        </button>
      </div>
    </div>
  );
}
