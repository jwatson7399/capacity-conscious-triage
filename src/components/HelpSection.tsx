import { useShift } from '../context/ShiftContext';

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
          Replaces round-robin with capacity-based scoring — teams are recommended based on who actually has bandwidth, not whose turn it is.
        </p>
        <p data-tour="help-problems">
          Round-robin can't tell that Team 2 just got a code and an intubation while Team 1 has two stable patients. This tool can.
        </p>
        <ul className="list-disc ml-4 space-y-1">
          <li>The <strong>big number</strong> on each team card is <strong>Capacity</strong> — higher means more room for a new patient.</li>
          <li>Tap <strong>+ New Patient</strong>, pick acuity color, and assign to the recommended team (or override).</li>
          <li>After assignment, a <strong>buffer</strong> temporarily skips that team so they aren't hit back-to-back.</li>
        </ul>
        <p>
          Every recommendation can be overridden. The final call is always yours. No new workflow — same assign flow, smarter suggestions.
        </p>
        {onShowBenchmark && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg">
            <p className="text-gray-800 dark:text-gray-200">
              In 1,000 simulated shifts, the formula produced fairer workload distribution 75% of the time.{' '}
              <button onClick={onShowBenchmark} className="text-blue-600 dark:text-blue-400 font-medium">
                See full benchmark →
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
            <li><strong>Strength</strong> — sum of provider weights adjusted by status (active, in procedure, etc.).</li>
            <li><strong>Demand</strong> — sum of acuity weights for current patients, decaying over time as they stabilize.</li>
          </ul>
        </div>
        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg space-y-1">
          <p className="font-semibold text-gray-800 dark:text-gray-200">What the numbers mean</p>
          <p>
            Below the big number, <strong>Strength</strong> shows raw provider weight for reference.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            Example: Team A has strength <strong>32.5</strong> with demand <strong>6.0</strong> → capacity <strong>≈ 5</strong> (high → recommended).
            Team B has strength <strong>11.3</strong> with demand <strong>6.0</strong> → capacity <strong>≈ 2</strong> (low → not recommended).
          </p>
          <p className="text-gray-700 dark:text-gray-300">Capacity colors: <span className="text-emerald-600 font-semibold">Ready</span> (≥10) → <span className="text-green-600 font-semibold">Stable</span> (≥5) → <span className="text-yellow-600 font-semibold">Manageable</span> (≥3.35) → <span className="text-orange-600 font-semibold">Very Busy</span> (≥2) → <span className="text-red-600 font-semibold">High Load</span> (≥0.05) → <span className="text-red-900 dark:text-red-400 font-semibold">Overwhelmed</span> (0).</p>
        </div>
      </Section>

      {/* 2. Acuity Colors & Decay */}
      <Section title="Acuity Colors & Decay" dataTour="help-patient-load">
        <p>
          When assigning a patient, select an acuity color. Each carries a different demand weight that decays as the patient stabilizes. Decay is a step function — demand drops instantly at each threshold, not gradually.
        </p>
        <div data-tour="help-patient-load-chart">
        <table className="w-full text-left">
          <thead><tr className="border-b"><th className="py-1">Color</th><th>Weight</th><th>Decay</th></tr></thead>
          <tbody>
            <tr><td className="py-1"><span className="text-red-600 font-semibold">Red</span></td><td>5</td><td>→ 3 at 60m → 1 at 120m → 0 at 240m</td></tr>
            <tr><td className="py-1"><span className="text-amber-600 font-semibold">Yellow</span></td><td>3</td><td>→ 1 at 90m → 0 at 240m</td></tr>
            <tr><td className="py-1"><span className="text-violet-600 font-semibold">Purple</span></td><td>1</td><td>→ 0 at 120m</td></tr>
          </tbody>
        </table>
        </div>
        <div className="mt-2 space-y-2">
          <p className="font-semibold text-gray-700 dark:text-gray-200">Clinical examples</p>
          <ul className="list-disc ml-4 space-y-1">
            <li><span className="text-red-600 font-semibold">Red</span> — Cardiac arrests, hypotensive arrhythmias, unstable active GIB, active seizure, anaphylaxis, likely intubation/BiPAP</li>
            <li><span className="text-amber-600 font-semibold">Yellow</span> — Sepsis, AMS, normotensive arrhythmias, stable but active GIB, active EtOH withdrawal requiring IV benzos, seizure now postictal</li>
            <li><span className="text-violet-600 font-semibold">Purple</span> — Sedated EDP on end-tidal CO₂ monitoring, stable overdose requiring observation</li>
          </ul>
        </div>
        <p>
          Decay mirrors stabilization — a code requires intense resources on arrival, but as the patient stabilizes the marginal workload drops.
        </p>
      </Section>

      {/* 3. Buffers & Recommendations */}
      <Section title="Buffers & Recommendations" dataTour="help-recommendations">
        <p>
          After assignment, a <strong>buffer</strong> temporarily skips that team from recommendations, preventing back-to-back hits. The acuity of the patient that created the buffer determines its duration:
        </p>
        <table className="w-full text-left">
          <thead><tr className="border-b"><th className="py-1">Acuity</th><th>Buffer Duration</th></tr></thead>
          <tbody>
            <tr><td className="py-1"><span className="text-red-600 font-semibold">Red</span></td><td>35 minutes</td></tr>
            <tr><td className="py-1"><span className="text-amber-600 font-semibold">Yellow</span></td><td>25 minutes</td></tr>
            <tr><td className="py-1"><span className="text-violet-600 font-semibold">Purple</span></td><td>15 minutes</td></tr>
          </tbody>
        </table>
        <p>The colored bar on each team card shows active buffers — it shrinks as time passes. Stacked buffers merge into a pulsing rainbow bar with a combined count.</p>

        <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Recommendation algorithm</p>
        <ol className="list-decimal ml-4 space-y-1">
          <li><strong>Exclude Trauma (Team 4)</strong> — always manual-only, never auto-recommended.</li>
          <li><strong>Skip buffered teams</strong> — any active buffer grants temporary immunity from recommendation.</li>
          <li><strong>Highest capacity wins</strong> — the unbuffered team with the most room gets the patient.</li>
          <li><strong>Tiebreaker: recency</strong> — if capacity is equal, the team that went longest without a patient is preferred.</li>
          <li><strong>Tiebreaker: team number</strong> — if still tied, lowest team number wins.</li>
        </ol>

        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2">
          <p className="font-semibold text-gray-800 dark:text-gray-200">All teams buffered? Recency takes over</p>
          <p>
            When every eligible team is buffered simultaneously, the system switches to <strong>least-recent-assignment-first</strong>
            {' '}to force fair alternation. Capacity is still the tiebreaker, but recency dominates. When at least one team is unbuffered, normal priority resumes.
          </p>
        </div>
      </Section>

      {/* 4. Actions & Controls */}
      <Section title="Actions & Controls">
        <p className="font-semibold text-gray-700 dark:text-gray-200">Assigning patients</p>
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>+ New Patient</strong> (blue button) — Assign a new patient to the Critical area.</li>
        </ul>
        <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Per-patient actions</p>
        <p>Tap any patient badge to expand it:</p>
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>Upgrade to Red</strong> — Escalate acuity (resets weight and decay timer).</li>
          <li><strong>Remove from A-Side</strong> — Patient discharged or no longer A-side.</li>
          <li><strong>Mark Deceased</strong> — Grays out patient; applies 30-minute team buffer for debrief.</li>
          <li><strong>Reassign to Another Team</strong> — Move patient to a different team (requires a reason).</li>
        </ul>
        <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Team management</p>
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>Close Team</strong> — Teams 3/4 only. 60-minute countdown, then patients auto-transfer to partner team.</li>
          <li><strong>Sign Out to Team N</strong> — Immediately transfer all patients from a closed team.</li>
          <li><strong>Swap Provider</strong> — Replace a provider (e.g. shift change). Tap the provider row, then "Swap."</li>
          <li><strong>Provider status</strong> — Cycle through Active, In Procedure, Taking Signout, Off Floor. Statuses auto-expire.</li>
        </ul>
        <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Overrides</p>
        <p>
          You can assign a patient to any team, not just the recommended one — select a reason when overriding. Overrides are logged for shift review. Team 4 (Trauma) is only reachable via override.
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
          <li><strong>C-###</strong> — New arrival from triage assigned to Critical area (e.g. C-001)</li>
          <li><strong>F-###</strong> — Floor upgrade patient (select "Floor Upgrade" as source when assigning)</li>
          <li><strong>demand drops from N to M in [time]</strong> — Next decay step countdown</li>
          <li><strong>(demand: N)</strong> — Current decayed weight</li>
          <li><strong>(stabilized)</strong> — Demand fully decayed; no further reductions</li>
        </ul>

        <div className="mt-3 p-3 bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 rounded-lg">
          <p className="text-gray-700 dark:text-gray-300">
            <strong>Calibration note:</strong> Weights reflect estimated supervisory capacity based on departmental input and iterative simulation tuning — these are configurable.
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
