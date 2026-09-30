// © 2026 New York University. All rights reserved.
import { useEffect, useRef, useState } from 'react';
import type { Provider, ProviderType, TeamId } from '../types';
import type { DaySchedule } from '../utils/scheduleParser';
import { ROLE_LONG, ROLE_ORDER, clock, hourMinute, teamName } from '../ui/model';
import { loadSampleSchedule, providersAt } from '../ui/samples';
import { uid } from '../uid';
import { RoleSelect } from './TeamDetail';
import { loadDraft, saveDraft, type DraftEntry, type DraftTeam } from './draft';
import Sheet, { Confirm, SheetHeader } from './Sheet';
import { CctMark } from './HomeArt';
import { clearWeek, loadWeek, readWeek, storeRead, type ReadWeek } from '../schedule/storage';
import { floatsAt, rosterAt, weekRange, type StoredWeek } from '../schedule/week';
import { displayName, slotsOf } from '../schedule/follow';
import { RoleFixes } from './ScheduleMenu';

function Roster({ team, entries, onChange, onAdd, onRemove }: {
  team: DraftTeam;
  entries: DraftEntry[];
  onChange: (id: string, patch: Partial<DraftEntry>) => void;
  onAdd: (team: DraftTeam) => void;
  onRemove: (e: DraftEntry) => void;
}) {
  const title = team === 0 ? 'Float attendings' : teamName(team);
  return (
    <section className="card roster" aria-label={title}>
      <div className="between" style={{ alignItems: 'baseline', marginBottom: 8 }}>
        <h3>{title}</h3>
        <span className="num muted">{entries.filter(e => e.name.trim()).length}</span>
      </div>
      {team === 4 && <small className="muted">Shown on the board, outside recommendations</small>}
      {team === 0 && <small className="muted">Available to any A-side team as a float modifier</small>}
      {entries.map((e, i) => (
        <div key={e.id} className="rentry">
          <input aria-label={`${title}, provider ${i + 1} name`} value={e.name} placeholder="Last name" maxLength={60}
            data-entry={e.id} onChange={ev => onChange(e.id, { name: ev.target.value })}
            onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); onAdd(team); } }} />
          <button className="btn icon-btn" aria-label={`Remove ${e.name || 'empty entry'}`} onClick={() => onRemove(e)}>×</button>
          {team === 0
            ? <small className="muted">Attending</small>
            : <RoleSelect label={`Role for ${e.name || `provider ${i + 1}`}`} value={e.type} onChange={t => onChange(e.id, { type: t })} />}
          {(e.endsAt !== undefined || e.note) && <small className="muted rnote" style={{ gridColumn: '1 / -1', fontSize: 12 }}>{e.endsAt !== undefined ? `Until ${clock(e.endsAt)}` : ''}{e.endsAt !== undefined && e.note ? ' · ' : ''}{e.note ?? ''}</small>}
        </div>
      ))}
      <button className="btn full" style={{ marginTop: 10 }} onClick={() => onAdd(team)}>+ Add {team === 0 ? 'float attending' : 'provider'}</button>
    </section>
  );
}

type Row = { key: string; name: string; type: ProviderType; team: DraftTeam; scheduleKey?: string; share?: number; endsAt?: number; note?: string; needsRole?: boolean };

const DAY_MS = 86_400_000;
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function atHour(iso: string, h: number): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, h).getTime();
}

function ScheduleSheet({ onCancel, onApply }: { onCancel: () => void; onApply: (entries: DraftEntry[], week: StoredWeek | null) => void }) {
  const [week, setWeek] = useState<StoredWeek | null>(() => loadWeek());
  const [pending, setPending] = useState<ReadWeek | null>(null);
  const [fixes, setFixes] = useState<Record<string, ProviderType>>({});
  const [sample, setSample] = useState<DaySchedule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [teams, setTeams] = useState<Record<string, DraftTeam>>({});
  const [at, setAt] = useState<number>(() => Date.now());

  const readFile = async (file: File) => {
    setError(null); setBusy(true);
    try {
      const read = readWeek(await file.arrayBuffer(), file.name, week?.roleFixes ?? {});
      setPending(read); setFixes({}); setSample(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read that file.'); }
    finally { setBusy(false); }
  };
  const saveRead = () => {
    if (!pending) return;
    const w = storeRead(week, pending, fixes);
    setWeek(w); setPending(null); setTeams({});
    const range = weekRange(w)!;
    const now = Date.now();
    setAt(now >= atHour(range.first, 0) && now < atHour(range.last, 0) + DAY_MS ? now : atHour(pending.days[0].isoDate, 10));
  };
  const loadSample = async () => {
    setError(null); setBusy(true);
    try { setSample(await loadSampleSchedule()); setPending(null); setTeams({}); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the sample.'); }
    finally { setBusy(false); }
  };

  // Who is on at the chosen moment.
  const rows: Row[] = [];
  let sampleDay = 0;
  if (sample) {
    sampleDay = Math.min(Math.max(0, Math.floor((at - atHour(isoToday(), 0)) / DAY_MS)), sample.length - 1);
    const { providers, floatAttendings } = providersAt(sample[sampleDay], new Date(at).getHours());
    providers.forEach((p, i) => rows.push({ key: `p${i}-${p.name}`, name: p.name, type: p.type, team: p.teamId }));
    floatAttendings.forEach((n, i) => rows.push({ key: `f${i}-${n}`, name: n, type: 'attending', team: 0 }));
  } else if (week && !pending) {
    const { slots, floats } = slotsOf(week);
    rosterAt(slots, at).forEach(e => rows.push({ key: e.scheduleKey, name: displayName(e.name), type: e.type, team: e.teamId, scheduleKey: e.scheduleKey, share: e.share, endsAt: e.endsAt, note: e.note }));
    floatsAt(floats, at).forEach(n => rows.push({ key: `float-${n}`, name: displayName(n), type: 'attending', team: 0 }));
  }
  // Teams in order (Float last), attendings first, as on the board.
  const teamOrder = (t: DraftTeam) => (t === 0 ? 9 : t);
  rows.sort((a, b) => teamOrder(a.team) - teamOrder(b.team) || ROLE_ORDER.indexOf(a.type) - ROLE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name));
  const range = week ? weekRange(week) : null;
  const dayChoices: string[] = sample
    ? sample.map((_, i) => isoPlus(isoToday(), i))
    : week ? week.days.map(d => d.isoDate) : [];
  const chosenIso = isoOf(new Date(at));
  const unresolvedNow = pending ? pending.needsRole.filter(n => !fixes[n.toLowerCase()]) : [];

  return (
    <Sheet label="Load from schedule" onClose={onCancel} wide>
      <SheetHeader title="Load from schedule" onClose={onCancel}
        sub="Upload the weekly department schedule (.xlsx) once. It stays on this device only, and the board follows it through every shift change." />
      {!pending && (
        <div className="opts c2">
          <label className="btn" style={{ position: 'relative' }}>
            {week ? 'Upload a newer schedule (.xlsx)' : 'Choose schedule file (.xlsx)'}
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="visually-hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }} />
          </label>
          <button className="btn" onClick={() => void loadSample()} disabled={busy}>Use sample scheduled shift</button>
        </div>
      )}
      {busy && <p style={{ marginTop: 12 }}>Reading…</p>}
      {error && <p role="alert" style={{ marginTop: 12, color: 'var(--danger)' }}>{error}</p>}

      {pending && <>
        <div className="lbl">Check {pending.source}</div>
        <p style={{ margin: 0 }}>{pending.days.length} days, {dayLabel(pending.days[0].isoDate)} to {dayLabel(pending.days[pending.days.length - 1].isoDate)}.
          {week && ' Days already on this device with the same dates are replaced. Changes you made by hand on a live board are kept.'}</p>
        {pending.corrected > 0 && <p className="muted" style={{ fontSize: 13 }}>The sheet's dates did not match their weekdays, so the year was corrected for {pending.corrected} day{pending.corrected === 1 ? '' : 's'}. Check the dates above.</p>}
        {pending.needsRole.length > 0 && <RoleFixes names={pending.needsRole} fixes={fixes} onChange={(n, t) => setFixes(f => ({ ...f, [n.toLowerCase()]: t }))} />}
        <div className="sheet-actions">
          <button className="btn" onClick={() => setPending(null)}>Cancel</button>
          <button className="btn primary" disabled={unresolvedNow.length > 0} onClick={saveRead}>
            {unresolvedNow.length > 0 ? `Pick ${unresolvedNow.length} more role${unresolvedNow.length === 1 ? '' : 's'}` : 'Save to this device'}
          </button>
        </div>
      </>}

      {!pending && week && range && !sample && (
        <div className="between" style={{ marginTop: 12, alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <small className="muted">On this device: {dayLabel(range.first)} to {dayLabel(range.last)}{week.sources.length ? ` · ${week.sources[week.sources.length - 1]}` : ''}</small>
          <button className="btn quiet sm" onClick={() => setConfirmClear(true)}>Remove from this device</button>
        </div>
      )}

      {!pending && (sample || week) && <>
        {sample && <div className="lbl">Sample scheduled shift (made-up names)</div>}
        <div className="opts c2">
          <label><span className="lbl" style={{ display: 'block', margin: '0 0 6px' }}>Day</span>
            <select value={dayChoices.includes(chosenIso) ? chosenIso : ''} onChange={e => { setAt(atHour(e.target.value, new Date(at).getHours())); setTeams({}); }}>
              {!dayChoices.includes(chosenIso) && <option value="" disabled>Pick a day</option>}
              {dayChoices.map(d => <option key={d} value={d}>{sample ? `${sample[dayChoices.indexOf(d)].dayOfWeek} ${sample[dayChoices.indexOf(d)].date}` : dayLabel(d)}</option>)}
            </select>
          </label>
          <label><span className="lbl" style={{ display: 'block', margin: '0 0 6px' }}>Time</span>
            <select value={new Date(at).getHours()} onChange={e => { setAt(atHour(chosenIso, Number(e.target.value))); setTeams({}); }}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourMinute(h)}</option>)}
            </select>
          </label>
        </div>
        {!sample && <button className="btn quiet sm" style={{ marginTop: 6 }} onClick={() => { setAt(Date.now()); setTeams({}); }}>Now</button>}
        <div className="lbl">{rows.length} on shift at {clock(at)}</div>
        {rows.length === 0 && <p>Nobody on this schedule at that time.</p>}
        {rows.map(r => (
          <div key={r.key} className="prov">
            <div className="who">
              <b>{r.name}</b>
              <small>{ROLE_LONG[r.type]}{r.endsAt !== undefined && <span className="num"> · until {clock(r.endsAt)}</span>}</small>
              {r.note && <small className="muted" style={{ display: 'block' }}>{r.note}</small>}
            </div>
            <select style={{ width: 150 }} aria-label={`Team for ${r.name}`} value={teams[r.key] ?? r.team}
              onChange={e => setTeams(t => ({ ...t, [r.key]: Number(e.target.value) as DraftTeam }))}>
              {([1, 2, 3, 4] as DraftTeam[]).concat(r.type === 'attending' ? [0] : []).map(t => (
                <option key={t} value={t}>{t === 0 ? 'Float' : t === 4 ? 'Trauma' : `Team ${t}`}</option>
              ))}
            </select>
          </div>
        ))}
        <p style={{ marginTop: 12, fontSize: 13 }}>
          {sample ? 'Confirming replaces the current draft. The sample does not follow shift changes.'
            : 'Confirming replaces the current draft. Once the shift starts, the board adds and removes people at their scheduled times.'}
          {' '}The shift does not start until you press Start shift.
        </p>
        <button className="btn primary lg full" disabled={rows.length === 0}
          onClick={() => onApply(rows.map(r => ({
            id: uid(), name: r.name, type: r.type, team: teams[r.key] ?? r.team,
            ...(r.scheduleKey ? { scheduleKey: r.scheduleKey, share: r.share, endsAt: r.endsAt, note: r.note } : {}),
          })), sample ? null : week)}>
          Use these {rows.length} providers
        </button>
      </>}
      {confirmClear && <Confirm title="Remove the schedule from this device?" danger confirmLabel="Remove"
        body={<p>The uploaded schedule and the roles you picked are deleted from this device. A live shift keeps its current board.</p>}
        onCancel={() => setConfirmClear(false)} onConfirm={() => { clearWeek(); setWeek(null); setConfirmClear(false); }} />}
    </Sheet>
  );
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoToday(): string { return isoOf(new Date()); }
function isoPlus(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoOf(new Date(y, m - 1, d + days));
}

/** Following the uploaded schedule once the shift starts (Decision 40). */
export interface FollowStart { week: StoredWeek; suppress: Record<string, number> }

export default function SetupScreen({ onHome, onStart }: { onHome: () => void; onStart: (providers: Provider[], floats: string[], follow?: FollowStart) => void }) {
  const [draft, setDraft] = useState<DraftEntry[]>(loadDraft);
  const [schedule, setSchedule] = useState(false);
  const [week, setWeek] = useState<StoredWeek | null>(() => loadWeek());
  const [followOn, setFollowOn] = useState(true);
  const [removing, setRemoving] = useState<DraftEntry | null>(null);
  const focusId = useRef<string | null>(null);

  useEffect(() => { saveDraft(draft); }, [draft]);
  useEffect(() => {
    if (!focusId.current) return;
    document.querySelector<HTMLInputElement>(`[data-entry="${focusId.current}"]`)?.focus();
    focusId.current = null;
  });

  const change = (id: string, patch: Partial<DraftEntry>) => setDraft(d => d.map(e => e.id === id ? { ...e, ...patch } : e));
  const add = (team: DraftTeam) => {
    const id = uid();
    focusId.current = id;
    const hasAttending = draft.some(e => e.team === team && e.type === 'attending');
    setDraft(d => [...d, { id, name: '', type: team === 0 || !hasAttending ? 'attending' : 'senior_resident', team }]);
  };
  const remove = (e: DraftEntry) => { if (e.name.trim()) setRemoving(e); else setDraft(d => d.filter(x => x.id !== e.id)); };
  // A scheduled entry deleted here stays hidden, so the schedule does not put that person back.
  const drop = (e: DraftEntry) => setDraft(d => e.scheduleKey ? d.map(x => x.id === e.id ? { ...x, dropped: true } : x) : d.filter(x => x.id !== e.id));

  const shown = draft.filter(e => !e.dropped);
  const named = shown.filter(e => e.name.trim());
  // Follow only a schedule that has people on it now (an old week would empty the board).
  const coversNow = !!week && rosterAt(slotsOf(week).slots, Date.now()).length > 0;
  const fromSchedule = !!week && draft.some(e => e.scheduleKey) && coversNow;
  const staleSchedule = !!week && draft.some(e => e.scheduleKey) && !coversNow;
  const valid = named.some(e => e.team === 1 || e.team === 2 || e.team === 3);
  const start = () => {
    const providers: Provider[] = named.filter(e => e.team !== 0).map(e => ({
      id: uid(), name: e.name.trim(), type: e.type, status: 'active', statusExpiresAt: null, teamId: e.team as TeamId,
      ...(e.scheduleKey && fromSchedule && followOn ? { scheduleKey: e.scheduleKey, share: e.share, endsAt: e.endsAt, ...(e.note ? { note: e.note } : {}) } : {}),
      ...(e.share !== undefined && !(fromSchedule && followOn) ? { share: e.share } : {}),
    }));
    const suppress = Object.fromEntries(draft.filter(e => e.dropped && e.scheduleKey).map(e => [e.scheduleKey!, e.endsAt ?? Date.now()]));
    onStart(providers, named.filter(e => e.team === 0).map(e => e.name.trim()), fromSchedule && followOn && week ? { week, suppress } : undefined);
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header className="appbar">
        <CctMark />
        <span className="brand-sep" aria-hidden="true" />
        <div><div className="ttl">Start shift</div><div className="sub">Draft saved on this device</div></div>
        <span className="sp" />
        <button className="btn quiet" onClick={onHome}>‹ Home</button>
      </header>
      <main className="page" style={{ flex: 1, width: '100%', paddingBottom: 24 }}>
        <div className="between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', margin: '6px 0 18px' }}>
          <div>
            <div className="sc muted">Shift preparation</div>
            <h1 style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-.8px', margin: '6px 0' }}>Build your teams.</h1>
            <p className="muted" style={{ margin: 0 }}>Add a name and choose a role. Press Enter to add the next person.</p>
          </div>
          <button className="btn" onClick={() => setSchedule(true)}>Load from schedule</button>
        </div>
        <div className="sc muted" style={{ margin: '0 2px 8px' }}>A-side · Teams 1 to 3</div>
        <div className="setup-grid">
          {([1, 2, 3] as DraftTeam[]).map(t => <Roster key={t} team={t} entries={shown.filter(e => e.team === t)} onChange={change} onAdd={add} onRemove={remove} />)}
        </div>
        <div className="setup-grid two" style={{ marginTop: 12 }}>
          {([4, 0] as DraftTeam[]).map(t => <Roster key={t} team={t} entries={shown.filter(e => e.team === t)} onChange={change} onAdd={add} onRemove={remove} />)}
        </div>
        {fromSchedule && (
          <label className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12 }}>
            <input type="checkbox" checked={followOn} onChange={e => setFollowOn(e.target.checked)} style={{ marginTop: 3 }} />
            <span><b>Follow the schedule during the shift</b><br />
              <small className="muted">People join and leave at their scheduled times, and Teams 3 and 4 close for new patients at night (Team 3 at 11 PM, Team 4 at 12 AM). Anything you change by hand on the board stays as you set it.</small></span>
          </label>
        )}
        {staleSchedule && (
          <p className="card" role="status" style={{ marginTop: 12 }}>The schedule on this device has nobody on shift right now, so the board will not follow it. Load this week's schedule to follow shift changes.</p>
        )}
        {draft.length > 0 && <button className="btn quiet" style={{ marginTop: 12 }} onClick={() => setRemoving({ id: '*', name: 'everyone', type: 'attending', team: 1 })}>Clear draft</button>}
      </main>
      <footer className="setup-footer">
        <div className="between" style={{ alignItems: 'center', maxWidth: 1148, margin: '0 auto' }}>
          <div><b className="num">{named.length} provider{named.length === 1 ? '' : 's'}</b><br /><small className="muted">{valid ? 'Nothing starts until you press Start shift.' : 'Add at least one provider to Team 1, 2 or 3.'}</small></div>
          <button className="btn primary lg" disabled={!valid} onClick={start}>Start shift →</button>
        </div>
        <div className="foot" style={{ paddingBottom: 0 }}>© 2026 New York University</div>
      </footer>
      {schedule && <ScheduleSheet onCancel={() => { setWeek(loadWeek()); setSchedule(false); }} onApply={(entries, w) => { setDraft(entries); setWeek(w); setSchedule(false); }} />}
      {removing && <Confirm title={removing.id === '*' ? 'Clear the whole draft?' : `Remove ${removing.name}?`} danger confirmLabel="Remove"
        body={<p>{removing.id === '*' ? 'Every entry on this screen is removed.' : 'Removes this entry from the shift draft.'}</p>}
        onCancel={() => setRemoving(null)}
        onConfirm={() => { if (removing.id === '*') setDraft([]); else drop(removing); setRemoving(null); }} />}
    </div>
  );
}
