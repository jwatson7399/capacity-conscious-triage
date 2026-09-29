// © 2026 New York University. All rights reserved.
// Decorative art for the home screen (Roundtable 2026-09-28, Decision 28): the CCT gauge mark and
// the faint "capacity skyline" behind the title. Both are aria-hidden and carry no data.
import type { CSSProperties } from 'react';

/** CCT with a small capacity column above each letter, in the board's column shades. */
export function CctMark() {
  const cols: [string, number, string][] = [['C', 9, 'var(--c2)'], ['C', 17, 'var(--cnext)'], ['T', 6, 'var(--c3)']];
  return (
    <div className="cct-mark" aria-hidden="true">
      {cols.map(([ch, h, color], i) => (
        <div key={i} className="cct-mark-col">
          <span className="cct-mark-track"><span style={{ height: h, background: color }} /></span>
          <span className="cct-mark-letter">{ch}</span>
        </div>
      ))}
    </div>
  );
}

// Fourteen towers across 720 x 250. Levels are the top of each fill; dur, delay and hi drive the
// loop (a slow rise, like load decaying, then a quick drop, like an assignment).
const W = 720, H = 250, TOP = 10, BASE = 246;
const TOWERS = [
  { top: 155.9, dur: 13.5, delay: 0.3, hi: 1.35 },
  { top: 106.7, dur: 10.9, delay: 2.4, hi: 1.35 },
  { top: 134.7, dur: 14.2, delay: 9.6, hi: 1.35 },
  { top: 97.2, dur: 15.2, delay: 1.3, hi: 1.35 },
  { top: 93.7, dur: 12.0, delay: 0.4, hi: 1.35 },
  { top: 183.6, dur: 10.5, delay: 5.3, hi: 1.35 },
  { top: 192.0, dur: 9.2, delay: 1.8, hi: 1.35 },
  { top: 59.7, dur: 13.5, delay: 7.4, hi: 1.22 },
  { top: 152.5, dur: 10.5, delay: 6.2, hi: 1.35 },
  { top: 156.5, dur: 14.7, delay: 0.1, hi: 1.35 },
  { top: 34.3, dur: 14.6, delay: 10.2, hi: 1.07 },
  { top: 118.6, dur: 11.4, delay: 1.8, hi: 1.35 },
  { top: 59.8, dur: 15.7, delay: 5.3, hi: 1.22 },
  { top: 117.6, dur: 9.6, delay: 0.9, hi: 1.35 },
];
const SCALE = [0, 0.2, 0.345, 0.47, 0.59, 0.765, 1];
const PITCH = W / TOWERS.length, TW = PITCH * 0.62;

/** Faint animated skyline of capacity columns. Ink follows the theme through currentColor. */
export function CapacitySkyline() {
  return (
    <svg className="skyline" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <defs>
        <linearGradient id="skyFadeY" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="skyFadeX" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.18" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.82" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="skyMaskY"><rect width={W} height={H} fill="url(#skyFadeY)" /></mask>
        <mask id="skyMaskX"><rect width={W} height={H} fill="url(#skyFadeX)" /></mask>
      </defs>
      <g mask="url(#skyMaskX)"><g mask="url(#skyMaskY)">
        {SCALE.map(f => {
          const y = TOP + (BASE - TOP) * f;
          return <line key={f} x1={0} y1={y} x2={W} y2={y} stroke="currentColor" strokeOpacity={0.07} />;
        })}
        {TOWERS.map((t, i) => {
          const x = i * PITCH + (PITCH - TW) / 2;
          const style = { animationDuration: `${t.dur}s`, animationDelay: `-${t.delay}s`, '--hi': t.hi } as CSSProperties;
          return (
            <g key={i}>
              <rect x={x} y={TOP} width={TW} height={BASE - TOP} rx={3} fill="none" stroke="currentColor" strokeOpacity={0.13} />
              <g className="skyline-fill" style={style}>
                <rect x={x + 1} y={t.top} width={TW - 2} height={BASE - t.top - 1} rx={2} fill="currentColor" fillOpacity={0.08} />
                <line x1={x + 1} y1={t.top} x2={x + TW - 1} y2={t.top} stroke="currentColor" strokeOpacity={0.15} vectorEffect="non-scaling-stroke" />
              </g>
            </g>
          );
        })}
      </g></g>
    </svg>
  );
}
