interface Props {
  onBack: () => void;
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="border border-slate-300 dark:border-white/10 rounded-xl overflow-hidden" open={defaultOpen}>
      <summary className="px-4 py-3 font-semibold text-gray-800 dark:text-gray-100 cursor-pointer min-h-[44px] flex items-center justify-center gap-2 bg-slate-100 dark:bg-white/5">
        <span className="chevron-icon text-gray-400 text-xs">▶</span>
        {title}
      </summary>
      <div className="px-4 pb-4 pt-3 text-sm text-slate-600 dark:text-slate-300 space-y-3 text-center">
        {children}
      </div>
    </details>
  );
}

function StatRow({ label, subtitle, formula, roundRobin, winner }: { label: string; subtitle?: string; formula: string; roundRobin: string; winner?: 'formula' | 'rr' | 'tie' }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500 dark:text-slate-400 w-36 shrink-0">
        {label}
        {subtitle && <span className="block text-[10px] text-slate-500 leading-tight mt-0.5">{subtitle}</span>}
      </span>
      <span className={`flex-1 text-center rounded-lg px-2 py-1 font-medium ${winner === 'formula' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/30' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'}`}>{formula}</span>
      <span className={`flex-1 text-center rounded-lg px-2 py-1 font-medium ${winner === 'rr' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/30' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'}`}>{roundRobin}</span>
    </div>
  );
}

export default function RealScheduleBenchmarkReport({ onBack }: Props) {
  return (
    <div className="dashboard-bg overflow-y-auto p-6">
      <div className="max-w-lg mx-auto space-y-5 pb-12">

        {/* Back button */}
        <button
          onClick={onBack}
          className="min-h-[44px] bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 rounded-xl px-4 py-2 font-semibold text-sm active:bg-slate-300 dark:active:bg-white/20 border border-slate-300 dark:border-white/10"
        >
          ← Back
        </button>

        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Your Schedule. Real Providers. 1,000 Shifts.</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Real Schedule Benchmark — Week of 1/26</p>
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-5">
            <div className="text-4xl font-bold text-blue-600 dark:text-blue-300">72%</div>
            <div className="text-sm text-blue-500 dark:text-blue-200 mt-1">of shifts won by formula using the Week of 1/26 schedule</div>
            <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400 text-center">
              <div>7 real days, 4 shift windows, 1,000 simulated shifts.</div>
              <div>Providers rotating in and out mid-shift, just like a real day.</div>
            </div>
          </div>
        </div>

        {/* What We Tested */}
        <Section title="What We Tested" defaultOpen>
          <p>We took the Week of 1/26 schedule xlsx and simulated 1,000 shifts: each run randomly picks a day and one of four 8-hour windows, then generates a realistic patient stream. Both formula and round-robin see the exact same patients in the exact same order.</p>
          <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-3 mt-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Simulation Mechanics</div>
            <ul className="text-xs text-slate-500 dark:text-slate-400 text-left space-y-1 list-none ml-0">
              <li><strong className="text-slate-600 dark:text-slate-300">Dynamic rosters:</strong> Providers appear and disappear hour-by-hour based on their actual scheduled times — the roster changes mid-simulation.</li>
              <li><strong className="text-slate-600 dark:text-slate-300">Status disruptions:</strong> Random procedure calls, sign-outs, and off-floor events reduce provider capacity unpredictably during each shift.</li>
              <li><strong className="text-slate-600 dark:text-slate-300">Time-of-day arrivals:</strong> Patient rates follow real ER patterns — peak at 10 AM, quiet at 3 AM — not uniform random.</li>
              <li><strong className="text-slate-600 dark:text-slate-300">Seeded PRNG:</strong> Same seed = same patients = perfectly fair paired comparison.</li>
            </ul>
          </div>
          <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-3 mt-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Shift Windows</div>
            <div className="flex gap-1 justify-center">
              {['7A–3P', '9A–5P', '3P–11P', '5P–1A'].map(w => (
                <span key={w} className="bg-blue-500/10 text-blue-600 dark:text-blue-300 text-xs px-2 py-1 rounded-md font-medium">{w}</span>
              ))}
            </div>
          </div>
        </Section>

        {/* The Results */}
        <Section title="The Results" defaultOpen>
          <div className="flex gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            <span className="w-36 shrink-0" />
            <span className="flex-1 text-center text-blue-500 dark:text-blue-400">Formula</span>
            <span className="flex-1 text-center text-amber-500 dark:text-amber-400">Round-Robin</span>
          </div>
          <div className="space-y-2">
            <StatRow label="Rolling Fairness" subtitle="measured at every patient arrival" formula="86.2" roundRobin="83.9" winner="formula" />
            <StatRow label="Avg Capacity Ratio" subtitle="higher = more headroom" formula="27.1" roundRobin="26.2" winner="formula" />
            <StatRow label="Min Capacity Ratio" subtitle="worst moment of the shift" formula="5.6" roundRobin="4.6" winner="formula" />
            <StatRow label="Red-Zone Events" subtitle="ratio < 8.5 (p5), fewer = safer" formula="0.8" roundRobin="1.1" winner="formula" />
          </div>
          <div className="mt-4 bg-slate-100 dark:bg-white/5 rounded-lg p-3 text-center">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">Win / Loss / Tie</div>
            <div className="flex items-center justify-center gap-3 text-lg font-bold">
              <span className="text-blue-600 dark:text-blue-300">720</span>
              <span className="text-slate-500">/</span>
              <span className="text-amber-600 dark:text-amber-300">274</span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-500 dark:text-slate-400">6</span>
            </div>
          </div>
        </Section>

        {/* Why This Beats the Synthetic Benchmark */}
        <Section title="Why This Beats the Synthetic Benchmark">
          <p>The original synthetic benchmark used 200 runs with 6 hardcoded team presets and static rosters — every provider stayed the entire shift. It proved the formula works in theory.</p>
          <p>This benchmark uses real xlsx schedules where providers appear and disappear based on actual shift times. Round-robin can't notice when a team loses its attending mid-shift. The formula recalculates every time.</p>
          <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-3 mt-2">
            <div className="flex gap-4 text-xs">
              <div className="flex-1">
                <div className="font-medium text-slate-500 dark:text-slate-400 mb-1">Synthetic</div>
                <ul className="text-slate-500 dark:text-slate-400 text-left space-y-0.5 list-none ml-0">
                  <li>200 runs</li>
                  <li>6 hardcoded presets</li>
                  <li>Static rosters</li>
                  <li>No provider changes</li>
                </ul>
              </div>
              <div className="flex-1">
                <div className="font-medium text-blue-500 dark:text-blue-400 mb-1">Real Schedule</div>
                <ul className="text-slate-500 dark:text-slate-400 text-left space-y-0.5 list-none ml-0">
                  <li>1,000 runs</li>
                  <li>7 real days × 4 windows</li>
                  <li>Dynamic rosters</li>
                  <li>Mid-shift transitions</li>
                </ul>
              </div>
            </div>
          </div>
        </Section>

        {/* When Staffing Is Uneven */}
        <Section title="When Staffing Is Uneven">
          <p>The formula's advantage scales with staffing imbalance. When teams are equally staffed, both methods perform similarly — that's expected.</p>
          <div className="space-y-2 mt-2">
            <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-3">
              <div className="font-medium text-slate-900 dark:text-white text-sm">Morning Shifts — 80% win rate</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">7A–3P has the strongest formula advantage. Day-shift teams often have uneven compositions (attending + senior resident vs solo junior), and the formula exploits this mismatch every time.</p>
            </div>
            <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-3">
              <div className="font-medium text-slate-900 dark:text-white text-sm">Transition Windows — 67–72% win rate</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Providers signing out mid-shift create temporary imbalances. Round-robin keeps rotating obliviously — the formula notices the capacity drop and steers patients to the team that still has bandwidth.</p>
            </div>
            <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-3">
              <div className="font-medium text-slate-900 dark:text-white text-sm">Balanced Days (the control)</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">When teams are equally staffed all shift, both methods perform similarly. The formula adds value when there are meaningful differences to exploit.</p>
            </div>
          </div>
        </Section>

        {/* Methodology */}
        <Section title="Methodology">
          <ul className="list-none ml-0 space-y-2 text-slate-500 dark:text-slate-400">
            <li><strong className="text-slate-600 dark:text-slate-300">Source:</strong> Week of 1/26 schedule — 7 days with real provider assignments, shift times, and team compositions.</li>
            <li><strong className="text-slate-600 dark:text-slate-300">1,000 runs:</strong> Each run randomly selects a day and shift window, then generates a full 8-hour patient stream. Both formula and round-robin see identical inputs.</li>
            <li><strong className="text-slate-600 dark:text-slate-300">Dynamic rosters:</strong> Providers appear and disappear during the 8-hour window based on their scheduled hours — not a static snapshot.</li>
            <li><strong className="text-slate-600 dark:text-slate-300">Empirically calibrated scale:</strong> Capacity terms (Comfortable, Manageable, Busy, etc.) are calibrated from the percentile distribution of 23,193 ratio observations across all 12 schedule files.</li>
            <li><strong className="text-slate-600 dark:text-slate-300">Statistical testing:</strong> Paired t-test for significance, Cohen's d for effect size. All metrics significant at p &lt; 0.001.</li>
            <li><strong className="text-slate-600 dark:text-slate-300">Rolling fairness:</strong> Fairness is measured at every patient arrival, not just at the end of the shift — so mid-shift imbalances count.</li>
          </ul>
        </Section>

      </div>
    </div>
  );
}
