import { useState } from 'react';
import { useShift } from '../context/ShiftContext';
import type { Provider, ProviderStatus } from '../types';
import { STATUS_LABELS, STATUS_COLORS, PROVIDER_TYPE_LABELS, STATUS_MULTIPLIERS } from '../constants';

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
  const [showStatuses, setShowStatuses] = useState(false);
  const effective = capacityWeights[provider.type] * STATUS_MULTIPLIERS[provider.status];

  return (
    <div className="py-2 border-b border-gray-50 dark:border-slate-700 last:border-0">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_COLORS[provider.status]}`} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{provider.name}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {PROVIDER_TYPE_LABELS[provider.type]}
            {effective > 0 && <span className="ml-1">(strength: {effective.toFixed(1)})</span>}
          </div>
        </div>
        {provider.status !== 'active' && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{STATUS_LABELS[provider.status]}</span>
        )}
        {provider.statusExpiresAt && (
          <span className="text-sm font-mono font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
            {formatCountdown(provider.statusExpiresAt, now)}
          </span>
        )}
        {canManage && (
          <button
            onClick={() => setShowStatuses(!showStatuses)}
            className="text-xs text-blue-600 font-medium min-h-[44px] px-2"
          >
            {showStatuses ? 'Done' : 'Status'}
          </button>
        )}
        {canManage && onSwap && (
          <button
            onClick={onSwap}
            className="text-xs text-gray-500 min-h-[44px] px-2"
          >
            Swap
          </button>
        )}
      </div>

      {showStatuses && canManage && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => {
                dispatch({ type: 'SET_PROVIDER_STATUS', providerId: provider.id, status: s });
                setShowStatuses(false);
              }}
              className={`py-2 px-3 rounded-lg text-sm font-medium min-h-[44px] transition-colors ${
                s === provider.status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 active:bg-gray-200'
              }`}
            >
              {STATUS_LABELS[s]} <span className="text-xs opacity-70">({Math.round(STATUS_MULTIPLIERS[s] * 100)}% strength)</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
