// © 2026 New York University. All rights reserved.
import { useState } from 'react';
import type { AcuityTier, FloatModifier, Patient, Provider, ProviderType, TeamId } from '../types';
import { FLOAT_MODIFIER_LABELS, FLOAT_MODIFIER_MULTIPLIERS, DECEASED_BUFFER_MS } from '../constants';
import { useShift } from '../context/ShiftContext';
import { uid } from '../uid';
import {
  ACUITIES, ACUITY_CLASS, ACUITY_NAME, ALL_TEAMS, ROLE_LONG, ROLE_ORDER, TRAUMA, ago, baseWeight, clock, contribution, countMinutes,
  deceasedMinutesLeft, displayRatio, duration, isFloatPrimary, minutesLeft, providerLabel, teamName, teamPatients, teamProviders, timerRunning,
} from '../ui/model';
import Sheet, { Confirm, SheetHeader } from './Sheet';

type Dialog =
  | { kind: 'upgrade' | 'downgrade' | 'deceased' | 'reassign' | 'float' | 'correct'; patient: Patient }
  | { kind: 'provider'; provider: Provider | null }
  | { kind: 'remove'; provider: Provider }
  | { kind: 'signout' }
  | { kind: 'close' }
  | { kind: 'reopen' };

const DECEASED_MIN = Math.round(DECEASED_BUFFER_MS / 60000);

/** Colors above the current one (Red is highest). */
function higherTiers(t: AcuityTier): AcuityTier[] {
  return ACUITIES.slice(0, ACUITIES.indexOf(t));
}

/** Fix a wrongly entered color. The patient keeps its placed time, so its weight is read at the same age. */
function CorrectColorSheet({ p, now, onCancel, onPick }: { p: Patient; now: number; onCancel: () => void; onPick: (t: AcuityTier) => void }) {
  return (
    <Sheet label={`Correct color for ${p.id}`} onClose={onCancel}>
      <SheetHeader title={`Correct color · ${p.id}`} onClose={onCancel}
        sub={`Entered as ${ACUITY_NAME[p.acuity]}. Use this when the color was wrong; the placed time (${clock(p.upgradedAt ?? p.assignedAt)}) stays, unlike an upgrade.`} />
      <div className="opts">
        {ACUITIES.filter(t => t !== p.acuity).map(t => {
          const c = contribution({ ...p, acuity: t }, now);
          return (
            <button key={t} data-acuity={ACUITY_CLASS[t]} className="opt" onClick={() => onPick(t)}>
              <span className={`gl ${ACUITY_CLASS[t]}`} aria-hidden="true">{ACUITY_NAME[t][0]}</span>
              <span><b>{ACUITY_NAME[t]}</b><small className="num">would add {c.toFixed(2)} load now</small></span>
            </button>
          );
        })}
      </div>
      <div className="sheet-actions"><button className="btn" onClick={onCancel}>Cancel</button></div>
    </Sheet>
  );
}

function UpgradeSheet({ p, onCancel, onPick }: { p: Patient; onCancel: () => void; onPick: (t: AcuityTier) => void }) {
  return (
    <Sheet label={`Upgrade ${p.id}`} onClose={onCancel}>
      <SheetHeader title={`Upgrade ${p.id}`} onClose={onCancel}
        sub={`Now ${ACUITY_NAME[p.acuity]}. The timer restarts at the new color's full weight.`} />
      <div className="opts">
        {higherTiers(p.acuity).map(t => (
          <button key={t} data-acuity={ACUITY_CLASS[t]} className="opt" onClick={() => onPick(t)}>
            <span className={`gl ${ACUITY_CLASS[t]}`} aria-hidden="true">{ACUITY_NAME[t][0]}</span>
            <span><b>Upgrade to {ACUITY_NAME[t]}</b><small>{baseWeight(t)} units, counts for {countMinutes(t)} min</small></span>
          </button>
        ))}
      </div>
      <div className="sheet-actions"><button className="btn" onClick={onCancel}>Cancel</button></div>
    </Sheet>
  );
}

export function RoleSelect({ value, onChange, id, label }: { value: ProviderType; onChange: (t: ProviderType) => void; id?: string; label: string }) {
  return (
    <select id={id} aria-label={label} value={value} onChange={e => onChange(e.target.value as ProviderType)}>
      {ROLE_ORDER.map(r => <option key={r} value={r}>{ROLE_LONG[r]}</option>)}
    </select>
  );
}

function ProviderForm({ teamId, current, onCancel, onSave }: {
  teamId: TeamId; current: Provider | null; onCancel: () => void; onSave: (name: string, type: ProviderType) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ProviderType>(current?.type ?? 'attending');
  const title = current ? `Swap ${providerLabel(current)}` : `Add provider to ${teamName(teamId)}`;
  return (
    <Sheet label={title} onClose={onCancel}>
      <SheetHeader title={title} onClose={onCancel} sub={current ? `${ROLE_LONG[current.type]} on ${teamName(teamId)}. The new provider takes this place.` : undefined} />
      <form onSubmit={e => { e.preventDefault(); if (name.trim()) onSave(name.trim(), type); }}>
        <div className="lbl"><label htmlFor="pf-name">Name</label></div>
        <input id="pf-name" data-autofocus value={name} onChange={e => setName(e.target.value)} maxLength={60} autoComplete="off" placeholder="Last name" />
        <div className="lbl"><label htmlFor="pf-role">Role</label></div>
        <RoleSelect id="pf-role" label="Role" value={type} onChange={setType} />
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>{current ? 'Confirm swap' : 'Add provider'}</button>
        </div>
      </form>
    </Sheet>
  );
}

function TeamPicker({ title, sub, from, closedTeams, verb, onPick, onCancel }: {
  title: string; sub: string; from: TeamId; closedTeams: Record<number, number>; verb: string;
  onPick: (t: TeamId) => void; onCancel: () => void;
}) {
  const targets = ALL_TEAMS.filter(t => t !== from && !(t in closedTeams));
  return (
    <Sheet label={title} onClose={onCancel}>
      <SheetHeader title={title} sub={sub} onClose={onCancel} />
      <div className="opts">
        {targets.length === 0 && <p>No open team to receive them.</p>}
        {targets.map(t => (
          <button key={t} className="opt" onClick={() => onPick(t)}>
            <span><b>{verb} {teamName(t)}</b>{t === TRAUMA && <small>Outside recommendations</small>}</span>
          </button>
        ))}
      </div>
      <div className="sheet-actions"><button className="btn" onClick={onCancel}>Cancel</button></div>
    </Sheet>
  );
}

function PatientCard({ p, now, onAction }: { p: Patient; now: number; onAction: (k: Dialog['kind'], p: Patient) => void }) {
  const c = contribution(p, now);
  const left = minutesLeft(p, now);
  const running = timerRunning(p, now);
  const primary = isFloatPrimary(p);
  const cls = ACUITY_CLASS[p.acuity];
  const fm = p.floatModifier ?? 'none';
  return (
    <article className="pt">
      <div className="between">
        <h3><span className={`gl ${cls}`} aria-hidden="true">{ACUITY_NAME[p.acuity][0]}</span>{ACUITY_NAME[p.acuity]} <span className="muted num" style={{ fontWeight: 500 }}>· {p.id}</span></h3>
        <span style={{ display: 'flex', gap: 4 }}>
          {p.deceased && <span className="tag outline">Deceased</span>}
          {p.upgradedAt && <span className="tag outline">Upgraded</span>}
        </span>
      </div>
      <div className="meta num">Placed {clock(p.assignedAt)}, {ago(p.assignedAt, now)}{p.upgradedAt ? ` · upgraded ${clock(p.upgradedAt)}` : ''}</div>
      {p.signouts?.map((o, i) => <div key={i} className="meta signed num">Signed out from {teamName(o.fromTeamId)} at {clock(o.at)}</div>)}
      <div className="contrib"><span className="num">{c.toFixed(2)}</span><small className="muted">load contribution{fm !== 'none' ? ` (${FLOAT_MODIFIER_LABELS[fm]}, ${Math.round(FLOAT_MODIFIER_MULTIPLIERS[fm] * 100)}%)` : ''}</small></div>
      <div className="track"><i style={{ width: `${Math.min(100, c / baseWeight('tier_one') * 100)}%`, background: `var(--${cls}-fill)` }} /></div>
      <small className="muted">{p.deceased ? 'Not counted (deceased)' : primary ? 'Not counted (float primary)' : running ? `${duration(left)} until no longer counted` : 'No longer counted'}</small>
      <div className="acts">
        <button className="btn sm" disabled={p.acuity === 'tier_one'} onClick={() => onAction('upgrade', p)}>Upgrade{p.acuity === 'tier_one' ? '' : '…'}</button>
        <button className="btn sm" onClick={() => onAction('correct', p)}>Correct color</button>
        <button className="btn sm" onClick={() => onAction('downgrade', p)}>Downgrade</button>
        <button className="btn sm" onClick={() => onAction('reassign', p)}>Reassign</button>
        <button className="btn sm" disabled={!!p.deceased} onClick={() => onAction('deceased', p)}>{p.deceased ? 'Deceased' : 'Mark deceased'}</button>
        <button className="btn sm" onClick={() => onAction('float', p)}>{fm === 'none' ? 'Give to float' : `${fm === 'float_primary' ? 'Float' : FLOAT_MODIFIER_LABELS[fm]}${p.floatAttendingName ? ` · ${p.floatAttendingName}` : ''}`}</button>
      </div>
    </article>
  );
}

/**
 * Float for a patient already on a team. Only float primary is offered: the float takes the
 * patient and the team carries none of its load. Float supervising is hidden until attendings
 * can enter it after triage (Roundtable Decision 37); a patient already set to it still shows it.
 */
function FloatSheet({ p, names, onCancel, onPick }: { p: Patient; names: string[]; onCancel: () => void; onPick: (m: FloatModifier, name?: string) => void }) {
  const [typed, setTyped] = useState('');
  const list = names.length ? names : typed.trim() ? [typed.trim()] : [];
  const pct = (m: FloatModifier) => Math.round(FLOAT_MODIFIER_MULTIPLIERS[m] * 100);
  return (
    <Sheet label={`Give ${p.id} to the float`} onClose={onCancel}>
      <SheetHeader title={`Give to float · ${p.id}`} onClose={onCancel}
        sub={`The float takes this patient. It stays listed on ${teamName(p.assignedTeamId)} but adds no load there.`} />
      <div className="opts">
        <button className={`opt${!p.floatModifier || p.floatModifier === 'none' ? ' on' : ''}`} onClick={() => onPick('none')}>
          <span><b>No float</b><small>{teamName(p.assignedTeamId)} keeps the patient</small></span>
        </button>
        {p.floatModifier === 'float_supervising' && (
          <button className="opt on" onClick={onCancel}>
            <span><b>{FLOAT_MODIFIER_LABELS.float_supervising}</b><small>{p.floatAttendingName ? `Dr. ${p.floatAttendingName} · ` : ''}counts {pct('float_supervising')}% (set earlier)</small></span>
          </button>
        )}
        {names.length === 0 && (
          <div>
            <div className="lbl"><label htmlFor="float-name">Float attending</label></div>
            <input id="float-name" value={typed} onChange={e => setTyped(e.target.value)} placeholder="Last name" maxLength={60} />
          </div>
        )}
        {list.map(n => (
          <button key={n} className={`opt${p.floatModifier === 'float_primary' && p.floatAttendingName === n ? ' on' : ''}`} onClick={() => onPick('float_primary', n)}>
            <span><b>Dr. {n}</b><small>Float takes the patient · counts {pct('float_primary')}%</small></span>
          </button>
        ))}
      </div>
      <div className="sheet-actions"><button className="btn" onClick={onCancel}>Cancel</button></div>
    </Sheet>
  );
}

export default function TeamDetail({ teamId, onClose, onNote, onSignedOut }: { teamId: TeamId; onClose: () => void; onNote: (text: string) => void; onSignedOut?: () => void }) {
  const { state, dispatch, recommendation: rec, capacityWeights } = useShift();
  const [tab, setTab] = useState<'patients' | 'providers'>('patients');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const now = state.now;
  const s = rec.scores.find(x => x.teamId === teamId)!;
  const patients = teamPatients(state, teamId).sort((a, b) => b.assignedAt - a.assignedAt);
  const counted = patients.filter(p => timerRunning(p, now));
  const quiet = patients.filter(p => !timerRunning(p, now));
  const providers = teamProviders(state, teamId);
  const closed = teamId in state.closedTeams;
  const deceased = deceasedMinutesLeft(state, teamId);
  const done = (text: string) => { setDialog(null); onNote(text); };
  const openPatient = (kind: Dialog['kind'], patient: Patient) => setDialog({ kind, patient } as Dialog);

  return (
    <Sheet label={`${teamName(teamId)} detail`} onClose={() => { if (!dialog) onClose(); }} side>
      <SheetHeader
        title={<>{teamName(teamId)} {closed && <span className="tag outline">Closed</span>}</>}
        sub={`${teamId === TRAUMA ? 'Outside recommendations' : teamId === rec.first ? 'Recommended next' : 'A-side'} · as of ${clock(now)}`}
        onClose={onClose}
      />
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="td-ratio num">{displayRatio(s, rec.scores)}</div>
          <small className="muted num">{s.capacity === 0 ? 'no providers' : `current capacity = ${s.capacity.toFixed(1)} strength ÷ ${s.load.toFixed(2)} load`}</small>
        </div>
        {deceased > 0 && <span className="tag outline" title="Ranked last until it ends">Deceased · {deceased} min left</span>}
      </div>

      <div className="tabs" role="tablist" aria-label="Team detail sections">
        <button role="tab" aria-selected={tab === 'patients'} onClick={() => setTab('patients')}>Patients <span className="num">{patients.length}</span></button>
        <button role="tab" aria-selected={tab === 'providers'} onClick={() => setTab('providers')}>Providers <span className="num">{providers.length}</span></button>
      </div>

      <div role="tabpanel">
        {tab === 'patients' ? <>
          {counted.length === 0 && <p style={{ marginTop: 14 }}>No patients currently counted.</p>}
          {counted.map(p => <PatientCard key={p.id} p={p} now={now} onAction={openPatient} />)}
          {quiet.length > 0 && (
            <details className="quiet">
              <summary>No longer counted ({quiet.length})</summary>
              {quiet.map(p => <PatientCard key={p.id} p={p} now={now} onAction={openPatient} />)}
            </details>
          )}
          <p style={{ fontSize: 12, marginTop: 12 }}>Timers show how long each patient still adds to team load. They describe the model, not clinical status or readiness for discharge.</p>
        </> : <>
          {providers.length === 0 && <p style={{ marginTop: 14 }}>No providers on this team.</p>}
          {providers.map(p => (
            <div key={p.id} className="prov">
              <div className="who"><b>{providerLabel(p)}</b><small>{ROLE_LONG[p.type]} <span className="str num">Strength {capacityWeights[p.type]}</span></small></div>
              <button className="btn sm" onClick={() => setDialog({ kind: 'provider', provider: p })}>Swap</button>
              <button className="btn sm" onClick={() => setDialog({ kind: 'remove', provider: p })}>Remove</button>
            </div>
          ))}
          <button className="btn full" style={{ marginTop: 14 }} onClick={() => setDialog({ kind: 'provider', provider: null })}>+ Add provider</button>
          <details className="quiet scale">
            <summary>Provider strength scale</summary>
            <p>Team strength is the sum of its providers' strengths. The values are fixed for the study.</p>
            <table>
              <thead><tr><th>Provider</th><th>Strength</th></tr></thead>
              <tbody>{ROLE_ORDER.map(r => <tr key={r}><td>{ROLE_LONG[r]}</td><td className="num">{capacityWeights[r]}</td></tr>)}</tbody>
            </table>
          </details>
        </>}
      </div>

      <section className="danger-zone">
        <div className="lbl" style={{ marginTop: 0 }}>Team actions</div>
        <div className="opts">
          <button className="btn danger full" disabled={patients.length === 0} onClick={() => setDialog({ kind: 'signout' })}>
            Sign out all {patients.length} patient{patients.length === 1 ? '' : 's'} to another team
          </button>
          {closed
            ? <button className="btn full" onClick={() => setDialog({ kind: 'reopen' })}>Reopen team</button>
            : <button className="btn danger full" onClick={() => setDialog({ kind: 'close' })}>Close team</button>}
        </div>
      </section>
      <div className="foot">© 2026 New York University</div>

      {dialog?.kind === 'correct' && <CorrectColorSheet p={dialog.patient} now={now} onCancel={() => setDialog(null)}
        onPick={t => { dispatch({ type: 'CORRECT_COLOR', patientId: dialog.patient.id, toTier: t }); done(`${dialog.patient.id} corrected to ${ACUITY_NAME[t]}`); }} />}
      {dialog?.kind === 'upgrade' && <UpgradeSheet p={dialog.patient} onCancel={() => setDialog(null)}
        onPick={t => { dispatch({ type: 'UPGRADE_PATIENT', patientId: dialog.patient.id, toTier: t }); done(`${dialog.patient.id} upgraded to ${ACUITY_NAME[t]}`); }} />}
      {dialog?.kind === 'downgrade' && <Confirm title={`Downgrade ${dialog.patient.id}?`}
        body={<p>This takes the patient off the board and out of team load, for a patient who no longer belongs on the A-side. It does not record a clinical outcome.</p>} confirmLabel="Downgrade" danger
        onCancel={() => setDialog(null)} onConfirm={() => { dispatch({ type: 'DOWNGRADE_PATIENT', patientId: dialog.patient.id }); done(`${dialog.patient.id} downgraded`); }} />}
      {dialog?.kind === 'deceased' && <Confirm title={`Mark ${dialog.patient.id} deceased?`}
        body={<p>Starts a {DECEASED_MIN}-minute buffer on {teamName(teamId)}: the team is ranked last until it ends, unless every open team is buffered. The patient's load comes off the team now.</p>} confirmLabel="Mark deceased" danger
        onCancel={() => setDialog(null)} onConfirm={() => { dispatch({ type: 'DECEASE_PATIENT', patientId: dialog.patient.id }); done(`${dialog.patient.id} marked deceased`); }} />}
      {dialog?.kind === 'reassign' && <TeamPicker title={`Reassign ${dialog.patient.id}`} verb="Move to"
        sub="The patient keeps its timer; this corrects which team it is counted on." from={teamId} closedTeams={state.closedTeams}
        onCancel={() => setDialog(null)} onPick={t => { dispatch({ type: 'REASSIGN_PATIENT', patientId: dialog.patient.id, toTeamId: t, reason: 'Reassigned from team detail' }); done(`${dialog.patient.id} moved to ${teamName(t)}`); }} />}
      {dialog?.kind === 'float' && <FloatSheet p={dialog.patient} names={state.floatAttendings}
        onCancel={() => setDialog(null)} onPick={(m, n) => { dispatch({ type: 'SET_FLOAT_MODIFIER', patientId: dialog.patient.id, modifier: m, floatName: n }); done(m === 'none' ? `${dialog.patient.id} back on ${teamName(teamId)}` : `${dialog.patient.id} given to the float${n ? `, Dr. ${n}` : ''}`); }} />}
      {dialog?.kind === 'provider' && <ProviderForm teamId={teamId} current={dialog.provider} onCancel={() => setDialog(null)}
        onSave={(name, type) => {
          if (dialog.provider) dispatch({ type: 'SWAP_PROVIDER', outProviderId: dialog.provider.id, incoming: { name, type, teamId } });
          else dispatch({ type: 'ADD_PROVIDERS', providers: [{ id: uid(), name, type, status: 'active', statusExpiresAt: null, teamId }] });
          done(dialog.provider ? `${name} replaced ${dialog.provider.name}` : `${name} added to ${teamName(teamId)}`);
        }} />}
      {dialog?.kind === 'remove' && <Confirm title={`Remove ${providerLabel(dialog.provider)}?`}
        body={<p>{ROLE_LONG[dialog.provider.type]} leaves {teamName(teamId)}. This lowers the team's strength.</p>} confirmLabel="Remove" danger
        onCancel={() => setDialog(null)} onConfirm={() => { dispatch({ type: 'REMOVE_PROVIDER', providerId: dialog.provider.id }); done(`${dialog.provider.name} removed`); }} />}
      {dialog?.kind === 'signout' && <TeamPicker title={`Sign out ${teamName(teamId)}`} verb="Sign out to"
        sub={`Moves all ${patients.length} patients. Their load timers keep running.${closed ? ' The team stays closed until someone reopens it.' : ''}`}
        from={teamId} closedTeams={state.closedTeams}
        onCancel={() => setDialog(null)} onPick={t => { dispatch({ type: 'SIGNOUT_PATIENTS', fromTeamId: teamId, toTeamId: t }); setDialog(null); if (onSignedOut) onSignedOut(); else onNote(`${teamName(teamId)} signed out to ${teamName(t)}`); }} />}
      {dialog?.kind === 'close' && <Confirm title={`Close ${teamName(teamId)}?`}
        body={<p>Takes the team out of recommendations until someone reopens it. Its patients stay on it; move them with sign-out.</p>}
        confirmLabel="Close team" danger
        onCancel={() => setDialog(null)} onConfirm={() => { dispatch({ type: 'CLOSE_TEAM', teamId }); done(`${teamName(teamId)} closed`); }} />}
      {dialog?.kind === 'reopen' && <Confirm title={`Reopen ${teamName(teamId)}?`}
        body={<p>Returns the team to recommendations now.</p>} confirmLabel="Reopen"
        onCancel={() => setDialog(null)} onConfirm={() => { dispatch({ type: 'REOPEN_TEAM', teamId }); done(`${teamName(teamId)} reopened`); }} />}
    </Sheet>
  );
}
