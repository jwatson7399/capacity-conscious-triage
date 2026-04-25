import { useShift } from '../context/ShiftContext';
import { getDefaultOverrides } from '../engine/simulation';
import type { SimOverrides } from '../types';

const TIER_COLOR_LABELS: Record<string, string> = {
  tier_one: 'Red',
  tier_two: 'Yellow',
  tier_three: 'Purple',
};

function NumberInput({ label, value, onChange, min, max, step, suffix }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-300 shrink-0">{label}</span>
      <div className="flex-1 border-b border-dotted border-white/15 min-w-4 self-end mb-1.5" />
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number" value={value} min={min} max={max} step={step ?? 0.5}
          onChange={e => onChange(Number(e.target.value))}
          className="w-20 bg-white/10 text-white text-xs rounded px-2 py-1 text-right font-mono border border-white/10"
        />
        {suffix && <span className="text-xs text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}

function isModified(current: unknown, defaultVal: unknown): boolean {
  return JSON.stringify(current) !== JSON.stringify(defaultVal);
}

function SectionHeader({ title, modified, onReset }: { title: string; modified: boolean; onReset: () => void }) {
  return (
    <div className="flex items-center justify-between mt-4 mb-2">
      <span className="text-xs font-semibold text-slate-200">{title}</span>
      <div className="flex items-center gap-2">
        {modified && (
          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">Modified</span>
        )}
        <button onClick={onReset} className="text-[10px] text-blue-400 active:text-blue-300">Reset</button>
      </div>
    </div>
  );
}

export default function SimulationParams({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useShift();
  const sim = state.simulation;
  if (!sim) return null;

  const ov = sim.overrides;
  const defaults = getDefaultOverrides();

  const update = (partial: Partial<SimOverrides>) => {
    dispatch({ type: 'SET_SIM_OVERRIDE', overrides: partial });
  };

  const resetSection = (key: keyof SimOverrides) => {
    update({ [key]: defaults[key] });
  };

  return (
    <div className="bg-slate-800/95 backdrop-blur border-b border-white/10 px-4 py-3 max-h-[60vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-white">Simulation Parameters</h3>
        <button onClick={onClose} className="text-slate-400 active:text-white text-lg leading-none">&times;</button>
      </div>

      <SectionHeader title="Strength Weights" modified={isModified(ov.capacityWeights, defaults.capacityWeights)} onReset={() => resetSection('capacityWeights')} />
      <div className="space-y-1.5">
        {(Object.entries(ov.capacityWeights) as [string, number][]).map(([key, val]) => (
          <NumberInput key={key} label={key.replace('_', ' ')} value={val} min={0} max={50}
            onChange={v => update({ capacityWeights: { ...ov.capacityWeights, [key]: v } as SimOverrides['capacityWeights'] })} />
        ))}
      </div>

      <SectionHeader title="Status Multipliers" modified={isModified(ov.statusMultipliers, defaults.statusMultipliers)} onReset={() => resetSection('statusMultipliers')} />
      <div className="space-y-1.5">
        {(Object.entries(ov.statusMultipliers) as [string, number][]).map(([key, val]) => (
          <NumberInput key={key} label={key.replace('_', ' ')} value={Math.round(val * 100)} min={0} max={100} step={5} suffix="%"
            onChange={v => update({ statusMultipliers: { ...ov.statusMultipliers, [key]: v / 100 } as SimOverrides['statusMultipliers'] })} />
        ))}
      </div>

      <SectionHeader title="Acuity Colors" modified={isModified(ov.acuityWeights, defaults.acuityWeights)} onReset={() => resetSection('acuityWeights')} />
      <div className="space-y-1.5">
        {(Object.entries(ov.acuityWeights) as [string, number][]).map(([key, val]) => (
          <NumberInput key={key} label={TIER_COLOR_LABELS[key] ?? key} value={val} min={0} max={20}
            onChange={v => update({ acuityWeights: { ...ov.acuityWeights, [key]: v } as SimOverrides['acuityWeights'] })} />
        ))}
      </div>

      <SectionHeader title="Buffer Durations" modified={isModified(ov.bufferDurations, defaults.bufferDurations)} onReset={() => resetSection('bufferDurations')} />
      <div className="space-y-1.5">
        {(Object.entries(ov.bufferDurations) as [string, number][]).map(([key, val]) => (
          <NumberInput key={key} label={TIER_COLOR_LABELS[key] ?? key} value={Math.round(val / 60000)} min={0} max={120} step={1} suffix="min"
            onChange={v => update({ bufferDurations: { ...ov.bufferDurations, [key]: v * 60000 } as SimOverrides['bufferDurations'] })} />
        ))}
      </div>

      <SectionHeader title="Arrival Rate" modified={isModified(ov.arrivalRatePerHour, defaults.arrivalRatePerHour)} onReset={() => resetSection('arrivalRatePerHour')} />
      <NumberInput label="Patients/hour" value={ov.arrivalRatePerHour} min={0.5} max={15} step={0.5}
        onChange={v => update({ arrivalRatePerHour: v })} />

      <SectionHeader title="Acuity Distribution" modified={isModified(ov.acuityDistribution, defaults.acuityDistribution)} onReset={() => resetSection('acuityDistribution')} />
      <div className="space-y-1.5">
        <NumberInput label="Red %" value={ov.acuityDistribution.tier_one} min={0} max={100} step={5}
          onChange={v => update({ acuityDistribution: { ...ov.acuityDistribution, tier_one: v } })} />
        <NumberInput label="Yellow %" value={ov.acuityDistribution.tier_two} min={0} max={100} step={5}
          onChange={v => update({ acuityDistribution: { ...ov.acuityDistribution, tier_two: v } })} />
        <NumberInput label="Purple %" value={ov.acuityDistribution.tier_three} min={0} max={100} step={5}
          onChange={v => update({ acuityDistribution: { ...ov.acuityDistribution, tier_three: v } })} />
      </div>

      <SectionHeader title="Floor Upgrade Chance" modified={isModified(ov.floorUpgradeChance, defaults.floorUpgradeChance)} onReset={() => resetSection('floorUpgradeChance')} />
      <NumberInput label="%" value={ov.floorUpgradeChance} min={0} max={100} step={5}
        onChange={v => update({ floorUpgradeChance: v })} />

      <div className="mt-4 pt-3 border-t border-white/10">
        <button
          onClick={() => update(getDefaultOverrides())}
          className="w-full text-xs text-blue-400 active:text-blue-300 py-2"
        >
          Reset All to Defaults
        </button>
      </div>
    </div>
  );
}
