import { useMemo } from 'react';
import type { SimulationState, TeamId } from '../types';
import { statsFromEntries, countBackToBackHA, countSlams, countSpread, acuitySpread } from '../engine/fairness';

interface Props {
  simulation: SimulationState;
}

interface MetricRow {
  label: string;
  hint?: string;
  live: number;
  shadow: number;
  higherBetter: boolean;
  fmt: (n: number) => string;
}

const int = (n: number) => String(n);
const dec1 = (n: number) => (isFinite(n) ? n.toFixed(1) : '-');

function metricWinner(row: MetricRow): 'live' | 'shadow' | null {
  if (!isFinite(row.live) || !isFinite(row.shadow)) return null;
  if (Math.abs(row.live - row.shadow) < 0.01) return null;
  const liveWins = row.higherBetter ? row.live > row.shadow : row.live < row.shadow;
  return liveWins ? 'live' : 'shadow';
}

export default function SimSummaryCard({ simulation: sim }: Props) {
  const shadow = sim.shadow;
  const liveShadow = sim.liveShadow;

  const liveMode = sim.roundRobin ? 'Round Robin' : 'Formula';
  const shadowMode = shadow?.mode === 'round_robin' ? 'Round Robin' : 'Formula';

  const liveStats = useMemo(() => statsFromEntries(liveShadow?.entries ?? []), [liveShadow?.entries]);
  const shadowStats = useMemo(() => statsFromEntries(shadow?.entries ?? []), [shadow?.entries]);

  const eligible = ([1, 2, 3, 4] as TeamId[]).filter(
    t => t !== 4 && !sim.permanentlyClosedTeams.includes(t)
  );

  const rows = useMemo((): MetricRow[] => {
    const liveEntries = liveShadow?.entries ?? [];
    const shadowEntries = shadow?.entries ?? [];
    return [
      {
        label: 'B2B High-Acuity',
        hint: '2 red/yellow to one team within 30 min',
        live: countBackToBackHA(liveEntries),
        shadow: countBackToBackHA(shadowEntries),
        higherBetter: false,
        fmt: int,
      },
      {
        label: 'Slams',
        hint: '2+ patients to one team within 1 hr',
        live: countSlams(liveEntries),
        shadow: countSlams(shadowEntries),
        higherBetter: false,
        fmt: int,
      },
      {
        label: 'Red-Zone Arrivals',
        hint: 'team below p5 of historical capacity at assignment',
        live: liveStats.redZoneEvents,
        shadow: shadowStats.redZoneEvents,
        higherBetter: false,
        fmt: int,
      },
      {
        label: 'Min Capacity',
        hint: 'lowest ratio at any assignment',
        live: liveStats.minRatio,
        shadow: shadowStats.minRatio,
        higherBetter: true,
        fmt: dec1,
      },
      {
        label: 'Avg Capacity',
        hint: 'mean ratio across assignments',
        live: liveStats.avgRatio,
        shadow: shadowStats.avgRatio,
        higherBetter: true,
        fmt: dec1,
      },
      {
        label: 'Count Spread',
        hint: 'max − min patients per team',
        live: countSpread(liveStats, eligible),
        shadow: countSpread(shadowStats, eligible),
        higherBetter: false,
        fmt: int,
      },
      {
        label: 'Acuity Spread',
        hint: 'max − min weighted load per team',
        live: acuitySpread(liveStats, eligible),
        shadow: acuitySpread(shadowStats, eligible),
        higherBetter: false,
        fmt: int,
      },
    ];
  }, [liveShadow?.entries, shadow?.entries, liveStats, shadowStats, eligible]);

  if (!shadow || !liveShadow) return null;

  const liveCountStr = eligible.map(t => liveStats.teamCounts[t] ?? 0).join(' | ');
  const shadowCountStr = eligible.map(t => shadowStats.teamCounts[t] ?? 0).join(' | ');

  // Per-metric tally — no composite score, no weights.
  let liveWins = 0;
  let shadowWins = 0;
  for (const row of rows) {
    const w = metricWinner(row);
    if (w === 'live') liveWins++;
    else if (w === 'shadow') shadowWins++;
  }
  const ties = rows.length - liveWins - shadowWins;
  const leader = liveWins > shadowWins ? liveMode : shadowWins > liveWins ? shadowMode : null;
  const leaderWins = Math.max(liveWins, shadowWins);

  return (
    <div className="mx-4 mb-4 glass-card rounded-xl overflow-hidden">
      <div className="bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-violet-500/20 px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-bold text-white">Shift Complete — Performance Summary</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">
          Same seed ({sim.seed}), same {sim.timeline.length} patients — only assignment logic differs
        </p>
      </div>

      <div className="px-4 py-3">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-2">
          <span className="text-right text-xs font-semibold text-cyan-300">{liveMode}</span>
          <span className="w-28 text-center text-[10px] text-slate-600">vs</span>
          <span className="text-left text-xs font-semibold text-amber-300">{shadowMode}</span>
        </div>

        {/* Patients per team (context, not a scored metric) */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center py-1.5 border-b border-white/5">
          <span className="text-right font-mono text-sm text-slate-300">{liveCountStr}</span>
          <span className="text-[10px] text-slate-500 font-medium w-28 text-center">Patients</span>
          <span className="text-left font-mono text-sm text-slate-300">{shadowCountStr}</span>
        </div>

        {/* Individual metrics — each compared on its own; no composite */}
        {rows.map(row => {
          const w = metricWinner(row);
          return (
            <div key={row.label} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center py-1.5 border-b border-white/5 last:border-b-0">
              <span className={`text-right font-mono text-sm ${w === 'live' ? 'text-emerald-400 font-semibold' : 'text-slate-300'}`}>
                {row.fmt(row.live)}
              </span>
              <span className="w-28 text-center">
                <span className="block text-[10px] text-slate-500 font-medium leading-tight">{row.label}</span>
                {row.hint && <span className="block text-[8px] text-slate-600 leading-tight">{row.hint}</span>}
              </span>
              <span className={`text-left font-mono text-sm ${w === 'shadow' ? 'text-emerald-400 font-semibold' : 'text-slate-300'}`}>
                {row.fmt(row.shadow)}
              </span>
            </div>
          );
        })}

        {/* Metric tally — counts wins, doesn't weight them */}
        <div className="mt-3 text-center py-2 rounded-lg bg-white/5">
          {!leader ? (
            <span className="text-xs text-slate-400">
              Even split — {liveWins} metric{liveWins !== 1 ? 's' : ''} each{ties > 0 ? `, ${ties} tied` : ''}
            </span>
          ) : (
            <span className="text-xs text-slate-300">
              <span className="font-semibold text-emerald-400">{leader}</span> leads on {leaderWins} of {rows.length} metrics
              {ties > 0 ? ` (${ties} tied)` : ''}
            </span>
          )}
        </div>

        {/* Per-team breakdown */}
        <div className="mt-3">
          <div className="text-[10px] text-slate-500 font-semibold mb-1">Per-Team Breakdown</div>
          <div className="space-y-1">
            {eligible.map(t => {
              const liveCount = liveStats.teamCounts[t] ?? 0;
              const shadowCount = shadowStats.teamCounts[t] ?? 0;
              const liveAcuity = liveStats.teamAcuityLoad[t];
              const shadowAcuity = shadowStats.teamAcuityLoad[t];
              return (
                <div key={t} className="grid grid-cols-[1fr_auto_1fr] gap-2 text-[10px] items-center">
                  <span className="text-right font-mono text-slate-300">
                    {liveCount}p {liveAcuity ? `(${liveAcuity.tier_one}R/${liveAcuity.tier_two}Y/${liveAcuity.tier_three}P)` : ''}
                  </span>
                  <span className="w-28 text-center text-slate-500 font-medium">Team {t}</span>
                  <span className="text-left font-mono text-slate-300">
                    {shadowCount}p {shadowAcuity ? `(${shadowAcuity.tier_one}R/${shadowAcuity.tier_two}Y/${shadowAcuity.tier_three}P)` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
