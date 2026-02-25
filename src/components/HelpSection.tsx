interface Props {
  onClose: () => void;
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

export default function HelpSection({ onClose }: Props) {
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">How It Works</h2>
        <button onClick={onClose} className="text-blue-600 font-medium min-h-[44px] px-2">Close</button>
      </div>

      {/* Introduction — always visible, no <details> */}
      <div className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300 space-y-3 border-b border-gray-200 dark:border-slate-700">
        <p>
          Previously, Teams 1 through 3 rotated A-side patients in a simple round-robin.
          While straightforward, this approach had three key shortcomings:
        </p>
        <div data-tour="help-problems" className="space-y-1">
          <ul className="list-disc ml-4 space-y-1">
            <li data-tour="help-problem-composition"><strong>Team composition is ignored</strong> — A team with a senior resident and two juniors was treated identically to a team staffed by a single off-service intern.</li>
          </ul>
          <div data-tour="help-problem-acuity-load">
            <ul className="list-disc ml-4 space-y-1">
              <li><strong>Acuity equivalence is assumed</strong> — A cardiac arrest patient and a sedated EDP requiring end-tidal CO₂ monitoring are both counted as one A-side patient.</li>
              <li><strong>Team load is neglected</strong> — There was no way to account for how overwhelmed one team already was compared to the others, stretching providers thin and putting patient care at risk.</li>
            </ul>
          </div>
        </div>
        <p>
          This app replaces round-robin with formula-driven scoring. It continuously tracks each team's
          capacity (who's available and in what role), current patient load, and cooldown buffers, then
          recommends the team best positioned to absorb the next patient.
        </p>
        <p>
          Team 4 (Trauma) is always visible on the dashboard but is excluded from automatic recommendations —
          patients are assigned there only through manual override.
        </p>
        <p>
          Every recommendation can be overridden. The system logs overrides for review, but the final call
          always belongs to the staff at the bedside.
        </p>
      </div>

      <Section title="The Core Formula" dataTour="help-formula">
        <div data-tour="help-formula-core">
          <p>Each team receives a continuously updated <strong>capacity ratio</strong>:</p>
          <pre className="bg-gray-100 dark:bg-slate-700 rounded-lg p-3 font-mono text-xs overflow-x-auto">
Capacity Ratio = Team Capacity / Patient Load</pre>
          <ul className="list-disc ml-4 space-y-1">
            <li><strong>Team Capacity</strong> — sum of provider weights adjusted by their current status (active, in procedure, taking signout, off floor).</li>
            <li><strong>Patient Load</strong> — sum of weighted acuity scores for all patients currently on the team, with decay over time.</li>
          </ul>
        </div>

        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg space-y-1">
          <p className="font-semibold text-gray-800 dark:text-gray-200">What the numbers mean</p>
          <p>
            The <strong>big number</strong> on each team card is the <strong>Capacity Ratio</strong> — <strong>higher ratio = more room</strong>. The team with the highest ratio is recommended.
          </p>
          <p>
            Below it, <strong>Capacity</strong> shows the raw provider weight for reference.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            Example: Team A has capacity <strong>32.5</strong> with total load <strong>6.0</strong> → ratio <strong>32.5 ÷ 6.0 ≈ 5</strong> (high → recommended).
            Team B has capacity <strong>11.3</strong> with total load <strong>6.0</strong> → ratio <strong>11.3 ÷ 6.0 ≈ 2</strong> (low → not recommended).
          </p>
        </div>
      </Section>

      <Section title="Team Capacity" dataTour="help-team-capacity">
        <div data-tour="help-team-capacity-weights">
          <p>Capacity is the sum of each provider's contribution:</p>
          <pre className="bg-gray-100 dark:bg-slate-700 rounded-lg p-3 font-mono text-xs overflow-x-auto">
Capacity = &Sigma;(ProviderWeight &times; StatusMultiplier)</pre>
          <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Provider Weights</p>
          <table className="w-full text-left">
            <thead><tr className="border-b"><th className="py-1">Type</th><th>Weight</th></tr></thead>
            <tbody>
              <tr><td className="py-1">Attending</td><td>17.5</td></tr>
              <tr><td className="py-1">Senior Resident (PGY 3-4)</td><td>15.0</td></tr>
              <tr><td className="py-1">PA</td><td>10.0</td></tr>
              <tr><td className="py-1">Junior Resident (PGY 1-2)</td><td>7.5</td></tr>
              <tr><td className="py-1">Rotator</td><td>1.0</td></tr>
            </tbody>
          </table>
        </div>
        <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Status Multipliers</p>
        <table className="w-full text-left">
          <thead><tr className="border-b"><th className="py-1">Status</th><th>Multiplier</th></tr></thead>
          <tbody>
            <tr><td className="py-1">Active</td><td>100%</td></tr>
            <tr><td className="py-1">Taking Signout</td><td>50%</td></tr>
            <tr><td className="py-1">In Procedure</td><td>25%</td></tr>
            <tr><td className="py-1">Off Floor</td><td>0%</td></tr>
          </tbody>
        </table>
        <p>Non-active statuses auto-expire: off-floor after 15 minutes, all others after 30 minutes.</p>
      </Section>

      <Section title="Patient Load & Decay" dataTour="help-patient-load">
        <p>
          When a new patient is assigned from triage, you select one of three acuity colors. Each color represents
          a different load on the team. Over time, weights decay as patients stabilize:
        </p>
        <div data-tour="help-patient-load-chart">
        <table className="w-full text-left">
          <thead><tr className="border-b"><th className="py-1">Acuity Color</th><th>Initial Load</th><th>Decay</th></tr></thead>
          <tbody>
            <tr><td className="py-1"><span className="text-red-600 font-semibold">Red</span></td><td>5</td><td>&rarr; 3 at 60m &rarr; 1 at 120m</td></tr>
            <tr><td className="py-1"><span className="text-amber-600 font-semibold">Yellow</span></td><td>3</td><td>&rarr; 1 at 90m</td></tr>
            <tr><td className="py-1"><span className="text-violet-600 font-semibold">Purple</span></td><td>1</td><td>&rarr; 0 at 120m</td></tr>
          </tbody>
        </table>
        <div className="mt-2 space-y-2">
          <p className="font-semibold text-gray-700 dark:text-gray-200">Examples</p>
          <ul className="list-disc ml-4 space-y-1">
            <li><span className="text-red-600 font-semibold">Red</span> (critical action) — Cardiac arrests, hypotensive arrhythmias, unstable active GIB, active seizure, anaphylaxis, likely intubation/BiPAP</li>
            <li><span className="text-amber-600 font-semibold">Yellow</span> (emergent) — Sepsis, AMS, normotensive arrhythmias, stable but active GIB, active EtOH withdrawal requiring IV benzos, seizure now postictal</li>
            <li><span className="text-violet-600 font-semibold">Purple</span> (soft A-side) — Sedated EDP on end-tidal CO₂ monitoring, stable overdose requiring observation</li>
          </ul>
        </div>
        </div>
        <p>
          Decay reflects clinical reality: a Red patient requires intense resources on arrival, but as they
          stabilize, the marginal workload decreases. Without decay, teams that received early critical patients
          would have a permanently high patient load even after the acute stabilizing interventions have been completed.
        </p>
      </Section>

      <Section title="The Buffer System">
        <p>
          When a patient is assigned, a temporary <strong>buffer</strong> is placed on that team. The buffer
          deprioritizes the team for <em>all</em> incoming patients — regardless of acuity color — preventing
          immediate back-to-back assignments.
        </p>
        <p>
          The tier of the patient that <em>created</em> the buffer only determines its <strong>duration</strong>:
        </p>
        <table className="w-full text-left">
          <thead><tr className="border-b"><th className="py-1">Acuity Color</th><th>Buffer Duration</th></tr></thead>
          <tbody>
            <tr><td className="py-1"><span className="text-red-600 font-semibold">Red</span></td><td>35 minutes</td></tr>
            <tr><td className="py-1"><span className="text-amber-600 font-semibold">Yellow</span></td><td>25 minutes</td></tr>
            <tr><td className="py-1"><span className="text-violet-600 font-semibold">Purple</span></td><td>15 minutes</td></tr>
          </tbody>
        </table>
        <p>
          Any active buffer — whether spawned by a <span className="text-red-600 font-semibold">Red</span>,{' '}
          <span className="text-amber-600 font-semibold">Yellow</span>, or{' '}
          <span className="text-violet-600 font-semibold">Purple</span> patient — grants the team temporary immunity
          from being recommended. The team's score and capacity ratio are unaffected; it is simply skipped when
          selecting the next recommendation. The colored bar on each team card shows active buffers. The bar shrinks
          as time passes; when it disappears, the buffer has expired and no longer affects recommendations.
        </p>
        <p>
          When multiple buffers stack on the same team, they are merged into a single bar showing the combined count
          and the latest expiration time. Stacked buffers display as a pulsing, rainbow-gradient bar so they stand out visually.
        </p>
        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2">
          <p className="font-semibold text-gray-800 dark:text-gray-200">All teams buffered? Recency takes over</p>
          <p>
            When patients arrive faster than buffers expire, every eligible team can end up buffered at the same
            time — whether it's 2 teams on a night shift or all 3 during a busy day. In that scenario, the buffer
            mechanism alone can't differentiate teams, and capacity ratio would always favor the higher-staffed
            team, leading to lopsided assignments.
          </p>
          <p>
            To prevent this, the system switches priority when all eligible teams are buffered: <strong>the team
            that received a patient least recently is recommended first</strong>, regardless of a small ratio advantage.
            Capacity ratio is still used as a tiebreaker if recency is equal, but it no longer dominates. This forces
            fair alternation so no single team gets stacked with consecutive patients simply because it has more providers.
          </p>
          <p>
            When at least one team is unbuffered, the normal priority applies: unbuffered teams first, then highest
            ratio, then recency.
          </p>
        </div>
      </Section>

      <Section title="How Recommendations Work" dataTour="help-recommendations">
        <p>When you open the assignment screen, the system runs through these steps:</p>
        <ol className="list-decimal ml-4 space-y-1">
          <li><strong>Exclude Trauma (Team 4)</strong> — Team 4 never receives automatic recommendations.</li>
          <li><strong>Check buffers</strong> — Teams with any active buffer are skipped — they won't be recommended until the buffer expires, regardless of their score (buffer duration depends on the tier of the patient that created it, but the presence of any buffer grants immunity regardless of tier).</li>
          <li><strong>Compare capacity ratios</strong> — The team with the highest ratio is recommended first; the next highest is the second choice.</li>
          <li><strong>Tiebreaker: recency</strong> — If two teams have identical ratios, the one that received a patient least recently is preferred.</li>
          <li><strong>Tiebreaker: team number</strong> — If still tied, the lowest team number wins.</li>
        </ol>
      </Section>

      <Section title="Overrides & Trauma">
        <p>
          You can assign a patient to any team, not just the recommended one. When you do, you must select
          a reason. Overrides are logged for shift review and quality auditing.
        </p>
        <p>
          Team 4 (Trauma) is always visible on the dashboard but is excluded from automatic recommendations.
          Patients can only be assigned to Team 4 through a manual override.
        </p>
      </Section>

      <Section title="Available Actions">
        <p className="font-semibold text-gray-700 dark:text-gray-200">Assigning patients</p>
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>+ Assign Patient</strong> (blue button) — Assign a new arrival from triage to the Critical area</li>
          <li><strong>+ Floor Patient</strong> (amber button) — Upgrade a patient from the regular ER area to the Critical area</li>
        </ul>
        <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Per-patient actions</p>
        <p>Tap any patient badge to expand it and see available actions:</p>
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>Upgrade to Red</strong> — Escalate acuity to Red (Tier 1). Only available for Yellow and Purple patients. This resets the patient's load weight and decay timer.</li>
          <li><strong>Downgrade</strong> — Remove the patient from the team (e.g. patient discharged or no longer A-side)</li>
          <li><strong>Mark Deceased</strong> — Record a patient death. The patient is grayed out and a 30-minute deceased buffer is applied to the team to allow for team debrief, family conversations, etc.</li>
          <li><strong>Reassign to Another Team</strong> — Move the patient to a different team. Requires a reason.</li>
        </ul>
        <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Team management</p>
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>Close Team</strong> — Available for Teams 3 and 4. Starts a 60-minute countdown, after which patients auto-transfer to the designated partner team.</li>
          <li><strong>Sign Out to Team N</strong> — Immediately transfer all patients from a closed team to its partner.</li>
          <li><strong>Swap Provider</strong> — Replace a provider on a team (e.g. shift change). Tap the provider row, then "Swap."</li>
          <li><strong>Provider status</strong> — Cycle a provider through Active, In Procedure, Taking Signout, or Off Floor. Statuses auto-expire.</li>
        </ul>
      </Section>

      <Section title="Patient Nomenclature">
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>C-###</strong> — New arrival from triage assigned to the Critical area (e.g. C-001 — first arrival of the shift)</li>
          <li><strong>F-###</strong> — Floor upgrade patient — a patient upgraded from the regular ER area to the Critical area (e.g. F-001 — first floor upgrade). Use the "+ Floor Patient" button to assign one.</li>
          <li><strong>assigned X ago</strong> — How long since the patient was assigned to this team</li>
          <li><strong>load drops from N to M in [time]</strong> — The patient's acuity weight will decay from N to M after the shown time</li>
          <li><strong>(load: N)</strong> — Current acuity load weight (e.g. load: 3 means a Red patient has stabilized from initial load 5 down to 3)</li>
          <li><strong>(stabilized)</strong> — Patient load has fully decayed; no further load reductions remain</li>
        </ul>
      </Section>
    </div>
  );
}
