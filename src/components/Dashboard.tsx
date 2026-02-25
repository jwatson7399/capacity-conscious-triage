import { useState, useEffect, useMemo } from 'react';
import { useShift } from '../context/ShiftContext';
import type { TeamId } from '../types';
import { ACUITY_COLORS, STATUS_COLORS, ACUITY_LABELS, ACUITY_DESCRIPTORS, STATUS_LABELS, CAPACITY_TERMS, TRAUMA_TEAM_ID } from '../constants';
import TeamCard from './TeamCard';
import AssignPatient from './AssignPatient';
import HelpSection from './HelpSection';
import GuidedTour from './GuidedTour';
import SimulationControls from './SimulationControls';
import { buildTourSteps } from '../tourSteps';

const TEAM_IDS: TeamId[] = [1, 2, 3, 4];

export default function Dashboard({ tourActive, onTourComplete }: { tourActive?: boolean; onTourComplete?: () => void }) {
  const { state, dispatch, recommendation } = useShift();
  const [showAssign, setShowAssign] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const steps = useMemo(() => buildTourSteps({
    openHelp: () => setShowHelp(true),
    closeHelp: () => setShowHelp(false),
  }), []);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('er-triage-dark') === 'true';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('er-triage-dark', String(darkMode));
  }, [darkMode]);

  const roleLabel = state.currentRole === 'triage_nurse' ? 'Triage Nurse'
    : state.currentRole === 'charge_nurse' ? 'Charge Nurse'
    : 'Attending';

  return (
    <div className="dashboard-bg pb-24">
      {/* Header */}
      {state.simulation?.active && (
        <div className="sticky top-0 z-11 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />
      )}
      <div data-tour="header" className={`sticky ${state.simulation?.active ? 'top-1' : 'top-0'} header-bar px-4 py-3 z-10 flex items-center justify-between`}>
        <div>
          <h1 className="text-xl font-bold text-white">
            ER Triage{state.simulation?.active ? ' Simulator' : ''}
          </h1>
          <div className="flex items-center gap-2">
            {state.simulation?.active && (
              <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full font-medium">SIM</span>
            )}
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
            onClick={() => setDarkMode(!darkMode)}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-lg"
            aria-label="Toggle dark mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button
            onClick={() => setLegendOpen(!legendOpen)}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-sm font-medium"
            aria-label="Color legend"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>
          </button>
          <button
            onClick={() => setShowHelp(v => !v)}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 font-bold text-lg"
            aria-label="Help"
            data-tour="help-button"
          >
            ?
          </button>
        </div>
      </div>

      {/* Simulation Controls */}
      {state.simulation?.active && <SimulationControls />}

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
            <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">Acuity Colors</div>
            <div className="flex flex-wrap gap-2">
              {(['tier_one', 'tier_two', 'tier_three'] as const).map(tier => (
                <span key={tier} className={`${ACUITY_COLORS[tier].bg} ${ACUITY_COLORS[tier].text} px-2 py-0.5 rounded text-xs font-medium`}>
                  {ACUITY_LABELS[tier]} ({ACUITY_DESCRIPTORS[tier]})
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">Provider Status</div>
            <div className="flex flex-wrap gap-3">
              {(['active', 'in_procedure', 'taking_signout', 'off_floor'] as const).map(status => (
                <span key={status} className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                  <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status]}`} />
                  {STATUS_LABELS[status]}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">Recommendation</div>
            <div className="flex flex-wrap gap-3">
              <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                <span className="w-4 h-3 border-2 border-yellow-500 rounded-sm inline-block" /> 1st Choice
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                <span className="w-4 h-3 border-2 border-dashed border-blue-400 rounded-sm inline-block" /> 2nd Choice
              </span>
            </div>
          </div>
          <div>
            <div className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Capacity Scale</div>
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
        <div className="mx-4 mt-4 glass-card rounded-xl text-amber-800 dark:text-amber-300 text-center py-4 px-6 border border-amber-200 dark:border-amber-700">
          Shift not started yet. Waiting for Charge Nurse to set up teams.
        </div>
      )}

      {/* Team Cards */}
      <div className="p-4 grid gap-4 md:grid-cols-2">
        {(() => {
          const candidates = recommendation.scores.filter(s => s.teamId !== TRAUMA_TEAM_ID && !(s.teamId in state.closedTeams));
          const allCandidatesBuffered = candidates.length > 0 && candidates.every(s => s.isBuffered);
          return TEAM_IDS.map(id => {
            const score = recommendation.scores.find(s => s.teamId === id);
            if (!score) return null;
            const rank = id === recommendation.first ? 'first'
              : id === recommendation.second ? 'second'
              : null;
            const isClosed = id in state.closedTeams;
            const closedAt = state.closedTeams[id];
            return <TeamCard key={id} teamId={id} score={score} recommendationRank={rank} isClosed={isClosed} closedAt={closedAt} allCandidatesBuffered={allCandidatesBuffered} />;
          });
        })()}
      </div>

      {/* Empty state for simulation */}
      {state.simulation?.active && state.patients.length === 0 && (
        <div className="mx-4 text-center text-sm text-slate-400/70 py-4">
          {state.simulation.paused
            ? 'Simulation paused — press play to begin'
            : (() => {
                const nextArrival = state.simulation.timeline[0];
                if (!nextArrival) return 'No patients in this simulation timeline';
                const untilMs = Math.max(0, nextArrival.arrivalTime - state.now);
                const secs = Math.ceil(untilMs / 1000);
                return `Waiting for first patient arrival${secs > 0 ? ` (~${secs}s at ${state.simulation.speed}x)` : '...'}`;
              })()
          }
        </div>
      )}

      {/* Summary */}
      <div className="mx-4 text-center text-sm text-slate-400">
        {state.patients.length} patient{state.patients.length !== 1 ? 's' : ''} assigned this shift
      </div>

      {/* FABs — hidden during simulation since patients are auto-assigned */}
      {state.shiftStarted && !state.simulation?.active && (
        <div className="fixed bottom-6 right-6 z-20 flex flex-col gap-3 items-end">
          <button
            onClick={() => setShowUpgrade(true)}
            className="bg-gradient-to-r from-amber-500 to-amber-400 text-white rounded-2xl px-5 py-3 shadow-lg shadow-amber-600/30 font-bold text-sm active:from-amber-600 active:to-amber-500 min-h-[48px]"
            aria-label="Assign floor patient"
            data-tour="fab-floor"
          >
            {state.currentRole === 'attending' ? '+ Upgrade Patient' : '+ Floor Patient'}
          </button>
          {state.currentRole !== 'attending' && (
            <button
              onClick={() => setShowAssign(true)}
              className="bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-2xl px-6 py-4 shadow-lg shadow-blue-600/30 font-bold text-base active:from-blue-700 active:to-blue-600 min-h-[56px]"
              aria-label="Assign Patient"
              data-tour="fab-assign"
            >
              + Assign Patient
            </button>
          )}
        </div>
      )}

      {showAssign && <AssignPatient onClose={() => setShowAssign(false)} />}
      {showUpgrade && <AssignPatient onClose={() => setShowUpgrade(false)} initialSource="floor" />}

      {tourActive && onTourComplete && (
        <GuidedTour steps={steps} onComplete={onTourComplete} />
      )}
    </div>
  );
}
