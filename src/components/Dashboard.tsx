import { useState } from 'react';
import { useShift } from '../context/ShiftContext';
import type { TeamId } from '../types';
import { ACUITY_COLORS, STATUS_COLORS, ACUITY_LABELS, STATUS_LABELS, CAPACITY_TERMS } from '../constants';
import TeamCard from './TeamCard';
import AssignPatient from './AssignPatient';
import HelpSection from './HelpSection';

const TEAM_IDS: TeamId[] = [1, 2, 3, 4];

export default function Dashboard() {
  const { state, dispatch, recommendation } = useShift();
  const [showAssign, setShowAssign] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);

  const roleLabel = state.currentRole === 'triage_nurse' ? 'Triage Nurse'
    : state.currentRole === 'charge_nurse' ? 'Charge Nurse'
    : 'Attending';

  return (
    <div className="dashboard-bg pb-24">
      {/* Header */}
      <div className="sticky top-0 header-bar px-4 py-3 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">ER Triage</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-medium">{roleLabel}</span>
            <button
              onClick={() => dispatch({ type: 'SET_ROLE', role: null })}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium"
            >
              Change
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLegendOpen(!legendOpen)}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-sm font-medium"
            aria-label="Color legend"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
          </button>
          <button
            onClick={() => setShowHelp(v => !v)}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 font-bold text-lg"
            aria-label="Help"
          >
            ?
          </button>
        </div>
      </div>

      {/* Help Section (inline) */}
      {showHelp && (
        <div className="mx-4 mt-3">
          <HelpSection onClose={() => setShowHelp(false)} />
        </div>
      )}

      {/* Color Legend */}
      {legendOpen && (
        <div className="mx-4 mt-3 glass-card rounded-xl p-4 space-y-3 text-sm">
          <div>
            <div className="font-semibold text-gray-700 mb-1">Acuity Tiers</div>
            <div className="flex flex-wrap gap-2">
              {(['tier_one', 'tier_two', 'tier_three'] as const).map(tier => (
                <span key={tier} className={`${ACUITY_COLORS[tier].bg} ${ACUITY_COLORS[tier].text} px-2 py-0.5 rounded text-xs font-medium`}>
                  {ACUITY_LABELS[tier]}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="font-semibold text-gray-700 mb-1">Provider Status</div>
            <div className="flex flex-wrap gap-3">
              {(['active', 'in_procedure', 'taking_signout', 'off_floor'] as const).map(status => (
                <span key={status} className="flex items-center gap-1 text-xs text-gray-600">
                  <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status]}`} />
                  {STATUS_LABELS[status]}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="font-semibold text-gray-700 mb-1">Recommendation</div>
            <div className="flex flex-wrap gap-3">
              <span className="flex items-center gap-1 text-xs text-gray-600">
                <span className="w-4 h-3 border-2 border-blue-600 rounded-sm inline-block" /> 1st Choice
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-600">
                <span className="w-4 h-3 border-2 border-dashed border-blue-400 rounded-sm inline-block" /> 2nd Choice
              </span>
            </div>
          </div>
          <div>
            <div className="font-semibold text-gray-700 mb-2">Capacity Scale</div>
            <div className="flex rounded-lg overflow-hidden h-7">
              <div className="flex-1 bg-red-700 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white leading-none">0</span>
              </div>
              {[...CAPACITY_TERMS].reverse().map(term => (
                <div key={term.label} className={`flex-1 flex items-center justify-center ${
                  term.label === 'Ready' ? 'bg-emerald-500' :
                  term.label === 'Stable' ? 'bg-green-500' :
                  term.label === 'Manageable' ? 'bg-yellow-400' :
                  term.label === 'Very Busy' ? 'bg-orange-500' :
                  'bg-red-500'
                }`}>
                  <span className="text-[10px] font-bold text-white leading-none">{term.minRatio}+</span>
                </div>
              ))}
            </div>
            <div className="flex mt-0.5">
              <div className="flex-1 text-center text-[10px] font-semibold text-red-700">Overwhelmed</div>
              {[...CAPACITY_TERMS].reverse().map(term => (
                <div key={term.label} className={`flex-1 text-center text-[10px] font-semibold ${term.color}`}>
                  {term.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Shift not started */}
      {!state.shiftStarted && (
        <div className="mx-4 mt-4 glass-card rounded-xl text-amber-800 text-center py-4 px-6 border border-amber-200">
          Shift not started yet. Waiting for Charge Nurse to set up teams.
        </div>
      )}

      {/* Team Cards */}
      <div className="p-4 grid gap-4 md:grid-cols-2">
        {TEAM_IDS.map(id => {
          const score = recommendation.scores.find(s => s.teamId === id);
          if (!score) return null;
          const rank = id === recommendation.first ? 'first'
            : id === recommendation.second ? 'second'
            : null;
          return <TeamCard key={id} teamId={id} score={score} recommendationRank={rank} />;
        })}
      </div>

      {/* Summary */}
      <div className="mx-4 text-center text-sm text-slate-400">
        {state.patients.length} patient{state.patients.length !== 1 ? 's' : ''} assigned this shift
      </div>

      {/* FAB */}
      {state.shiftStarted && state.currentRole !== 'attending' && (
        <button
          onClick={() => setShowAssign(true)}
          className="fixed bottom-6 right-6 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-2xl px-6 py-4 shadow-lg shadow-blue-600/30 font-bold text-base z-20 active:from-blue-700 active:to-blue-600 min-h-[56px]"
          aria-label="Assign Patient"
        >
          + Assign Patient
        </button>
      )}

      {showAssign && <AssignPatient onClose={() => setShowAssign(false)} />}
    </div>
  );
}
