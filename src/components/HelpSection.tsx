interface Props {
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="border-b border-gray-200" open={false}>
      <summary className="px-4 py-3 font-semibold text-gray-900 cursor-pointer min-h-[44px] flex items-center">
        {title}
      </summary>
      <div className="px-4 pb-4 text-sm text-gray-600 space-y-2">
        {children}
      </div>
    </details>
  );
}

export default function HelpSection({ onClose }: Props) {
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">How It Works</h2>
        <button onClick={onClose} className="text-blue-600 font-medium min-h-[44px] px-2">Close</button>
      </div>

      {/* Introduction — always visible, no <details> */}
      <div className="px-4 py-4 text-sm text-gray-600 space-y-3 border-b border-gray-200">
        <p>
          Previously, Teams 1 through 3 rotated A-side patients in a simple round-robin.
          While straightforward, this approach had three key shortcomings:
        </p>
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>Team composition is ignored</strong> — A team with a senior resident and two juniors was treated identically to one staffed by a single off-service intern.</li>
          <li><strong>Acuity equivalence is assumed</strong> — A cardiac arrest patient and a sedated EDP requiring end-tidal CO₂ monitoring are both counted as one A-side patient.</li>
          <li><strong>Team load is neglected</strong> — There was no way to account for how overwhelmed one team already was compared to the others, stretching providers thin and putting patient care at risk.</li>
        </ul>
        <p>
          This app replaces round-robin with formula-driven scoring. It continuously tracks each team's
          capacity (who's available and in what role), current patient load, and cooldown buffers, then
          recommends the team best positioned to absorb the next patient.
        </p>
        <p>
          Every recommendation can be overridden. The system logs overrides for review, but the final call
          always belongs to the staff at the bedside.
        </p>
      </div>

      <Section title="The Core Formula">
        <p>Each team receives a continuously updated <strong>capacity ratio</strong>:</p>
        <pre className="bg-gray-100 rounded-lg p-3 font-mono text-xs overflow-x-auto">
Capacity Ratio = Team Capacity / (Patient Load + Buffer Load)</pre>
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>Team Capacity</strong> — sum of provider weights adjusted by their current status.</li>
          <li><strong>Patient Load</strong> — sum of weighted acuity scores for all patients currently on the team, with decay over time.</li>
          <li><strong>Buffer Load</strong> — temporary additional load added when a patient is freshly assigned, preventing rapid back-to-back assignments.</li>
        </ul>

        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1">
          <p className="font-semibold text-gray-800">What the numbers mean</p>
          <p>
            The <strong>big number</strong> on each team card is the <strong>Capacity Ratio</strong> — <strong>higher ratio = more room</strong>. The team with the highest ratio is recommended.
          </p>
          <p>
            Below it, <strong>Capacity</strong> shows the raw provider weight for reference.
          </p>
          <p className="text-gray-700">
            Example: Team A has capacity <strong>32.5</strong> with total load <strong>6.0</strong> → ratio <strong>32.5 ÷ 6.0 ≈ 5</strong> (high → recommended).
            Team B has capacity <strong>11.3</strong> with total load <strong>6.0</strong> → ratio <strong>11.3 ÷ 6.0 ≈ 2</strong> (low → not recommended).
          </p>
        </div>
      </Section>

      {/* Visual scoring walkthrough */}
      <Section title="Scoring Example">
        <div className="rounded-lg overflow-hidden border border-gray-300 text-xs font-mono">
          <div className="bg-green-50 border-b border-gray-300 p-3 space-y-1">
            <div className="font-bold text-gray-900 text-sm font-sans">Team 1</div>
            <div>Providers: <strong>SR(15.0)</strong> + <strong>JR(7.5)</strong> + <strong>PA(10.0)</strong> = Capacity <strong>32.5</strong></div>
            <div>Patients: <span className="text-red-700 font-bold">Tier One</span>(5) + <span className="text-violet-700 font-bold">Tier Three</span>(1) = Load <strong>6.0</strong></div>
            <div>Ratio: 32.5 &divide; 6.0 = <strong className="text-green-700">5</strong> <span className="font-sans font-semibold ml-1 bg-green-200 text-green-800 px-1.5 py-0.5 rounded">HIGH → RECOMMENDED</span></div>
          </div>
          <div className="bg-red-50 p-3 space-y-1">
            <div className="font-bold text-gray-900 text-sm font-sans">Team 2</div>
            <div>Providers: <strong>SR(3.75 in proc)</strong> + <strong>JR(7.5)</strong> = Capacity <strong>11.3</strong></div>
            <div>Patients: 2&times; <span className="text-amber-700 font-bold">Tier Two</span>(3+3) = Load <strong>6.0</strong></div>
            <div>Ratio: 11.3 &divide; 6.0 = <strong className="text-red-700">2</strong> <span className="font-sans font-semibold ml-1 bg-red-200 text-red-800 px-1.5 py-0.5 rounded">LOW → NOT recommended</span></div>
          </div>
        </div>
        <p className="mt-2 text-gray-500 text-xs">
          Higher ratio = more room for patients. The big number on each card is the <strong>capacity ratio</strong> (capacity &divide; load).
        </p>
      </Section>

      <Section title="Team Capacity">
        <p>Capacity is the sum of each provider's contribution:</p>
        <pre className="bg-gray-100 rounded-lg p-3 font-mono text-xs overflow-x-auto">
Capacity = &Sigma;(ProviderWeight &times; StatusMultiplier)</pre>
        <p className="font-semibold text-gray-700 mt-2">Provider Weights</p>
        <table className="w-full text-left">
          <thead><tr className="border-b"><th className="py-1">Type</th><th>Weight</th></tr></thead>
          <tbody>
            <tr><td className="py-1">Attending</td><td>17.5</td></tr>
            <tr><td className="py-1">Senior Resident (PGY 3-4)</td><td>15.0</td></tr>
            <tr><td className="py-1">PA</td><td>10.0</td></tr>
            <tr><td className="py-1">Junior Resident (PGY 1-2)</td><td>7.5</td></tr>
            <tr><td className="py-1">Rotator</td><td>3.75</td></tr>
          </tbody>
        </table>
        <p className="font-semibold text-gray-700 mt-2">Status Multipliers</p>
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

      <Section title="Patient Load & Decay">
        <p>Each patient adds a weighted load based on acuity tier. Over time, weights decay as patients stabilize:</p>
        <table className="w-full text-left">
          <thead><tr className="border-b"><th className="py-1">Tier</th><th>Initial</th><th>Decay</th></tr></thead>
          <tbody>
            <tr><td className="py-1"><span className="text-red-600 font-semibold">Tier One</span></td><td>5</td><td>&rarr; 3 at 60m &rarr; 1 at 120m</td></tr>
            <tr><td className="py-1"><span className="text-amber-600 font-semibold">Tier Two</span></td><td>3</td><td>&rarr; 1 at 90m</td></tr>
            <tr><td className="py-1"><span className="text-violet-600 font-semibold">Tier Three</span></td><td>1</td><td>&rarr; 0 at 120m</td></tr>
          </tbody>
        </table>
        <p>
          Decay reflects clinical reality: a tier-one patient requires intense resources on arrival, but as they
          stabilize, the marginal workload decreases. Without decay, teams that received early critical patients
          would be permanently penalized even after the acute phase passes.
        </p>
      </Section>

      <Section title="The Buffer System">
        <p>
          When a patient is assigned, a temporary <strong>buffer</strong> is placed on that team. The buffer
          deprioritizes the team for <em>all</em> incoming patients — regardless of acuity tier — preventing
          immediate back-to-back assignments.
        </p>
        <p>
          The tier of the patient that <em>created</em> the buffer only determines its <strong>duration</strong>:
        </p>
        <table className="w-full text-left">
          <thead><tr className="border-b"><th className="py-1">Spawning Tier</th><th>Buffer Duration</th></tr></thead>
          <tbody>
            <tr><td className="py-1"><span className="text-red-600 font-semibold">Tier One</span></td><td>35 minutes</td></tr>
            <tr><td className="py-1"><span className="text-amber-600 font-semibold">Tier Two</span></td><td>25 minutes</td></tr>
            <tr><td className="py-1"><span className="text-violet-600 font-semibold">Tier Three</span></td><td>15 minutes</td></tr>
          </tbody>
        </table>
        <p>
          Any active buffer — whether spawned by a <span className="text-red-600 font-semibold">Tier One</span>,{' '}
          <span className="text-amber-600 font-semibold">Tier Two</span>, or{' '}
          <span className="text-violet-600 font-semibold">Tier Three</span> patient — deprioritizes the team equally.
          The colored bar on each team card shows active buffers. The bar shrinks as time passes; when it disappears,
          the buffer has expired and no longer affects the team's score.
        </p>
        <p>
          When multiple buffers stack on the same team, they are merged into a single bar showing the combined count
          and the latest expiration time.
        </p>
      </Section>

      <Section title="How Recommendations Work">
        <p>When you open the assignment screen, the system runs through these steps:</p>
        <ol className="list-decimal ml-4 space-y-1">
          <li><strong>Exclude Trauma (Team 4)</strong> — Team 4 never receives automatic recommendations.</li>
          <li><strong>Check buffers</strong> — Teams with any active buffer are deprioritized (buffer duration depends on the tier of the patient that created it, but the presence of any buffer affects ranking regardless of tier).</li>
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

      <Section title="Patient Nomenclature">
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>C-###</strong> — Critical / new arrival patient (e.g. C-001 — first critical patient of the shift)</li>
          <li><strong>F-###</strong> — Floor upgrade patient (e.g. F-001 — first floor upgrade)</li>
          <li><strong>Time on right</strong> — Time until next weight decay step (e.g. 47m = 47 minutes until next decay step)</li>
          <li><strong>w:N</strong> — Current acuity weight, shown when decreased from initial (e.g. w:3 means a Tier One patient has decayed from initial weight 5 down to 3)</li>
        </ul>
      </Section>
    </div>
  );
}
