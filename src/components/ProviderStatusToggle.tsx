import { useState } from 'react';
import { useShift } from '../context/ShiftContext';
import type { Provider, ProviderStatus } from '../types';
import { STATUS_LABELS, STATUS_COLORS, PROVIDER_TYPE_SHORT, STATUS_MULTIPLIERS } from '../constants';

const STATUSES: ProviderStatus[] = ['active', 'in_procedure', 'taking_signout', 'off_floor'];

function formatCountdown(expiresAt: number, now: number): string {
  const remaining = Math.max(0, expiresAt - now);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

interface Props {
  provider: Provider;
  canManage: boolean;
  now: number;
  onSwap?: () => void;
}

export default function ProviderStatusToggle({ provider, canManage, now, onSwap }: Props) {
  const { dispatch, capacityWeights } = useShift();
  const [expanded, setExpanded] = useState(false);
  const effective = capacityWeights[provider.type] * STATUS_MULTIPLIERS[provider.status];

  return (
    <>
      <button
        onClick={() => canManage && setExpanded(!expanded)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-gray-900 dark:text-gray-100 transition-colors ${canManage ? 'hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer' : 'cursor-default'}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_COLORS[provider.status]}`} />
        <span>{provider.name}</span>
        <span className="text-gray-500 dark:text-gray-400 font-medium">{PROVIDER_TYPE_SHORT[provider.type]}</span>
        {provider.statusExpiresAt && (
          <span className="font-mono text-[10px] bg-orange-200 dark:bg-orange-900/60 text-orange-800 dark:text-orange-200 px-1.5 py-0.5 rounded-full">
            {formatCountdown(provider.statusExpiresAt, now)}
          </span>
        )}
      </button>

      {expanded && canManage && (
        <div className="basis-full w-full mt-1 p-2 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {provider.name} · strength {effective.toFixed(1)}
              {provider.status !== 'active' && ` · ${STATUS_LABELS[provider.status]}`}
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-2"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => {
                  dispatch({ type: 'SET_PROVIDER_STATUS', providerId: provider.id, status: s });
                }}
                className={`py-2 px-3 rounded-lg text-sm font-medium min-h-[44px] transition-colors ${
                  s === provider.status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 active:bg-gray-200'
                }`}
              >
                {STATUS_LABELS[s]} <span className="text-xs opacity-70">({Math.round(STATUS_MULTIPLIERS[s] * 100)}%)</span>
              </button>
            ))}
          </div>
          {onSwap && (
            <button
              onClick={() => { onSwap(); setExpanded(false); }}
              className="w-full py-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 text-sm font-medium min-h-[44px]"
            >
              Swap Provider
            </button>
          )}
        </div>
      )}
    </>
  );
}
