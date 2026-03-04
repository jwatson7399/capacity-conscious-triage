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

function PresetSection({ title, description, finding, winRate }: { title: string; description: string; finding: string; winRate: string }) {
  return (
    <details className="border border-slate-300 dark:border-white/10 rounded-lg overflow-hidden">
      <summary className="px-3 py-2 font-medium text-gray-700 dark:text-gray-200 cursor-pointer min-h-[40px] flex items-center justify-center gap-2 bg-slate-100 dark:bg-white/5 text-sm">
        <span className="chevron-icon text-gray-400 text-xs">▶</span>
        {title} — <span className="text-blue-500 dark:text-blue-400">{winRate}</span>
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
          <p className="text-sm text-slate-500 dark:text-slate-400">1,000-Run Statistical Review</p>
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-5">
            <div className="text-4xl font-bold text-blue-600 dark:text-blue-300">75%</div>
            <div className="text-sm text-blue-500 dark:text-blue-200 mt-1">of simulated shifts won by formula</div>
            <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400 text-center">
              <div>3 out of every 4 shifts, your team gets a fairer, safer workload.</div>
              <div>That means less chaos, less burnout, fewer overwhelmed teams</div>
              <div>— safer patient care.</div>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            We ran 1,000 simulated 8-hour ER shifts — 200 seeded runs across 5 different staffing presets — and compared formula-driven triage against round-robin. Both methods saw the exact same patients in the exact same order. The formula produced fairer, safer distributions in 749 of 1,000 runs.
          </p>
        </div>

        {/* What is Fairness Score */}
        <Section title="What is the Fairness Score?" defaultOpen>
          <p className="text-center">Each shift is scored 0–100 across five weighted components:</p>
          <div className="space-y-2 mt-2 text-center">
            <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-3">
              <div className="font-medium text-slate-900 dark:text-white">Overwhelm Avoidance <span className="text-blue-500 dark:text-blue-400 text-xs ml-1">30%</span></div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">How often does any team's patient demand exceed its provider strength? Even one overwhelm event can compromise care. Fewer = higher score.</p>
            </div>
            <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-3">
              <div className="font-medium text-slate-900 dark:text-white">Balanced Workload <span className="text-blue-500 dark:text-blue-400 text-xs ml-1">25%</span></div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">A team with an attending + senior resident has more strength than one with a single junior. This measures whether patient volume matches each team's ability to handle it.</p>
            </div>
            <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-3">
              <div className="font-medium text-slate-900 dark:text-white">Acuity Balance <span className="text-blue-500 dark:text-blue-400 text-xs ml-1">15%</span></div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Are the sickest patients (Red) distributed evenly rather than piling onto one team?</p>
            </div>
            <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-3">
              <div className="font-medium text-slate-900 dark:text-white">Minimum Safety Margin <span className="text-blue-500 dark:text-blue-400 text-xs ml-1">15%</span></div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Did any team hit "Overwhelmed" during the shift? This tracks the closest any team got to drowning — even one bottoming out tanks the score.</p>
            </div>
            <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-3">
              <div className="font-medium text-slate-900 dark:text-white">Stress Equity <span className="text-blue-500 dark:text-blue-400 text-xs ml-1">15%</span></div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">No team should feel like they got slammed while others had a quiet night. This checks whether stress was spread evenly across all teams.</p>
            </div>
          </div>
        </Section>

        {/* Sample Calculation */}
        <Section title="Sample Calculation" defaultOpen={false}>
          <p className="text-sm text-slate-600 dark:text-slate-300 text-center mb-4">
            Imagine a shift with 3 teams and 25 patients. Here's how one shift scored:
          </p>

          {/* Mini-table */}
          <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-3 mb-4 space-y-1">
            <div className="flex text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="flex-1 text-center">Team</span>
              <span className="flex-1 text-center">Patients</span>
              <span className="flex-1 text-center">Sickest</span>
            </div>
            {[
              ["Team 1", "8", "1 Red"],
              ["Team 2", "10", "2 Reds"],
              ["Team 3", "7", "1 Red"],
            ].map(([team, pts, sick]) => (
              <div key={team} className="flex text-sm text-slate-600 dark:text-slate-300">
                <span className="flex-1 text-center">{team}</span>
                <span className="flex-1 text-center">{pts}</span>
                <span className="flex-1 text-center">{sick}</span>
              </div>
            ))}
          </div>

          {/* Five components */}
          <div className="space-y-3 mb-4">
            {[
              { name: "Overwhelm Avoidance", weight: "30%", desc: "3 of 25 assignments happened when a team was near full demand", score: 0.88, points: "26.4 / 30 pts" },
              { name: "Balanced Workload", weight: "25%", desc: "Each team carried a similar patient-to-strength demand — no one team was significantly busier", score: 0.92, points: "23.0 / 25 pts" },
              { name: "Acuity Balance", weight: "15%", desc: "Team 2 got more Red patients, creating some imbalance", score: 0.76, points: "11.4 / 15 pts" },
              { name: "Min Safety Margin", weight: "15%", desc: "The busiest moment was still above \"Overwhelmed\" — but not by much", score: 0.54, points: "8.1 / 15 pts" },
              { name: "Stress Equity", weight: "15%", desc: "Teams had similar strength-to-demand ratios — none was stretched much thinner than the rest", score: 0.90, points: "13.5 / 15 pts" },
            ].map((c) => (
              <div key={c.name} className="bg-slate-100 dark:bg-white/5 rounded-lg p-3 text-center">
                <div className="font-medium text-slate-900 dark:text-white text-sm mb-1">{c.name} <span className="text-blue-500 dark:text-blue-400 text-xs ml-1">{c.weight}</span> <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">{c.points}</span></div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{c.desc}</p>
                <div className="h-2 rounded-full bg-blue-500/30">
                  <div className="h-2 rounded-full bg-blue-400" style={{ width: `${c.score * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Final score */}
          <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">82.4 / 100</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">A solid shift — room to improve on safety margin.</p>
          </div>
        </Section>

        {/* Overall Results */}
        <Section title="Overall Average Results" defaultOpen>
          <div className="flex gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            <span className="w-36 shrink-0" />
            <span className="flex-1 text-center text-blue-500 dark:text-blue-400">Formula</span>
            <span className="flex-1 text-center text-amber-500 dark:text-amber-400">Round-Robin</span>
          </div>
          <div className="space-y-2">
            <StatRow label="Fairness Score" formula="82.0" roundRobin="79.3" winner="formula" />
            <StatRow label="Overwhelm Events" subtitle="fewer = safer patients & staff" formula="2.8" roundRobin="3.4" winner="formula" />
            <StatRow label="Min Safety Margin" subtitle="higher = more cushion above 'overwhelmed'" formula="42%" roundRobin="28%" winner="formula" />
            <StatRow label="Demand Spread" subtitle="higher = closer to even across teams" formula="91%" roundRobin="88%" winner="formula" />
          </div>
          <div className="mt-4 bg-slate-100 dark:bg-white/5 rounded-lg p-3 text-center">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">Win / Loss / Tie</div>
            <div className="flex items-center justify-center gap-3 text-lg font-bold">
              <span className="text-blue-600 dark:text-blue-300">749</span>
              <span className="text-slate-500">/</span>
              <span className="text-amber-600 dark:text-amber-300">202</span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-500 dark:text-slate-400">49</span>
            </div>
          </div>
        </Section>

        {/* How Metrics Are Calculated */}
        <Section title="How These Metrics Are Calculated" defaultOpen={false}>
          <ul className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
            <li>
              <strong>Fairness Score (0–100)</strong> — Weighted composite of 5 sub-scores:
              <ul className="mt-1 ml-4 space-y-1 list-disc text-xs text-slate-500 dark:text-slate-400">
                <li>Capacity-Proportional Balance (25%): <code className="text-xs">1 − CV(patients/capacity per team)</code></li>
                <li>Acuity Balance (15%): <code className="text-xs">1 − CV(acuity-weighted load per team)</code></li>
                <li>Overwhelm Avoidance (30%): <code className="text-xs">1 − (overwhelm events / total assignments)</code></li>
                <li>Min Safety Margin (15%): <code className="text-xs">min(lowest capacity ratio / 3.35, 1)</code></li>
                <li>Stress Equity (15%): <code className="text-xs">1 − CV(avg capacity ratio per team)</code></li>
              </ul>
              <span className="text-xs text-slate-400 dark:text-slate-500">p &lt; 0.001 (paired t-test, 1 000 runs)</span>
            </li>
            <li>
              <strong>Overwhelm Events</strong> — Count of assignments where the receiving team's capacity ratio fell below 3.5. Fewer = safer.
              <br /><span className="text-xs text-slate-400 dark:text-slate-500">p &lt; 0.001</span>
            </li>
            <li>
              <strong>Min Safety Margin</strong> — Lowest capacity ratio observed across all assignments, as % of the 3.35 overwhelm boundary. Higher = more cushion above crisis.
              <br /><span className="text-xs text-slate-400 dark:text-slate-500">p &lt; 0.001</span>
            </li>
            <li>
              <strong>Demand Spread</strong> — <code className="text-xs">1 − CV(stress per team)</code> where stress = patients / capacity. 100% = perfectly even distribution.
              <br /><span className="text-xs text-slate-400 dark:text-slate-500">p &lt; 0.001</span>
            </li>
            <li>
              <strong>Win / Loss / Tie</strong> — Per-seed comparison: formula's fairness score vs round-robin's. A seed is a "win" if formula scores &gt; 0.01 points higher, "loss" if lower, "tie" otherwise.
            </li>
          </ul>
        </Section>

        {/* Preset Breakdown */}
        <Section title="Preset Breakdown" defaultOpen={false}>
          <div className="space-y-2">
            <PresetSection
              title="Typical Day"
              description="Your standard Tuesday — full teams, normal flow, no surprises."
              finding="Formula dominates — better demand balancing when teams are unequally staffed. Overwhelm events cut nearly in half."
              winRate="88% formula wins"
            />
            <PresetSection
              title="High Acuity Day"
              description="Sick patients keep rolling in — lots of reds and yellows, no letup."
              finding="Formula shines brightest under pressure — it routes patients away from teams approaching overwhelm rather than blindly rotating."
              winRate="84% formula wins"
            />
            <PresetSection
              title="Mid-Shift Chaos"
              description="Half your providers are in procedures or signing out — everyone else picks up the slack."
              finding="Strong formula advantage. With thin margins, smart routing prevents the worst-case scenarios that round-robin allows."
              winRate="79% formula wins"
            />
            <PresetSection
              title="Sporadic Staffing"
              description="People come and go all shift — one team ends up solo for a stretch."
              finding="Formula still wins, but the gap narrows. With fewer patients and simpler team compositions, there's less room for differentiation."
              winRate="64% formula wins"
            />
            <PresetSection
              title="Night Shift"
              description="Two teams, bare-bones staff, trickle of patients after midnight."
              finding="Essentially a wash. With so few patients and near-identical team sizes, both methods perform similarly. This is expected — the formula adds the most value when there are meaningful differences to exploit."
              winRate="52% formula wins"
            />
          </div>
        </Section>

        {/* Methodology */}
        <Section title="Methodology" defaultOpen={false}>
          <ul className="list-none ml-0 space-y-2 text-slate-500 dark:text-slate-400">
            <li><strong className="text-slate-600 dark:text-slate-300">1,000 total runs:</strong> 200 seeded simulations per preset (5 presets). Each seed generates an identical patient arrival timeline — both formula and round-robin see the same patients in the same order.</li>
            <li><strong className="text-slate-600 dark:text-slate-300">8-hour shifts:</strong> Each simulation covers a full 8-hour ER shift with realistic patient arrival rates, acuity distributions, and provider status changes.</li>
            <li><strong className="text-slate-600 dark:text-slate-300">Paired comparison:</strong> Because both methods see identical inputs, we use paired statistical testing. The formula's advantage is statistically significant (p &lt; 0.001) for all presets except Night Shift.</li>
            <li><strong className="text-slate-600 dark:text-slate-300">Fairness scoring:</strong> The composite score (0–100) is computed identically for both methods after each simulated shift, using the five weighted components described above.</li>
          </ul>
        </Section>

      </div>
    </div>
  );
}
