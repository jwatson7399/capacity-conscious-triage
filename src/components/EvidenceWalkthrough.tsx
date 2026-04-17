import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import MethodologyDeepDive from './MethodologyDeepDive';

/* ─── InfoTip ─────────────────────────────────────────────────────────── */

function InfoTip({ term, label, children }: { term: string; label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center gap-1 text-blue-500 dark:text-blue-400 rounded-full hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors px-1.5 py-0.5 align-middle min-h-[32px]"
        aria-label={`Info: ${term}`}
      >
        <span className="text-xs leading-none shrink-0">ℹ️</span>
        {label && <span className="text-xs">{label}</span>}
      </button>
      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setOpen(false)}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-t-2xl p-5 max-w-lg w-full shadow-xl border-t border-slate-200 dark:border-white/10 animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto mb-4" />
            <div className="font-semibold text-slate-900 dark:text-white mb-2 text-base">{term}</div>
            <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{children}</div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/* ─── Shared visual helpers ───────────────────────────────────────────── */

function HeroNumber({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`font-bold tracking-tight ${className}`} style={{ fontSize: 'clamp(2.8rem, 10vw, 5rem)' }}>
      {children}
    </div>
  );
}

function ProviderSilhouette({ label, color, highlighted }: { label: string; color: string; highlighted?: boolean }) {
  return (
    <div className={`flex flex-col items-center ${highlighted ? 'animate-fadeScaleIn' : ''}`}>
      <svg width="24" height="28" viewBox="0 0 24 28" fill="none" className={color}>
        <circle cx="12" cy="7" r="5" fill="currentColor" />
        <path d="M2 26c0-5.523 4.477-10 10-10s10 4.477 10 10" fill="currentColor" />
      </svg>
      <span className={`text-[8px] font-bold mt-0.5 ${color}`}>{label}</span>
    </div>
  );
}

function PatientSilhouette() {
  return (
    <div className="flex flex-col items-center">
      <svg width="20" height="24" viewBox="0 0 24 28" fill="none" className="text-purple-400 dark:text-purple-400/70">
        <circle cx="12" cy="7" r="5" fill="currentColor" />
        <path d="M2 26c0-5.523 4.477-10 10-10s10 4.477 10 10" fill="currentColor" />
      </svg>
      <span className="text-[8px] text-purple-400 dark:text-purple-400/70 font-medium">ESI-3</span>
    </div>
  );
}

function ComparisonBar({ label, value, maxValue, color, unit, isActive = true }: { label: string; value: number; maxValue: number; color: string; unit?: string; isActive?: boolean }) {
  const pct = Math.round((value / maxValue) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs sm:text-sm w-16 text-right text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-200 dark:bg-white/10 rounded-full h-8 sm:h-10 overflow-hidden relative">
        <div className={`${color} h-full rounded-full transition-all duration-700 ease-out`} style={{ width: isActive ? `${pct}%` : '0%' }} />
        <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`}>
          {value} {unit && <span className="font-normal text-slate-800 dark:text-slate-200">{unit}</span>}
        </span>
      </div>
    </div>
  );
}

/* ─── Card 1: The Study ───────────────────────────────────────────────── */

function CardStudy({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <p className="text-xs sm:text-sm uppercase tracking-widest text-slate-600 dark:text-slate-400 mb-4 font-semibold">The Study</p>
      <div className={isActive ? 'animate-fadeScaleIn' : 'opacity-0'}><HeroNumber className="text-slate-900 dark:text-white">1,541</HeroNumber></div>
      <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 mt-2">real patient encounters</p>
      <div className={`mt-6 glass-card rounded-xl px-5 py-3 ${isActive ? 'animate-fadeSlideUp' : 'opacity-0'}`}>
        <p className="text-sm text-slate-500 dark:text-slate-400">Dec 2025 – Mar 2026 · 121 days</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">Teams 1, 2, and 3 · A-side only</p>
      </div>
      <p className="mt-8 text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xs leading-relaxed">
        We replayed every A-side patient assignment using your actual schedules, real arrival times, real ESI acuity levels. What actually happened vs what our formula would have done, both methods compared side by side.
      </p>
    </div>
  );
}

/* ─── Card 2: The Current Process ─────────────────────────────────────── */

function CardCurrentProcess({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <p className="text-xs sm:text-sm uppercase tracking-widest text-slate-600 dark:text-slate-400 mb-4 font-semibold">The Current Process</p>
      <div className={isActive ? 'animate-fadeScaleIn' : 'opacity-0'}><HeroNumber className="text-amber-500">31.7%</HeroNumber></div>
      <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 mt-2 max-w-xs">
        of the time, the current process assigned the new critical patient to the highest-capacity team
      </p>
      <div className="mt-5 glass-card rounded-xl px-5 py-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Random chance with 3 teams: <span className="font-bold text-slate-700 dark:text-slate-200">33.3%</span>
        </p>
      </div>
      <p className="mt-6 text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-xs leading-relaxed">
        The current process shows zero capacity awareness. It performs no better than drawing a team name out of a hat.
      </p>
      <div className="mt-4 flex justify-center">
        <InfoTip term="Capacity Ratio" label="Capacity Ratio">
          A team's total provider strength divided by their current patient load. Higher = more bandwidth to take a new patient.
        </InfoTip>
      </div>
    </div>
  );
}

/* ─── Card 3: Road Map ───────────────────────────────────────────────── */

function CardRoadMap({ isActive }: { isActive: boolean }) {
  const metrics = [
    { tag: 'Slams', desc: '2+ patients to one team within 1 hour' },
    { tag: 'Back-to-Back High Acuity', desc: 'Two ESI 1–2 patients to one team within 30 min' },
    { tag: 'Patient Count Gap', desc: 'Busiest vs. lightest team, by patient count' },
    { tag: 'Severity Gap', desc: 'Busiest vs. lightest team, by acuity-weighted load' },
    { tag: 'Worst-Moment Floor', desc: 'How stretched the most overloaded team gets at peak strain' },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <p className="text-xs sm:text-sm uppercase tracking-widest text-slate-600 dark:text-slate-400 mb-2 font-semibold">What We Measured</p>
      <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xs leading-relaxed">
        Five metrics, each compared head-to-head across all 121 days:
      </p>
      <div className={`space-y-2 max-w-xs w-full ${isActive ? 'animate-fadeSlideUp' : 'opacity-0'}`}>
        {metrics.map((m) => (
          <div key={m.tag} className="rounded-xl border border-slate-200 dark:border-white/10 bg-white/40 dark:bg-white/5 px-4 py-2.5 text-left">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{m.tag}</p>
            <p className="text-xs mt-0.5 text-slate-500 dark:text-slate-400">{m.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Card 4: Slams ───────────────────────────────────────────────────── */

function CardSlams({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <p className="text-xs sm:text-sm uppercase tracking-widest text-slate-600 dark:text-slate-400 mb-1 font-semibold">Slams</p>
      <p className="text-xs text-slate-600 dark:text-slate-400 mb-5">2+ patients to one team within 1 hour</p>

      <div className={`flex items-center gap-4 sm:gap-8 ${isActive ? 'animate-fadeScaleIn' : 'opacity-0'}`}>
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400 mb-1">Current</p>
          <div className="text-4xl sm:text-5xl font-bold text-amber-500">2.2</div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">/day</p>
        </div>
        <div className="text-2xl text-slate-300 dark:text-slate-600">→</div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400 mb-1">Formula</p>
          <div className="text-4xl sm:text-5xl font-bold text-blue-500">1.2</div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">/day</p>
        </div>
      </div>

      <div className={`mt-5 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl px-5 py-3 ${isActive ? 'animate-fadeSlideUp' : 'opacity-0'}`}>
        <p className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-300">↓ 45% reduction</p>
        <p className="text-sm text-blue-500 dark:text-blue-400 mt-1">128 fewer slams over 4 months</p>
      </div>

    </div>
  );
}

/* ─── Card 4: Danger Stacking ─────────────────────────────────────────── */

function CardDangerStacking({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="text-2xl mb-1">⚠️</div>
      <p className="text-xs sm:text-sm uppercase tracking-widest text-red-400 dark:text-red-400 mb-1 font-semibold">Back-to-Back High Acuity</p>
      <p className="text-xs text-slate-600 dark:text-slate-400 mb-5">Two ESI 1-2 patients to one team within 30 min</p>

      <div className={`flex items-center gap-4 sm:gap-8 ${isActive ? 'animate-fadeScaleIn' : 'opacity-0'}`}>
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400 mb-1">Current</p>
          <div className="text-4xl sm:text-5xl font-bold text-amber-500">0.7</div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">/day</p>
        </div>
        <div className="text-2xl text-slate-300 dark:text-slate-600">→</div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400 mb-1">Formula</p>
          <div className="text-4xl sm:text-5xl font-bold text-blue-500">0.1</div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">/day</p>
        </div>
      </div>

      <div className={`mt-5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-5 py-3 ${isActive ? 'animate-fadeSlideUp' : 'opacity-0'}`}>
        <p className="text-lg sm:text-xl font-bold text-red-600 dark:text-red-300">↓ 85% reduction</p>
        <p className="text-sm text-red-500 dark:text-red-400 mt-1">66 fewer over 4 months</p>
      </div>

    </div>
  );
}

/* ─── Card 5: Capacity Balance ───────────────────────────────────────── */

function CardCapacityBalance({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <p className="text-xs sm:text-sm uppercase tracking-widest text-slate-600 dark:text-slate-400 mb-2 font-semibold">Patient Count Gap</p>
      <p className="text-xs text-slate-600 dark:text-slate-400 mb-6">Busiest team vs. lightest team per day</p>

      <div className="w-full max-w-xs">
        <ComparisonBar label="Current" value={2.5} maxValue={2.5} color="bg-amber-500" unit="patients" isActive={isActive} />
        <div className="h-3" />
        <ComparisonBar label="Formula" value={1.2} maxValue={2.5} color="bg-blue-500" unit="patients" isActive={isActive} />
      </div>

      <div className={`mt-6 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl px-5 py-3 ${isActive ? 'animate-fadeSlideUp' : 'opacity-0'}`}>
        <p className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-300">↓ 52% smaller gap</p>
        <p className="text-sm text-blue-500 dark:text-blue-400 mt-1">2.5 → 1.2 patients apart per day</p>
      </div>

      <p className="mt-6 text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xs leading-relaxed">
        Each time a team receives a patient, its capacity ratio drops, making other teams more attractive for the next arrival. This self-correcting cycle spreads patients proportional to staffing strength. A strong team handles more, a light team gets breathing room, but no one team gets piled on while another sits empty.
      </p>

      <div className="mt-3 flex justify-center">
        <InfoTip term="Capacity Balance" label="Capacity Balance">
          Are teams getting patients proportional to their staffing strength? A strong team with an attending + senior resident should handle more than a team with one intern.
        </InfoTip>
      </div>
    </div>
  );
}

/* ─── Card 6: Acuity Balance ─────────────────────────────────────────── */

function CardAcuityBalance({ isActive }: { isActive: boolean }) {
  const currentVal = 5.0;
  const formulaVal = 2.4;
  const maxVal = 6;

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <p className="text-xs sm:text-sm uppercase tracking-widest text-slate-600 dark:text-slate-400 mb-2 font-semibold">Severity Gap</p>
      <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">Heaviest acuity load vs. lightest per day</p>

      <div className="flex items-end justify-center gap-8 sm:gap-12" style={{ height: 140 }}>
        <div className="flex flex-col items-center h-full justify-end">
          <span className={`text-sm sm:text-base font-bold text-amber-500 mb-1.5 transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`}>{currentVal}</span>
          <div className="w-14 sm:w-16 bg-slate-200 dark:bg-white/10 rounded-t-lg relative overflow-hidden" style={{ height: '100%' }}>
            <div
              className="absolute bottom-0 w-full bg-amber-500 rounded-t-lg transition-all duration-700 ease-out"
              style={{ height: isActive ? `${(currentVal / maxVal) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 mt-2">Current</span>
        </div>
        <div className="flex flex-col items-center h-full justify-end">
          <span className={`text-sm sm:text-base font-bold text-blue-500 mb-1.5 transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`}>{formulaVal}</span>
          <div className="w-14 sm:w-16 bg-slate-200 dark:bg-white/10 rounded-t-lg relative overflow-hidden" style={{ height: '100%' }}>
            <div
              className="absolute bottom-0 w-full bg-blue-500 rounded-t-lg transition-all duration-700 ease-out"
              style={{ height: isActive ? `${(formulaVal / maxVal) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 mt-2">Formula</span>
        </div>
      </div>

      <div className={`mt-5 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl px-5 py-3 ${isActive ? 'animate-fadeSlideUp' : 'opacity-0'}`}>
        <p className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-300">↓ 52% smaller gap</p>
        <p className="text-sm text-blue-500 dark:text-blue-400 mt-1">5.0 → 2.4 acuity points apart per day</p>
      </div>

      <p className="mt-4 text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xs leading-relaxed">
        This one was surprising. The formula doesn't consider severity until after a patient is already assigned. It routes entirely by which team has the most room. You might expect that to widen the severity gap. Instead, it shrank. When patients are spread evenly, severity follows. No team gets an unlucky run of the sickest cases.
      </p>

      <div className="mt-2 flex justify-center">
        <InfoTip term="Acuity Points" label="Acuity Points">
          Each patient's severity converted to a number using evidence-based weights: Red (ESI 1) = 4, Yellow (ESI 2) = 2, Purple (ESI 3+) = 1. Based on the POWER study (n=11,716) and five supporting studies.
        </InfoTip>
      </div>
    </div>
  );
}

/* ─── Card 6: Safety Floor ────────────────────────────────────────────── */

function CardSafetyFloor({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <p className="text-xs sm:text-sm uppercase tracking-widest text-slate-600 dark:text-slate-400 mb-2 font-semibold">Worst Moment of a Typical Day</p>
      <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">Average daily minimum capacity ratio at time of assignment</p>

      {/* Provider silhouette analogy with embedded bars */}
      <div className={`flex items-center justify-center gap-4 max-w-xs w-full ${isActive ? 'animate-fadeSlideUp' : 'opacity-0'}`}>
        {/* Current: PA + PGY-1 over patient */}
        <div className="flex-1 rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5 p-3">
          <p className="text-[10px] uppercase tracking-wider text-amber-500 dark:text-amber-400 text-center font-semibold mb-2">Current</p>
          <div className="flex justify-center gap-3 mb-1">
            <ProviderSilhouette label="PA" color="text-amber-500" />
            <ProviderSilhouette label="PGY-1" color="text-amber-500" />
          </div>
          <div className="h-0.5 bg-amber-300 dark:bg-amber-500/40 rounded-full mx-2 my-1.5" />
          <div className="flex justify-center">
            <PatientSilhouette />
          </div>
          <div className="mt-2 bg-slate-200 dark:bg-white/10 rounded-full h-4 overflow-hidden">
            <div className="bg-amber-500 h-full rounded-full transition-all duration-700 ease-out" style={{ width: isActive ? '40%' : '0%' }} />
          </div>
          <p className="text-[10px] font-bold text-amber-600 dark:text-amber-300 text-center mt-1">18 ratio</p>
        </div>

        <div className="text-lg text-slate-300 dark:text-slate-600 shrink-0">→</div>

        {/* Formula: PA + PGY-1 + PGY-3 over patient */}
        <div className="flex-1 rounded-xl border border-blue-300 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/5 p-3">
          <p className="text-[10px] uppercase tracking-wider text-blue-500 dark:text-blue-400 text-center font-semibold mb-2">Formula</p>
          <div className="flex justify-center gap-2 mb-1">
            <ProviderSilhouette label="PA" color="text-blue-500" />
            <ProviderSilhouette label="PGY-1" color="text-blue-500" />
            <ProviderSilhouette label="PGY-3" color="text-blue-500" highlighted />
          </div>
          <div className="h-0.5 bg-blue-300 dark:bg-blue-500/40 rounded-full mx-2 my-1.5" />
          <div className="flex justify-center">
            <PatientSilhouette />
          </div>
          <div className="mt-2 bg-slate-200 dark:bg-white/10 rounded-full h-4 overflow-hidden">
            <div className="bg-blue-500 h-full rounded-full transition-all duration-700 ease-out" style={{ width: isActive ? '71%' : '0%' }} />
          </div>
          <p className="text-[10px] font-bold text-blue-600 dark:text-blue-300 text-center mt-1">32 ratio</p>
        </div>
      </div>

      <div className={`mt-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl px-5 py-3 max-w-xs ${isActive ? 'animate-fadeSlideUp' : 'opacity-0'}`} style={{ animationDelay: '300ms' }}>
        <p className="text-xs text-blue-500 dark:text-blue-400">At peak strain, the worst-off team has</p>
        <p className="text-sm font-bold text-blue-600 dark:text-blue-300">2× the staffing support.</p>
      </div>

      <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xs leading-relaxed">
        Every day, there's a moment when one team is more stretched than any other. Under the current process, nothing redirects the next patient elsewhere, that team just keeps getting hit. The formula catches the dip by always routing to the team with the most room, raising the floor from 18 to 32.
      </p>

      <div className="mt-2 flex justify-center">
        <InfoTip term="Capacity Ratio" label="Capacity Ratio">
          A team's total provider strength divided by their current patient load. Higher = more bandwidth to take a new patient.
        </InfoTip>
      </div>
    </div>
  );
}

/* ─── Card: Win Rate ──────────────────────────────────────────────────── */

const DAY_DATA = [
  { day: 'Mon', pct: 67 },
  { day: 'Tue', pct: 76 },
  { day: 'Wed', pct: 82 },
  { day: 'Thu', pct: 76 },
  { day: 'Fri', pct: 88 },
  { day: 'Sat', pct: 65 },
  { day: 'Sun', pct: 89 },
] as const;

function CardWinRate({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className={isActive ? 'animate-fadeScaleIn' : 'opacity-0'}><HeroNumber className="text-emerald-500">7 / 7</HeroNumber></div>
      <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 mt-2 max-w-xs">
        Every day of the week, the formula won on the majority of the metrics shown above
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">77.7% overall (94 of 121 days)</p>

      <p className="mt-5 mb-2 text-[10px] sm:text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 font-medium">Win rate per weekday</p>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 w-full max-w-xs">
        {DAY_DATA.map((d) => (
          <div key={d.day} className="flex flex-col items-center">
            <span className="text-[9px] sm:text-[10px] text-slate-600 dark:text-slate-400 mb-1">{d.day}</span>
            <div className="w-full bg-slate-200 dark:bg-white/10 rounded-sm overflow-hidden" style={{ height: 48 }}>
              <div
                className="w-full bg-emerald-500 rounded-sm mt-auto"
                style={{ height: `${d.pct}%`, marginTop: `${100 - d.pct}%` }}
              />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-600 dark:text-slate-300 mt-1">{d.pct}%</span>
            <span className="text-emerald-500 text-xs">✓</span>
          </div>
        ))}
      </div>

      <div className="mt-3 inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-full px-3 py-1">
        <span className="text-[10px] sm:text-xs font-semibold text-emerald-600 dark:text-emerald-300">All 7 days statistically significant</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <InfoTip term="Statistically Significant" label="Statistical Significance">
          The improvement is unlikely to be due to chance. Every day of the week individually reached p &lt; 0.05, the standard threshold in medical research.
        </InfoTip>
        <InfoTip term="Cohen's d = 0.84" label="Effect Size">
          A measure of how large the effect is. 0.2 = small, 0.5 = medium, 0.8 = large. Ours is 0.84, a large effect. It means if you picked a random day from each method, the formula's day would be better about 79% of the time.
        </InfoTip>
      </div>
    </div>
  );
}

/* ─── Card 9: What Changes ────────────────────────────────────────────── */

function CardWhatChanges({ isActive }: { isActive: boolean }) {
  const changedPct = 66.4;
  const samePct = 33.6;
  // SVG donut
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const changedDash = (changedPct / 100) * circumference;
  const sameDash = (samePct / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <p className="text-xs sm:text-sm uppercase tracking-widest text-slate-600 dark:text-slate-400 mb-4 font-semibold">What Changes</p>

      <div className={isActive ? 'animate-fadeScaleIn' : 'opacity-0'}><HeroNumber className="text-blue-500">66.4%</HeroNumber></div>
      <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 mt-1">of assignments would change</p>

      <div className="mt-5 relative w-36 h-36 sm:w-44 sm:h-44">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="16"
            className="text-slate-200 dark:text-white/10" />
          <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="16"
            className="text-blue-500"
            stroke="currentColor"
            strokeDasharray={`${changedDash} ${circumference}`}
            strokeLinecap="round" />
          <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="16"
            className="text-slate-600 dark:text-slate-400"
            stroke="currentColor"
            strokeDasharray={`${sameDash} ${circumference}`}
            strokeDashoffset={`${-changedDash}`}
            strokeLinecap="round" />
        </svg>
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs sm:text-sm">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-slate-600 dark:text-slate-300">Changed (66.4%)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-slate-400 dark:bg-slate-500" />
          <span className="text-slate-600 dark:text-slate-300">Same (33.6%)</span>
        </span>
      </div>

      <p className="mt-5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xs leading-relaxed">
        The current process is statistically indistinguishable from random. When you go from zero capacity awareness to full, most assignments change.
      </p>
    </div>
  );
}

/* ─── Card 10: Summary ────────────────────────────────────────────────── */

const SUMMARY_ITEMS = [
  '128 fewer slams',
  '66 fewer high-acuity pileups',
  'Patient gap halved (2.5 → 1.2)',
  'Severity gap halved (5.0 → 2.4)',
  'Safety margin nearly doubled (18 → 32)',
  'Won 7/7 days of the week (77.7% of all shifts)',
] as const;

function CardSummary({ onBack, isActive, onMethodology }: { onBack: () => void; isActive: boolean; onMethodology: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <p className="text-sm sm:text-base font-semibold text-slate-500 dark:text-slate-400 mb-5">
        4 months. 1,541 encounters. Your data.
      </p>

      <div className={`space-y-2.5 text-left max-w-xs ${isActive ? 'animate-fadeSlideUp' : 'opacity-0'}`}>
        {SUMMARY_ITEMS.map((item) => (
          <div key={item} className="flex items-start gap-2.5">
            <span className="text-emerald-500 text-sm mt-0.5 shrink-0">✓</span>
            <span className="text-sm sm:text-base text-slate-700 dark:text-slate-200">{item}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onBack}
        className="mt-6 min-h-[48px] bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl px-8 py-3 font-semibold text-sm active:from-blue-700 active:to-indigo-700 transition-colors"
      >
        Back to App
      </button>
      <button
        onClick={onMethodology}
        className="mt-3 text-sm text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
      >
        How we ran the numbers &rarr;
      </button>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────── */

const TOTAL_CARDS = 11;

export default function EvidenceWalkthrough({ onBack }: { onBack: () => void }) {
  const [currentCard, setCurrentCard] = useState(0);
  const [showMethodology, setShowMethodology] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const next = useCallback(() => setCurrentCard((c) => Math.min(c + 1, TOTAL_CARDS - 1)), []);
  const prev = useCallback(() => setCurrentCard((c) => Math.max(c - 1, 0)), []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showMethodology) return;
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onBack, showMethodology]);

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    // Ignore vertical-dominant gestures
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (deltaX > 50) prev();
    else if (deltaX < -50) next();
  };

  if (showMethodology) {
    return <MethodologyDeepDive onBack={() => setShowMethodology(false)} />;
  }

  const cards = [
    (active: boolean) => <CardStudy key="study" isActive={active} />,
    (active: boolean) => <CardCurrentProcess key="current" isActive={active} />,
    (active: boolean) => <CardRoadMap key="roadmap" isActive={active} />,
    (active: boolean) => <CardSlams key="slams" isActive={active} />,
    (active: boolean) => <CardDangerStacking key="danger" isActive={active} />,
    (active: boolean) => <CardCapacityBalance key="capacity" isActive={active} />,
    (active: boolean) => <CardAcuityBalance key="acuity" isActive={active} />,
    (active: boolean) => <CardSafetyFloor key="safety" isActive={active} />,
    (active: boolean) => <CardWinRate key="winrate" isActive={active} />,
    (active: boolean) => <CardWhatChanges key="changes" isActive={active} />,
    (active: boolean) => <CardSummary key="summary" onBack={onBack} isActive={active} onMethodology={() => setShowMethodology(true)} />,
  ];

  return (
    <div className="dashboard-bg fixed inset-0 flex flex-col overflow-hidden" ref={containerRef}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button
          onClick={onBack}
          className="min-h-[44px] min-w-[44px] flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-white/10 active:bg-white/80 dark:active:bg-white/20 transition-colors"
        >
          ← Back
        </button>
        <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
          {currentCard + 1} / {TOTAL_CARDS}
        </span>
      </div>

      {/* Card viewport */}
      <div
        className="flex-1 overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${currentCard * 100}%)` }}
        >
          {cards.map((renderCard, i) => (
            <div key={i} className="min-w-full h-full">
              {renderCard(i === currentCard)}
            </div>
          ))}
        </div>

        {/* Arrow buttons */}
        {currentCard > 0 && (
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-white/70 dark:bg-white/10 text-slate-600 dark:text-slate-300 active:bg-white/90 dark:active:bg-white/20 transition-colors shadow-sm"
            aria-label="Previous card"
          >
            ‹
          </button>
        )}
        {currentCard < TOTAL_CARDS - 1 && (
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-white/70 dark:bg-white/10 text-slate-600 dark:text-slate-300 active:bg-white/90 dark:active:bg-white/20 transition-colors shadow-sm"
            aria-label="Next card"
          >
            ›
          </button>
        )}
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 py-4 shrink-0">
        {Array.from({ length: TOTAL_CARDS }, (_, i) => (
          <button
            key={i}
            onClick={() => setCurrentCard(i)}
            className={`rounded-full transition-all duration-200 ${
              i === currentCard
                ? 'w-6 h-2 bg-blue-500'
                : 'w-2 h-2 bg-slate-300 dark:bg-white/20'
            }`}
            aria-label={`Go to card ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
