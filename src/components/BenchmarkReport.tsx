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

function ColumnHeader() {
  return (
    <div className="flex gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
      <span className="w-36 shrink-0" />
      <span className="flex-1 text-center text-blue-500 dark:text-blue-400">Formula</span>
      <span className="flex-1 text-center text-amber-500 dark:text-amber-400">Round-Robin</span>
    </div>
  );
}

function PresetSection({ title, description, finding, leadRate }: { title: string; description: string; finding: string; leadRate: string }) {
  return (
    <details className="border border-slate-300 dark:border-white/10 rounded-lg overflow-hidden">
      <summary className="px-3 py-2 font-medium text-gray-700 dark:text-gray-200 cursor-pointer min-h-[40px] flex items-center justify-center gap-2 bg-slate-100 dark:bg-white/5 text-sm">
        <span className="chevron-icon text-gray-400 text-xs">▶</span>
        {title} — <span className="text-blue-500 dark:text-blue-400">{leadRate}</span>
      </summary>
      <div className="px-3 pb-3 pt-2 text-sm text-slate-600 dark:text-slate-300 space-y-2 text-center">
        <p className="text-slate-500 dark:text-slate-400">{description}</p>
        <p>{finding}</p>
      </div>
    </details>
  );
}

export default function BenchmarkReport({ onBack }: Props) {
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
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Formula vs Round-Robin</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Proven in simulation — before any real patient data</p>
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-5">
            <div className="text-4xl font-bold text-blue-600 dark:text-blue-300">81%</div>
            <div className="text-sm text-blue-500 dark:text-blue-200 mt-1">of 1,000 simulated shifts: the formula led round-robin on the metrics that matter — safety and capacity-conscious workload equity</div>
            <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400 text-center">
              <div>Round-robin led just 7% of shifts. The rest were even.</div>
              <div>Fewer teams pushed past the red zone, and the burden of sick patients</div>
              <div>matched to each team's actual strength — safer patient care.</div>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Every patient in this benchmark is synthetic. We ran 1,000 paired 8-hour ER shifts — 200 seeded runs across 5 staffing presets — and both assignment methods saw the exact same patients in the exact same order. No real schedules, no real encounters: this is the proof the formula carried before a single NYU record was ever shared. Each metric below stands on its own — there is no combined score.
          </p>
        </div>

        {/* Safety */}
        <Section title="Safety" defaultOpen>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            The safety question is simple: how often does a patient land on a team that is already drowning, and how close does any team get to that point?
          </p>
          <ColumnHeader />
          <div className="space-y-2">
            <StatRow label="Red-Zone Arrivals" subtitle="patients landing on a team below the red-zone boundary, per shift" formula="0.7" roundRobin="1.3" winner="formula" />
            <StatRow label="Min Capacity" subtitle="lowest capacity ratio any team hit — higher = more cushion" formula="17.6" roundRobin="13.0" winner="formula" />
          </div>
          <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300 text-left mt-2">
            <li>
              <strong>Red-zone arrivals cut in half (−51%).</strong> When the two methods differed, the formula was the safer one in 372 of 391 shifts.
              <br /><span className="text-xs text-slate-400 dark:text-slate-500">p &lt; 0.001, Cohen's d = 0.56</span>
            </li>
            <li>
              <strong>+35% more cushion above the red zone.</strong> The formula kept a higher worst-moment capacity in 87% of shifts (872 of 1,000) — because it routes each patient toward the team with the most room, the system's weakest point never gets as weak.
              <br /><span className="text-xs text-slate-400 dark:text-slate-500">p &lt; 0.001, Cohen's d = 0.77</span>
            </li>
          </ul>
        </Section>

        {/* Capacity-conscious workload equity */}
        <Section title="Capacity-Conscious Workload Equity" defaultOpen>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Equity isn't equal headcounts — an intern-led team and a senior-stacked team should not carry the same load. Equity is <strong>equal burden relative to strength</strong>. These rows show the gap between the most- and least-burdened team, where burden = workload ÷ team strength (per 100 strength points).
          </p>
          <ColumnHeader />
          <div className="space-y-2">
            <StatRow label="Acuity Burden Gap" subtitle="sickness load per strength: gap between heaviest & lightest team" formula="9.9" roundRobin="20.0" winner="formula" />
            <StatRow label="Patient Burden Gap" subtitle="patient count per strength: gap between heaviest & lightest team" formula="5.3" roundRobin="7.5" winner="formula" />
          </div>
          <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300 text-left mt-2">
            <li>
              <strong>The acuity burden gap is halved (−50%).</strong> Under round-robin, the team carrying the most sickness per unit of strength carries twice the relative load of the lightest team. The formula closes that gap in 74% of shifts (743 of 1,000).
              <br /><span className="text-xs text-slate-400 dark:text-slate-500">p &lt; 0.001, Cohen's d = 0.81</span>
            </li>
            <li>
              <strong>Patient burden gap −29%.</strong> Even by raw patient count relative to strength, the formula distributes more evenly (better in 55% of shifts vs 21% for round-robin).
              <br /><span className="text-xs text-slate-400 dark:text-slate-500">p &lt; 0.001, Cohen's d = 0.53</span>
            </li>
          </ul>
        </Section>

        {/* The honest tradeoff */}
        <Section title="Where Round-Robin Looks Better — By Design" defaultOpen={false}>
          <ColumnHeader />
          <div className="space-y-2">
            <StatRow label="Raw Count Spread" subtitle="max − min patients per team, ignoring team strength" formula="2.6" roundRobin="0.7" winner="rr" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 text-left">
            Round-robin "wins" exactly one thing: dealing out equal <em>numbers</em> of patients. That is its entire algorithm — and it's the problem this app exists to fix. The formula deliberately gives a stronger team more patients, so raw counts spread apart while actual burden evens out. Equal bodies is not fairness; equal burden is.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300 text-left">
            Back-to-back high-acuity arrivals and 1-hour clusters ("slams") were effectively tied in these synthetic shifts — the difference was under a third of one event per 8-hour shift, and under the high-acuity preset slams actually favored the formula. When the formula does send consecutive patients to the same team, it's because that team has the most headroom to absorb them — round-robin spaces arrivals evenly regardless of who can actually take them.
          </p>
        </Section>

        {/* Preset Breakdown */}
        <Section title="Preset Breakdown" defaultOpen={false}>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Per preset: share of 200 shifts where the formula led on the four primary metrics (red-zone arrivals, min capacity, both burden gaps).
          </p>
          <div className="space-y-2">
            <PresetSection
              title="High Acuity Day"
              description="Sick patients keep rolling in — lots of reds and yellows, no letup."
              finding="The formula's best case is the day that matters most: red-zone arrivals 2.4 vs 3.9 per shift, min capacity +43% (d = 1.52), and the acuity burden gap shrank from 30 to 11. Round-robin led 4 shifts out of 200."
              leadRate="leads 98% of shifts"
            />
            <PresetSection
              title="Sporadic Staffing"
              description="People come and go all shift — one team runs short-handed for a stretch."
              finding="Red-zone arrivals cut 76% (0.3 vs 1.2 per shift). When team strengths are unequal, rotation blindly feeds the weak team; the formula shields it."
              leadRate="leads 91% of shifts"
            />
            <PresetSection
              title="Mid-Shift Chaos"
              description="Half your providers are in procedures or signing out — everyone else picks up the slack."
              finding="With margins thin, the worst moment is what counts: min capacity 14.1 vs 9.9 (d = 1.23), and red-zone arrivals cut by nearly two-thirds (0.4 vs 1.0 per shift)."
              leadRate="leads 89% of shifts"
            />
            <PresetSection
              title="Typical Day"
              description="Your standard Tuesday — full teams, normal flow, no surprises."
              finding="Red-zone arrivals are rare for both methods on a calm day, but the formula still nearly halves the acuity burden gap (7.8 vs 14.4) and keeps 46% more cushion at the worst moment."
              leadRate="leads 83% of shifts"
            />
            <PresetSection
              title="Night Shift"
              description="Two teams, bare-bones staff, trickle of patients after midnight."
              finding="Essentially a wash — 44% of shifts ended dead even. With two near-identical teams and few patients, there's little for capacity-aware routing to exploit. This is expected: the formula adds value when teams genuinely differ."
              leadRate="leads 45% of shifts"
            />
          </div>
        </Section>

        {/* Methodology */}
        <Section title="Methodology" defaultOpen={false}>
          <ul className="list-none ml-0 space-y-2 text-slate-500 dark:text-slate-400 text-left">
            <li><strong className="text-slate-600 dark:text-slate-300">Zero real patient data:</strong> Arrivals, acuities, and timings are generated by a seeded simulation. This head-to-head was settled before any NYU schedules or encounter data existed in the project; the real data later calibrated parameters and confirmed the same result (see the methods paper).</li>
            <li><strong className="text-slate-600 dark:text-slate-300">Paired comparison:</strong> 200 seeded runs per preset, 5 presets. Each seed generates one patient timeline; formula and round-robin both face it — same patients, same order, same provider statuses. Differences are tested with paired t-tests.</li>
            <li><strong className="text-slate-600 dark:text-slate-300">No composite score:</strong> Metrics are reported individually. A single weighted score would hide the tradeoff it is supposed to reveal — round-robin's equal counts would partially offset the formula's safety gains, which is exactly the error in thinking this app corrects.</li>
            <li><strong className="text-slate-600 dark:text-slate-300">Burden gaps:</strong> "Burden" = workload ÷ steady-state team strength (Delphi-weighted provider sum). The gap is max − min across eligible teams, scaled per 100 strength points. Acuity burden weights patients 4:2:1 (red:yellow:purple).</li>
            <li><strong className="text-slate-600 dark:text-slate-300">Reproducible:</strong> <code className="text-xs">npx tsx scripts/benchmark.ts</code> regenerates every number on this page from the same seeds.</li>
          </ul>
        </Section>

      </div>
    </div>
  );
}
