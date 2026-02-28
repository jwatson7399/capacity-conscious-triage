import { useState, useEffect } from 'react';
import { useShift } from '../context/ShiftContext';
import type { TeamId, TeamScore, ProviderType } from '../types';
import { ACUITY_LABELS, ACUITY_COLORS, ACUITY_DECAY, PROVIDER_TYPE_LABELS, PROVIDER_TYPE_SHORT, TRAUMA_TEAM_ID, TEAM_CLOSE_TRANSFER_MS, TEAM_CLOSE_TRANSFER_TARGETS, getCapacityTerm } from '../constants';
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
  forceCollapseProviders?: boolean;
  forceCollapsePatients?: boolean;
  forceHideStabilized?: boolean;
}

const PROVIDER_TYPES: ProviderType[] = ['attending', 'senior_resident', 'junior_resident', 'pa', 'rotator'];

export default function TeamCard({ teamId, score, recommendationRank, isClosed, closedAt, allCandidatesBuffered, forceCollapseProviders, forceCollapsePatients, forceHideStabilized }: Props) {
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
  const [providersOpen, setProvidersOpen] = useState(true);
  const [patientsOpen, setPatientsOpen] = useState(true);
  const [hideStabilized, setHideStabilized] = useState(false);

  useEffect(() => {
    if (forceCollapseProviders) setProvidersOpen(false);
  }, [forceCollapseProviders]);

  useEffect(() => {
    if (forceCollapsePatients) setPatientsOpen(false);
  }, [forceCollapsePatients]);

  useEffect(() => {
    if (forceHideStabilized) setHideStabilized(true);
  }, [forceHideStabilized]);

  const isPatientStabilized = (p: typeof teamPatients[0]) => {
    if (p.deceased) return false;
    const elapsed = now - (p.upgradedAt ?? p.assignedAt);
    const steps = ACUITY_DECAY[p.acuity];
    return steps.length === 0 || elapsed >= steps[steps.length - 1].afterMs;
  };
  const stabilizedCount = teamPatients.filter(isPatientStabilized).length;
  const effectiveHideStabilized = hideStabilized;
  const visiblePatients = effectiveHideStabilized ? teamPatients.filter(p => !isPatientStabilized(p)) : teamPatients;
  const showProviders = providersOpen;
  const showPatients = patientsOpen;

  const borderClass = recommendationRank === 'first'
    ? 'recommendation-first'
    : recommendationRank === 'second'
      ? 'recommendation-second'
      : '';

  const capacityTerm = getCapacityTerm(score.capacityRatio);

  // Provider composition summary
  const providerSummary = (() => {
    const counts: Record<string, number> = {};
    for (const p of teamProviders) {
      const short = PROVIDER_TYPE_SHORT[p.type];
      counts[short] = (counts[short] || 0) + 1;
    }
    return Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ');
  })();

  // Patient tier count badges
  const tierCounts = {
    tier_one: teamPatients.filter(p => p.acuity === 'tier_one' && !p.deceased).length,
    tier_two: teamPatients.filter(p => p.acuity === 'tier_two' && !p.deceased).length,
    tier_three: teamPatients.filter(p => p.acuity === 'tier_three' && !p.deceased).length,
  };

  return (
    <div
      className={`glass-card rounded-xl overflow-hidden ${borderClass} ${isClosed ? 'opacity-60' : ''}`}
      data-tour-team={String(teamId)}
    >
      {/* Header */}
      <div
        className={`px-4 py-3 flex items-center justify-between ${isClosed ? 'bg-gray-200/80 dark:bg-gray-700/80' : isTrauma ? 'bg-red-50/80 dark:bg-red-950/40' : 'bg-slate-50/80 dark:bg-slate-800/80'}`}
        {...(recommendationRank === 'first' ? { 'data-tour': 'recommended-team' } : {})}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 dark:text-gray-100">
              {isTrauma ? 'Trauma (Team 4)' : `Team ${teamId}`}
            </span>
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
          {attending && (
            <div className="text-sm text-gray-500 dark:text-gray-400">Dr. {attending.name}</div>
          )}
          {isTrauma && (
            <div className="text-xs text-red-600 dark:text-red-400">Excluded from assignment recommendations</div>
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
        <div className="text-right" {...(recommendationRank === 'first' ? { 'data-tour': 'capacity-ratio' } : {})}>
          <div className={`text-2xl font-bold ${teamProviders.length === 0 ? 'text-slate-300 dark:text-slate-600' : capacityTerm.color}`}>{teamProviders.length === 0 ? '—' : score.capacityRatio === Infinity ? '∞' : score.capacityRatio.toFixed(1)}</div>
          <div className={`text-lg font-bold ${teamProviders.length === 0 ? 'text-amber-500 dark:text-amber-400' : activeBuffers.length > 0 ? (allCandidatesBuffered && recommendationRank === 'first' ? 'text-blue-500' : 'text-slate-400 dark:text-slate-500') : capacityTerm.color}`}>
            {teamProviders.length === 0
              ? 'Add Providers'
              : activeBuffers.length > 0
                ? (allCandidatesBuffered && recommendationRank === 'first' ? 'Next Up' : 'Buffered')
                : capacityTerm.label}
          </div>
          {allCandidatesBuffered && recommendationRank === 'first' && activeBuffers.length > 0 && (
            <div className="text-[10px] text-slate-400 dark:text-slate-500">(all teams buffered)</div>
          )}
          <div className="text-xs text-gray-400">Strength: {score.capacity.toFixed(1)}</div>
          <div className="text-xs text-gray-400">Demand: {score.load.toFixed(1)}</div>
        </div>
      </div>

      {/* Buffer bars */}
      {activeBuffers.length > 0 && (
        <div className="px-4 pt-2 space-y-1" data-tour="buffer-bar" data-tour-team={String(teamId)}>
          {activeBuffers.map(buf => {
            const remainingMs = Math.max(0, buf.expiresAt - now);
            const mins = Math.floor(remainingMs / 60000);
            const secs = Math.floor((remainingMs % 60000) / 1000);
            const colors = ACUITY_COLORS[buf.tier];

            const isMerged = (buf.mergedCount ?? 1) > 1;
            const isDeceased = !!buf.deceasedPatientId;
            const elapsedMs = now - buf.createdAt;
            const effectiveTotal = elapsedMs + remainingMs;
            const pct = effectiveTotal > 0 ? (remainingMs / effectiveTotal) * 100 : 0;

            const barColor = isDeceased
              ? 'bg-gray-400'
              : isMerged
                ? 'bg-gradient-to-r from-red-400 via-amber-400 to-violet-400 animate-pulse'
                : colors.bar;

            const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            const shortLabel = isDeceased ? 'Deceased' : isMerged ? `Merged (${buf.mergedCount})` : ACUITY_LABELS[buf.tier];
            const fullLabel = isDeceased
              ? `Recently deceased patient buffer`
              : isMerged
                ? `Merged buffer (${buf.mergedCount} combined)`
                : `${ACUITY_LABELS[buf.tier]} buffer`;

            return (
              <div key={buf.id} className={`${isMerged ? 'h-7' : 'h-5'} rounded overflow-hidden bg-gray-200 dark:bg-gray-700 relative`} title={`${fullLabel} · ${timeStr} remaining`}>
                <div
                  className={`h-full ${barColor} absolute left-0 transition-[width] duration-1000 ease-linear`}
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-gray-900 dark:text-gray-100 z-10 overflow-hidden whitespace-nowrap">
                  <span className="hidden sm:inline">{fullLabel}</span>
                  <span className="sm:hidden">{shortLabel}</span>
                  <span className="mx-1">&middot;</span>
                  <span className="font-mono">{timeStr}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Providers */}
      <div className="px-4 pt-2" data-tour="provider-list" data-tour-team={String(teamId)}>
        <button
          onClick={() => setProvidersOpen(!providersOpen)}
          className="flex items-center gap-1 w-full text-left"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showProviders ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Providers ({teamProviders.length})
          </span>
          {!showProviders && providerSummary && (
            <span className="text-xs text-gray-400 ml-1">— {providerSummary}</span>
          )}
        </button>
        {showProviders && (
          <>
            {teamProviders.length === 0 && (
              <p className="text-sm text-gray-400 py-1">None assigned</p>
            )}
            {teamProviders.map(p => (
              <ProviderStatusToggle
                key={p.id}
                provider={p}
                canManage={canManage}
                now={now}
                onSwap={canManage ? () => setSwapping(p.id) : undefined}
              />
            ))}
            {swapping && (
              <div className="mt-2 p-2 bg-gray-50 dark:bg-slate-700 rounded-lg space-y-2">
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
          </>
        )}
      </div>

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
        {showPatients && (
          <>
            {stabilizedCount > 0 && (
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => setHideStabilized(!hideStabilized)}
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                    effectiveHideStabilized
                      ? 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 inline-block mr-0.5 -mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {effectiveHideStabilized
                      ? <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>
                      : <><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></>
                    }
                  </svg>
                  {effectiveHideStabilized ? `Show ${stabilizedCount} stabilized` : 'Hide stabilized'}
                </button>
                {effectiveHideStabilized && (
                  <span className="text-[10px] text-gray-400 italic">{stabilizedCount} stabilized</span>
                )}
              </div>
            )}
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
