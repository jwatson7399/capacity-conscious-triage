// © 2026 New York University. All rights reserved.
import { useEffect, useRef, useState } from 'react';
import type { AcuityTier, Recommendation, TeamId } from '../types';
import { OVERRIDE_REASONS, type OverrideReasonCode } from '../activity';
import {
  ACUITIES, ACUITY_CLASS, ACUITY_HINT, ACUITY_NAME, ALL_TEAMS, TRAUMA, baseWeight, displayRatio, formatRatio, highCount,
  ratioAfter, teamName,
} from '../ui/model';
import Sheet, { SheetHeader } from './Sheet';

export function AssignPanel({ rec, armed, floor, onArm, onFloor, onPlace, onPlaceFloor, onFloat, onOther }: {
  rec: Recommendation;
  armed: AcuityTier | null;
  floor: boolean;
  onArm: (a: AcuityTier | null) => void;
  onFloor: () => void;
  onPlace: () => void;
  /** Floor upgrade: the patient stays on the team they already belong to. */
  onPlaceFloor: (teamId: TeamId) => void;
  /** The float takes this arrival (no load on any team). */
  onFloat: () => void;
  onOther: () => void;
}) {
  const s1 = rec.scores.find(s => s.teamId === rec.first);
  const high = highCount(rec.scores);
  const ref = useRef<HTMLDivElement>(null);
  // Publish the panel's height so the board can leave that much room below its content.
  useEffect(() => {
    const el = ref.current;
    const root = document.getElementById('cct-root');
    if (!el || !root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => root.style.setProperty('--keys-h', `${Math.ceil(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty('--keys-h'); };
  }, []);
  return (
    <div ref={ref} className="keys" data-tour="assign" role="region" aria-label="Assign the next patient">
      <div className="lab">
        <span>{floor ? <>Upgrade stays on <b>the patient's current team</b></>
          : rec.first ? <>Next patient to <b>{teamName(rec.first)}</b></> : <b>No eligible team</b>}</span>
        <span className="sp" />
        <button className={`fl${floor ? ' on' : ''}`} onClick={onFloor} aria-pressed={floor}>
          <i aria-hidden="true">{floor ? '✓' : ''}</i>Floor upgrade
        </button>
      </div>
      <div className="krow">
        {ACUITIES.map(a => (
          <button key={a} className={`key ${ACUITY_CLASS[a]}${armed === a ? ' on' : ''}${armed && armed !== a ? ' dim' : ''}`}
            onClick={() => onArm(armed === a ? null : a)} aria-pressed={armed === a} title={ACUITY_HINT[a]}>
            <b>{ACUITY_NAME[a]}</b><small>{baseWeight(a)} unit{baseWeight(a) > 1 ? 's' : ''}</small>
          </button>
        ))}
      </div>
      {armed && floor && (
        <div className="go fteams" role="group" aria-label="Which team is the patient on?">
          {ALL_TEAMS.map(t => {
            const s = rec.scores.find(x => x.teamId === t);
            return (
              <button key={t} className="place" onClick={() => onPlaceFloor(t)} disabled={!s}>
                {t === TRAUMA ? 'Trauma' : teamName(t)}
                {s && <small className="num">{displayRatio(s, rec.scores)} → {formatRatio(ratioAfter(s, armed), s.capacity, high)}</small>}
              </button>
            );
          })}
        </div>
      )}
      {armed && !floor && (
        <div className="go">
          <button className="place" onClick={onPlace} disabled={!s1}>
            {s1 ? <>Place {ACUITY_NAME[armed]} on {teamName(s1.teamId)}
              <small className="num">{displayRatio(s1, rec.scores)} → {formatRatio(ratioAfter(s1, armed), s1.capacity, high)}</small></> : 'No eligible team'}
          </button>
          <button className="alt" onClick={onFloat} disabled={!s1} title="The float attending takes this patient; no team load">Float</button>
          <button className="alt" onClick={onOther}>Other team</button>
        </div>
      )}
    </div>
  );
}

/** Pick the float attending who takes a new arrival. */
export function FloatArrivalSheet({ names, onCancel, onPick }: { names: string[]; onCancel: () => void; onPick: (name?: string) => void }) {
  const [typed, setTyped] = useState('');
  return (
    <Sheet label="Give to float" onClose={onCancel}>
      <SheetHeader title="Give to float" onClose={onCancel}
        sub="The float attending takes this patient. It is listed on the recommended team for the record but adds no load, so that team stays first for the next patient." />
      <div className="opts">
        {names.map(n => <button key={n} className="opt" onClick={() => onPick(n)}><b>Dr. {n}</b></button>)}
        {names.length === 0 && (
          <div>
            <div className="lbl"><label htmlFor="float-arrival-name">Float attending (optional)</label></div>
            <input id="float-arrival-name" value={typed} onChange={e => setTyped(e.target.value)} placeholder="Last name" maxLength={60} />
          </div>
        )}
      </div>
      <div className="sheet-actions">
        <button className="btn" onClick={onCancel}>Cancel</button>
        {names.length === 0 && <button className="btn primary" onClick={() => onPick(typed.trim() || undefined)}>Give to float</button>}
      </div>
    </Sheet>
  );
}

export function OverrideSheet({ rec, closedTeams, initialAcuity, onCancel, onAssign }: {
  rec: Recommendation;
  closedTeams: Record<number, number>;
  initialAcuity: AcuityTier | null;
  onCancel: () => void;
  onAssign: (o: { teamId: TeamId; acuity: AcuityTier; reasonCode: OverrideReasonCode; note: string }) => void;
}) {
  const [team, setTeam] = useState<TeamId | null>(null);
  const [acuity, setAcuity] = useState<AcuityTier | null>(initialAcuity);
  const [reason, setReason] = useState<OverrideReasonCode | null>(null);
  const [note, setNote] = useState('');
  const ok = !!(team && acuity && reason && (reason !== 'other' || note.trim()));
  const rf = rec.first;

  return (
    <Sheet label="Assign to another team" onClose={onCancel}>
      <SheetHeader title="Assign to another team" onClose={onCancel}
        sub={rf ? `${teamName(rf)} is recommended. Your reason is saved with the assignment.` : 'No team is recommended right now. Your reason is saved with the assignment.'} />
      <div className="lbl">Team</div>
      <div className="opts c4">
        {ALL_TEAMS.map(t => {
          const s = rec.scores.find(x => x.teamId === t)!;
          const closed = t in closedTeams;
          return (
            <button key={t} className={`opt${team === t ? ' on' : ''}`} disabled={t === rf || closed} onClick={() => setTeam(t)} aria-pressed={team === t}>
              <span><b>{t === TRAUMA ? 'Trauma' : teamName(t)}</b>
                <small className="num">{t === rf ? 'Recommended' : closed ? 'Closed' : displayRatio(s, rec.scores)}</small></span>
            </button>
          );
        })}
      </div>
      <div className="lbl">Acuity</div>
      <div className="opts c3">
        {ACUITIES.map(a => (
          <button key={a} data-acuity={ACUITY_CLASS[a]} className={`opt${acuity === a ? ' on' : ''}`} onClick={() => setAcuity(a)} aria-pressed={acuity === a}>
            <span className={`gl ${ACUITY_CLASS[a]}`} aria-hidden="true">{ACUITY_NAME[a][0]}</span>{ACUITY_NAME[a]}
          </button>
        ))}
      </div>
      <div className="lbl">{rf ? `Why not ${teamName(rf)}?` : 'Reason'}</div>
      <div className="opts">
        {OVERRIDE_REASONS.map(r => (
          <button key={r.code} className={`opt${reason === r.code ? ' on' : ''}`} onClick={() => setReason(r.code)} aria-pressed={reason === r.code}>
            <span><b>{r.label}</b>{r.hint && <small>{r.hint}</small>}</span>
          </button>
        ))}
      </div>
      {reason === 'other' && (
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Short note, no patient identifiers" aria-label="Note (required)" maxLength={200} />
      )}
      <button className="btn primary lg full" style={{ marginTop: 14 }} disabled={!ok}
        onClick={() => ok && onAssign({ teamId: team!, acuity: acuity!, reasonCode: reason!, note: note.trim() })}>
        Assign{team ? ` to ${teamName(team)}` : ''}
      </button>
    </Sheet>
  );
}
