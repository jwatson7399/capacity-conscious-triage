import { useShift } from '../context/ShiftContext';
import { CAPACITY_GRADIENT_CSS } from '../constants';

interface Props {
  onClose: () => void;
  onShowBenchmark?: () => void;
}

function Section({ title, children, dataTour }: { title: string; children: React.ReactNode; dataTour?: string }) {
  return (
    <details className="border-b border-gray-200 dark:border-slate-700" open={false} {...(dataTour ? { 'data-tour': dataTour } : {})}>
      <summary className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 cursor-pointer min-h-[44px] flex items-center gap-2">
        <span className="chevron-icon text-gray-400 text-xs">▶</span>
        {title}
      </summary>
      <div className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-300 space-y-2">
        {children}
      </div>
    </details>
  );
}

export default function HelpSection({ onClose, onShowBenchmark }: Props) {
  const { capacityWeights } = useShift();
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">How It Works</h2>
        <button onClick={onClose} className="text-blue-600 font-medium min-h-[44px] px-2">Close</button>
      </div>

      {/* Quick Start — always visible */}
      <div className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300 space-y-3 border-b border-gray-200 dark:border-slate-700">
        <p>
          Replaces round-robin with capacity-based scoring: teams are recommended based on who actually has bandwidth, not whose turn it is.
        </p>
        <p data-tour="help-problems">
          Round-robin can't tell that Team 2 just got a code and an intubation while Team 1 has two stable patients. This tool can.
        </p>
        <ul className="list-disc ml-4 space-y-1">
          <li>The <strong>big number</strong> on each team card is <strong>Capacity</strong>:higher means more room for a new patient.</li>
          <li>Tap <strong>+ New Patient</strong>, pick acuity color, and assign to the recommended team (or override).</li>
        </ul>
        <p>
          Every recommendation can be overridden. The final call is always yours. No new workflow. Same assign flow, smarter suggestions.
        </p>
        {onShowBenchmark && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg space-y-2">
            <p className="text-gray-800 dark:text-gray-200">
              Across 1,000 paired simulated shifts vs round-robin: red-zone arrivals &minus;51%, worst-moment capacity +35%, acuity burden gap between teams &minus;50% (all p &lt; 0.001).{' '}
              <button onClick={onShowBenchmark} className="text-blue-600 dark:text-blue-400 font-medium">
                Benchmark →
              </button>
            </p>
          </div>
        )}
      </div>

      {/* 1. Reading the Dashboard */}
      <Section title="Reading the Dashboard" dataTour="help-formula">
        <div data-tour="help-formula-core">
          <p>Each team's <strong>Capacity = Strength / Demand</strong>. Higher = more room. The recommended team has the highest capacity among unbuffered teams.</p>
          <ul className="list-disc ml-4 space-y-1">
            <li><strong>Strength</strong>:sum of provider weights adjusted by status (active, in procedure, etc.).</li>
            <li><strong>Demand</strong>:sum of acuity weights for current patients, decaying over time as they stabilize.</li>
          </ul>
        </div>
        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg space-y-1">
          <p className="font-semibold text-gray-800 dark:text-gray-200">What the numbers mean</p>
          <p>
            Below the big number, <strong>Strength</strong> shows raw provider weight for reference.
          </p>
          <p className="text-gray-700 dark:text-gray-300 mb-1">Example: both teams face demand <strong>3.0</strong></p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="p-2 rounded border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30">
              <p className="font-semibold text-gray-800 dark:text-gray-200">Team A</p>
              <p className="text-gray-600 dark:text-gray-400">Strength <strong>32.5</strong></p>
              <p className="text-gray-600 dark:text-gray-400">32.5 ÷ 3.0 = <strong>10.8</strong></p>
              <p className="text-gray-600 dark:text-gray-400">Capacity <strong>≈ 11</strong></p>
              <p className="text-green-700 dark:text-green-400 font-medium">Manageable → recommended</p>
            </div>
            <div className="p-2 rounded border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30">
              <p className="font-semibold text-gray-800 dark:text-gray-200">Team B</p>
              <p className="text-gray-600 dark:text-gray-400">Strength <strong>11.3</strong></p>
              <p className="text-gray-600 dark:text-gray-400">11.3 ÷ 3.0 = <strong>3.8</strong></p>
              <p className="text-gray-600 dark:text-gray-400">Capacity <strong>≈ 4</strong></p>
              <p className="text-orange-700 dark:text-orange-400 font-medium">High Demand → not recommended</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="relative rounded overflow-hidden h-5" style={{ background: CAPACITY_GRADIENT_CSS, opacity: 0.7 }}>
              <div className="absolute inset-0 flex">
                {['<8.5', '8.5+', '11.5+', '16+', '23+', '50+'].map(label => (
                  <div key={label} className="flex-1 flex items-center justify-center">
                    <span className="text-[9px] font-semibold text-white/90 leading-none drop-shadow-sm">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Cutoffs recalibrated under the recommended config (4:2:1 acuity weights, D6 linear decay, no buffers) from 1,000 simulated shifts run against 3 months of real NYU BK provider schedules (23,193 team-level observations). Boundaries placed at p5/p15/p33/p50/p75 of the empirical distribution.</p>
            <details className="mt-1">
              <summary className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer">
                How were these cutoffs derived?
              </summary>
              <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-2">
                <p>
                  <strong>Simulation setup.</strong> 1,000 eight-hour shifts were generated against 12 real NYU BK
                  provider schedule files (Dec 2025 – Mar 2026), covering 7 days × 4 shift windows (7A–3P, 9A–5P, 3P–11P, 5P–1A).
                  Each run sampled a date's actual roster (real team compositions, provider types, and scheduled hours),
                  then simulated patients arriving randomly at rates that match real-world patterns (busier in the
                  morning, quieter at night), with a realistic mix of Red, Yellow, and Purple acuities.
                </p>
                <p>
                  <strong>Capacity ratio distribution.</strong> At every simulated arrival, the receiving team's capacity ratio
                  (Strength ÷ Demand) was recorded: 23,193 team-level observations total. Under the recommended config the
                  distribution is right-skewed with the modal plateau in the 10–15 range; the bulk of observations fall between
                  8 and 30, with a long tail at very high ratios.
                </p>
                <p>
                  <strong>Percentile boundaries.</strong> Thresholds were placed at empirical percentiles:
                </p>
                <ul className="list-disc ml-4 space-y-0.5">
                  <li><strong>≥ 50 (Comfortable)</strong>:top 25% (≥ p75); significant slack.</li>
                  <li><strong>≥ 23 (Manageable)</strong>:p50–p75; above median, comfortable headroom.</li>
                  <li><strong>≥ 16 (Busy)</strong>:p33–p50; below median.</li>
                  <li><strong>≥ 11.5 (Very Busy)</strong>:p15–p33; modal plateau, peak typical workload.</li>
                  <li><strong>≥ 8.5 (High Demand)</strong>:p5–p15; approaching danger zone.</li>
                  <li><strong>&lt; 8.5 (Red Zone)</strong>:bottom 5% (p5); demand approaching or exceeding capacity.</li>
                </ul>
              </div>
            </details>
          </div>
        </div>
      </Section>

      {/* 2. Acuity Colors & Decay */}
      <Section title="Acuity Colors & Decay" dataTour="help-patient-load">
        <p>
          When assigning a patient, select an acuity color. Each carries a different demand weight that decays linearly to zero as the patient stabilizes.
        </p>
        <div data-tour="help-patient-load-chart">
        <table className="w-full text-left">
          <thead><tr className="border-b"><th className="py-1">Color</th><th>Initial Weight</th><th>Stabilizes</th></tr></thead>
          <tbody>
            <tr><td className="py-1"><span className="text-red-600 font-semibold">Red</span></td><td>4</td><td>linearly to 0 over 180 min</td></tr>
            <tr><td className="py-1"><span className="text-amber-600 font-semibold">Yellow</span></td><td>2</td><td>linearly to 0 over 180 min</td></tr>
            <tr><td className="py-1"><span className="text-violet-600 font-semibold">Purple</span></td><td>1</td><td>linearly to 0 over 90 min</td></tr>
          </tbody>
        </table>
        </div>
        <div className="mt-2 space-y-2">
          <p className="font-semibold text-gray-700 dark:text-gray-200">Clinical examples</p>
          <ul className="list-disc ml-4 space-y-1">
            <li><span className="text-red-600 font-semibold">Red</span>:Cardiac arrests, hypotensive arrhythmias, unstable active GIB, active seizure, anaphylaxis, likely intubation/BiPAP</li>
            <li><span className="text-amber-600 font-semibold">Yellow</span>:Sepsis, AMS, normotensive arrhythmias, stable but active GIB, active EtOH withdrawal requiring IV benzos, seizure now postictal</li>
            <li><span className="text-violet-600 font-semibold">Purple</span>:Sedated EDP on end-tidal CO₂ monitoring, stable overdose requiring observation</li>
          </ul>
        </div>
        <p>
          Decay mirrors stabilization: a code requires intense resources on arrival, but as the patient stabilizes the marginal workload drops.
        </p>
      </Section>

      {/* 3. Recommendations */}
      <Section title="Recommendations" dataTour="help-recommendations">
        <p className="font-semibold text-gray-700 dark:text-gray-200">Algorithm</p>
        <ol className="list-decimal ml-4 space-y-1">
          <li><strong>Exclude Trauma (Team 4)</strong>:always manual-only, never auto-recommended.</li>
          <li><strong>Highest capacity wins</strong>:the team with the most room gets the patient.</li>
          <li><strong>Tiebreaker: recency</strong>:if capacity is equal, the team that went longest without a patient is preferred.</li>
          <li><strong>Tiebreaker: team number</strong>:if still tied, lowest team number wins.</li>
        </ol>
        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p>
            A team that just received a high-acuity patient sees its capacity drop immediately, so the next arrival is naturally directed elsewhere. No artificial cooldown is needed; the load model itself prevents back-to-back hits proportional to acuity.
          </p>
        </div>
      </Section>

      {/* 4. Actions & Controls */}
      <Section title="Actions & Controls">
        <p className="font-semibold text-gray-700 dark:text-gray-200">Assigning patients</p>
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>+ New Patient</strong> (blue button): Assign a new patient to the Critical area.</li>
        </ul>
        <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Per-patient actions</p>
        <p>Tap any patient badge to expand it:</p>
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>Upgrade to Red</strong>:Escalate acuity (resets weight and decay timer).</li>
          <li><strong>Remove from A-Side</strong>:Patient discharged or no longer A-side.</li>
          <li><strong>Mark Deceased</strong>:Grays out patient and pauses recommendations to that team briefly for debrief.</li>
          <li><strong>Reassign to Another Team</strong>:Move patient to a different team (requires a reason).</li>
        </ul>
        <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Team management</p>
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>Close Team</strong>:Teams 3/4 only. 60-minute countdown, then patients auto-transfer to partner team.</li>
          <li><strong>Sign Out to Team N</strong>:Immediately transfer all patients from a closed team.</li>
          <li><strong>Swap Provider</strong>:Replace a provider (e.g. shift change). Tap the provider row, then "Swap."</li>
          <li><strong>Provider status</strong>:Cycle through Active, In Procedure, Taking Signout, Off Floor. Statuses auto-expire.</li>
        </ul>
        <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Overrides</p>
        <p>
          You can assign a patient to any team, not just the recommended one. Select a reason when overriding. Overrides are logged for shift review. Team 4 (Trauma) is only reachable via override.
        </p>
      </Section>

      {/* 5. Weights & Reference */}
      <Section title="Weights & Reference" dataTour="help-team-capacity">
        <div data-tour="help-team-capacity-weights">
          <p className="font-semibold text-gray-700 dark:text-gray-200">Provider Weights <span className="font-normal text-xs text-gray-400">(live from Delphi survey)</span></p>
          <table className="w-full text-left">
            <thead><tr className="border-b"><th className="py-1">Type</th><th>Weight</th></tr></thead>
            <tbody>
              <tr><td className="py-1">Attending</td><td>{capacityWeights.attending}</td></tr>
              <tr><td className="py-1">Senior Resident (PGY 3-4)</td><td>{capacityWeights.senior_resident}</td></tr>
              <tr><td className="py-1">PA</td><td>{capacityWeights.pa}</td></tr>
              <tr><td className="py-1">Resident (PGY-2)</td><td>{capacityWeights.junior_resident}</td></tr>
              <tr><td className="py-1">Intern (PGY-1)</td><td>{capacityWeights.intern}</td></tr>
              <tr><td className="py-1">Rotator</td><td>{capacityWeights.rotator}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Status Multipliers</p>
        <table className="w-full text-left">
          <thead><tr className="border-b"><th className="py-1">Status</th><th>Multiplier</th></tr></thead>
          <tbody>
            <tr><td className="py-1">Active</td><td>100%</td></tr>
            <tr><td className="py-1">Taking Signout</td><td>50%</td></tr>
            <tr><td className="py-1">In Procedure</td><td>25% (still providing oversight and returning shortly)</td></tr>
            <tr><td className="py-1">Off Floor</td><td>0%</td></tr>
          </tbody>
        </table>
        <p>Non-active statuses auto-expire: off-floor after 15 minutes, all others after 30 minutes.</p>

        <p className="font-semibold text-gray-700 dark:text-gray-200 mt-3">Patient nomenclature</p>
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>C-###</strong>:New arrival from triage assigned to Critical area (e.g. C-001)</li>
          <li><strong>F-###</strong>:Floor upgrade patient (select "Floor Upgrade" as source when assigning)</li>
          <li><strong>current demand X.X; stabilizes in [time]</strong>:Live decayed weight and time until weight reaches zero</li>
          <li><strong>(stabilized)</strong>:Demand fully decayed; no further reductions</li>
        </ul>

        <div className="mt-3 p-3 bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 rounded-lg">
          <p className="text-gray-700 dark:text-gray-300">
            <strong>Calibration note:</strong> Provider weights come from a Delphi survey of NYU BK clinicians (n=19, attendings/seniors/PAs); attending = 20 is the fixed reference. Values are fetched live from the survey sheet and update as additional rounds complete.
          </p>
        </div>
      </Section>

      {onShowBenchmark && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700">
          <button onClick={onShowBenchmark} className="text-sm text-blue-600 dark:text-blue-400 font-medium">
            See how formula compares to round-robin →
          </button>
        </div>
      )}
    </div>
  );
}
