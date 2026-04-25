import { useState, useMemo } from 'react';
import { useShift } from '../context/ShiftContext';
import type { TeamId } from '../types';
import type { FloatAttending } from '../utils/scheduleParser';
import { ACUITY_COLORS, STATUS_COLORS, ACUITY_LABELS, ACUITY_DESCRIPTORS, STATUS_LABELS, TRAUMA_TEAM_ID, CAPACITY_GRADIENT_CSS } from '../constants';
import TeamCard from './TeamCard';
import AssignPatient from './AssignPatient';
import HelpSection from './HelpSection';
import GuidedTour from './GuidedTour';
import SimulationControls from './SimulationControls';
import SimSummaryCard from './SimSummaryCard';
import TimelineSlider, { TimelineBar } from './TimelineSlider';
import BenchmarkReport from './BenchmarkReport';
import RealScheduleBenchmarkReport from './RealScheduleBenchmarkReport';
import ShiftSetup from './ShiftSetup';
import Toast from './Toast';
import { buildTourSteps } from '../tourSteps';

const TEAM_IDS: TeamId[] = [1, 2, 3, 4];

export default function Dashboard({ tourActive, onTourComplete, darkMode, onToggleDarkMode }: { tourActive?: boolean; onTourComplete?: () => void; darkMode: boolean; onToggleDarkMode: () => void }) {
  const { state, dispatch, recommendation, capacityWeights } = useShift();
  const [showAssign, setShowAssign] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [showBacktest, setShowBacktest] = useState(false);
  const [showShiftSetup, setShowShiftSetup] = useState(false);
  const [toastTeam, setToastTeam] = useState<TeamId | null>(null);
  const [legendOpen, setLegendOpen] = useState(!!tourActive);
  const team1Providers = useMemo(() => state.providers.filter(p => p.teamId === 1), [state.providers]);
  const steps = useMemo(() => buildTourSteps({
    openHelp: () => setShowHelp(true),
    closeHelp: () => setShowHelp(false),
    capacityWeights,
    team1Providers,
  }), [capacityWeights, team1Providers]);
  const [globalCollapsePatients, setGlobalCollapsePatients] = useState(false);
  const [globalHideStabilized, setGlobalHideStabilized] = useState(true);
  const [compactMenuOpen, setCompactMenuOpen] = useState(false);
  const [scheduleHour, setScheduleHour] = useState(() => state.scheduleData?.currentHour ?? new Date().getHours());
  const compactMode = globalCollapsePatients && globalHideStabilized;
  const isSandbox = state.demoMode === 'sandbox';
  const inDemo = state.demoMode != null;
  const [sandboxTipDismissed, setSandboxTipDismissed] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem('sandbox-tip-dismissed') === '1';
  });
  const dismissSandboxTip = () => {
    localStorage.setItem('sandbox-tip-dismissed', '1');
    setSandboxTipDismissed(true);
  };

  const roleLabel = state.currentRole === 'triage_nurse' ? 'Charge / Triage Nurse'
    : state.currentRole === 'charge_nurse' ? 'Charge / Triage Nurse'
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
            {isSandbox ? 'Sandbox' : state.scheduleData ? 'Real Schedule Demo' : state.simulation?.active ? 'ER Triage Simulator' : 'ER Triage'}
          </h1>
          <div className="flex items-center gap-2">
            {isSandbox && (
              <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-medium">DEMO</span>
            )}
            {state.simulation?.active && (
              <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full font-medium">SIM</span>
            )}
            <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-medium">{roleLabel}</span>
            {isSandbox && (
              <button
                onClick={() => dispatch({ type: 'LOAD_DEMO' })}
                className="text-xs text-amber-300 hover:text-amber-200 font-medium"
                title="Reshuffle sandbox"
              >
                ↻ Reshuffle
              </button>
            )}
            <button
              onClick={() => {
                if (state.patients.length > 0 && !state.simulation?.active && !inDemo) {
                  if (!confirm('Return to main menu? Current shift data will be lost.')) return;
                }
                dispatch({ type: 'RESET' });
              }}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium"
            >
              Main Menu
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setCompactMenuOpen(!compactMenuOpen)}
              className={`w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-lg ${compactMode ? 'ring-2 ring-blue-400' : ''}`}
              aria-label="Compact mode"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            </button>
            {compactMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCompactMenuOpen(false)} />
                <div className="absolute right-0 top-12 z-40 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 py-1 text-sm">
                  <button
                    onClick={() => {
                      const next = !compactMode;
                      setGlobalCollapsePatients(next);
                      setGlobalHideStabilized(next);
                    }}
                    className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-slate-700 font-semibold text-gray-800 dark:text-gray-200"
                  >
                    Compact Mode
                    <span className={`w-4 h-4 rounded border ${compactMode ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-400'} flex items-center justify-center text-xs`}>
                      {compactMode && '✓'}
                    </span>
                  </button>
                  <div className="border-t border-gray-200 dark:border-slate-700 my-1" />
                  <button
                    onClick={() => setGlobalCollapsePatients(!globalCollapsePatients)}
                    className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300"
                  >
                    Collapse all patients
                    <span className={`w-4 h-4 rounded border ${globalCollapsePatients ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-400'} flex items-center justify-center text-xs`}>
                      {globalCollapsePatients && '✓'}
                    </span>
                  </button>
                  <button
                    onClick={() => setGlobalHideStabilized(!globalHideStabilized)}
                    className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300"
                  >
                    Hide all stabilized
                    <span className={`w-4 h-4 rounded border ${globalHideStabilized ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-400'} flex items-center justify-center text-xs`}>
                      {globalHideStabilized && '✓'}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={onToggleDarkMode}
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
            className="h-10 px-3 rounded-full bg-white/20 border border-white/30 flex items-center justify-center gap-1.5 text-white/90 font-medium text-sm"
            aria-label="Help"
            data-tour="help-button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
            Help
          </button>
        </div>
      </div>

      {/* Simulation Controls */}
      {state.simulation?.active && <SimulationControls />}

      {/* Sandbox first-time tip */}
      {isSandbox && !sandboxTipDismissed && (
        <div className="mx-4 mt-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-xl px-4 py-3 flex items-start gap-3">
          <div className="flex-1 text-sm text-amber-900 dark:text-amber-100 leading-snug">
            <div className="font-semibold mb-0.5">Welcome to the sandbox</div>
            <div className="text-xs text-amber-800 dark:text-amber-200">
              Fake providers & patients. Tap <span className="font-semibold">+ New Patient</span> to try an assignment, or <span className="font-semibold">↻ Reshuffle</span> for a new layout.
            </div>
          </div>
          <button
            onClick={dismissSandboxTip}
            className="text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 text-lg leading-none px-1"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* No-providers banner */}
      {state.shiftStarted && state.providers.length === 0 && !state.simulation?.active && (
        <button
          onClick={() => setShowShiftSetup(true)}
          className="mx-4 mt-3 w-[calc(100%-2rem)] bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-xl px-4 py-3 text-left active:bg-amber-100 dark:active:bg-amber-900/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="font-semibold text-amber-800 dark:text-amber-200 text-sm">No providers added yet</div>
            <span className="text-amber-600 dark:text-amber-300 text-lg">+</span>
          </div>
          <div className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">Tap to add providers and enable scoring.</div>
        </button>
      )}

      {/* Help Section (inline) */}
      {showHelp && (
        <div className="mx-4 mt-3">
          <HelpSection onClose={() => setShowHelp(false)} onShowBenchmark={() => { setShowHelp(false); setShowBenchmark(true); }} onShowBacktest={() => { setShowHelp(false); setShowBacktest(true); }} />
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
                <span className="w-4 h-3 border-2 border-blue-600 rounded-sm inline-block" /> 1st Choice
              </span>
            </div>
          </div>
          <div>
            <div className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Capacity Scale</div>
            <div className="relative rounded-lg overflow-hidden h-7" style={{ background: CAPACITY_GRADIENT_CSS }}>
              <div className="absolute inset-0 flex">
                {['<8.5', '8.5', '11.5', '16', '23', '50'].map((label) => (
                  <div key={label} className="flex-1 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-white leading-none drop-shadow-sm">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shift not started */}
      {!state.shiftStarted && (
        <div className="mx-4 mt-4 glass-card rounded-xl text-amber-800 dark:text-amber-300 text-center py-4 px-6 border border-amber-200 dark:border-amber-700">
          Shift not started yet. Waiting for nurse to set up teams.
        </div>
      )}

      {/* Schedule Timeline */}
      {state.scheduleData && (() => {
        const day = state.scheduleData.days[state.scheduleData.selectedDayIdx];
        if (!day) return null;
        const allProviders = day.providers as Array<{ shiftStart?: string; shiftEnd?: string }>;
        const teams = ([1, 2, 3, 4] as TeamId[]).map(teamId => ({
          teamId,
          providers: day.providers.filter(p => p.teamId === teamId),
        }));
        const floats: FloatAttending[] = day.floatAttendings;
        const onHourChange = (h: number) => {
          setScheduleHour(h);
          dispatch({ type: 'SCHEDULE_CHANGE_HOUR', hour: h });
        };
        return (
          <>
            {/* Master timeline bar — always visible */}
            <div className="mx-4 mt-3 pt-5">
              <TimelineBar providers={allProviders} currentHour={scheduleHour} onHourChange={onHourChange} solidColor="bg-blue-500" />
            </div>

            <details className="mx-4 mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                Schedule Timeline — {day.dayOfWeek} {day.date}
              </summary>
              <TimelineSlider
                teams={teams}
                floatAttendings={floats}
                currentHour={scheduleHour}
                onHourChange={onHourChange}
              />
            </details>
          </>
        );
      })()}

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
            return <TeamCard key={id} teamId={id} score={score} recommendationRank={rank} isClosed={isClosed} closedAt={closedAt} allCandidatesBuffered={allCandidatesBuffered} forceCollapsePatients={globalCollapsePatients} forceHideStabilized={globalHideStabilized} />;
          });
        })()}
      </div>

      {/* Empty state for simulation */}
      {state.simulation?.active && state.patients.length === 0 && (
        <div className="mx-4 text-center text-sm text-slate-500/70 dark:text-slate-400/70 py-4">
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

      {/* Simulation summary card */}
      {state.simulation?.active && state.simulation.shadow && state.simulation.liveShadow &&
        state.simulation.nextArrivalIndex >= state.simulation.timeline.length && (
        <SimSummaryCard simulation={state.simulation} />
      )}

      {/* Summary */}
      <div className="mx-4 text-center text-sm text-slate-500 dark:text-slate-400">
        {state.patients.length} patient{state.patients.length !== 1 ? 's' : ''} assigned this shift
      </div>

      {/* FAB — hidden during simulation since patients are auto-assigned */}
      {state.shiftStarted && !state.simulation?.active && (
        <div className="fixed bottom-6 right-6 z-20">
          <button
            onClick={() => setShowAssign(true)}
            className="bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-2xl px-6 py-4 shadow-lg shadow-blue-600/30 font-bold text-base active:from-blue-700 active:to-blue-600 min-h-[56px]"
            aria-label="Assign Patient"
            data-tour="fab-assign"
          >
            {state.currentRole === 'attending' ? (
              '+ Upgrade Patient'
            ) : (
              <span className="flex flex-col items-center leading-tight">
                <span>+ New Patient</span>
                <span className="text-[10px] font-normal opacity-80">or upgrade</span>
              </span>
            )}
          </button>
        </div>
      )}

      {showAssign && (
        <AssignPatient
          onClose={() => setShowAssign(false)}
          initialSource={state.currentRole === 'attending' ? 'floor' : undefined}
          onAssigned={(teamId) => setToastTeam(teamId)}
        />
      )}

      {tourActive && onTourComplete && (
        <GuidedTour steps={steps} onComplete={onTourComplete} />
      )}

      {toastTeam !== null && (
        <Toast message={`Assigned to Team ${toastTeam}`} onDismiss={() => setToastTeam(null)} />
      )}

      {showShiftSetup && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <ShiftSetup onBack={() => setShowShiftSetup(false)} />
        </div>
      )}

      {showBenchmark && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <BenchmarkReport onBack={() => setShowBenchmark(false)} />
        </div>
      )}

      {showBacktest && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <RealScheduleBenchmarkReport onBack={() => setShowBacktest(false)} />
        </div>
      )}
    </div>
  );
}
