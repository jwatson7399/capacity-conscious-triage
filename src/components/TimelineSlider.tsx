import { useRef, useCallback, useState } from 'react';
import type { TeamId } from '../types';
import type { ScheduleProvider, FloatAttending } from '../utils/scheduleParser';
import { parseTimeToHour } from '../utils/scheduleParser';
import { PROVIDER_TYPE_SHORT, CAPACITY_WEIGHTS } from '../constants';

interface TeamData {
  teamId: TeamId;
  providers: ScheduleProvider[];
}

interface Props {
  teams: TeamData[];
  floatAttendings: FloatAttending[];
  currentHour: number;
  onHourChange: (hour: number) => void;
}

/** Build a staffing-count array (48 half-hour slots) for a set of providers */
function buildCoverage(providers: Array<{ shiftStart?: string; shiftEnd?: string }>): number[] {
  const slots = new Array(48).fill(0);
  for (const p of providers) {
    if (!p.shiftStart || !p.shiftEnd) { slots.forEach((_, i) => slots[i]++); continue; }
    const start = parseTimeToHour(p.shiftStart);
    const end = parseTimeToHour(p.shiftEnd);
    if (start < 0 || end < 0) { slots.forEach((_, i) => slots[i]++); continue; }
    if (start <= end) {
      for (let i = Math.floor(start * 2); i < Math.floor(end * 2); i++) slots[i]++;
    } else {
      for (let i = Math.floor(start * 2); i < 48; i++) slots[i]++;
      for (let i = 0; i < Math.floor(end * 2); i++) slots[i]++;
    }
  }
  return slots;
}

/** Map coverage count to a color: darker = less staff, brighter = more */
function coverageColor(count: number, max: number): string {
  if (max === 0) return 'bg-gray-300 dark:bg-slate-600';
  if (count === 0) return 'bg-gray-300 dark:bg-slate-600';
  const ratio = count / max;
  if (ratio > 0.75) return 'bg-emerald-400 dark:bg-emerald-400';
  if (ratio > 0.5) return 'bg-emerald-300 dark:bg-emerald-500/70';
  if (ratio > 0.25) return 'bg-gray-400 dark:bg-slate-500';
  return 'bg-gray-300 dark:bg-slate-600';
}

function isActive(p: { shiftStart?: string; shiftEnd?: string }, hour: number): boolean {
  if (!p.shiftStart || !p.shiftEnd) return true;
  const start = parseTimeToHour(p.shiftStart);
  const end = parseTimeToHour(p.shiftEnd);
  if (start < 0 || end < 0) return true;
  if (start <= end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function shiftLabel(p: { shiftStart?: string; shiftEnd?: string }): string {
  if (!p.shiftStart || !p.shiftEnd) return '';
  return `${p.shiftStart}-${p.shiftEnd}`;
}

function formatHour(h: number): string {
  if (h === 0 || h === 24) return '12A';
  if (h < 12) return `${h}A`;
  if (h === 12) return '12P';
  return `${h - 12}P`;
}

function formatHourFull(h: number): string {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  const suffix = hr < 12 || hr === 24 ? 'AM' : 'PM';
  const display = hr === 0 || hr === 24 ? 12 : hr > 12 ? hr - 12 : hr;
  return min > 0 ? `${display}:${String(min).padStart(2, '0')} ${suffix}` : `${display} ${suffix}`;
}

/** "SINDKAR" → "Sindkar", "BOWEN-SPINELLI" → "Bowen-Spinelli" */
function titleCase(name: string): string {
  return name.replace(/[a-zA-Z]+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function TimelineBar({ providers, currentHour, onHourChange, solidColor }: {
  providers: Array<{ shiftStart?: string; shiftEnd?: string }>;
  currentHour: number;
  onHourChange: (hour: number) => void;
  solidColor?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  const hourFromEvent = useCallback((clientX: number): number => {
    if (!barRef.current) return currentHour;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(pct * 48) / 2; // snap to 0.5h
  }, [currentHour]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onHourChange(hourFromEvent(e.clientX));
  }, [hourFromEvent, onHourChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    onHourChange(hourFromEvent(e.clientX));
  }, [hourFromEvent, onHourChange]);

  const cursorPct = (currentHour / 24) * 100;
  const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24];

  // Heatmap: one bar per half-hour slot, opacity = staffing level
  const coverage = buildCoverage(providers);
  const maxCoverage = Math.max(...coverage, 1);

  return (
    <div
      className="mt-1.5 mb-1 relative cursor-pointer touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      {/* Time label above bar */}
      <div
        className="absolute -top-6 z-20 pointer-events-none whitespace-nowrap"
        style={{ left: `${cursorPct}%`, transform: 'translateX(-50%)' }}
      >
        <span className="text-xs font-bold text-white bg-blue-600 dark:bg-blue-500 px-1.5 py-0.5 rounded shadow">
          {formatHourFull(currentHour)}
        </span>
      </div>

      <div
        ref={barRef}
        className="relative h-6 bg-gray-100 dark:bg-slate-700 rounded overflow-hidden"
      >
        {/* Coverage heatmap */}
        <div className="absolute inset-0 flex">
          {coverage.map((count, i) => (
            <div
              key={i}
              className={`flex-1 ${solidColor ? (count > 0 ? solidColor : 'bg-gray-300 dark:bg-slate-600') : coverageColor(count, maxCoverage)}`}
            />
          ))}
        </div>

        {/* Tick lines */}
        {ticks.slice(1, -1).map(h => (
          <div
            key={h}
            className="absolute top-0 h-full w-px bg-gray-300/40 dark:bg-slate-500/40"
            style={{ left: `${(h / 24) * 100}%` }}
          />
        ))}

        {/* Cursor line (inside bar, clipped) */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white dark:bg-white z-10 mix-blend-difference"
          style={{ left: `${cursorPct}%` }}
        />
      </div>

      {/* Cursor triangle below bar */}
      <div
        className="absolute z-10 pointer-events-none"
        style={{ left: `${cursorPct}%`, top: 'calc(100% - 18px)', transform: 'translateX(-50%)' }}
      >
        <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-blue-600 dark:border-t-blue-400" />
      </div>

      {/* Tick labels */}
      <div className="relative h-4 mt-0.5">
        {ticks.map(h => (
          <span
            key={h}
            className="absolute text-[10px] text-gray-500 dark:text-gray-400 -translate-x-1/2"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {formatHour(h)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function TimelineSlider({ teams, floatAttendings, currentHour, onHourChange }: Props) {
  // Team 4 (Trauma) and floats start collapsed
  const [collapsed, setCollapsed] = useState<Record<number | string, boolean>>({ 4: true, float: true });
  const toggle = (id: number | string) => setCollapsed(c => ({ ...c, [id]: !c[id] }));

  return (
    <div className="space-y-3">
      {/* Shading key */}
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
        <span>Less staff</span>
        <div className="w-20 h-2.5 rounded-full" style={{ background: 'linear-gradient(to right, #d1d5db, #9ca3af, #6ee7b7, #34d399)' }} />
        <span>More staff</span>
      </div>

      {teams.map(({ teamId, providers }) => {
        const active = providers.filter(p => isActive(p, currentHour));
        const upcoming = providers.filter(p => {
          if (!p.shiftStart) return false;
          const start = parseTimeToHour(p.shiftStart);
          return start > currentHour && !isActive(p, currentHour);
        });

        const activeAtt = active.find(p => p.type === 'attending');
        const activeNonAtt = active.filter(p => p.type !== 'attending');

        // Group non-attendings by type label
        const grouped: Record<string, Array<{ name: string; shift: string }>> = {};
        for (const p of activeNonAtt) {
          const label = PROVIDER_TYPE_SHORT[p.type] || p.type;
          if (!grouped[label]) grouped[label] = [];
          grouped[label].push({ name: titleCase(p.name), shift: shiftLabel(p) });
        }

        return (
          <div key={teamId} className="border border-gray-200 dark:border-slate-600 rounded-lg p-2.5">
            {(() => {
              const scored = active.map(p => ({ abbr: PROVIDER_TYPE_SHORT[p.type], weight: CAPACITY_WEIGHTS[p.type] }));
              const total = scored.reduce((s, v) => s + v.weight, 0);
              const isCollapsed = !!collapsed[teamId];
              return (
                <div
                  className="flex items-start justify-between cursor-pointer select-none"
                  onClick={() => toggle(teamId)}
                >
                  <div className="flex items-center gap-1.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isCollapsed ? '' : 'rotate-90'}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">
                      Team {teamId}{teamId === 4 ? ' (Trauma)' : ''}
                    </div>
                  </div>
                  <div className="text-right leading-tight">
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">
                      {scored.map((s, i) => (
                        <span key={i}>{i > 0 && ' + '}<span title={s.abbr}>{s.abbr} {s.weight}</span></span>
                      ))}
                    </div>
                    <div className="text-xs font-bold text-gray-700 dark:text-gray-200">
                      Team Strength: {total}
                    </div>
                  </div>
                </div>
              );
            })()}
            {!collapsed[teamId] && activeAtt && (
              <div className="text-sm text-gray-900 dark:text-white mb-0.5">
                <span className="text-gray-500 dark:text-gray-400 text-xs">Attending:</span>{' '}
                <span className="font-semibold">{titleCase(activeAtt.name)}</span>
                {activeAtt.shiftStart && <span className="text-gray-400 text-xs ml-0.5">({shiftLabel(activeAtt)})</span>}
              </div>
            )}

            {!collapsed[teamId] && <>
            {/* Other active providers */}
            <div className="text-sm text-gray-900 dark:text-white leading-snug">
              {Object.entries(grouped).map(([label, entries], gi) => (
                <span key={label}>
                  {gi > 0 && <span className="text-gray-400 mx-1">·</span>}
                  <span className="text-gray-500 dark:text-gray-400 text-xs">{label}:</span>{' '}
                  {entries.map((e, ei) => (
                    <span key={ei}>
                      {ei > 0 && ', '}
                      {e.name}
                      {e.shift && <span className="text-gray-400 text-xs ml-0.5">({e.shift})</span>}
                    </span>
                  ))}
                </span>
              ))}
              {activeNonAtt.length === 0 && !activeAtt && <span className="text-gray-400 italic text-xs">No providers</span>}
            </div>

            {/* Timeline bar (pt-5 for floating time label) */}
            <div className="pt-6">
            <TimelineBar
              providers={providers}
              currentHour={currentHour}
              onHourChange={onHourChange}
            />
            </div>

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <div className="text-xs text-gray-400 dark:text-gray-500 italic">
                Upcoming: {upcoming.map((p, i) => (
                  <span key={i}>{i > 0 && ' · '}<span className="not-italic text-gray-500 dark:text-gray-400">{PROVIDER_TYPE_SHORT[p.type]}</span> {titleCase(p.name)} {shiftLabel(p)}</span>
                ))}
              </div>
            )}
            </>}
          </div>
        );
      })}

      {/* Float attendings */}
      {floatAttendings.length > 0 && (
        <div className="border border-gray-200 dark:border-slate-600 rounded-lg p-2.5">
          <div
            className="flex items-center gap-1.5 cursor-pointer select-none"
            onClick={() => toggle('float')}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${collapsed['float'] ? '' : 'rotate-90'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              Float Attendings
            </div>
          </div>
          {!collapsed['float'] && (() => {
            const activeFloats = floatAttendings.filter(f => isActive(f, currentHour));
            const upcomingFloats = floatAttendings.filter(f => {
              if (!f.shiftStart) return false;
              const start = parseTimeToHour(f.shiftStart);
              return start > currentHour && !isActive(f, currentHour);
            });
            return (
              <>
                <div className="text-sm text-gray-900 dark:text-white mt-1">
                  {activeFloats.length > 0
                    ? activeFloats.map((f, i) => (
                        <span key={i}>{i > 0 && ' · '}{titleCase(f.name)} <span className="text-gray-400 text-xs">({shiftLabel(f)})</span></span>
                      ))
                    : <span className="text-gray-400 italic text-xs">None active</span>
                  }
                </div>
                <div className="pt-6">
                <TimelineBar
                  providers={floatAttendings}
                  currentHour={currentHour}
                  onHourChange={onHourChange}
                />
                </div>
                {upcomingFloats.length > 0 && (
                  <div className="text-xs text-gray-400 italic">
                    Upcoming: {upcomingFloats.map((f, i) => (
                      <span key={i}>{i > 0 && ' · '}{titleCase(f.name)} {shiftLabel(f)}</span>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
