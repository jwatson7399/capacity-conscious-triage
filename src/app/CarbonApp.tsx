// © 2026 New York University. All rights reserved.
//
// The Carbon interface. One role, one shared device.
// The live shift's provider is mounted for the whole session, so going Home never wipes
// a shift. The demo and the tour mount their own providers inside it; they cannot reach
// the live shift's state.
import { useCallback, useRef, useState } from 'react';
import type { Provider, ProviderType } from '../types';
import { ShiftProvider, useShift } from '../context/ShiftContext';
import Home from './Home';
import SetupScreen, { type FollowStart } from './SetupScreen';
import { clearDraft, saveDraft } from './draft';
import { useTheme } from './useTheme';
import Ticker from './Ticker';
import Board from './Board';
import Demo from './Demo';
import Tour from './Tour';
import ScheduleStart from './ScheduleStart';
import { loadWeek, readWeek, storeRead, saveRoleFixes, type ReadWeek } from '../schedule/storage';
import { mergeWeek, type StoredWeek } from '../schedule/week';
import { prepareScheduleStart, scheduleReadiness, scheduleRange } from '../schedule/start';
import { uid } from '../uid';
import { Help, HowItWorks } from './Help';

type Screen = 'home' | 'setup' | 'schedule' | 'board' | 'demo' | 'tour';
type Overlay = 'help' | 'how' | null;

function hasParam(name: string): boolean {
  try { return new URLSearchParams(window.location.search).has(name); } catch { return false; }
}

function Screens() {
  const { state, dispatch } = useShift();
  const [dark, toggleDark] = useTheme();
  const [screen, setScreen] = useState<Screen>(() => (hasParam('tour') ? 'tour' : 'home'));
  const [week, setWeek] = useState<StoredWeek | null>(loadWeek);
  const [pending, setPending] = useState<ReadWeek | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [uploadId, setUploadId] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [overlay, setOverlay] = useState<Overlay>(() => (hasParam('walkthrough') ? 'how' : null));

  const go = useCallback((s: Screen) => {
    setScreen(s);
    window.scrollTo(0, 0);
    if (s !== 'tour' && hasParam('tour')) history.replaceState(null, '', window.location.pathname);
  }, []);
  const home = useCallback(() => { request.current++; setReading(false); setWeek(loadWeek()); go('home'); }, [go]);
  const help = useCallback(() => setOverlay('help'), []);
  const how = useCallback(() => setOverlay('how'), []);
  const closeOverlay = useCallback(() => {
    setOverlay(null);
    if (hasParam('walkthrough')) history.replaceState(null, '', window.location.pathname);
  }, []);

  const start = (providers: Provider[], floats: string[], follow?: FollowStart) => {
    if (state.shiftStarted) { go('board'); return; }
    if (follow) {
      const ready = scheduleReadiness(follow.week, Date.now());
      if (!ready.canStart) throw new Error(ready.reason!);
    }
    dispatch({ type: 'TICK' });
    dispatch({ type: 'START_SHIFT', providers });
    dispatch({ type: 'SET_FLOAT_ATTENDINGS', names: floats });
    if (follow) dispatch({ type: 'SCHEDULE_FOLLOW', week: follow.week, suppress: follow.suppress });
    clearDraft();
    go('board');
  };
  const endShift = () => { dispatch({ type: 'RESET' }); setWeek(loadWeek()); go('home'); };
  const upload = () => fileInput.current?.click();
  const acceptFile = async (file: File) => {
    const id = ++request.current;
    setReading(true); setUploadError(null); setPending(null); setUploadId(id); go('schedule');
    try {
      const known = loadWeek();
      const read = readWeek(await file.arrayBuffer(), file.name, known?.roleFixes ?? {});
      if (id !== request.current) return;
      const candidate = mergeWeek(null, read.days, read.source, known?.roleFixes ?? {}, Date.now());
      if (!scheduleReadiness(candidate, Date.now()).coversNow) throw new Error(`${file.name} covers ${scheduleRange(candidate)}. Nobody is on shift on A-side now. Choose a schedule that covers now.`);
      if (read.needsRole.length) { setWeek(known); setPending(read); }
      else setWeek(storeRead(known, read, {}, Date.now()));
    } catch (e) { if (id === request.current) setUploadError(e instanceof Error ? e.message : 'Could not read that schedule.'); }
    finally { if (id === request.current) setReading(false); }
  };
  const resolveRoles = (fixes: Record<string, ProviderType>) => {
    try {
      const updated = pending ? storeRead(week, pending, fixes) : week ? saveRoleFixes(week, fixes) : null;
      setWeek(updated); setPending(null); setUploadError(null);
    } catch (e) { setUploadError(e instanceof Error ? e.message : 'Could not save the roles.'); }
  };
  const startScheduled = (w: StoredWeek) => {
    const ready = prepareScheduleStart(w, Date.now());
    start(ready.providers, ready.floats, ready.follow);
  };
  const editScheduled = (w: StoredWeek) => {
    const ready = prepareScheduleStart(w, Date.now());
    saveDraft([
      ...ready.providers.map(p => ({ id: p.id, name: p.name, type: p.type, team: p.teamId, scheduleKey: p.scheduleKey, share: p.share, endsAt: p.endsAt, note: p.note })),
      ...ready.floats.map(name => ({ id: uid(), name, type: 'attending' as const, team: 0 as const })),
    ]);
    go('setup');
  };

  const common = { dark, onToggleDark: toggleDark, onHome: home, onHelp: help, onHow: how };

  return <>
    <input ref={fileInput} type="file" aria-label="Upload schedule file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: 'none' }}
      onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void acceptFile(file); }} />
    {screen === 'home' && <Home dark={dark} onToggleDark={toggleDark} onStart={() => go('setup')} onResume={() => go('board')}
      onDemo={() => go('demo')} onTour={() => go('tour')} onHow={how} week={week} onUpload={upload}
      onSchedule={() => { setWeek(loadWeek()); setPending(null); setUploadError(null); setUploadId(id => id + 1); go('schedule'); }} />}
    {screen === 'schedule' && (state.shiftStarted ? <Board mode="live" {...common} onEndShift={endShift} />
      : <ScheduleStart key={uploadId} week={week} pending={pending} busy={reading} error={uploadError} onHome={home} onUpload={upload}
        onResolve={resolveRoles} onStart={startScheduled} onEdit={editScheduled} />)}
    {screen === 'setup' && (state.shiftStarted
      ? <Board mode="live" {...common} onEndShift={endShift} />
      : <SetupScreen onHome={home} onStart={start} />)}
    {screen === 'board' && (state.shiftStarted
      ? <Board mode="live" {...common} onEndShift={endShift} />
      : <SetupScreen onHome={home} onStart={start} />)}
    {screen === 'demo' && <ShiftProvider><Ticker /><Demo {...common} /></ShiftProvider>}
    {screen === 'tour' && <ShiftProvider><Ticker /><Tour {...common} onExit={home} onDemo={() => go('demo')} /></ShiftProvider>}
    {overlay === 'help' && <Help onBack={closeOverlay} />}
    {overlay === 'how' && <HowItWorks onBack={closeOverlay} onHome={() => { closeOverlay(); home(); }} startWalk={hasParam('walkthrough')} />}
  </>;
}

export default function CarbonApp() {
  return (
    <div id="cct-root" className="cct">
      <ShiftProvider>
        <Ticker />
        <Screens />
      </ShiftProvider>
    </div>
  );
}
