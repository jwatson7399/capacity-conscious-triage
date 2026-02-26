import { useState } from 'react';
import { useShift } from '../context/ShiftContext';
import type { Provider, TeamId, ProviderType } from '../types';
import { getDefaultOverrides, randomSeed } from '../engine/simulation';

type Preset = 'typical_day' | 'understaffed_night' | 'high_acuity' | 'custom';

interface TeamPreset {
  label: string;
  description: string;
  providers: Array<{ type: ProviderType; teamId: TeamId }>;
  acuityDistribution?: { tier_one: number; tier_two: number; tier_three: number };
  arrivalRate?: number;
  closedTeams?: number[];
}

const PRESETS: Record<Exclude<Preset, 'custom'>, TeamPreset> = {
  typical_day: {
    label: 'Typical Day',
    description: '4 teams, full staffing, balanced acuity',
    providers: [
      // Team 1
      { type: 'attending', teamId: 1 }, { type: 'senior_resident', teamId: 1 },
      { type: 'junior_resident', teamId: 1 }, { type: 'pa', teamId: 1 },
      // Team 2
      { type: 'attending', teamId: 2 }, { type: 'senior_resident', teamId: 2 },
      { type: 'junior_resident', teamId: 2 }, { type: 'pa', teamId: 2 },
      // Team 3
      { type: 'attending', teamId: 3 }, { type: 'senior_resident', teamId: 3 },
      { type: 'pa', teamId: 3 },
      // Team 4 (trauma)
      { type: 'attending', teamId: 4 }, { type: 'junior_resident', teamId: 4 },
    ],
  },
  understaffed_night: {
    label: 'Night Shift',
    description: '2 teams, skeleton crew, lower volume',
    providers: [
      { type: 'attending', teamId: 1 }, { type: 'junior_resident', teamId: 1 }, { type: 'pa', teamId: 1 },
      { type: 'attending', teamId: 2 }, { type: 'senior_resident', teamId: 2 },
    ],
    arrivalRate: 2,
    closedTeams: [3, 4],
  },
  high_acuity: {
    label: 'High Acuity Day',
    description: 'Full staff, heavy red/yellow mix',
    providers: [
      { type: 'attending', teamId: 1 }, { type: 'senior_resident', teamId: 1 },
      { type: 'junior_resident', teamId: 1 }, { type: 'pa', teamId: 1 }, { type: 'rotator', teamId: 1 },
      { type: 'attending', teamId: 2 }, { type: 'senior_resident', teamId: 2 },
      { type: 'junior_resident', teamId: 2 }, { type: 'pa', teamId: 2 },
      { type: 'attending', teamId: 3 }, { type: 'senior_resident', teamId: 3 },
      { type: 'junior_resident', teamId: 3 }, { type: 'pa', teamId: 3 },
      { type: 'attending', teamId: 4 }, { type: 'senior_resident', teamId: 4 },
    ],
    acuityDistribution: { tier_one: 40, tier_two: 40, tier_three: 20 },
    arrivalRate: 6,
  },
};

const PROVIDER_NAMES = [
  'Rodriguez', 'Chen', 'Patel', 'Garcia', 'Williams', 'Kim', 'Johnson',
  'Lee', 'Brown', 'Davis', 'Taylor', 'Martinez', 'Wilson', 'Anderson',
  'Thomas', 'Jackson', 'White', 'Harris', 'Clark', 'Lewis',
];

export default function SimulationSetup({ onCancel }: { onCancel: () => void }) {
  const { dispatch } = useShift();
  const [preset, setPreset] = useState<Preset>('typical_day');
  const [shiftHours, setShiftHours] = useState(8);
  const [arrivalRate, setArrivalRate] = useState(4);
  const [acuityDist, setAcuityDist] = useState({ tier_one: 25, tier_two: 50, tier_three: 25 });
  const [seed, setSeed] = useState(() => randomSeed());
  const [roundRobin, setRoundRobin] = useState(false);

  const activePreset = preset !== 'custom' ? PRESETS[preset] : null;

  const handleStart = () => {
    const overrides = getDefaultOverrides();
    overrides.arrivalRatePerHour = arrivalRate;
    overrides.acuityDistribution = acuityDist;

    // Build providers from preset or custom
    const providerDefs = activePreset?.providers ?? PRESETS.typical_day.providers;
    const providers: Provider[] = providerDefs.map((def, i) => ({
      id: `sp${i}`,
      name: PROVIDER_NAMES[i % PROVIDER_NAMES.length],
      type: def.type,
      status: 'active',
      statusExpiresAt: null,
      teamId: def.teamId,
    }));

    const closedTeams: Record<number, number> = {};
    if (activePreset?.closedTeams) {
      const now = Date.now();
      for (const t of activePreset.closedTeams) closedTeams[t] = now;
    }

    dispatch({
      type: 'START_SIMULATION',
      providers,
      seed,
      shiftDurationMs: shiftHours * 60 * 60 * 1000,
      overrides,
      closedTeams,
      roundRobin,
    });
  };

  const setTierOne = (v: number) => {
    const remaining = 100 - v;
    const ratio = acuityDist.tier_two + acuityDist.tier_three;
    if (ratio === 0) {
      setAcuityDist({ tier_one: v, tier_two: Math.round(remaining / 2), tier_three: remaining - Math.round(remaining / 2) });
    } else {
      setAcuityDist({
        tier_one: v,
        tier_two: Math.round((acuityDist.tier_two / ratio) * remaining),
        tier_three: remaining - Math.round((acuityDist.tier_two / ratio) * remaining),
      });
    }
  };

  return (
    <div className="dashboard-bg flex flex-col items-center p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Simulation Setup</h1>
      <p className="text-slate-400 mb-6 text-sm text-center">Configure a simulated ER shift to watch the triage system in action</p>

      <div className="w-full max-w-md space-y-6">
        {/* Team Preset */}
        <div>
          <label className="text-sm font-semibold text-slate-300 block mb-2">Team Composition</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(PRESETS) as [Exclude<Preset, 'custom'>, TeamPreset][]).map(([key, p]) => (
              <button
                key={key}
                onClick={() => {
                  setPreset(key);
                  if (p.arrivalRate) setArrivalRate(p.arrivalRate);
                  else setArrivalRate(4);
                  if (p.acuityDistribution) setAcuityDist(p.acuityDistribution);
                  else setAcuityDist({ tier_one: 25, tier_two: 50, tier_three: 25 });
                }}
                className={`rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                  preset === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/10 text-slate-300 active:bg-white/20'
                }`}
              >
                <div className="font-semibold">{p.label}</div>
                <div className="text-xs opacity-70 mt-0.5">{p.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Shift Duration */}
        <div>
          <label className="text-sm font-semibold text-slate-300 block mb-2">
            Shift Duration: {shiftHours}h
          </label>
          <input
            type="range" min={2} max={12} step={1} value={shiftHours}
            onChange={e => setShiftHours(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-slate-500"><span>2h</span><span>12h</span></div>
        </div>

        {/* Patient Volume */}
        <div>
          <label className="text-sm font-semibold text-slate-300 block mb-2">
            Arrival Rate: {arrivalRate} patients/hour
          </label>
          <input
            type="range" min={2} max={8} step={0.5}
            value={arrivalRate}
            onChange={e => setArrivalRate(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-slate-500"><span>2/hr</span><span>8/hr</span></div>
        </div>

        {/* Acuity Mix */}
        <div>
          <label className="text-sm font-semibold text-slate-300 block mb-1">Acuity Distribution</label>
          <p className="text-xs text-slate-500 mb-2">Drag Red to adjust — Yellow and Purple scale automatically to total 100%</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400 w-12">Red</span>
              <input type="range" min={0} max={80} value={acuityDist.tier_one} onChange={e => setTierOne(Number(e.target.value))} className="flex-1 accent-red-500" />
              <span className="text-xs text-slate-400 w-8">{acuityDist.tier_one}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-400 w-12">Yellow</span>
              <div className="flex-1 bg-white/5 rounded h-2"><div className="bg-amber-500 h-2 rounded" style={{ width: `${acuityDist.tier_two}%` }} /></div>
              <span className="text-xs text-slate-400 w-8">{acuityDist.tier_two}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-violet-400 w-12">Purple</span>
              <div className="flex-1 bg-white/5 rounded h-2"><div className="bg-violet-500 h-2 rounded" style={{ width: `${acuityDist.tier_three}%` }} /></div>
              <span className="text-xs text-slate-400 w-8">{acuityDist.tier_three}%</span>
            </div>
          </div>
        </div>

        {/* Assignment Mode */}
        <div>
          <label className="text-sm font-semibold text-slate-300 block mb-2">Assignment Mode</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setRoundRobin(false)}
              className={`rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                !roundRobin ? 'bg-blue-600 text-white' : 'bg-white/10 text-slate-300 active:bg-white/20'
              }`}
            >
              <div className="font-semibold">Formula-Driven</div>
              <div className="text-xs opacity-70 mt-0.5">Capacity ratio + buffers</div>
            </button>
            <button
              onClick={() => setRoundRobin(true)}
              className={`rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                roundRobin ? 'bg-amber-600 text-white' : 'bg-white/10 text-slate-300 active:bg-white/20'
              }`}
            >
              <div className="font-semibold">Round Robin</div>
              <div className="text-xs opacity-70 mt-0.5">Rotate teams 1 → 2 → 3</div>
            </button>
          </div>
          {roundRobin && (
            <p className="text-xs text-amber-400 mt-1.5">Patients rotate evenly regardless of team capacity, acuity, or load — use to compare against formula-driven mode with the same seed.</p>
          )}
        </div>

        {/* Seed */}
        <div>
          <label className="text-sm font-semibold text-slate-300 block mb-2">Random Seed</label>
          <div className="flex gap-2">
            <input
              type="number" value={seed}
              onChange={e => setSeed(Number(e.target.value))}
              className="flex-1 bg-white/10 text-white rounded-lg px-3 py-2 text-sm font-mono border border-white/10"
            />
            <button
              onClick={() => setSeed(randomSeed())}
              className="bg-white/10 text-slate-300 rounded-lg px-3 py-2 text-sm active:bg-white/20"
            >
              Randomize
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">Same seed = identical patient arrivals</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 bg-white/10 text-slate-300 rounded-xl py-3 font-semibold active:bg-white/20"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-semibold active:bg-blue-700"
          >
            Start Simulation
          </button>
        </div>
      </div>
    </div>
  );
}
