import { useMemo } from 'react';
import type { SimulationState, TeamId } from '../types';
import { statsFromEntries, computeFairness } from '../engine/fairness';

interface Props {
  simulation: SimulationState;
}

function StatRow({ label, liveVal, shadowVal, higherBetter }: { label: string; liveVal: string; shadowVal: string; higherBetter: boolean }) {
  const liveNum = parseFloat(liveVal);
  const shadowNum = parseFloat(shadowVal);
  const tie = isNaN(liveNum) || isNaN(shadowNum) || Math.abs(liveNum - shadowNum) < 0.01;
  const liveWins = !tie && (higherBetter ? liveNum > shadowNum : liveNum < shadowNum);
  const shadowWins = !tie && (higherBetter ? shadowNum > liveNum : shadowNum < liveNum);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center py-1.5 border-b border-white/5 last:border-b-0">
      <span className={`text-right font-mono text-sm ${liveWins ? 'text-emerald-400 font-semibold' : 'text-slate-300'}`}>{liveVal}</span>
      <span className="text-[10px] text-slate-500 font-medium w-24 text-center">{label}</span>
      <span className={`text-left font-mono text-sm ${shadowWins ? 'text-emerald-400 font-semibold' : 'text-slate-300'}`}>{shadowVal}</span>
    </div>
  );
}

function FairnessBar({ score, label }: { score: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{label}</span>
        <span className="font-mono">{score.toFixed(0)}</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  );
}

function fmt(n: number): string {
  if (!isFinite(n)) return '-';
  return n.toFixed(1);
}

export default function SimSummaryCard({ simulation: sim }: Props) {
  const shadow = sim.shadow;
  const liveShadow = sim.liveShadow;
  if (!shadow || !liveShadow) return null;

  const liveMode = sim.roundRobin ? 'Round Robin' : 'Formula';
  const shadowMode = shadow.mode === 'round_robin' ? 'Round Robin' : 'Formula';

  const liveStats = useMemo(() => statsFromEntries(liveShadow.entries), [liveShadow]);
  const shadowStats = useMemo(() => statsFromEntries(shadow.entries), [shadow]);

  const liveFairness = useMemo(() => computeFairness(liveStats, sim.permanentlyClosedTeams), [liveStats, sim.permanentlyClosedTeams]);
  const shadowFairness = useMemo(() => computeFairness(shadowStats, sim.permanentlyClosedTeams), [shadowStats, sim.permanentlyClosedTeams]);

  const eligible = ([1, 2, 3, 4] as TeamId[]).filter(
    t => t !== 4 && !sim.permanentlyClosedTeams.includes(t)
  );

  const liveCountStr = eligible.map(t => liveStats.teamCounts[t] ?? 0).join(' | ');
  const shadowCountStr = eligible.map(t => shadowStats.teamCounts[t] ?? 0).join(' | ');

  const winner = liveFairness > shadowFairness + 0.5 ? liveMode : shadowFairness > liveFairness + 0.5 ? shadowMode : null;
  const diff = Math.abs(liveFairness - shadowFairness).toFixed(0);

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
          <span className="w-24 text-center text-[10px] text-slate-600">vs</span>
          <span className="text-left text-xs font-semibold text-amber-300">{shadowMode}</span>
        </div>

        <StatRow label="Patients" liveVal={liveCountStr} shadowVal={shadowCountStr} higherBetter={false} />
        <StatRow label="Avg Ratio" liveVal={fmt(liveStats.avgRatio)} shadowVal={fmt(shadowStats.avgRatio)} higherBetter={true} />
        <StatRow label="Min Ratio" liveVal={fmt(liveStats.minRatio)} shadowVal={fmt(shadowStats.minRatio)} higherBetter={true} />
        <StatRow label="Overwhelms" liveVal={String(liveStats.overwhelms)} shadowVal={String(shadowStats.overwhelms)} higherBetter={false} />

        {/* Fairness bars */}
        <div className="mt-3 space-y-2">
          <FairnessBar score={liveFairness} label={liveMode} />
          <FairnessBar score={shadowFairness} label={shadowMode} />
        </div>

        {/* Winner callout */}
        <div className="mt-3 text-center py-2 rounded-lg bg-white/5">
          {!winner ? (
            <span className="text-xs text-slate-400">Both modes scored equally</span>
          ) : (
            <span className="text-xs text-slate-300">
              <span className="font-semibold text-emerald-400">{winner}</span> scored {diff} points higher
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
                  <span className="w-24 text-center text-slate-500 font-medium">Team {t}</span>
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
