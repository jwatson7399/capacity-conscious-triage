import { useState } from 'react';
import { useShift } from '../context/ShiftContext';
import type { TeamId, TeamScore, ProviderType } from '../types';
import { ACUITY_LABELS, ACUITY_COLORS, PROVIDER_TYPE_LABELS, TRAUMA_TEAM_ID, getCapacityTerm } from '../constants';
import { getActiveBuffers } from '../engine/recommendation';
import ProviderStatusToggle from './ProviderStatusToggle';
import PatientBadge from './PatientBadge';

interface Props {
  teamId: TeamId;
  score: TeamScore;
  recommendationRank: 'first' | 'second' | null;
}

const PROVIDER_TYPES: ProviderType[] = ['attending', 'senior_resident', 'junior_resident', 'pa', 'rotator'];

export default function TeamCard({ teamId, score, recommendationRank }: Props) {
  const { state, dispatch } = useShift();
  const { providers, patients, buffers, now, currentRole } = state;
  const isTrauma = teamId === TRAUMA_TEAM_ID;
  const canManage = currentRole === 'charge_nurse' || currentRole === 'attending';

  const teamProviders = providers.filter(p => p.teamId === teamId);
  const teamPatients = patients.filter(p => p.assignedTeamId === teamId);
  const activeBuffers = getActiveBuffers(buffers, teamId, now);
  const attending = teamProviders.find(p => p.type === 'attending');

  const [swapping, setSwapping] = useState<string | null>(null);
  const [swapName, setSwapName] = useState('');
  const [swapType, setSwapType] = useState<ProviderType>('senior_resident');
  const [providersOpen, setProvidersOpen] = useState(false);

  const borderClass = recommendationRank === 'first'
    ? 'recommendation-first'
    : recommendationRank === 'second'
      ? 'recommendation-second'
      : '';

  const capacityTerm = getCapacityTerm(score.capacityRatio);

  return (
    <div className={`glass-card rounded-xl overflow-hidden ${borderClass}`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${isTrauma ? 'bg-red-50/80' : 'bg-slate-50/80'}`}>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">
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
          </div>
          {attending && (
            <div className="text-sm text-gray-500">Dr. {attending.name}</div>
          )}
          {isTrauma && (
            <div className="text-xs text-red-600">Excluded from assignment recommendations</div>
          )}
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${capacityTerm.color}`}>{score.capacityRatio === Infinity ? '∞' : Math.round(score.capacityRatio)}</div>
          <div className={`text-lg font-bold ${capacityTerm.color}`}>{capacityTerm.label}</div>
          <div className="text-xs text-gray-400">Capacity: {score.capacity.toFixed(1)}</div>
          <div className="text-xs text-gray-400">Load: {score.load.toFixed(1)}</div>
        </div>
      </div>

      {/* Buffer bars */}
      {activeBuffers.length > 0 && (
        <div className="px-4 pt-2 space-y-1">
          {activeBuffers.map(buf => {
            const remainingMs = Math.max(0, buf.expiresAt - now);
            const mins = Math.floor(remainingMs / 60000);
            const secs = Math.floor((remainingMs % 60000) / 1000);
            const colors = ACUITY_COLORS[buf.tier];

            const isMerged = (buf.mergedCount ?? 1) > 1;
            const elapsedMs = now - buf.createdAt;
            const effectiveTotal = elapsedMs + remainingMs;
            const pct = effectiveTotal > 0 ? (remainingMs / effectiveTotal) * 100 : 0;

            return (
              <div key={buf.id} className={`${isMerged ? 'h-7' : 'h-5'} rounded overflow-hidden bg-gray-200 relative`}>
                <div
                  className={`h-full ${isMerged ? 'bg-gradient-to-r from-red-400 via-amber-400 to-red-400 animate-pulse' : colors.bar} absolute left-0 transition-[width] duration-1000 ease-linear`}
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-gray-900 z-10">
                  {isMerged
                    ? <>Merged buffer ({buf.mergedCount} combined) &middot; <span className="font-mono ml-1">{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</span> <span className="ml-1">remaining</span></>
                    : <>{ACUITY_LABELS[buf.tier]} buffer &middot; <span className="font-mono ml-1">{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</span> <span className="ml-1">remaining</span></>
                  }
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Providers */}
      <div className="px-4 pt-2">
        <button
          onClick={() => setProvidersOpen(!providersOpen)}
          className="flex items-center gap-1 w-full text-left"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${providersOpen ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Providers ({teamProviders.length})</span>
        </button>
        {providersOpen && (
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
              <div className="mt-2 p-2 bg-gray-50 rounded-lg space-y-2">
                <div className="text-sm font-medium text-gray-700">Replace provider</div>
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
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Patients ({teamPatients.length})
        </div>
        {teamPatients.length === 0 && (
          <p className="text-sm text-gray-400 py-1">No patients assigned</p>
        )}
        {teamPatients.map(p => (
          <PatientBadge
            key={p.id}
            patient={p}
            now={now}
            canManage={canManage}
            onUpgrade={() => dispatch({ type: 'UPGRADE_PATIENT', patientId: p.id })}
            onReassign={(toTeamId, reason) => dispatch({ type: 'REASSIGN_PATIENT', patientId: p.id, toTeamId, reason })}
          />
        ))}
      </div>
    </div>
  );
}
