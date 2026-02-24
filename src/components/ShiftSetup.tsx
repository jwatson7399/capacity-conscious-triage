import { useState } from 'react';
import { useShift } from '../context/ShiftContext';
import type { Provider, ProviderType, TeamId } from '../types';
import { PROVIDER_TYPE_LABELS } from '../constants';
import { uid } from '../uid';

const TEAM_IDS: TeamId[] = [1, 2, 3, 4];
const TEAM_LABELS: Record<TeamId, string> = { 1: 'Team 1', 2: 'Team 2', 3: 'Team 3', 4: 'Trauma (Team 4)' };
const PROVIDER_TYPES: ProviderType[] = ['attending', 'senior_resident', 'junior_resident', 'pa', 'rotator'];

interface DraftProvider {
  id: string;
  name: string;
  type: ProviderType;
  teamId: TeamId;
}

export default function ShiftSetup() {
  const { dispatch } = useShift();
  const [drafts, setDrafts] = useState<DraftProvider[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<TeamId>(1);
  const [addingTo, setAddingTo] = useState<TeamId | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ProviderType>('senior_resident');

  const addProvider = (teamId: TeamId) => {
    if (!newName.trim()) return;
    setDrafts(d => [...d, { id: uid(), name: newName.trim(), type: newType, teamId }]);
    setNewName('');
    setNewType('senior_resident');
    setAddingTo(null);
  };

  const removeProvider = (id: string) => {
    setDrafts(d => d.filter(p => p.id !== id));
  };

  const canStart = () => {
    // At least one general team (1-3) needs a provider
    return [1, 2, 3].some(t => drafts.some(d => d.teamId === t));
  };

  const startShift = () => {
    const providers: Provider[] = drafts.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      status: 'active',
      statusExpiresAt: null,
      teamId: d.teamId,
    }));
    dispatch({ type: 'START_SHIFT', providers });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
        <h1 className="text-xl font-bold text-gray-900">Shift Setup</h1>
        <p className="text-sm text-gray-500">Add providers to each team</p>
      </div>

      <div className="p-4 space-y-3">
        {TEAM_IDS.map(teamId => {
          const teamDrafts = drafts.filter(d => d.teamId === teamId);
          const isExpanded = expandedTeam === teamId;

          return (
            <div key={teamId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                className="w-full px-4 py-3 flex justify-between items-center text-left"
                onClick={() => setExpandedTeam(isExpanded ? (null as unknown as TeamId) : teamId)}
              >
                <span className="font-semibold text-gray-900">{TEAM_LABELS[teamId]}</span>
                <span className="text-sm text-gray-500">{teamDrafts.length} provider{teamDrafts.length !== 1 ? 's' : ''}</span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  {teamDrafts.length === 0 && (
                    <p className="text-sm text-gray-400 py-2">No providers added</p>
                  )}
                  {teamDrafts.map(d => (
                    <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <span className="font-medium text-gray-900">{d.name}</span>
                        <span className="text-sm text-gray-500 ml-2">{PROVIDER_TYPE_LABELS[d.type]}</span>
                      </div>
                      <button
                        onClick={() => removeProvider(d.id)}
                        className="text-red-500 text-sm min-h-[44px] px-3"
                        aria-label={`Remove ${d.name}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  {addingTo === teamId ? (
                    <div className="mt-3 space-y-2">
                      <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Provider name"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
                        autoFocus
                      />
                      <select
                        value={newType}
                        onChange={e => setNewType(e.target.value as ProviderType)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base bg-white"
                      >
                        {PROVIDER_TYPES.map(t => (
                          <option key={t} value={t}>{PROVIDER_TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => addProvider(teamId)}
                          disabled={!newName.trim()}
                          className="flex-1 bg-blue-600 text-white rounded-lg py-2 font-medium disabled:opacity-50 min-h-[44px]"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => { setAddingTo(null); setNewName(''); }}
                          className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 font-medium min-h-[44px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingTo(teamId)}
                      className="mt-2 w-full text-blue-600 font-medium py-2 min-h-[44px]"
                    >
                      + Add Provider
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="fixed bottom-0 inset-x-0 p-4 bg-white border-t border-gray-200">
        <button
          onClick={startShift}
          disabled={!canStart()}
          className="w-full bg-blue-600 text-white rounded-xl py-4 font-bold text-lg disabled:opacity-50 min-h-[56px]"
        >
          Start Shift
        </button>
      </div>
    </div>
  );
}
