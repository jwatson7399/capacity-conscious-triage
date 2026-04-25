import { useState } from 'react';
import { useShift } from '../context/ShiftContext';
import type { TeamId, TeamScore, ProviderType } from '../types';
import { ACUITY_DECAY, PROVIDER_TYPE_LABELS, TRAUMA_TEAM_ID, TEAM_CLOSE_TRANSFER_MS, TEAM_CLOSE_TRANSFER_TARGETS, getCapacityColor, capacityFillPercent } from '../constants';
import { getActiveBuffers } from '../engine/recommendation';
import ProviderStatusToggle from './ProviderStatusToggle';
import PatientBadge from './PatientBadge';

interface Props {
  teamId: TeamId;
  score: TeamScore;
  recommendationRank: 'first' | 'second' | null;
  isClosed?: boolean;
  closedAt?: number;
  allCandidatesBuffered?: boolean;
  forceCollapsePatients?: boolean;
  forceHideStabilized?: boolean;
}

const PROVIDER_TYPES: ProviderType[] = ['attending', 'senior_resident', 'junior_resident', 'intern', 'pa', 'rotator'];

export default function TeamCard({ teamId, score, recommendationRank, isClosed, closedAt, allCandidatesBuffered, forceCollapsePatients, forceHideStabilized }: Props) {
  const { state, dispatch } = useShift();
  const { providers, patients, buffers, now, currentRole } = state;
  const isTrauma = teamId === TRAUMA_TEAM_ID;
  const canManage = currentRole === 'charge_nurse' || currentRole === 'triage_nurse' || currentRole === 'attending';
  const transferTarget = TEAM_CLOSE_TRANSFER_TARGETS[teamId];

  const teamProviders = providers.filter(p => p.teamId === teamId);
  const teamPatients = patients.filter(p => p.assignedTeamId === teamId);
  const activeBuffers = getActiveBuffers(buffers, teamId, now);
  const attending = teamProviders.find(p => p.type === 'attending');

  const [swapping, setSwapping] = useState<string | null>(null);
  const [swapName, setSwapName] = useState('');
  const [swapType, setSwapType] = useState<ProviderType>('senior_resident');
  const [patientsOpen, setPatientsOpen] = useState(!forceCollapsePatients);
  const [hideStabilized, setHideStabilized] = useState(!!forceHideStabilized);
  const [prevForceCollapsePatients, setPrevForceCollapsePatients] = useState(forceCollapsePatients);
  const [prevForceHideStabilized, setPrevForceHideStabilized] = useState(forceHideStabilized);

  if (prevForceCollapsePatients !== forceCollapsePatients) {
    setPatientsOpen(!forceCollapsePatients);
    setPrevForceCollapsePatients(forceCollapsePatients);
  }
  if (prevForceHideStabilized !== forceHideStabilized) {
    setHideStabilized(!!forceHideStabilized);
    setPrevForceHideStabilized(forceHideStabilized);
  }

  const isPatientStabilized = (p: typeof teamPatients[0]) => {
    if (p.deceased) return false;
    const elapsed = now - (p.upgradedAt ?? p.assignedAt);
    const steps = ACUITY_DECAY[p.acuity];
    return steps.length === 0 || elapsed >= steps[steps.length - 1].afterMs;
  };
  const stabilizedCount = teamPatients.filter(isPatientStabilized).length;
  const effectiveHideStabilized = hideStabilized;
  const visiblePatients = effectiveHideStabilized ? teamPatients.filter(p => !isPatientStabilized(p)) : teamPatients;
  const showPatients = patientsOpen;

  const borderClass = recommendationRank === 'first'
    ? 'recommendation-first'
    : recommendationRank === 'second'
      ? 'recommendation-second'
      : '';

  // Patient tier count badges
  const tierCounts = {
    tier_one: teamPatients.filter(p => p.acuity === 'tier_one' && !p.deceased).length,
    tier_two: teamPatients.filter(p => p.acuity === 'tier_two' && !p.deceased).length,
    tier_three: teamPatients.filter(p => p.acuity === 'tier_three' && !p.deceased).length,
  };

  return (
    <div
      className={`relative glass-card rounded-xl overflow-hidden ${borderClass} ${isClosed ? 'opacity-60' : ''}`}
      data-tour-team={String(teamId)}
    >
      {(recommendationRank || isClosed) && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          {recommendationRank === 'first' && (
            <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-medium" aria-live="polite">
              Recommended
            </span>
          )}
          {recommendationRank === 'second' && (
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
              2nd Choice
            </span>
          )}
          {isClosed && (
            <span className="bg-gray-600 text-white text-xs px-2 py-0.5 rounded-full font-medium">
              Closed
            </span>
          )}
        </div>
      )}
      {/* Header with battery capacity widget */}
      {(() => {
        const hasProviders = teamProviders.length > 0;
        const isInactiveTrauma = isTrauma && teamPatients.length === 0;
        const useCapacityStyling = hasProviders && !isInactiveTrauma;
        const ratio = score.capacityRatio;
        const capColor = useCapacityStyling ? getCapacityColor(ratio) : '#94a3b8'; // slate-400 fallback
        const fillPct = useCapacityStyling ? capacityFillPercent(ratio) : 0;
        const headerBg = isClosed
          ? 'bg-gray-200/80 dark:bg-gray-700/80'
          : !useCapacityStyling
            ? 'bg-slate-50/80 dark:bg-slate-800/80'
            : (() => {
              // Transitions at midpoints between COLOR_STOPS so tint tracks interpolated number color.
              if (!isFinite(ratio) || ratio >= 54) return 'bg-emerald-50/80 dark:bg-emerald-950/40';
              if (ratio >= 39) return 'bg-green-50/80 dark:bg-green-950/40';
              if (ratio >= 25) return 'bg-yellow-50/80 dark:bg-yellow-950/40';
              if (ratio >= 15) return 'bg-orange-50/80 dark:bg-orange-950/40';
              if (ratio >= 10) return 'bg-red-50/80 dark:bg-red-950/40';
              return 'bg-red-100/80 dark:bg-red-950/60';
            })();
        const isAtInfinity = hasProviders && (ratio === Infinity || ratio >= 100);
        const displayNumber = !hasProviders ? '—' : isAtInfinity ? '∞' : ratio.toFixed(1);
        const showNextUp = isAtInfinity && recommendationRank === 'first';
        return (
          <div
            className={`px-3 py-3 grid items-center gap-3 border-b border-gray-200/70 dark:border-slate-700/70 ${headerBg}`}
            style={{ gridTemplateColumns: '108px 1fr' }}
            {...(recommendationRank === 'first' ? { 'data-tour': 'recommended-team' } : {})}
          >
            {/* Capacity battery widget (left) */}
            <div
              className="flex flex-col items-center"
              {...(recommendationRank === 'first' ? { 'data-tour': 'capacity-ratio' } : {})}
            >
              <div
                className="font-bold leading-none"
                style={{ color: capColor, fontSize: 26, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}
              >
                {displayNumber}
              </div>
              <div className="flex items-center mt-2" aria-hidden="true">
                <div
                  style={{
                    width: 56,
                    height: 16,
                    border: `1px solid ${capColor}`,
                    borderRadius: 3,
                    padding: 1.5,
                    background: isInactiveTrauma
                      ? 'repeating-linear-gradient(-45deg, rgba(148,163,184,0.35) 0 2px, rgba(255,255,255,0.6) 2px 5px)'
                      : 'rgba(255,255,255,0.6)',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{
                      width: `${fillPct}%`,
                      height: '100%',
                      background: capColor,
                      borderRadius: 1,
                    }}
                  />
                </div>
                <div
                  style={{
                    width: 3,
                    height: 7,
                    background: capColor,
                    borderRadius: '0 1px 1px 0',
                  }}
                />
              </div>
              <div
                className="mt-1.5 font-bold uppercase"
                style={{ color: capColor, fontSize: 10, letterSpacing: '0.08em' }}
              >
                Capacity
              </div>
              {showNextUp && (
                <div
                  className="mt-1 font-semibold uppercase italic"
                  style={{ color: capColor, fontSize: 9, letterSpacing: '0.06em', opacity: 0.8 }}
                >
                  · next up ·
                </div>
              )}
            </div>

            {/* Team info (right) */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  {isTrauma ? 'Trauma (Team 4)' : `Team ${teamId}`}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-variant-numeric-tabular">
                  Strength <b className="text-gray-700 dark:text-gray-300 font-semibold">{score.capacity.toFixed(1)}</b>
                  <span className="mx-1 text-gray-400">·</span>
                  Load <b className="text-gray-700 dark:text-gray-300 font-semibold">{score.load.toFixed(1)}</b>
                </span>
              </div>
              {attending && (
                <div className="text-sm text-gray-500 dark:text-gray-400 leading-tight">Dr. {attending.name}</div>
              )}
              {teamProviders.filter(p => p.type !== 'attending').length > 0 && (
                <div
                  className="flex flex-wrap items-start gap-1.5 mt-1.5"
                  data-tour="provider-list"
                  data-tour-team={String(teamId)}
                >
                  {teamProviders.filter(p => p.type !== 'attending').map(p => (
                    <ProviderStatusToggle
                      key={p.id}
                      provider={p}
                      canManage={canManage}
                      now={now}
                      onSwap={canManage ? () => setSwapping(p.id) : undefined}
                    />
                  ))}
                </div>
              )}
              {(teamProviders.length === 0 || activeBuffers.length > 0) && (
                <div className={`text-xs font-bold mt-1 ${teamProviders.length === 0 ? 'text-amber-600 dark:text-amber-400' : (allCandidatesBuffered && recommendationRank === 'first' ? 'text-blue-500' : 'text-slate-400 dark:text-slate-500')}`}>
                  {teamProviders.length === 0
                    ? 'Add Providers'
                    : (allCandidatesBuffered && recommendationRank === 'first' ? 'Next Up' : 'Buffered')}
                </div>
              )}
              {allCandidatesBuffered && recommendationRank === 'first' && activeBuffers.length > 0 && (
                <div className="text-[10px] text-slate-400 dark:text-slate-500">(all teams buffered)</div>
              )}
              {isTrauma && (
                <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">Excluded from assignment recommendations</div>
              )}
              {isClosed && closedAt && transferTarget && (() => {
                const transferAt = closedAt + TEAM_CLOSE_TRANSFER_MS;
                const remainingMs = Math.max(0, transferAt - now);
                const mins = Math.floor(remainingMs / 60000);
                const secs = Math.floor((remainingMs % 60000) / 1000);
                return (
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Auto-transfer to Team {transferTarget} in{' '}
                    <span className="font-mono">{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</span>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* Provider swap panel (appears when a provider's swap is triggered) */}
      {swapping && (
        <div className="px-4 pt-3 pb-2 space-y-2 bg-gray-50 dark:bg-slate-700/60 border-b border-gray-200 dark:border-slate-700">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-200">Replace provider</div>
          <input
            type="text"
            value={swapName}
            onChange={e => setSwapName(e.target.value)}
            placeholder="New provider name"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
            autoFocus
          />
          <select
            value={swapType}
            onChange={e => setSwapType(e.target.value as ProviderType)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
          >
            {PROVIDER_TYPES.map(t => (
              <option key={t} value={t}>{PROVIDER_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (swapName.trim()) {
                  dispatch({
                    type: 'SWAP_PROVIDER',
                    outProviderId: swapping,
                    incoming: { name: swapName.trim(), type: swapType, teamId },
                  });
                  setSwapping(null);
                  setSwapName('');
                }
              }}
              disabled={!swapName.trim()}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 min-h-[44px]"
            >
              Swap
            </button>
            <button
              onClick={() => { setSwapping(null); setSwapName(''); }}
              className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-medium min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Patients */}
      <div className="px-4 pt-2 pb-3">
        <button
          onClick={() => setPatientsOpen(!patientsOpen)}
          className="flex items-center gap-1 w-full text-left mb-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showPatients ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Patients ({teamPatients.length})
          </span>
          {!showPatients && (
            <span className="flex items-center gap-1 ml-1">
              {tierCounts.tier_one > 0 && (
                <span className="text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-medium">{tierCounts.tier_one}R</span>
              )}
              {tierCounts.tier_two > 0 && (
                <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">{tierCounts.tier_two}Y</span>
              )}
              {tierCounts.tier_three > 0 && (
                <span className="text-xs bg-violet-100 text-violet-800 px-1.5 py-0.5 rounded font-medium">{tierCounts.tier_three}P</span>
              )}
            </span>
          )}
        </button>
        {showPatients && teamPatients.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
            <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/30 ${tierCounts.tier_one === 0 ? 'opacity-40' : ''}`}>
              <span className="text-sm font-extrabold text-red-600 dark:text-red-400 leading-none">{tierCounts.tier_one}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-red-800/80 dark:text-red-300/80">Red</span>
            </div>
            <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 ${tierCounts.tier_two === 0 ? 'opacity-40' : ''}`}>
              <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400 leading-none">{tierCounts.tier_two}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-800/80 dark:text-amber-300/80">Yellow</span>
            </div>
            <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/30 ${tierCounts.tier_three === 0 ? 'opacity-40' : ''}`}>
              <span className="text-sm font-extrabold text-violet-600 dark:text-violet-400 leading-none">{tierCounts.tier_three}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-violet-800/80 dark:text-violet-300/80">Purple</span>
            </div>
            {stabilizedCount > 0 && (
              <button
                onClick={() => setHideStabilized(!hideStabilized)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 transition-colors"
                aria-pressed={effectiveHideStabilized}
              >
                <span className="text-sm font-extrabold text-slate-600 dark:text-slate-300 leading-none">{stabilizedCount}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-700/80 dark:text-slate-400/80">
                  Stabilized
                </span>
              </button>
            )}
          </div>
        )}
        {showPatients && (
          <>
            {visiblePatients.length === 0 && teamPatients.length === 0 && (
              <p className="text-sm text-gray-400 py-1">No patients assigned</p>
            )}
            {visiblePatients.length === 0 && teamPatients.length > 0 && (
              <p className="text-xs text-gray-400 italic py-1">All patients stabilized</p>
            )}
            {visiblePatients.map((p, i) => (
              <div key={p.id} {...(i === 0 && recommendationRank === 'first' ? { 'data-tour': 'patient-badge' } : {})}>
              <PatientBadge
                patient={p}
                now={now}
                canManage={canManage}
                onUpgrade={() => dispatch({ type: 'UPGRADE_PATIENT', patientId: p.id })}
                onReassign={(toTeamId, reason) => dispatch({ type: 'REASSIGN_PATIENT', patientId: p.id, toTeamId, reason })}
                onDecease={() => dispatch({ type: 'DECEASE_PATIENT', patientId: p.id })}
                onDowngrade={() => dispatch({ type: 'DOWNGRADE_PATIENT', patientId: p.id })}
                onSetFloatModifier={(modifier, floatName) => dispatch({ type: 'SET_FLOAT_MODIFIER', patientId: p.id, modifier, floatName })}
                floatAttendings={state.floatAttendings}
              />
              </div>
            ))}
          </>
        )}
      </div>

      {/* Close / Sign Out buttons */}
      {canManage && (teamId === 3 || teamId === 4) && !isClosed && (
        <div className="px-4 pb-3">
          <button
            onClick={() => dispatch({ type: 'CLOSE_TEAM', teamId })}
            className="w-full py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-medium min-h-[44px]"
          >
            Close Team
          </button>
        </div>
      )}
      {canManage && isClosed && teamPatients.length > 0 && transferTarget && (
        <div className="px-4 pb-3">
          <button
            onClick={() => dispatch({ type: 'SIGNOUT_PATIENTS', fromTeamId: teamId, toTeamId: transferTarget })}
            className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium min-h-[44px]"
          >
            Sign Out to Team {transferTarget}
          </button>
        </div>
      )}
    </div>
  );
}
