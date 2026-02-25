import { useState } from 'react';
import type { Patient, TeamId } from '../types';
import { ACUITY_LABELS, ACUITY_COLORS, ACUITY_DECAY } from '../constants';
import { getDecayedAcuityWeight } from '../engine/recommendation';

function formatDuration(totalMins: number): string {
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs === 0) return `${mins}min${mins !== 1 ? 's' : ''}`;
  if (mins === 0) return `${hrs}hr${hrs !== 1 ? 's' : ''}`;
  return `${hrs}hr${hrs !== 1 ? 's' : ''} ${mins}min${mins !== 1 ? 's' : ''}`;
}

function getNextDecayInfo(patient: Patient, now: number, currentWeight: number): { label: string; decaying: boolean } {
  const elapsed = now - (patient.upgradedAt ?? patient.assignedAt);
  const steps = ACUITY_DECAY[patient.acuity];
  for (const step of steps) {
    if (elapsed < step.afterMs) {
      const remainMs = step.afterMs - elapsed;
      const mins = Math.ceil(remainMs / 60000);
      return { label: `load drops from ${currentWeight} to ${step.weight} in [${formatDuration(mins)}]`, decaying: true };
    }
  }
  return { label: '(stabilized)', decaying: false };
}

interface Props {
  patient: Patient;
  now: number;
  canManage: boolean;
  onUpgrade?: () => void;
  onReassign?: (toTeamId: TeamId, reason: string) => void;
  onDecease?: () => void;
  onDowngrade?: () => void;
}

export default function PatientBadge({ patient, now, canManage, onUpgrade, onReassign, onDecease, onDowngrade }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [reassignTeam, setReassignTeam] = useState<TeamId | null>(null);
  const [reassignReason, setReassignReason] = useState('');
  const [confirmAction, setConfirmAction] = useState<'decease' | 'downgrade' | null>(null);

  const colors = ACUITY_COLORS[patient.acuity];
  const currentWeight = getDecayedAcuityWeight(patient, now);
  const decayInfo = getNextDecayInfo(patient, now, currentWeight);
  const isDeceased = patient.deceased === true;
  const isStabilized = !isDeceased && !decayInfo.decaying;

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 rounded-lg text-left ${
          isStabilized ? 'px-3 py-1 min-h-[28px]' : 'px-3 py-2 min-h-[44px]'
        } ${isDeceased ? 'bg-gray-200 opacity-60' : colors.bg}`}
        style={isStabilized ? {
          backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(255,255,255,0.7) 4px, rgba(255,255,255,0.7) 11px)',
        } : undefined}
      >
        <span className={`patient-id font-bold ${isStabilized ? 'text-xs' : ''} ${isDeceased ? 'text-gray-500' : colors.text}`}>{patient.id}</span>
        <span className={`text-xs ${isDeceased ? 'text-gray-500' : colors.text}`}>
          {isDeceased ? 'Deceased' : ACUITY_LABELS[patient.acuity]}
        </span>
        {patient.originalAcuity && !isDeceased && (
          <span className="text-xs bg-red-200 text-red-800 px-1.5 rounded">upgraded</span>
        )}
        {!isDeceased && !isStabilized && (
          <span className="text-xs text-gray-500 dark:text-gray-500 font-medium">(load: {currentWeight})</span>
        )}
        {!isDeceased && !isStabilized && (
          <span className="ml-auto text-right text-xs text-gray-500 dark:text-gray-500 leading-tight">
            <span className="block">assigned {formatDuration(Math.floor((now - patient.assignedAt) / 60000))} ago</span>
            <span className={`block text-[10px] ${decayInfo.decaying ? '' : 'italic'}`}>{decayInfo.label}</span>
          </span>
        )}
        {isStabilized && (
          <span className="ml-auto text-[10px] text-gray-500 italic">stabilized</span>
        )}
      </button>

      {expanded && canManage && !isDeceased && (
        <div className="mt-1 p-2 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600 space-y-2">
          {patient.acuity !== 'tier_one' && onUpgrade && (
            <button
              onClick={onUpgrade}
              className="w-full bg-red-100 text-red-800 rounded-lg py-2 text-sm font-medium min-h-[44px]"
            >
              Upgrade to Red
            </button>
          )}
          {onDecease && confirmAction !== 'decease' && (
            <button
              onClick={() => setConfirmAction('decease')}
              className="w-full bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium min-h-[44px]"
            >
              Mark Deceased
            </button>
          )}
          {confirmAction === 'decease' && onDecease && (
            <div className="flex gap-2">
              <button
                onClick={() => { onDecease(); setConfirmAction(null); }}
                className="flex-1 bg-gray-600 text-white rounded-lg py-2 text-sm font-medium min-h-[44px]"
              >
                Confirm Deceased
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-medium min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          )}
          {onDowngrade && confirmAction !== 'downgrade' && (
            <button
              onClick={() => setConfirmAction('downgrade')}
              className="w-full bg-yellow-100 text-yellow-800 rounded-lg py-2 text-sm font-medium min-h-[44px]"
            >
              Downgrade
            </button>
          )}
          {confirmAction === 'downgrade' && onDowngrade && (
            <div className="flex gap-2">
              <button
                onClick={() => { onDowngrade(); setConfirmAction(null); }}
                className="flex-1 bg-yellow-600 text-white rounded-lg py-2 text-sm font-medium min-h-[44px]"
              >
                Confirm Downgrade
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-medium min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          )}
          {onReassign && (
            <>
              {reassignTeam === null ? (
                <button
                  onClick={() => setReassignTeam(([1, 2, 3, 4] as TeamId[]).find(t => t !== patient.assignedTeamId) ?? 1)}
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
