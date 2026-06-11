interface Props {
  onBack: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-xl p-5">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">{title}</h2>
      {children}
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-100 dark:bg-white/5">
            {headers.map((h) => (
              <th key={h} className="text-left px-2.5 py-2 font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? '' : 'bg-slate-50 dark:bg-white/[0.02]'}>
              {row.map((cell, j) => (
                <td key={j} className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-white/5 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MethodologyDeepDive({ onBack }: Props) {
  return (
    <div className="dashboard-bg fixed inset-0 overflow-y-auto p-6">
      <div className="max-w-lg mx-auto space-y-5 pb-12">

        {/* Back button */}
        <button
          onClick={onBack}
          className="min-h-[44px] bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 rounded-xl px-4 py-2 font-semibold text-sm active:bg-slate-300 dark:active:bg-white/20 border border-slate-300 dark:border-white/10"
        >
          &larr; Back to Evidence
        </button>

        {/* Hero */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">How We Ran the Numbers</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Full methodology behind the evidence walkthrough</p>
        </div>

        {/* 1. Data Source */}
        <Section title="1. Data Source">
          <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
            Patient data was extracted from the Epic EMR system for NYU Langone Brooklyn. Arrival times come from ED tracking board timestamps, team assignments reflect the actual workflow, and provider schedules were parsed from 18 weekly <code className="text-xs bg-slate-100 dark:bg-white/10 px-1 py-0.5 rounded">.xlsx</code> files covering Dec 2025 &ndash; Mar 2026.
          </p>
          <DataTable
            headers={['Scope', 'Encounters', 'Days']}
            rows={[
              ['Total A-side', '2,597', '\u2014'],
              ['Minus Trauma / Team 4', '\u2212639', '\u2014'],
              ['A-side Teams 1\u20133', '1,958', '122'],
              ['Primary cohort (9AM\u2013midnight)', '1,541', '121'],
            ]}
          />
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
            The evidence walkthrough presents the primary cohort: three-team hours where Teams 1, 2, and 3 are all staffed simultaneously.
          </p>
        </Section>

        {/* 2. Provider Capacity Weights */}
        <Section title="2. Provider Capacity Weights">
          <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
            Nineteen ER clinicians (attendings, residents, and PAs) independently rated each provider type's patient-handling capacity relative to an attending, fixed at 20, via a Delphi survey. Responses are collected in a Google Sheet polled every 5 minutes by the app's <code className="text-xs bg-slate-100 dark:bg-white/10 px-1 py-0.5 rounded">useSurveyWeights</code> hook; the round-one means below are baked in as fallback defaults when the sheet is unavailable.
          </p>
          <DataTable
            headers={['Provider Type', 'Original Default', 'Delphi R1 Mean (n=19, adopted)']}
            rows={[
              ['Attending', '20', '20 (fixed reference)'],
              ['Senior Resident (PGY 3\u20134)', '15.0', '15.2'],
              ['PA', '10.0', '11.4'],
              ['Junior Resident (PGY-2)', '7.5', '10.8'],
              ['Intern (PGY-1)', '5.0', '6.6'],
              ['Rotator', '1.0', '2.4'],
            ]}
          />
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
            Round-one means broadly confirmed the original defaults for seniors and PAs, and rated junior residents and interns meaningfully higher. Live values update automatically as later survey rounds complete.
          </p>
        </Section>

        {/* 3. Acuity Weights */}
        <Section title="3. Acuity Weights (4:2:1)">
          <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
            Patient acuity weights reflect relative physician time demand. Four published studies measuring direct emergency physician time or resource utilization by acuity were reviewed:
          </p>
          <DataTable
            headers={['Study', 'n', 'Key Finding']}
            rows={[
              ['POWER (Dreyer 2009)', '11,716', 'Red:Yellow:Purple = 2.80:1.48:1'],
              ['Innes (2005)', '585', 'Yellow:Purple = 1.16:1'],
              ['Wrede (2020)', '202', 'ESI 1+2: 76 min, ESI 3: 48 min'],
              ['Hocker / NHAMCS (2018)', '~133M', 'ESI 2 & 3 form single resource cluster'],
            ]}
          />
          <div className="mt-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4 space-y-2">
            <p className="text-sm text-slate-700 dark:text-slate-200 font-semibold">Cross-study synthesis</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Red:Yellow ratios clustered at <strong>1.89&ndash;1.99 : 1</strong> (POWER means and medians).
              Yellow:Purple ratios clustered at <strong>1.48&ndash;1.49 : 1</strong>.
              The simplest integer ratio fitting this evidence is <strong>4 : 2 : 1</strong>.
            </p>
          </div>
          <div className="mt-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4">
            <p className="text-sm text-slate-700 dark:text-slate-200 font-semibold mb-1">Why 4:2:1 replaced 5:3:1</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              The original Yellow:Purple ratio of 3:1 overstated the gap by <strong>100%</strong> versus POWER's observed 1.48:1. Purple patients were treated as nearly invisible. Correcting to 4:2:1 improved the win rate from 75.2% to 77.7%, and all 7 weekdays became individually significant.
            </p>
          </div>
        </Section>

        {/* 4. Fairness Score Formula */}
        <Section title="4. Fairness Score Formula">
          <div className="bg-slate-100 dark:bg-white/5 rounded-lg p-4 font-mono text-sm text-slate-700 dark:text-slate-200 leading-relaxed mb-4">
            <div>Fairness = (Capacity Balance &times; 0.35)</div>
            <div className="pl-16">+ (Acuity Balance &times; 0.25)</div>
            <div className="pl-16">+ (Stress Equity &times; 0.20)</div>
            <div className="pl-16">+ (Safety Floor &times; 0.20)</div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            The underlying engine uses five components weighted 25/15/30/15/15. Two of them (Overwhelm Avoidance at 30% and Min Ratio Score at 15%) score 1.000 for all methods in this dataset, so the display folds their weight into the four visible dimensions.
          </p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">121-day averages (each sub-score 0&ndash;1)</p>
          <DataTable
            headers={['Dimension', 'Actual', 'Formula', '\u0394', 'p']}
            rows={[
              ['Capacity Balance', '0.715', '0.843', '+17.9%', '<0.001'],
              ['Acuity Balance', '0.700', '0.841', '+20.1%', '<0.001'],
              ['Stress Equity', '0.819', '0.903', '+10.3%', '<0.001'],
              ['Composite (0\u2013100)', '85.7', '92.2', '+7.6%', '<0.001'],
            ]}
          />
        </Section>

        {/* 5. Statistical Methods */}
        <Section title="5. Statistical Methods">
          <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
            The benchmark uses a <strong>paired comparison</strong> design: for each of the 121 days, both Formula and Actual see the exact same patients, arrival times, and provider schedules. The only variable is the assignment decision.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-300">77.7%</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Win rate (94 of 121 days)</div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-300">0.84</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Cohen's d (large effect)</div>
            </div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
            Overall significance: <strong>p &lt; 0.001</strong>. Day-of-week stratification confirms the formula doesn't just win on easy days. All seven weekdays are individually significant:
          </p>
          <DataTable
            headers={['Day', 'n', 'Win %', '\u0394', "Cohen's d", 'p']}
            rows={[
              ['Monday', '18', '67%', '+5.8', '0.77', '0.005'],
              ['Tuesday', '17', '76%', '+6.6', '0.79', '0.006'],
              ['Wednesday', '17', '82%', '+6.5', '0.84', '0.004'],
              ['Thursday', '17', '76%', '+6.2', '0.88', '0.003'],
              ['Friday', '17', '88%', '+6.7', '0.96', '0.001'],
              ['Saturday', '17', '65%', '+2.7', '0.62', '0.02'],
              ['Sunday', '18', '89%', '+11.0', '1.25', '<0.001'],
            ]}
          />
        </Section>

        {/* 6. Buffer Ablation */}
        <Section title="6. Buffer Ablation">
          <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
            To isolate whether the formula's gains come from capacity-aware routing or cooldown buffers, a fourth arm was added: <strong>Formula with zero-duration buffers</strong> (capacity routing only, no cooldowns).
          </p>
          <DataTable
            headers={['Metric', 'Actual', 'Formula', 'No-Buffer', 'Round-Robin']}
            rows={[
              ['Fairness', '85.7', '92.2', '92.2', '92.7'],
              ['Slams/day', '2.25', '1.19', '1.25', '0.86'],
              ['B2B HA/day', '0.65', '0.11', '0.17', '0.12'],
            ]}
          />
          <div className="mt-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-4">
            <p className="text-sm text-slate-700 dark:text-slate-200 font-semibold mb-1">Key finding</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Capacity-aware routing delivers <strong>~95% of every improvement</strong>. Buffers contribute ~5% (7 extra slams and 7 extra B2B HA prevented over 121 days). The buffer effect is <strong>not statistically significant</strong> (p&nbsp;=&nbsp;0.44 for fairness, p&nbsp;=&nbsp;0.09 for slams).
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
              The improvement is real and comes from the math, not a fragile cooldown timer.
            </p>
          </div>
        </Section>

        {/* 7. Feb 9 Worked Example */}
        <Section title="7. Feb 9 Worked Example">
          <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
            Sunday, Feb 9, 2026 illustrates the problem the formula solves. The actual process assigned <strong>8 of 12 patients to Team 1</strong>, left Team 3 with zero, and created 3 slams. The formula spread them 3/4/5 with no slams.
          </p>

          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Morning roster (9 AM), all teams at capacity 35</p>
          <DataTable
            headers={['Team', 'Providers', 'Capacity']}
            rows={[
              ['Team 1', 'Attending + PA + Intern', '35'],
              ['Team 2', 'Attending + PA + Intern', '35'],
              ['Team 3', 'Attending + Senior Resident', '35'],
            ]}
          />

          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-4 mb-2">Assignment log (12 ESI-2 patients)</p>
          {(() => {
            const rows = [
              ['1', '10:34', 'T1', '\u221e', 'T1', '\u221e'],
              ['2', '10:39', 'T1', '17.5', 'T2', '\u221e'],
              ['3', '11:00', 'T1', '8.8', 'T3', '\u221e'],
              ['4', '12:09', 'T1', '8.8', 'T1', '35.0'],
              ['5', '12:39', 'T1', '7.0', 'T2', '35.0'],
              ['6', '1:16', 'T2', '\u221e', 'T3', '52.5'],
              ['7', '3:10', 'T2', '17.5', 'T3', '52.5'],
              ['8', '3:45', 'T1', '5.8', 'T2', '35.0'],
              ['9', '4:47', 'T1', '7.0', 'T1', '35.0'],
              ['10', '5:25', 'T2', '17.5', 'T3', '35.0'],
              ['11', '7:30', 'T2', '35.0', 'T3', '52.5'],
              ['12', '10:11', 'T1', '17.5', 'T2', '35.0'],
            ];
            return (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-white/10">#</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-white/10">Time</th>
                      <th colSpan={2} className="px-2 py-1.5 text-center font-semibold text-amber-600 dark:text-amber-400 border-b border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10">Current</th>
                      <th colSpan={2} className="px-2 py-1.5 text-center font-semibold text-blue-600 dark:text-blue-400 border-b border-blue-300 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10">Formula</th>
                    </tr>
                    <tr>
                      <th colSpan={2} className="border-b border-slate-200 dark:border-white/10" />
                      <th className="px-2 py-1 text-left text-xs font-medium text-amber-500 dark:text-amber-400/70 border-b border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5">Team</th>
                      <th className="px-2 py-1 text-left text-xs font-medium text-amber-500 dark:text-amber-400/70 border-b border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5">Ratio</th>
                      <th className="px-2 py-1 text-left text-xs font-medium text-blue-500 dark:text-blue-400/70 border-b border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5">Team</th>
                      <th className="px-2 py-1 text-left text-xs font-medium text-blue-500 dark:text-blue-400/70 border-b border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5">Ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? '' : 'bg-slate-50 dark:bg-white/[0.02]'}>
                        <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-white/5">{row[0]}</td>
                        <td className="px-2 py-1.5 text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-white/5 whitespace-nowrap">{row[1]}</td>
                        <td className="px-2 py-1.5 font-medium text-amber-600 dark:text-amber-400 border-b border-slate-100 dark:border-white/5">{row[2]}</td>
                        <td className="px-2 py-1.5 text-amber-500 dark:text-amber-400/80 border-b border-slate-100 dark:border-white/5">{row[3]}</td>
                        <td className="px-2 py-1.5 font-medium text-blue-600 dark:text-blue-400 border-b border-slate-100 dark:border-white/5">{row[4]}</td>
                        <td className="px-2 py-1.5 text-blue-500 dark:text-blue-400/80 border-b border-slate-100 dark:border-white/5">{row[5]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Ratio = capacity ratio of the assigned team at time of assignment (higher = more headroom). Formula agreed with Actual 3 of 12 times (25%).
          </p>

          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-4 mb-2">Scorecard</p>
          <DataTable
            headers={['Metric', 'Actual', 'Formula']}
            rows={[
              ['Fairness (0\u2013100)', '62.0', '92.2'],
              ['Distribution', '8 / 4 / 0', '3 / 4 / 5'],
              ['Gini coefficient', '0.44', '0.11'],
              ['Avg capacity ratio', '45.8', '70.4'],
              ['Min capacity ratio', '7.0', '35.0'],
              ['Slams', '3', '0'],
              ['Back-to-back HA', '3', '0'],
            ]}
          />
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
            Feb 9 was a particularly bad day (fairness 62 vs the 121-day mean of 86), but the pattern holds consistently: the actual process ignores team capacity while the formula routes based on it. The formula won on 94 of 121 days.
          </p>
        </Section>

      </div>
    </div>
  );
}
