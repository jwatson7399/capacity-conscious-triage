// © 2026 New York University. All rights reserved.
import { useEffect, useRef, useState } from 'react';
import type { Provider, ProviderType, TeamId } from '../types';
import { parseWeeklySchedule, type DaySchedule } from '../utils/scheduleParser';
import { ROLE_LONG, teamName } from '../ui/model';
import { loadSampleSchedule, providersAt } from '../ui/samples';
import { uid } from '../uid';
import { RoleSelect } from './TeamDetail';
import { loadDraft, saveDraft, type DraftEntry, type DraftTeam } from './draft';
import Sheet, { Confirm, SheetHeader } from './Sheet';
import { CctMark } from './HomeArt';

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
        </div>
      ))}
      <button className="btn full" style={{ marginTop: 10 }} onClick={() => onAdd(team)}>+ Add {team === 0 ? 'float attending' : 'provider'}</button>
    </section>
  );
}

function ScheduleSheet({ onCancel, onApply }: { onCancel: () => void; onApply: (entries: DraftEntry[]) => void }) {
  const [days, setDays] = useState<DaySchedule[] | null>(null);
  const [source, setSource] = useState('');
  const [dayIdx, setDayIdx] = useState(0);
  const [hour, setHour] = useState(() => new Date().getHours());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [teams, setTeams] = useState<Record<string, DraftTeam>>({});

  const rows: { key: string; name: string; type: ProviderType; team: DraftTeam }[] = [];
  if (days && days[dayIdx]) {
    const { providers, floatAttendings } = providersAt(days[dayIdx], hour);
    providers.forEach((p, i) => rows.push({ key: `p${i}-${p.name}`, name: p.name, type: p.type, team: p.teamId }));
    floatAttendings.forEach((n, i) => rows.push({ key: `f${i}-${n}`, name: n, type: 'attending', team: 0 }));
  }

  const readFile = async (file: File) => {
    setError(null); setBusy(true);
    try {
      const parsed = parseWeeklySchedule(await file.arrayBuffer());
      if (parsed.days.length === 0) throw new Error('No days found in that file.');
      setDays(parsed.days); setDayIdx(0); setSource(file.name); setTeams({});
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read that file.'); }
    finally { setBusy(false); }
  };
  const loadSample = async () => {
    setError(null); setBusy(true);
    try { const d = await loadSampleSchedule(); setDays(d); setDayIdx(0); setSource('Sample scheduled shift (made-up names)'); setTeams({}); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the sample.'); }
    finally { setBusy(false); }
  };

  return (
    <Sheet label="Load from schedule" onClose={onCancel} wide>
      <SheetHeader title="Load from schedule" onClose={onCancel} sub="Pick a day and hour, check who lands on which team, then confirm. The file is read on this device only." />
      <div className="opts c2">
        <label className="btn" style={{ position: 'relative' }}>
          Choose schedule file (.xlsx)
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="visually-hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }} />
        </label>
        <button className="btn" onClick={() => void loadSample()} disabled={busy}>Use sample scheduled shift</button>
      </div>
      {busy && <p style={{ marginTop: 12 }}>Reading…</p>}
      {error && <p role="alert" style={{ marginTop: 12, color: 'var(--danger)' }}>{error}</p>}
      {days && <>
        <div className="lbl">{source}</div>
        <div className="opts c2">
          <label><span className="lbl" style={{ display: 'block', margin: '0 0 6px' }}>Day</span>
            <select value={dayIdx} onChange={e => { setDayIdx(Number(e.target.value)); setTeams({}); }}>
              {days.map((d, i) => <option key={i} value={i}>{d.dayOfWeek} {d.date}</option>)}
            </select>
          </label>
          <label><span className="lbl" style={{ display: 'block', margin: '0 0 6px' }}>Hour</span>
            <select value={hour} onChange={e => { setHour(Number(e.target.value)); setTeams({}); }}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </label>
        </div>
        <div className="lbl">{rows.length} on shift at {String(hour).padStart(2, '0')}:00</div>
        {rows.length === 0 && <p>Nobody on this schedule at that hour.</p>}
        {rows.map(r => (
          <div key={r.key} className="prov">
            <div className="who"><b>{r.name}</b><small>{ROLE_LONG[r.type]}</small></div>
            <select style={{ width: 150 }} aria-label={`Team for ${r.name}`} value={teams[r.key] ?? r.team}
              onChange={e => setTeams(t => ({ ...t, [r.key]: Number(e.target.value) as DraftTeam }))}>
              {([1, 2, 3, 4] as DraftTeam[]).concat(r.type === 'attending' ? [0] : []).map(t => (
                <option key={t} value={t}>{t === 0 ? 'Float' : t === 4 ? 'Trauma' : `Team ${t}`}</option>
              ))}
            </select>
          </div>
        ))}
        <p style={{ marginTop: 12, fontSize: 13 }}>Confirming replaces the current draft. The shift does not start until you press Start shift.</p>
        <button className="btn primary lg full" disabled={rows.length === 0}
          onClick={() => onApply(rows.map(r => ({ id: uid(), name: r.name, type: r.type, team: teams[r.key] ?? r.team })))}>
          Use these {rows.length} providers
        </button>
      </>}
    </Sheet>
  );
}

export default function SetupScreen({ onHome, onStart }: { onHome: () => void; onStart: (providers: Provider[], floats: string[]) => void }) {
  const [draft, setDraft] = useState<DraftEntry[]>(loadDraft);
  const [schedule, setSchedule] = useState(false);
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

  const named = draft.filter(e => e.name.trim());
  const valid = named.some(e => e.team === 1 || e.team === 2 || e.team === 3);
  const start = () => {
    const providers: Provider[] = named.filter(e => e.team !== 0).map(e => ({
      id: uid(), name: e.name.trim(), type: e.type, status: 'active', statusExpiresAt: null, teamId: e.team as TeamId,
    }));
    onStart(providers, named.filter(e => e.team === 0).map(e => e.name.trim()));
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
          {([1, 2, 3] as DraftTeam[]).map(t => <Roster key={t} team={t} entries={draft.filter(e => e.team === t)} onChange={change} onAdd={add} onRemove={remove} />)}
        </div>
        <div className="setup-grid two" style={{ marginTop: 12 }}>
          {([4, 0] as DraftTeam[]).map(t => <Roster key={t} team={t} entries={draft.filter(e => e.team === t)} onChange={change} onAdd={add} onRemove={remove} />)}
        </div>
        {draft.length > 0 && <button className="btn quiet" style={{ marginTop: 12 }} onClick={() => setRemoving({ id: '*', name: 'everyone', type: 'attending', team: 1 })}>Clear draft</button>}
      </main>
      <footer className="setup-footer">
        <div className="between" style={{ alignItems: 'center', maxWidth: 1148, margin: '0 auto' }}>
          <div><b className="num">{named.length} provider{named.length === 1 ? '' : 's'}</b><br /><small className="muted">{valid ? 'Nothing starts until you press Start shift.' : 'Add at least one provider to Team 1, 2 or 3.'}</small></div>
          <button className="btn primary lg" disabled={!valid} onClick={start}>Start shift →</button>
        </div>
        <div className="foot" style={{ paddingBottom: 0 }}>© 2026 New York University</div>
      </footer>
      {schedule && <ScheduleSheet onCancel={() => setSchedule(false)} onApply={entries => { setDraft(entries); setSchedule(false); }} />}
      {removing && <Confirm title={removing.id === '*' ? 'Clear the whole draft?' : `Remove ${removing.name}?`} danger confirmLabel="Remove"
        body={<p>{removing.id === '*' ? 'Every entry on this screen is removed.' : 'Removes this entry from the shift draft.'}</p>}
        onCancel={() => setRemoving(null)}
        onConfirm={() => { setDraft(d => removing.id === '*' ? [] : d.filter(x => x.id !== removing.id)); setRemoving(null); }} />}
    </div>
  );
}
