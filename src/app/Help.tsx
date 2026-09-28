// © 2026 New York University. All rights reserved.
//
// Help, written from scratch for the Carbon build. It quotes no benchmark figures.
import { useEffect } from 'react';
import { CAPACITY_WEIGHTS, DECEASED_BUFFER_MS, FLOAT_MODIFIER_MULTIPLIERS } from '../constants';
import { ACUITIES, ACUITY_NAME, ROLE_LONG, ROLE_ORDER, baseWeight, countMinutes } from '../ui/model';

function Page({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
    window.addEventListener('keydown', onKey);
    window.scrollTo(0, 0);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);
  return (
    <div className="overlay-page" style={{ position: 'fixed', inset: 0, zIndex: 80, overflowY: 'auto', background: 'var(--bg)' }} role="dialog" aria-modal="true" aria-label={title}>
      <header className="appbar">
        <button className="btn quiet" onClick={onBack} autoFocus>‹ Back</button>
        <span className="ttl" style={{ fontSize: 20 }}>{title}</span>
      </header>
      <article className="prose">{children}
        <div className="foot">© 2026 New York University</div>
      </article>
    </div>
  );
}

export function Help({ onBack }: { onBack: () => void }) {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <Page title="Help" onBack={onBack}>
      <p>This board suggests which A-side team should take the next patient. It never places anyone on its own. You decide every assignment.</p>

      <h2>Reading the board</h2>
      <p>Each column is one team on a shared scale. A fuller column means more room. The number on it is the team's strength divided by its current patient load. The outlined column is the team recommended next.</p>
      <p>Below the columns, each team's bar shows its patients. Every segment is one patient, sized by what that patient adds to the load right now, so a new Red is visibly four times a new Purple.</p>
      <p>A number of 100 or more shows as ∞, because the team has far more room than it needs. When two or more A-side teams are at 100 or more at the same time, they show whole numbers instead so you can compare them. A team with no load always shows ∞.</p>

      <h2>Placing a patient</h2>
      <ol>
        <li>Tap the acuity: Red, Yellow or Purple. Nothing is placed yet.</li>
        <li>The recommended column shows a preview: a dashed line where the team will land and stripes over what this patient takes.</li>
        <li>Tap <b>Place</b> to put the patient on that team.</li>
      </ol>
      <p>To use a different team, tap <b>Other team</b>, pick the team and give a reason: continuity or bounce-back, a team or attending request, or other with a short note. The reason is saved with the assignment.</p>
      <p>Tick <b>Floor upgrade</b> first when the patient is coming up from elsewhere in the department. The patient number then starts with F instead of C.</p>
      <p>After a placement you have 30 seconds to undo it. Undo covers assignments only.</p>

      <h2>Team details</h2>
      <p>Tap any column or team row to open it. A tap never assigns anyone. From there you can:</p>
      <ul>
        <li><b>Upgrade</b> to a higher color. The timer restarts at that color's full weight.</li>
        <li><b>Downgrade</b> a patient who no longer belongs on the A-side. It leaves the board.</li>
        <li><b>Reassign</b> a patient entered on the wrong team. The patient keeps its timer; this corrects which team it is counted on.</li>
        <li><b>Mark deceased.</b> The team is ranked last for {Math.round(DECEASED_BUFFER_MS / 60000)} minutes, shown as a tag with minutes left.</li>
        <li>Set a <b>float</b> attending. Float supervising counts the patient at {pct(FLOAT_MODIFIER_MULTIPLIERS.float_supervising)}; float primary counts it at {pct(FLOAT_MODIFIER_MULTIPLIERS.float_primary)}, so it shows as not counted for this team.</li>
        <li>Swap, add or remove providers.</li>
        <li>Close the team or sign out all its patients. A closed team leaves the recommendations and stays closed until someone reopens it. Its patients move only when you sign them out.</li>
      </ul>
      <p>Patient timers describe the model: how long the patient still adds to team load. They say nothing about clinical status or readiness for discharge.</p>

      <h2>The numbers behind it</h2>
      <table>
        <thead><tr><th>Provider</th><th>Strength</th></tr></thead>
        <tbody>{ROLE_ORDER.map(r => <tr key={r}><td>{ROLE_LONG[r]}</td><td className="num">{CAPACITY_WEIGHTS[r]}</td></tr>)}</tbody>
      </table>
      <p style={{ fontSize: 13 }}>Strengths are fixed for the study.</p>
      <table>
        <thead><tr><th>Acuity</th><th>Load at placement</th><th>Counts for</th></tr></thead>
        <tbody>{ACUITIES.map(a => <tr key={a}><td>{ACUITY_NAME[a]}</td><td className="num">{baseWeight(a)}</td><td className="num">{countMinutes(a)} min</td></tr>)}</tbody>
      </table>
      <p>Each patient's load shrinks steadily to zero over its time. Trauma (Team 4) is shown on its own and is never recommended. Closed teams and teams with no providers are not recommended either. When two teams tie, the one that took a patient least recently goes first.</p>

      <h2>What it keeps</h2>
      <p>No patient names or record numbers. The shift activity list stays in memory on this device and is cleared when the shift ends or the page reloads.</p>
    </Page>
  );
}

export function HowItWorks({ onBack }: { onBack: () => void }) {
  return (
    <Page title="How it works" onBack={onBack}>
      <p>Round-robin gives each team the next patient in turn. It does not look at who is on each team or how sick their current patients are.</p>
      <p>This board does. For each team it adds up provider strength (an attending counts more than an intern) and divides by patient load (a Red counts more than a Purple, and recent patients count more than ones placed hours ago). The team with the most room for its staffing is suggested next.</p>
      <p>Patient load fades over time. A Red counts for {countMinutes('tier_one')} minutes, a Yellow for {countMinutes('tier_two')} and a Purple for {countMinutes('tier_three')}, shrinking steadily until the patient no longer counts. That keeps the number close to how busy the team is now, not how busy it was at the start of the shift.</p>
      <p>The suggestion is advice. The charge nurse places every patient, and can send a patient elsewhere with a reason whenever the board does not match what is happening at the bedside.</p>
    </Page>
  );
}
