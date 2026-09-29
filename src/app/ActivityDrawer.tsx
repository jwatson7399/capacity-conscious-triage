// © 2026 New York University. All rights reserved.
import { useEffect, useRef, useState } from 'react';
import { trapTab } from './focus';
import type { ActivityEvent, AssignEvent, RatioValue, TeamSnapshot } from '../activity';
import { undoneAssignIds } from '../activity';
import { FLOAT_MODIFIER_LABELS } from '../constants';
import { A_SIDE, ACUITY_CLASS, ACUITY_NAME, ROLE_LONG, TRAUMA, baseWeight, clock, countMinutes, formatRatio, teamName } from '../ui/model';

type Filter = 'all' | 'assign' | 'override';

function snapHigh(snap: TeamSnapshot[]): number {
  return snap.filter(s => A_SIDE.includes(s.teamId) && s.capacity > 0 && s.ratio !== 'infinity' && s.ratio >= 100).length;
}
function fmt(r: RatioValue, capacity: number, high: number): string {
  return formatRatio(r === 'infinity' ? Infinity : r, capacity, high);
}

function line(e: ActivityEvent, undone: Set<string>, undoneAt: Map<string, number>): { t1: string; t2: string; dot: string } {
  switch (e.kind) {
    case 'shift_start': return { t1: 'Shift started', t2: `${e.providerCount} providers. A-side ranking covers Teams 1 to 3; trauma is separate.`, dot: '' };
    case 'assign': {
      const sub = undone.has(e.id) ? `Undone at ${clock(undoneAt.get(e.id)!)}`
        : e.followed ? 'Followed recommendation'
        : e.override ? `Override · ${e.override.reasonLabel}${e.override.note ? `: ${e.override.note}` : ''}` : 'Override';
      return { t1: `${e.patientId} · ${ACUITY_NAME[e.acuity]} → ${teamName(e.chosenTeamId)}`, t2: sub + (e.auto ? ' · demo arrival' : ''), dot: ACUITY_CLASS[e.acuity] };
    }
    case 'floor_upgrade': return {
      t1: `${e.patientId} · floor upgrade, ${ACUITY_NAME[e.acuity]} on ${teamName(e.teamId)}`,
      t2: (undone.has(e.id) ? `Undone at ${clock(undoneAt.get(e.id)!)}` : 'Stays on its team · not a recommendation') + (e.auto ? ' · demo' : ''),
      dot: ACUITY_CLASS[e.acuity],
    };
    case 'undo': return { t1: `Undid ${e.patientId}`, t2: 'Assignment reversed', dot: 'hollow' };
    case 'reassign': return { t1: `${e.patientId} moved ${teamName(e.teamId)} → ${teamName(e.toTeamId!)}`, t2: e.reason ? `Reassigned · ${e.reason}` : 'Reassigned', dot: ACUITY_CLASS[e.acuity] };
    case 'upgrade': return { t1: `${e.patientId} upgraded to ${ACUITY_NAME[e.toAcuity ?? 'tier_one']}`, t2: `${teamName(e.teamId)} · was ${ACUITY_NAME[e.acuity]}`, dot: ACUITY_CLASS[e.toAcuity ?? 'tier_one'] };
    case 'downgrade': return { t1: `${e.patientId} downgraded`, t2: `Removed from ${teamName(e.teamId)} load`, dot: 'hollow' };
    case 'deceased': return { t1: `${e.patientId} marked deceased`, t2: `${teamName(e.teamId)} · 30-minute buffer started`, dot: 'hollow' };
    case 'float': return { t1: `${e.patientId} float: ${FLOAT_MODIFIER_LABELS[e.modifier]}`, t2: `${teamName(e.teamId)}${e.floatName ? ` · ${e.floatName}` : ''}`, dot: '' };
    case 'provider_add': return { t1: `${e.name} added`, t2: `${ROLE_LONG[e.providerType]} · ${teamName(e.teamId)}`, dot: '' };
    case 'provider_remove': return { t1: `${e.name} removed`, t2: `${ROLE_LONG[e.providerType]} · ${teamName(e.teamId)}`, dot: '' };
    case 'provider_swap': return { t1: `${e.replacedName ?? 'Provider'} swapped for ${e.name}`, t2: `${ROLE_LONG[e.providerType]} · ${teamName(e.teamId)}`, dot: '' };
    case 'team_close': return { t1: `${teamName(e.teamId)} closed`, t2: 'Out of recommendations', dot: '' };
    case 'team_reopen': return { t1: `${teamName(e.teamId)} reopened`, t2: 'Back in recommendations', dot: '' };
    case 'signout': return { t1: `${teamName(e.teamId)} signed out`, t2: `${e.patientCount} patient${e.patientCount === 1 ? '' : 's'} to ${teamName(e.toTeamId!)}`, dot: '' };
  }
}

function AssignDetail({ e, undoneTime }: { e: AssignEvent; undoneTime?: number }) {
  const high = snapHigh(e.snapshot);
  const before = e.snapshot.find(s => s.teamId === e.chosenTeamId);
  return (
    <div className="evd">
      <dl className="kv">
        <dt>Patient</dt><dd>{e.patientId} ({e.source === 'floor' ? 'floor upgrade' : 'new arrival'})</dd>
        <dt>Acuity</dt><dd>{ACUITY_NAME[e.acuity]}, {baseWeight(e.acuity)} unit{baseWeight(e.acuity) > 1 ? 's' : ''} at start, counts for {countMinutes(e.acuity)} min</dd>
        <dt>Placed on</dt><dd>{teamName(e.chosenTeamId)}</dd>
        <dt>Recommended</dt><dd>{e.recommendedTeamId ? teamName(e.recommendedTeamId) : 'None'}{e.nextRankedTeamId ? `; next-ranked ${teamName(e.nextRankedTeamId)}` : ''}</dd>
        {e.override && <><dt>Reason</dt><dd>{e.override.reasonLabel}{e.override.note ? `: ${e.override.note}` : ''}</dd></>}
        {before && <><dt>{teamName(e.chosenTeamId)} before</dt><dd className="num">{fmt(before.ratio, before.capacity, high)}</dd></>}
        <dt>Entered by</dt><dd>{e.auto ? 'Demo clock (simulated)' : 'This device'}</dd>
        {undoneTime !== undefined && <><dt>Status</dt><dd>Undone at {clock(undoneTime)}</dd></>}
      </dl>
      <div className="snap">
        {e.snapshot.filter(s => s.teamId !== TRAUMA).map(s => (
          <span key={s.teamId} className={s.teamId === e.chosenTeamId ? 'hit' : ''}>{teamName(s.teamId)}<b className="num">{fmt(s.ratio, s.capacity, high)}</b></span>
        ))}
      </div>
      <div className="t2" style={{ marginTop: 6, fontSize: 11, color: 'var(--tx3)' }}>Ratios at the moment of assignment, before this patient.</div>
    </div>
  );
}

export default function ActivityDrawer({ events, onClose }: { events: ActivityEvent[]; onClose: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.scrim')) return; // a sheet above handles its own keys
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) trapTab(e, ref.current);
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (opener && document.contains(opener)) opener.focus({ preventScroll: true }); };
  }, [onClose]);

  const undone = undoneAssignIds(events);
  const undoneAt = new Map<string, number>();
  for (const e of events) if (e.kind === 'undo' && e.undoesEventId) undoneAt.set(e.undoesEventId, e.at);
  const live = events.filter((e): e is AssignEvent => e.kind === 'assign' && !undone.has(e.id) && e.chosenTeamId !== TRAUMA);
  const overrides = live.filter(e => !e.followed).length;
  const list = [...events].reverse().filter(e =>
    filter === 'all' ? true : filter === 'assign' ? e.kind === 'assign' : e.kind === 'assign' && !e.followed);

  return <>
    <div className="lscrim" onClick={onClose} />
    <aside ref={ref} className="logp" role="dialog" aria-modal="true" aria-label="Shift activity">
      <div className="logh">
        <div className="between" style={{ alignItems: 'center' }}>
          <h2>Shift activity</h2>
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>
        <div className="lstats">
          <div><b className="num">{live.length}</b><small>A-side assigned</small></div>
          <div><b className="num">{live.length ? `${Math.round((live.length - overrides) / live.length * 100)}%` : 'n/a'}</b><small>followed rec.</small></div>
          <div><b className="num">{overrides}</b><small>overrides</small></div>
        </div>
        <div className="lfil" role="group" aria-label="Filter">
          {([['all', 'All'], ['assign', 'Assignments'], ['override', 'Overrides']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="llist">
        {list.length === 0 && <div style={{ padding: '30px 18px', color: 'var(--tx3)' }}>Nothing yet this shift.</div>}
        {list.map(e => {
          const l = line(e, undone, undoneAt);
          const expandable = e.kind === 'assign';
          const isOpen = !!open[e.id];
          return (
            <div key={e.id} className={`ev${isOpen ? ' open' : ''}${undone.has(e.id) ? ' undone' : ''}`}>
              <button disabled={!expandable} aria-expanded={expandable ? isOpen : undefined} onClick={() => setOpen(o => ({ ...o, [e.id]: !o[e.id] }))}>
                <span className="tm num">{clock(e.at)}</span>
                <span className={`dot ${l.dot}`} />
                <span><div className="t1">{l.t1}</div><div className="t2">{e.kind === 'assign' && !e.followed && !undone.has(e.id) ? <span className="ov">{l.t2}</span> : l.t2}</div></span>
                <span className="chev" aria-hidden="true">{expandable ? '▸' : ''}</span>
              </button>
              {expandable && isOpen && <AssignDetail e={e as AssignEvent} undoneTime={undoneAt.get(e.id)} />}
            </div>
          );
        })}
      </div>
      <div className="foot" style={{ borderTop: '1px solid var(--line)' }}>Held in memory on this device only. Cleared when the shift ends or the page reloads. © 2026 New York University</div>
    </aside>
  </>;
}
