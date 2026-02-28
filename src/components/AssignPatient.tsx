import { useState } from 'react';
import { useShift } from '../context/ShiftContext';
import type { AcuityTier, TeamId } from '../types';
import { ACUITY_LABELS, ACUITY_COLORS, TRAUMA_TEAM_ID, getCapacityTerm } from '../constants';
import OverrideModal from './OverrideModal';

const TIERS: AcuityTier[] = ['tier_one', 'tier_two', 'tier_three'];

const TIER_DESCRIPTIONS: Record<AcuityTier, string> = {
  tier_one: 'Critical action — ex: ACLS, intubation/BiPAP, GIB needing emergent blood transfusion, anaphylaxis, STEMI',
  tier_two: 'Emergent — ex: septic shock, acute abdomen, AMS, afib w/ RVR but normotensive',
  tier_three: 'Soft A-side — ex: end-tidal CO2 monitoring, concerning story but normal vitals',
};

interface Props {
  onClose: () => void;
  initialSource?: 'floor';
  onAssigned?: (teamId: TeamId) => void;
}

export default function AssignPatient({ onClose, initialSource, onAssigned }: Props) {
  const { recommendation, dispatch, state } = useShift();
  const [tier, setTier] = useState<AcuityTier | null>(null);
  const [source, setSource] = useState<'critical' | 'floor'>(initialSource ?? 'critical');
  const [selectedTeam, setSelectedTeam] = useState<TeamId | null>(null);
  const [showOverride, setShowOverride] = useState(false);

  const teamIds: TeamId[] = [1, 2, 3, 4];

  const handleTeamSelect = (teamId: TeamId) => {
    setSelectedTeam(teamId);
    if (teamId === recommendation.first || teamId === TRAUMA_TEAM_ID) {
      if (!tier) return;
      dispatch({
        type: 'ASSIGN_PATIENT',
        tier,
        teamId,
        source,
      });
      onAssigned?.(teamId);
      onClose();
    } else {
      setShowOverride(true);
    }
  };

  const confirm = (overrideReason?: string) => {
    if (!tier || !selectedTeam) return;
    dispatch({
      type: 'ASSIGN_PATIENT',
      tier,
      teamId: selectedTeam,
      source,
      overrideReason,
      recommendedTeamId: overrideReason ? (recommendation.first ?? undefined) : undefined,
    });
    onAssigned?.(selectedTeam);
    onClose();
  };

  if (showOverride && selectedTeam) {
    return (
      <OverrideModal
        recommendedTeamId={recommendation.first!}
        selectedTeamId={selectedTeam}
        onConfirm={(reason) => {
          confirm(reason);
        }}
        onCancel={() => {
          setShowOverride(false);
          setSelectedTeam(null);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mt-auto bg-white dark:bg-slate-900 rounded-t-2xl max-h-[85vh] overflow-y-auto pb-safe">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Assign Patient</h2>
          <button onClick={onClose} className="text-gray-500 min-h-[44px] px-2 text-sm">Cancel</button>
        </div>

        <div className="p-3 space-y-3">
          {/* Acuity Selection */}
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1.5">Acuity Color</div>
            <div className="space-y-1.5">
              {TIERS.map(t => {
                const colors = ACUITY_COLORS[t];
                return (
                  <button
                    key={t}
                    onClick={() => setTier(t)}
                    className={`w-full py-2 px-3 rounded-xl text-left min-h-[48px] transition-all ${colors.bg} ${colors.text} ${
                      tier === t
                        ? 'ring-2 ring-current'
                        : 'opacity-60'
                    }`}
                  >
                    <span className="font-bold text-lg">{ACUITY_LABELS[t]}</span>
                    <div className="text-xs font-semibold text-gray-500 mt-0.5">{TIER_DESCRIPTIONS[t]}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Source */}
          {tier && (
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1.5">Source</div>
              <div className="flex gap-2">
                {(['critical', 'floor'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSource(s)}
                    className={`flex-1 py-1.5 rounded-lg font-medium text-sm min-h-[40px] ${
                      source === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {s === 'critical' ? 'Critical' : 'Floor Upgrade'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Team Selection */}
          {tier && (
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1.5">Assign to Team</div>
              <div className="space-y-1.5">
                {teamIds.map(id => {
                  const score = recommendation.scores.find(s => s.teamId === id);
                  const isFirst = id === recommendation.first;
                  const isSecond = id === recommendation.second;
                  const isTrauma = id === TRAUMA_TEAM_ID;
                  const isClosed = id in state.closedTeams;

                  return (
                    <button
                      key={id}
                      onClick={() => !isClosed && handleTeamSelect(id)}
                      disabled={isClosed}
                      className={`w-full py-2 px-3 rounded-xl text-left min-h-[48px] transition-all ${
                        isClosed ? 'border border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed' :
                        isFirst ? 'recommendation-first bg-blue-50' :
                        isSecond ? 'recommendation-second bg-blue-50/50' :
                        isTrauma ? 'border border-red-200 bg-red-50' :
                        'border border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`font-semibold ${isClosed ? 'text-gray-400' : 'text-gray-900'}`}>
                            {isTrauma ? 'Trauma (Team 4)' : `Team ${id}`}
                          </span>
                          {isClosed && <span className="ml-2 text-xs text-gray-500 font-medium">Closed</span>}
                          {isFirst && <span className="ml-2 text-xs text-blue-600 font-medium">Recommended</span>}
                          {isSecond && <span className="ml-2 text-xs text-blue-500 font-medium">2nd Choice</span>}
                        </div>
                        {score && !isClosed && (
                          <span className={`text-sm font-medium ${getCapacityTerm(score.capacityRatio).color}`}>
                            {score.capacityRatio === Infinity ? '∞' : score.capacityRatio.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
