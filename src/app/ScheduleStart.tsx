// © 2026 New York University. All rights reserved.
import { useState } from 'react';
import type { ProviderType } from '../types';
import { useShift } from '../context/ShiftContext';
import { ROLE_LONG, ROLE_ORDER, clock, teamName } from '../ui/model';
import { displayName } from '../schedule/follow';
import { scheduleRange, scheduleReadiness } from '../schedule/start';
import { storageWarning, type ReadWeek } from '../schedule/storage';
import { type StoredWeek, TEAMS } from '../schedule/week';
import { RoleFixes } from './ScheduleMenu';
import { CctMark } from './HomeArt';

export default function ScheduleStart({ week, pending, busy, error, onHome, onUpload, onResolve, onStart, onEdit }: {
  week: StoredWeek | null; pending: ReadWeek | null; busy: boolean; error: string | null;
  onHome: () => void; onUpload: () => void;
  onResolve: (fixes: Record<string, ProviderType>) => void;
  onStart: (week: StoredWeek) => void; onEdit: (week: StoredWeek) => void;
}) {
  const { state } = useShift();
  const [fixes, setFixes] = useState<Record<string, ProviderType>>({});
  const [startError, setStartError] = useState<string | null>(null);
  const ready = scheduleReadiness(week, state.now);
  const roleNames = pending?.needsRole ?? ready.needsRole;
  const remaining = roleNames.filter(n => !fixes[n.toLowerCase()]);
  const hasRoles = !busy && !error && (!!pending || !ready.needsOriginal) && roleNames.length > 0;
  const canStart = !busy && !error && !pending && ready.canStart;
  const attempt = (action: (w: StoredWeek) => void) => {
    if (!week) return;
    try { setStartError(null); action(week); }
    catch (e) { setStartError(e instanceof Error ? e.message : 'The schedule changed. Check it before starting.'); }
  };
  const warning = storageWarning();
  return <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
    <header className="appbar"><CctMark /><span className="brand-sep" aria-hidden="true" />
      <div className="ttl" style={{ fontSize: hasRoles ? 18 : undefined }}>{hasRoles ? 'Check resident roles' : canStart ? 'Ready to start' : 'Upload schedule'}</div>
      <span className="sp" /><button className="btn quiet" style={{ whiteSpace: 'nowrap' }} onClick={onHome}>‹ Home</button>
    </header>
    <main className="page" style={{ flex: 1, width: '100%', paddingBottom: 24 }}>
      <h1 style={{ fontSize: 30, fontWeight: 500, margin: '10px 0' }}>{hasRoles ? 'A role for every resident.' : canStart ? 'Your teams, right now.' : "This week’s schedule."}</h1>
      <p className="muted">{canStart ? 'Check who is on now.' : 'Upload the weekly department schedule (.xlsx).'} The original file and your role picks stay on this device only. Nothing is sent anywhere.</p>
      {week && <p>Schedule on this device: {scheduleRange(week)}.</p>}
      {pending && <p>{pending.source}: {scheduleRange({ days: pending.days, sources: [], roleFixes: {}, loadedAt: 0 })}.</p>}
      {busy && <p role="status">Reading schedule…</p>}
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      {!busy && !error && !pending && !ready.canStart && !hasRoles && <p role="status">{ready.reason}</p>}
      {warning && <p role="status" className="card">{warning}</p>}
      {hasRoles && <>
        <RoleFixes names={roleNames} fixes={fixes} onChange={(n, t) => setFixes(f => ({ ...f, [n.toLowerCase()]: t }))} />
        <button className="btn primary full" style={{ marginTop: 16 }} disabled={remaining.length > 0}
          onClick={() => onResolve(fixes)}>{remaining.length ? `Pick ${remaining.length} more role${remaining.length === 1 ? '' : 's'}` : 'Continue to teams'}</button>
      </>}
      {canStart && <>
        <div className="card" style={{ margin: '16px 0', padding: 16 }}>
          <b>On shift at {clock(state.now)}</b>
          <p className="muted" style={{ margin: '6px 0 0' }}>{ready.next !== null ? `Next change at ${clock(ready.next)}.` : 'No more scheduled changes.'} The board follows the clock when you start.</p>
          {ready.expiresSoon && <p role="status" style={{ marginBottom: 0 }}>This schedule ends within 24 hours, at {ready.endsAt !== null && clock(ready.endsAt)}. Have the next schedule ready.</p>}
        </div>
        <div className="setup-grid">
          {TEAMS.map(t => <section key={t} className="card" style={{ padding: 16 }} aria-label={teamName(t)}>
            <div className="between"><h2 style={{ fontSize: 18, margin: 0 }}>{teamName(t)}</h2>{!ready.open.has(t) && <span className="muted">Closed</span>}</div>
            {t === 4 && <small className="muted">Shown on the board, outside recommendations</small>}
            {ready.roster.filter(e => e.teamId === t).sort((a, b) => ROLE_ORDER.indexOf(a.type) - ROLE_ORDER.indexOf(b.type)).map(e => <div key={e.scheduleKey} className="prov">
              <div className="who"><b>{displayName(e.name)}</b><small>{ROLE_LONG[e.type]} · until {clock(e.endsAt)}</small>
                {e.note && <small className="muted" style={{ display: 'block' }}>{e.note}</small>}</div>
            </div>)}
            {!ready.roster.some(e => e.teamId === t) && <p className="muted">Nobody scheduled now.</p>}
          </section>)}
          <section className="card" style={{ padding: 16 }} aria-label="Float attendings"><h2 style={{ fontSize: 18, margin: 0 }}>Float attendings</h2>
            {ready.floats.length ? ready.floats.map(n => <p key={n}>{n}</p>) : <p className="muted">None scheduled now.</p>}
          </section>
        </div>
      </>}
      {!busy && <button className="btn quiet" style={{ marginTop: 16 }} onClick={onUpload}>{week || pending ? 'Choose a different schedule' : 'Choose schedule file (.xlsx)'}</button>}
      {startError && <p role="alert" style={{ color: 'var(--danger)' }}>{startError}</p>}
    </main>
    <footer className="setup-footer">
      {canStart && <div className="opts c2" style={{ maxWidth: 700, margin: '0 auto' }}>
        <button className="btn" onClick={() => attempt(onEdit)}>Edit teams first</button>
        <button className="btn primary lg" onClick={() => attempt(onStart)}>Start shift</button>
      </div>}
      <div className="foot" style={{ paddingBottom: 0 }}>© 2026 New York University · Advisory only. You make every assignment.</div>
    </footer>
  </div>;
}
