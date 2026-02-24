import { useShift } from '../context/ShiftContext';
import type { Role } from '../types';

const roles: { role: Role; label: string; desc: string }[] = [
  { role: 'triage_nurse', label: 'Triage Nurse', desc: 'Assign incoming critical patients to teams' },
  { role: 'charge_nurse', label: 'Charge Nurse', desc: 'Set up shift, manage providers and teams' },
  { role: 'attending', label: 'Attending', desc: 'View team status, manage patient acuity' },
];

export default function RoleSelection() {
  const { dispatch } = useShift();

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
        <button
          onClick={() => dispatch({ type: 'LOAD_DEMO' })}
          className="w-full min-h-[56px] bg-white/10 text-white rounded-xl px-5 py-4 font-semibold text-base active:bg-white/20 transition-colors border border-white/10"
        >
          Load Demo (pre-filled shift)
        </button>
        <p className="text-xs text-slate-500 text-center mt-2">3 teams with providers, 6 patients, active buffers</p>
      </div>
    </div>
  );
}
