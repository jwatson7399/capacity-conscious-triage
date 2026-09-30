// © 2026 New York University. All rights reserved.
//
// The schedule controls on a live board: what the board is following, when the next shift change
// is, loading a newer or resent schedule, and stopping. Also the role picker for residents the
// sheet gives no level for, shared with the setup screen.
import { useEffect, useState } from 'react';
import type { ProviderType } from '../types';
import { useShift } from '../context/ShiftContext';
import { ROLE_LONG, ROLE_ORDER, clock } from '../ui/model';
import { displayName, slotsOf } from '../schedule/follow';
import { loadWeek, readWeek, storeRead, type ReadWeek } from '../schedule/storage';
import { mergeWeek, nextChange, rosterAt, weekRange } from '../schedule/week';
import { scheduleReadiness, scheduleRange } from '../schedule/start';
import Sheet, { Confirm, Copyright, SheetHeader } from './Sheet';

/** Pick a role for each resident the sheet gives no level for. Nothing is saved until every one has a role. */
export function RoleFixes({ names, fixes, onChange }: { names: string[]; fixes: Record<string, ProviderType>; onChange: (name: string, t: ProviderType) => void }) {
  return (
    <div className="card" style={{ marginTop: 12, padding: 16 }}>
      <b>{names.length} resident{names.length === 1 ? ' has' : 's have'} no level on the sheet</b>
      <p className="muted" style={{ margin: '4px 0 10px', fontSize: 13 }}>Pick a role for each. The app will not guess, because the role sets the team's strength. Your choice is kept on this device for later weeks.</p>
      {names.map(n => (
        <div key={n} className="prov">
          <div className="who"><b>{displayName(n)}</b></div>
          <select style={{ width: 170 }} aria-label={`Role for ${displayName(n)}`} value={fixes[n.toLowerCase()] ?? ''}
            onChange={e => onChange(n, e.target.value as ProviderType)}>
            <option value="" disabled>Pick a role</option>
            {ROLE_ORDER.map(r => <option key={r} value={r}>{ROLE_LONG[r]}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}


function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Header chip on a live board that follows a schedule. */
export function ScheduleChip({ onOpen }: { onOpen: () => void }) {
  const { state, follow } = useShift();
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 700px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 700px)');
    const f = () => setWide(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  // On a phone the header has no room; the schedule is in the menu instead.
  if (!follow || !wide) return null;
  const { slots, floats } = slotsOf(follow.week);
  const ended = rosterAt(slots, state.now).length === 0;
  const next = nextChange(slots, state.now, floats);
  return (
    <button className="pill" onClick={onOpen} aria-label="Schedule" title="The board follows the uploaded schedule"
      style={{ fontSize: 12, padding: '0 10px', gap: 6, whiteSpace: 'nowrap' }}>
      <span>Schedule</span>{ended ? <span style={{ color: 'var(--danger)' }}>ended</span> : next !== null && <span className="num muted">next {clock(next)}</span>}
    </button>
  );
}

export function ScheduleSheet({ onClose, onNote }: { onClose: () => void; onNote: (t: string) => void }) {
  const { state, dispatch, follow } = useShift();
  const [pending, setPending] = useState<ReadWeek | null>(null);
  const [fixes, setFixes] = useState<Record<string, ProviderType>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  if (!follow) return null;
  const range = weekRange(follow.week);
  const { slots, floats } = slotsOf(follow.week);
  const next = nextChange(slots, state.now, floats);
  const held = follow.held;
  const unresolvedNow = pending ? pending.needsRole.filter(n => !fixes[n.toLowerCase()]) : [];

  const readFile = async (file: File) => {
    setError(null);
    try { setPending(readWeek(await file.arrayBuffer(), file.name, follow.week.roleFixes)); setFixes({}); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read that file.'); }
  };
  const save = () => {
    if (!pending) return;
    const candidate = mergeWeek(null, pending.days, pending.source, { ...follow.week.roleFixes, ...fixes }, state.now);
    if (!scheduleReadiness(candidate, state.now).canStart) { setError(`${scheduleRange(candidate)}: ${scheduleReadiness(candidate, state.now).reason}`); return; }
    const w = storeRead(loadWeek() ?? follow.week, pending, fixes);
    dispatch({ type: 'SCHEDULE_UPDATE', week: w });
    setPending(null);
    onNote(`Schedule updated from ${pending.source}`);
    onClose();
  };

  return (
    <Sheet label="Schedule" onClose={onClose}>
      <SheetHeader title="Schedule" onClose={onClose}
        sub="The board adds and removes people at their scheduled times. Changes you make by hand stay as you set them." />
      {!pending && <>
        {range && <p style={{ margin: 0 }}>Following {dayLabel(range.first)} to {dayLabel(range.last)}{follow.week.sources.length ? ` (${follow.week.sources[follow.week.sources.length - 1]})` : ''}.</p>}
        <p className="num" style={{ marginTop: 6 }}>{next !== null ? `Next change at ${clock(next)}.` : 'No more changes on this schedule.'}</p>
        {held.length > 0 && <p className="muted" style={{ fontSize: 13 }}>Kept open by hand: {held.map(t => `Team ${t}`).join(', ')}. The schedule takes over again when it next opens {held.length === 1 ? 'it' : 'them'}.</p>}
        {rosterAt(slotsOf(follow.week).slots, state.now).length === 0 && <p role="alert" style={{ color: 'var(--danger)' }}>The schedule has nobody on shift now, so the board is holding as it is. Load the new week to keep following shift changes.</p>}
        <div className="opts">
          <label className="btn full" style={{ position: 'relative' }}>
            Load a newer or resent schedule (.xlsx)
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="visually-hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }} />
          </label>
          <button className="btn danger full" onClick={() => setConfirmStop(true)}>Stop following the schedule</button>
        </div>
        {error && <p role="alert" style={{ marginTop: 12, color: 'var(--danger)' }}>{error}</p>}
      </>}
      {pending && <>
        <div className="lbl">Check {pending.source}</div>
        <p style={{ margin: 0 }}>{pending.days.length} days, {dayLabel(pending.days[0].isoDate)} to {dayLabel(pending.days[pending.days.length - 1].isoDate)}. Days with the same dates are replaced from now on; your hand changes stay.</p>
        {pending.corrected > 0 && <p className="muted" style={{ fontSize: 13 }}>The sheet's dates did not match their weekdays, so the year was corrected for {pending.corrected} day{pending.corrected === 1 ? '' : 's'}.</p>}
        {pending.needsRole.length > 0 && <RoleFixes names={pending.needsRole} fixes={fixes} onChange={(n, t) => setFixes(f => ({ ...f, [n.toLowerCase()]: t }))} />}
        <div className="sheet-actions">
          <button className="btn" onClick={() => setPending(null)}>Cancel</button>
          <button className="btn primary" disabled={unresolvedNow.length > 0} onClick={save}>
            {unresolvedNow.length > 0 ? `Pick ${unresolvedNow.length} more role${unresolvedNow.length === 1 ? '' : 's'}` : 'Use this schedule'}
          </button>
        </div>
      </>}
      {pending && error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      <Copyright />
      {confirmStop && <Confirm title="Stop following the schedule?" danger confirmLabel="Stop"
        body={<p>The board keeps the people on it now. From here, shift changes are made by hand in team detail.</p>}
        onCancel={() => setConfirmStop(false)} onConfirm={() => { dispatch({ type: 'SCHEDULE_STOP' }); setConfirmStop(false); onNote('Stopped following the schedule'); onClose(); }} />}
    </Sheet>
  );
}
