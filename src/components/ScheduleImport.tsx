import { useState, useRef } from 'react';
import type { ProviderType, TeamId } from '../types';
import { PROVIDER_TYPE_LABELS } from '../constants';
import { parseWeeklySchedule, getProvidersForShift, type DaySchedule } from '../utils/scheduleParser';
import TimelineSlider from './TimelineSlider';

interface ImportedProvider {
  name: string;
  type: ProviderType;
  teamId: TeamId;
  included: boolean;
}

interface ImportResult {
  providers: ImportedProvider[];
  floatAttendings: string[];
  dayLabel: string;
}

interface Props {
  onImport: (providers: Array<{ name: string; type: ProviderType; teamId: TeamId }>, floatAttendings: string[]) => void;
}

const SHORT_DAYS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

function shortDay(dow: string): string {
  return SHORT_DAYS[dow.toLowerCase()] || dow.slice(0, 3);
}

export default function ScheduleImport({ onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [days, setDays] = useState<DaySchedule[] | null>(null);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [targetHour, setTargetHour] = useState(7);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<number | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setParsing(true);

    try {
      const buf = await file.arrayBuffer();
      const parsed = parseWeeklySchedule(buf);

      if (parsed.days.length === 0) {
        setError('No schedule data found. Check that the file has "Team 1", "Team 2", etc. headers.');
        setParsing(false);
        return;
      }

      setDays(parsed.days);

      // Auto-detect today's day
      const today = new Date();
      const todayDow = today.toLocaleDateString('en-US', { weekday: 'long' });
      const matchIdx = parsed.days.findIndex(d => d.dayOfWeek.toLowerCase() === todayDow.toLowerCase());
      const idx = matchIdx >= 0 ? matchIdx : 0;
      setSelectedDayIdx(idx);

      buildResult(parsed.days[idx], targetHour);
    } catch (err) {
      setError(`Failed to parse schedule: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setParsing(false);
    }
  };

  const buildResult = (day: DaySchedule, hour: number) => {
    const { providers, floatAttendings } = getProvidersForShift(day, hour);
    setResult({
      providers: providers.map(p => ({
        name: p.name,
        type: p.type,
        teamId: p.teamId,
        included: true,
      })),
      floatAttendings,
      dayLabel: `${day.dayOfWeek !== 'Unknown' ? day.dayOfWeek : ''} ${day.date !== 'Unknown' ? day.date : ''}`.trim() || 'Schedule',
    });
  };

  const handleDayChange = (idx: number) => {
    setSelectedDayIdx(idx);
    if (days) buildResult(days[idx], targetHour);
  };

  const handleTimeChange = (hour: number) => {
    setTargetHour(hour);
    if (days) buildResult(days[selectedDayIdx], hour);
  };

  const toggleProvider = (idx: number) => {
    setResult(prev => {
      if (!prev) return prev;
      const providers = [...prev.providers];
      providers[idx] = { ...providers[idx], included: !providers[idx].included };
      return { ...prev, providers };
    });
  };

  const changeType = (idx: number, type: ProviderType) => {
    setResult(prev => {
      if (!prev) return prev;
      const providers = [...prev.providers];
      providers[idx] = { ...providers[idx], type };
      return { ...prev, providers };
    });
    setEditingType(null);
  };

  const handleLoad = () => {
    if (!result) return;
    const included = result.providers
      .filter(p => p.included)
      .map(p => ({ name: p.name, type: p.type, teamId: p.teamId }));
    onImport(included, result.floatAttendings);

    // Show brief success message
    const count = included.length;
    const floatCount = result.floatAttendings.length;
    setSuccessMsg(`Loaded ${count} provider${count !== 1 ? 's' : ''}${floatCount > 0 ? ` + ${floatCount} float${floatCount !== 1 ? 's' : ''}` : ''}`);
    setDays(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';

    setTimeout(() => setSuccessMsg(null), 2500);
  };

  const handleCancel = () => {
    setDays(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  // Success confirmation
  if (successMsg) {
    return (
      <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl border border-green-200 dark:border-green-800 px-4 py-3 text-sm font-medium text-center">
        {successMsg}
      </div>
    );
  }

  // Preview screen
  if (result) {
    const byTeam = [1, 2, 3, 4].map(t => ({
      teamId: t as TeamId,
      providers: result.providers.filter(p => p.teamId === t),
    }));
    const includedCount = result.providers.filter(p => p.included).length;

    return (
      <div className="bg-blue-50 dark:bg-slate-700 rounded-xl border border-blue-200 dark:border-slate-600 p-4 space-y-3">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-base">{result.dayLabel}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {result.providers.length} providers found
            </p>
          </div>
          <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none px-1">&times;</button>
        </div>

        {/* Day picker */}
        {days && days.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {days.map((d, i) => (
              <button
                key={i}
                onClick={() => handleDayChange(i)}
                className={`px-2.5 py-1 text-xs rounded-full font-medium ${i === selectedDayIdx
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-600 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-500'}`}
              >
                {d.dayOfWeek !== 'Unknown' ? shortDay(d.dayOfWeek) : `Day ${i + 1}`}
              </button>
            ))}
          </div>
        )}

        {/* Timeline slider */}
        {days && (
          <TimelineSlider
            teams={[1, 2, 3, 4].map(t => ({
              teamId: t as TeamId,
              providers: days[selectedDayIdx].providers.filter(p => p.teamId === t),
            }))}
            floatAttendings={days[selectedDayIdx].floatAttendings}
            currentHour={targetHour}
            onHourChange={handleTimeChange}
          />
        )}

        {/* Provider list (filtered by current time) — toggle include/type */}
        <details className="text-sm">
          <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
            Edit providers ({includedCount} selected)
          </summary>
          <div className="mt-2 space-y-2">
            {byTeam.map(({ teamId, providers }) => (
              <div key={teamId}>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                  Team {teamId}{teamId === 4 ? ' (Trauma)' : ''}
                </div>
                {providers.length === 0 && (
                  <div className="text-xs text-gray-400 italic ml-2">No providers for this shift</div>
                )}
                {providers.map((p, i) => {
                  const globalIdx = result.providers.indexOf(p);
                  return (
                    <div key={i} className="flex items-center gap-2 py-0.5 ml-2">
                      <input
                        type="checkbox"
                        checked={p.included}
                        onChange={() => toggleProvider(globalIdx)}
                        className="w-4 h-4 flex-shrink-0"
                      />
                      <span className={`text-sm flex-1 ${p.included ? 'text-gray-900 dark:text-white' : 'text-gray-400 line-through'}`}>
                        {p.name}
                      </span>
                      {editingType === globalIdx ? (
                        <select
                          autoFocus
                          value={p.type}
                          onChange={e => changeType(globalIdx, e.target.value as ProviderType)}
                          onBlur={() => setEditingType(null)}
                          className="text-xs border border-blue-300 dark:border-slate-500 rounded px-1 py-0.5 bg-white dark:bg-slate-600 dark:text-white"
                        >
                          {(['attending', 'senior_resident', 'junior_resident', 'intern', 'pa', 'rotator'] as ProviderType[]).map(t => (
                            <option key={t} value={t}>{PROVIDER_TYPE_LABELS[t]}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingType(globalIdx)}
                          className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-600 rounded px-1.5 py-0.5"
                        >
                          {PROVIDER_TYPE_LABELS[p.type]}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </details>

        <button
          onClick={handleLoad}
          disabled={includedCount === 0}
          className="w-full bg-blue-600 text-white rounded-lg py-2 font-medium text-sm disabled:opacity-50 min-h-[44px]"
        >
          Load {includedCount} Provider{includedCount !== 1 ? 's' : ''}
          {result.floatAttendings.length > 0 ? ` + ${result.floatAttendings.length} Float${result.floatAttendings.length !== 1 ? 's' : ''}` : ''}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFile}
        className="hidden"
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={parsing}
        className="w-full bg-indigo-50 dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-slate-600 rounded-xl py-3 font-medium text-sm min-h-[44px]"
      >
        {parsing ? 'Parsing...' : 'Import Schedule (.xlsx)'}
      </button>
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg px-3 py-2 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
