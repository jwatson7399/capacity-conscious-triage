import { useState, useRef, useEffect, useMemo } from 'react';
import { useShift } from '../context/ShiftContext';
import SimulationParams from './SimulationParams';
import type { TeamId } from '../types';
import { statsFromEntries, countSpread } from '../engine/fairness';

const SPEEDS = [1, 5, 10, 15, 20, 30, 40, 50, 100, 200, 400];


function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  return `${m}m${String(s).padStart(2, '0')}s`;
}

function ComparisonPanel({ sim, arrivedCount }: { sim: NonNullable<ReturnType<typeof useShift>['state']['simulation']>; arrivedCount: number }) {
  const shadow = sim.shadow!;
  const liveShadow = sim.liveShadow!;

  const liveMode = sim.roundRobin ? 'Round Robin' : 'Formula';
  const shadowMode = shadow.mode === 'round_robin' ? 'Round Robin' : 'Formula';

  const liveEntries = useMemo(() => liveShadow.entries.slice(0, arrivedCount), [liveShadow, arrivedCount]);
  const shadowEntries = useMemo(() => shadow.entries.slice(0, arrivedCount), [shadow, arrivedCount]);

  const liveStats = useMemo(() => statsFromEntries(liveEntries), [liveEntries]);
  const shadowStats = useMemo(() => statsFromEntries(shadowEntries), [shadowEntries]);

  const eligible = ([1, 2, 3, 4] as TeamId[]).filter(
    t => t !== 4 && !sim.permanentlyClosedTeams.includes(t)
  );

  const liveSpread = countSpread(liveStats, eligible);
  const shadowSpread = countSpread(shadowStats, eligible);

  const f = (n: number) => !isFinite(n) ? '-' : n.toFixed(1);
  const hi = (a: number, b: number, higher: boolean) => {
    if (Math.abs(a - b) < 0.01) return '';
    return (higher ? a > b : a < b) ? 'text-emerald-400 font-semibold' : '';
  };

  if (arrivedCount === 0) {
    return <div className="mt-2 text-center text-[10px] text-slate-500 py-2">Waiting for first arrival...</div>;
  }

  return (
    <div className="mt-2 rounded-lg bg-white/5 p-2 text-[10px]">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-1 items-center mb-1.5">
        <span className="text-right text-cyan-300 font-semibold">{liveMode}</span>
        <span className="w-20 text-center text-slate-600">vs</span>
        <span className="text-left text-amber-300 font-semibold">{shadowMode}</span>
      </div>

      {/* Patients per team */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-1 items-center py-0.5">
        <span className="text-right font-mono text-slate-300">{eligible.map(t => liveStats.teamCounts[t] ?? 0).join(' | ')}</span>
        <span className="w-20 text-center text-slate-500">Patients</span>
        <span className="text-left font-mono text-slate-300">{eligible.map(t => shadowStats.teamCounts[t] ?? 0).join(' | ')}</span>
      </div>

      {/* Avg Capacity */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-1 items-center py-0.5">
        <span className={`text-right font-mono text-slate-300 ${hi(liveStats.avgRatio, shadowStats.avgRatio, true)}`}>{f(liveStats.avgRatio)}</span>
        <span className="w-20 text-center text-slate-500">Avg Cap</span>
        <span className={`text-left font-mono text-slate-300 ${hi(shadowStats.avgRatio, liveStats.avgRatio, true)}`}>{f(shadowStats.avgRatio)}</span>
      </div>

      {/* Min Capacity */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-1 items-center py-0.5">
        <span className={`text-right font-mono text-slate-300 ${hi(liveStats.minRatio, shadowStats.minRatio, true)}`}>{f(liveStats.minRatio)}</span>
        <span className="w-20 text-center text-slate-500">Min Cap</span>
        <span className={`text-left font-mono text-slate-300 ${hi(shadowStats.minRatio, liveStats.minRatio, true)}`}>{f(shadowStats.minRatio)}</span>
      </div>

      {/* Red-zone arrivals (receiving team below p5 of historical capacity distribution) */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-1 items-center py-0.5">
        <span className={`text-right font-mono text-slate-300 ${hi(liveStats.redZoneEvents, shadowStats.redZoneEvents, false)}`}>{liveStats.redZoneEvents}</span>
        <span className="w-20 text-center text-slate-500">Red Zone</span>
        <span className={`text-left font-mono text-slate-300 ${hi(shadowStats.redZoneEvents, liveStats.redZoneEvents, false)}`}>{shadowStats.redZoneEvents}</span>
      </div>

      {/* Count spread (max − min patients across teams) */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-1 items-center py-0.5">
        <span className={`text-right font-mono text-slate-300 ${hi(liveSpread, shadowSpread, false)}`}>{liveSpread}</span>
        <span className="w-20 text-center text-slate-500">Spread</span>
        <span className={`text-left font-mono text-slate-300 ${hi(shadowSpread, liveSpread, false)}`}>{shadowSpread}</span>
      </div>
    </div>
  );
}

export default function SimulationControls() {
  const { state, dispatch } = useShift();
  const sim = state.simulation;
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showParams, setShowParams] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const speedBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (showSpeedMenu && speedBtnRef.current) {
      const rect = speedBtnRef.current.getBoundingClientRect();
      const menuWidth = 80;
      const left = Math.min(rect.left, window.innerWidth - menuWidth - 8);
      setMenuPos({ top: rect.bottom + 4, left: Math.max(8, left) });
    }
  }, [showSpeedMenu]);

  if (!sim?.active) return null;

  const elapsed = state.now - sim.baseTime;
  const total = sim.shiftDurationMs;
  const progress = Math.min(1, elapsed / total);

  // Count arrivals so far
  const arrivedCount = sim.nextArrivalIndex;
  const totalArrivals = sim.timeline.length;

  return (
    <>
      <div className="bg-slate-800/90 backdrop-blur border-b border-white/10 px-3 py-2 overflow-visible">
        {/* Controls row */}
        <div className="flex items-center gap-2">
          {/* Rewind */}
          <button
            onClick={() => {
              // Jump to previous snapshot relative to current time
              let idx = -1;
              for (let i = sim.snapshots.length - 1; i >= 0; i--) {
                if (sim.snapshots[i].simTime < state.now) { idx = i; break; }
              }
              if (idx >= 0) dispatch({ type: 'SIM_REWIND', snapshotIndex: idx });
            }}
            className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white/70 text-sm active:bg-white/20 disabled:opacity-30"
            title="Previous checkpoint"
            disabled={!sim.snapshots.some(s => s.simTime < state.now)}
          >
            <span className="text-xs">&#9198;</span>
          </button>

          {/* Play/Pause */}
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SIM_PAUSE' })}
            className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white/70 text-sm active:bg-white/20"
            title={sim.paused ? 'Play' : 'Pause'}
          >
            {sim.paused ? '\u25B6' : '\u23F8'}
          </button>

          {/* Skip to next patient */}
          <button
            onClick={() => dispatch({ type: 'SIM_SKIP_TO_NEXT' })}
            className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white/70 text-sm active:bg-white/20 disabled:opacity-30"
            title="Skip to next patient arrival"
            disabled={sim.nextArrivalIndex >= sim.timeline.length}
          >
            <span className="text-xs">&#9197;</span>
          </button>

          {/* Speed */}
          <button
            ref={speedBtnRef}
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            className="h-10 rounded-lg bg-white/10 px-2 flex items-center text-white/70 text-xs font-mono active:bg-white/20"
          >
            {sim.speed}x &#9662;
          </button>

          {/* Elapsed */}
          <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
            {formatTime(elapsed)}
          </span>

          {/* Params */}
          <button
            onClick={() => setShowParams(!showParams)}
            className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white/70 text-sm active:bg-white/20"
            title="Parameters"
          >
            <span className="text-lg">&#9881;</span>
          </button>
        </div>

        {/* Arrival markers mini-timeline */}
        <div className="relative h-3.5 mt-1.5 rounded bg-white/5">
          {sim.timeline.map((entry, i) => {
            const pos = ((entry.arrivalTime - sim.baseTime) / total) * 100;
            if (pos < 0 || pos > 100) return null;
            const color = entry.acuity === 'tier_one' ? 'bg-red-400'
              : entry.acuity === 'tier_two' ? 'bg-amber-400' : 'bg-violet-400';
            return (
              <div
                key={i}
                className={`absolute top-0 w-2.5 h-2.5 rounded-full ${color} ${i < arrivedCount ? 'opacity-100' : 'opacity-40'}`}
                style={{ left: `${pos}%` }}
                title={`${entry.acuity} at ${formatTime(entry.arrivalTime - sim.baseTime)}`}
              />
            );
          })}
          {/* Playhead */}
          <div
            className="absolute top-0 w-0.5 h-3.5 bg-blue-400"
            style={{ left: `${progress * 100}%` }}
          />
        </div>

        {/* Stats line */}
        <div className="flex justify-between mt-1 text-[10px] text-slate-500">
          <span>{arrivedCount}/{totalArrivals} patients arrived</span>
          <span className="flex items-center gap-2">
            {sim.roundRobin && <span className="text-amber-400 font-semibold">ROUND ROBIN</span>}
            Seed: {sim.seed}
            {sim.shadow && sim.liveShadow && (
              <button
                onClick={() => setShowCompare(!showCompare)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${showCompare ? 'bg-cyan-500/30 text-cyan-300' : 'bg-white/10 text-slate-400'}`}
              >
                {showCompare ? '▲ Compare' : '▼ Compare'}
              </button>
            )}
          </span>
        </div>

        {/* Comparison panel */}
        {showCompare && sim.shadow && sim.liveShadow && (
          <ComparisonPanel sim={sim} arrivedCount={arrivedCount} />
        )}
      </div>

      {/* Floating mini controls */}
      <div className="fixed bottom-6 left-6 z-20 flex items-center gap-1.5 bg-slate-800/90 backdrop-blur rounded-2xl px-3 py-2 shadow-lg border border-white/10">
        <button
          onClick={() => {
            let idx = -1;
            for (let i = sim.snapshots.length - 1; i >= 0; i--) {
              if (sim.snapshots[i].simTime < state.now) { idx = i; break; }
            }
            if (idx >= 0) dispatch({ type: 'SIM_REWIND', snapshotIndex: idx });
          }}
          className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white/70 text-sm active:bg-white/20 disabled:opacity-30"
          disabled={!sim.snapshots.some(s => s.simTime < state.now)}
        >
          <span className="text-xs">&#9198;</span>
        </button>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SIM_PAUSE' })}
          className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white/70 text-sm active:bg-white/20"
        >
          {sim.paused ? '\u25B6' : '\u23F8'}
        </button>
        <button
          onClick={() => dispatch({ type: 'SIM_SKIP_TO_NEXT' })}
          className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white/70 text-sm active:bg-white/20 disabled:opacity-30"
          disabled={sim.nextArrivalIndex >= sim.timeline.length}
        >
          <span className="text-xs">&#9197;</span>
        </button>
        <span className="text-[10px] text-slate-400 font-mono ml-1">{formatTime(elapsed)}</span>
      </div>

      {showSpeedMenu && menuPos && (
        <>
          <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setShowSpeedMenu(false)} />
          <div className="fixed bg-slate-700 rounded-lg shadow-lg py-1" style={{ zIndex: 9999, top: menuPos.top, left: menuPos.left }}>
            {SPEEDS.map(s => (
              <button
                key={s}
                onClick={() => { dispatch({ type: 'SET_SIM_SPEED', speed: s }); setShowSpeedMenu(false); }}
                className={`block w-full text-left px-4 py-1.5 text-xs font-mono ${
                  s === sim.speed ? 'text-blue-400 bg-white/10' : 'text-white/70 hover:bg-white/10'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </>
      )}

      {showParams && <SimulationParams onClose={() => setShowParams(false)} />}
    </>
  );
}
