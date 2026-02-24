import { useState } from 'react';
import type { TeamId } from '../types';

const REASONS = [
  'Attending request',
  'Charge nurse decision',
  'Triage nurse decision',
  'Other',
];

interface Props {
  recommendedTeamId: TeamId;
  selectedTeamId: TeamId;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export default function OverrideModal({ recommendedTeamId, selectedTeamId, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const effectiveReason = reason === 'Other' ? customReason.trim() : reason;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative mt-auto bg-white rounded-t-2xl pb-safe">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Override Recommendation</h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="text-sm text-gray-600">
            Recommended: <span className="font-semibold">Team {recommendedTeamId}</span>
            <br />
            Selected: <span className="font-semibold">Team {selectedTeamId}</span>
          </div>

          <div>
            <div className="text-sm font-semibold text-gray-500 mb-2">Reason (required)</div>
            <div className="space-y-2">
              {REASONS.map(r => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`w-full py-2 px-4 rounded-lg text-left min-h-[44px] ${
                    reason === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {reason === 'Other' && (
            <input
              type="text"
              value={customReason}
              onChange={e => setCustomReason(e.target.value)}
              placeholder="Describe reason"
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              autoFocus
            />
          )}

          <div className="flex gap-2">
            <button
              onClick={() => onConfirm(effectiveReason)}
              disabled={!effectiveReason}
              className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-bold disabled:opacity-50 min-h-[48px]"
            >
              Confirm Override
            </button>
            <button
              onClick={onCancel}
              className="flex-1 bg-gray-100 text-gray-700 rounded-xl py-3 font-bold min-h-[48px]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
