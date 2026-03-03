import { useState } from 'react';
import { useShift } from '../context/ShiftContext';
import type { Provider, ProviderType, TeamId } from '../types';
import { PROVIDER_TYPE_LABELS } from '../constants';
import { uid } from '../uid';
import ScheduleImport from './ScheduleImport';

const TEAM_IDS: TeamId[] = [1, 2, 3, 4];
const TEAM_LABELS: Record<TeamId, string> = { 1: 'Team 1', 2: 'Team 2', 3: 'Team 3', 4: 'Trauma (Team 4)' };
const PROVIDER_TYPES: ProviderType[] = ['attending', 'senior_resident', 'junior_resident', 'intern', 'pa', 'rotator'];

interface DraftProvider {
  id: string;
  name: string;
  type: ProviderType;
  teamId: TeamId;
}

export default function ShiftSetup({ onBack }: { onBack?: () => void } = {}) {
  const { dispatch } = useShift();
  const [drafts, setDrafts] = useState<DraftProvider[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<TeamId>(1);
  const [addingTo, setAddingTo] = useState<TeamId | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ProviderType>('senior_resident');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<ProviderType>('senior_resident');

  const startEdit = (d: DraftProvider) => {
    setEditingId(d.id);
    setEditName(d.name);
    setEditType(d.type);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    setDrafts(ds => ds.map(d => d.id === editingId ? { ...d, name: titleCase(editName.trim()), type: editType } : d));
    setEditingId(null);
  };

  const handleScheduleImport = (
    providers: Array<{ name: string; type: ProviderType; teamId: TeamId }>,
    floatAttendings: string[],
  ) => {
    const imported: DraftProvider[] = providers.map(p => ({
      id: uid(),
      name: p.name.replace(/[a-zA-Z]+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()),
      type: p.type,
      teamId: p.teamId,
    }));
    setDrafts(imported);
    if (floatAttendings.length > 0) {
      dispatch({ type: 'SET_FLOAT_ATTENDINGS', names: floatAttendings });
    }
  };

  const titleCase = (s: string) => s.replace(/[a-zA-Z]+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  const addProvider = (teamId: TeamId) => {
    if (!newName.trim()) return;
    setDrafts(d => [...d, { id: uid(), name: titleCase(newName.trim()), type: newType, teamId }]);
    setNewName('');
    setNewType('senior_resident');
    setAddingTo(null);
  };

  const removeProvider = (id: string) => {
    setDrafts(d => d.filter(p => p.id !== id));
  };

  const toProviders = (): Provider[] => drafts.map(d => ({
    id: d.id,
    name: d.name,
    type: d.type,
    status: 'active',
    statusExpiresAt: null,
    teamId: d.teamId,
  }));

  const handleDone = () => {
    const providers = toProviders();
    if (onBack) {
      if (providers.length > 0) dispatch({ type: 'ADD_PROVIDERS', providers });
      onBack();
    } else {
      dispatch({ type: 'START_SHIFT', providers });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-24">
      <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-3 z-10 flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="text-blue-600 dark:text-blue-400 font-medium text-sm min-h-[44px] pr-2">
            ← Back
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {onBack ? 'Add Providers' : 'Shift Setup'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Add providers to each team</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <ScheduleImport onImport={handleScheduleImport} />

        {TEAM_IDS.map(teamId => {
          const teamDrafts = drafts.filter(d => d.teamId === teamId);
          const isExpanded = expandedTeam === teamId;

          return (
            <div key={teamId} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <button
                className="w-full px-4 py-3 flex justify-between items-center text-left"
                onClick={() => setExpandedTeam(isExpanded ? (null as unknown as TeamId) : teamId)}
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100">{TEAM_LABELS[teamId]}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{teamDrafts.length} provider{teamDrafts.length !== 1 ? 's' : ''}</span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-slate-700">
                  {teamDrafts.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 py-2">No providers added</p>
                  )}
                  {teamDrafts.map(d => (
                    <div key={d.id} className="py-2 border-b border-gray-50 dark:border-slate-700 last:border-0">
                      {editingId === d.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-base bg-white dark:bg-slate-700 dark:text-white"
                            autoFocus
                          />
                          <select
                            value={editType}
                            onChange={e => setEditType(e.target.value as ProviderType)}
                            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-base bg-white dark:bg-slate-700 dark:text-white"
                          >
                            {PROVIDER_TYPES.map(t => (
                              <option key={t} value={t}>{PROVIDER_TYPE_LABELS[t]}</option>
                            ))}
                          </select>
                          <div className="flex gap-2">
                            <button
                              onClick={saveEdit}
                              disabled={!editName.trim()}
                              className="flex-1 bg-blue-600 text-white rounded-lg py-2 font-medium disabled:opacity-50 min-h-[44px]"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="flex-1 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg py-2 font-medium min-h-[44px]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-gray-900 dark:text-gray-100">{d.name}</span>
                            <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">{PROVIDER_TYPE_LABELS[d.type]}</span>
                          </div>
                          <div className="flex items-center">
                            <button
                              onClick={() => startEdit(d)}
                              className="text-blue-600 dark:text-blue-400 text-sm min-h-[44px] px-3"
                              aria-label={`Edit ${d.name}`}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => removeProvider(d.id)}
                              className="text-red-500 text-sm min-h-[44px] px-3"
                              aria-label={`Remove ${d.name}`}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {addingTo === teamId ? (
                    <div className="mt-3 space-y-2">
                      <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Provider name"
                        className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-base bg-white dark:bg-slate-700 dark:text-white"
                        autoFocus
                      />
                      <select
                        value={newType}
                        onChange={e => setNewType(e.target.value as ProviderType)}
                        className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-base bg-white dark:bg-slate-700 dark:text-white"
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
                          className="flex-1 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg py-2 font-medium min-h-[44px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingTo(teamId)}
                      className="mt-2 w-full text-blue-600 dark:text-blue-400 font-medium py-2 min-h-[44px]"
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

      <div className="fixed bottom-0 inset-x-0 p-4 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700">
        <button
          onClick={handleDone}
          className="w-full bg-blue-600 text-white rounded-xl py-4 font-bold text-lg min-h-[56px]"
        >
          {onBack ? (drafts.length > 0 ? `Add ${drafts.length} Provider${drafts.length !== 1 ? 's' : ''}` : 'Back to Dashboard') : 'Start Shift'}
        </button>
      </div>
    </div>
  );
}
