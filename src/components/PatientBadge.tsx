import { useState } from 'react';
import type { Patient, TeamId } from '../types';
import { ACUITY_LABELS, ACUITY_COLORS, ACUITY_DECAY, ACUITY_WEIGHTS } from '../constants';
import { getDecayedAcuityWeight } from '../engine/recommendation';

function getNextDecayInfo(patient: Patient, now: number): { label: string } {
  const elapsed = now - (patient.upgradedAt ?? patient.assignedAt);
  const steps = ACUITY_DECAY[patient.acuity];
  for (const step of steps) {
    if (elapsed < step.afterMs) {
      const remainMs = step.afterMs - elapsed;
      const mins = Math.ceil(remainMs / 60000);
      return { label: `\u2192w:${step.weight} in ${mins}m` };
    }
  }
  return { label: 'decayed' };
}

interface Props {
  patient: Patient;
  now: number;
  canManage: boolean;
  onUpgrade?: () => void;
  onReassign?: (toTeamId: TeamId, reason: string) => void;
}

export default function PatientBadge({ patient, now, canManage, onUpgrade, onReassign }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [reassignTeam, setReassignTeam] = useState<TeamId | null>(null);
  const [reassignReason, setReassignReason] = useState('');

  const colors = ACUITY_COLORS[patient.acuity];
  const currentWeight = getDecayedAcuityWeight(patient, now);
  const baseWeight = ACUITY_WEIGHTS[patient.acuity];
  const hasDecayed = currentWeight < baseWeight;
  const decayInfo = getNextDecayInfo(patient, now);

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg ${colors.bg} min-h-[44px] text-left`}
      >
        <span className={`font-mono font-bold ${colors.text}`}>{patient.id}</span>
        <span className={`text-xs ${colors.text}`}>{ACUITY_LABELS[patient.acuity]}</span>
        {patient.originalAcuity && (
          <span className="text-xs bg-red-200 text-red-800 px-1.5 rounded">upgraded</span>
        )}
        {hasDecayed && (
          <span className="text-xs opacity-60">w:{currentWeight}</span>
        )}
        <span className="ml-auto text-right text-xs text-gray-500">
          <span>assigned {Math.floor((now - patient.assignedAt) / 60000)}m ago</span>
          <span className="mx-1">&middot;</span>
          <span>{decayInfo.label}</span>
        </span>
      </button>

      {expanded && canManage && (
        <div className="mt-1 p-2 bg-white rounded-lg border border-gray-200 space-y-2">
          {patient.acuity !== 'tier_one' && onUpgrade && (
            <button
              onClick={onUpgrade}
              className="w-full bg-red-100 text-red-800 rounded-lg py-2 text-sm font-medium min-h-[44px]"
            >
              Upgrade to Tier One
            </button>
          )}
          {onReassign && (
            <>
              {reassignTeam === null ? (
                <button
                  onClick={() => setReassignTeam(1)}
                  className="w-full bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-medium min-h-[44px]"
                >
                  Reassign to Another Team
                </button>
              ) : (
                <div className="space-y-2">
                  <select
                    value={reassignTeam}
                    onChange={e => setReassignTeam(Number(e.target.value) as TeamId)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                  >
                    {([1, 2, 3, 4] as TeamId[]).filter(t => t !== patient.assignedTeamId).map(t => (
                      <option key={t} value={t}>Team {t}{t === 4 ? ' (Trauma)' : ''}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={reassignReason}
                    onChange={e => setReassignReason(e.target.value)}
                    placeholder="Reason for reassignment"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (reassignReason.trim() && reassignTeam) {
                          onReassign(reassignTeam, reassignReason.trim());
                          setReassignTeam(null);
                          setReassignReason('');
                          setExpanded(false);
                        }
                      }}
                      disabled={!reassignReason.trim()}
                      className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 min-h-[44px]"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => { setReassignTeam(null); setReassignReason(''); }}
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
      )}
    </div>
  );
}
