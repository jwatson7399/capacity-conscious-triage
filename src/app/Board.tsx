// © 2026 New York University. All rights reserved.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AcuityTier, TeamId } from '../types';
import { useShift } from '../context/ShiftContext';
import { ACUITY_NAME, ALL_TEAMS, clock, deceasedMinutesLeft, teamName } from '../ui/model';
import Gauge from './Gauge';
import Ledger from './Ledger';
import { AssignPanel, OverrideSheet } from './Assign';
import ActivityDrawer from './ActivityDrawer';
import TeamDetail from './TeamDetail';
import Sheet, { Confirm, Copyright, SheetHeader } from './Sheet';
import { CctMark } from './HomeArt';

export type BoardMode = 'live' | 'demo' | 'tour';

const UNDO_MS = 30_000;
const UNDO_FULL_MS = 1_400;

/**
 * Device-clock window for the current undoable assignment. The assignment itself comes from
 * the session (undoable, bound to its event id); this only times the toast and chip.
 * eventId is null until the session records the placement.
 */
interface UndoTimer { eventId: string | null; after: string | null; until: number; startedAt: number }

export interface BoardProps {
  mode: BoardMode;
  dark: boolean;
  onToggleDark: () => void;
  onHome: () => void;
  onHelp: () => void;
  onHow: () => void;
  onEndShift?: () => void;
  /** Extra controls under the header (demo toolbar). */
  toolbar?: ReactNode;
  /** Tour hooks: the tour can drive the board's own UI state. */
  tourUi?: { armed?: AcuityTier | null; detail?: TeamId | null; activity?: boolean; override?: boolean };
  onUiChange?: (ui: { armed: AcuityTier | null; detail: TeamId | null; activity: boolean; override: boolean; placed: number }) => void;
}

export default function Board({ mode, dark, onToggleDark, onHome, onHelp, onHow, onEndShift, toolbar, tourUi, onUiChange }: BoardProps) {
  const { state, dispatch, recommendation: rec, activity, undoable } = useShift();
  const [armed, setArmed] = useState<AcuityTier | null>(tourUi?.armed ?? null);
  const [floor, setFloor] = useState(false);
  const [override, setOverride] = useState(tourUi?.override ?? false);
  const [detail, setDetail] = useState<TeamId | null>(tourUi?.detail ?? null);
  const [showLog, setShowLog] = useState(tourUi?.activity ?? false);
  const [menu, setMenu] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [timer, setTimer] = useState<UndoTimer | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [placed, setPlaced] = useState(0);
  const [nowReal, setNowReal] = useState(() => Date.now());

  // The tour can open parts of the board for its steps (adjusting state when the prop changes).
  const [prevTourUi, setPrevTourUi] = useState(tourUi);
  if (tourUi !== prevTourUi) {
    setPrevTourUi(tourUi);
    if (tourUi) {
      if (tourUi.armed !== undefined) setArmed(tourUi.armed);
      if (tourUi.detail !== undefined) setDetail(tourUi.detail);
      if (tourUi.activity !== undefined) setShowLog(tourUi.activity);
      if (tourUi.override !== undefined) setOverride(tourUi.override);
    }
  }

  // Bind a new timer to the event the session just recorded.
  if (timer && timer.eventId === null && undoable && undoable.eventId !== timer.after) {
    setTimer({ ...timer, eventId: undoable.eventId });
  }
  const undoEvent = timer && undoable && timer.eventId === undoable.eventId
    ? activity.find(e => e.id === undoable.eventId && e.kind === 'assign') : undefined;
  const undo = undoEvent && undoEvent.kind === 'assign' && timer
    ? { eventId: undoEvent.id, patientId: undoEvent.patientId, text: `${undoEvent.patientId} ${ACUITY_NAME[undoEvent.acuity]} placed on ${teamName(undoEvent.chosenTeamId)}`, until: timer.until, startedAt: timer.startedAt }
    : null;

  useEffect(() => { onUiChange?.({ armed, detail, activity: showLog, override, placed }); }, [armed, detail, showLog, override, placed, onUiChange]);

  // Undo countdown runs on the device clock, not the model clock.
  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => {
      const t = Date.now();
      if (t >= timer.until) setTimer(null);
      else setNowReal(t);
    }, 200);
    return () => clearInterval(id);
  }, [timer]);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 3200);
    return () => clearTimeout(id);
  }, [note]);

  const startUndo = () => {
    const t = Date.now();
    setNowReal(t);
    setTimer({ eventId: null, after: undoable?.eventId ?? null, until: t + UNDO_MS, startedAt: t });
  };

  const place = () => {
    if (!armed || !rec.first) return;
    const source = floor ? 'floor' : 'critical';
    dispatch({ type: 'ASSIGN_PATIENT', tier: armed, teamId: rec.first, source });
    startUndo();
    setArmed(null);
    setFloor(false);
    setPlaced(n => n + 1);
  };

  const assignOther = (o: { teamId: TeamId; acuity: AcuityTier; reasonCode: 'continuity' | 'team_request' | 'other'; note: string }) => {
    const source = floor ? 'floor' : 'critical';
    const reasonText = o.reasonCode === 'other' ? `Other: ${o.note}` : o.reasonCode === 'continuity' ? 'Continuity / bounce-back' : 'Team or attending request';
    dispatch({
      type: 'ASSIGN_PATIENT', tier: o.acuity, teamId: o.teamId, source,
      overrideReason: reasonText, recommendedTeamId: rec.first ?? undefined,
      meta: { reasonCode: o.reasonCode, note: o.note },
    });
    startUndo();
    setOverride(false);
    setArmed(null);
    setFloor(false);
    setPlaced(n => n + 1);
  };

  const doUndo = () => {
    if (!undo) return;
    dispatch({ type: 'UNDO_ASSIGN', eventId: undo.eventId });
    setNote(`Undid ${undo.patientId}`);
    setTimer(null);
  };

  const closeDetail = useCallback(() => setDetail(null), []);
  const closeLog = useCallback(() => setShowLog(false), []);

  const sim = state.simulation;
  const paused = !!sim?.paused;
  const isDemo = mode !== 'live';
  const undoPhase = undo ? (nowReal - undo.startedAt < UNDO_FULL_MS ? 'full' : 'chip') : null;
  const undoPct = undo ? Math.max(0, (undo.until - nowReal) / UNDO_MS * 100) : 0;
  const deceasedByTeam: Record<number, number> = Object.fromEntries(ALL_TEAMS.map(t => [t, deceasedMinutesLeft(state, t)]));
  const actCount = activity.filter(e => e.kind !== 'shift_start').length;

  return (
    <div className="board-shell">
      <header className="appbar boardbar">
        <CctMark />
        <span className="brand-sep" aria-hidden="true" />
        <div className="titleblock">
          {isDemo && <span className="demo-badge"><span>{mode === 'tour' ? 'Tour' : 'Demo'} ·</span> <span>Sample data</span></span>}
        </div>
        <span className="sp" />
        <span className={`live${paused ? ' paused' : ''}`} title={paused ? 'Paused' : 'Live'}><i /><span className="live-word">{paused ? 'Paused' : 'Live'}</span></span>
        <span className="clock num">{clock(state.now)}</span>
        <button className="pill themesw" role="switch" aria-checked={dark} aria-label="Dark mode" title={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={onToggleDark}>
          <span className={dark ? '' : 'on'} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          </span>
          <span className={dark ? 'on' : ''} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
          </span>
        </button>
        <button className="pill actbtn" onClick={() => setShowLog(true)} aria-label={`Shift activity, ${actCount} events`} data-tour="activity">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
          <span className="num">{actCount || ''}</span>
        </button>
        <button className="pill menubtn" onClick={() => setMenu(true)} aria-label="Menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
        </button>
      </header>
      {undoPhase === 'chip' && undo && (
        <button className="pill uchip" onClick={doUndo} aria-label={`Undo ${undo.text}`}>
          <span className="ring" style={{ ['--p' as string]: `${undoPct}%` }} />Undo {undo.patientId}
        </button>
      )}
      {toolbar}
      <div className="board">
        <div className="board-main">
          <div className="gcol">
            <Gauge rec={rec} closedTeams={state.closedTeams} deceased={deceasedByTeam} armed={armed} onOpen={setDetail} />
          </div>
          <Ledger state={state} rec={rec} armed={armed} onOpen={setDetail} />
        </div>
        <Copyright />
      </div>

      <AssignPanel rec={rec} armed={armed} floor={floor} onArm={setArmed} onFloor={() => setFloor(f => !f)} onPlace={place} onOther={() => setOverride(true)} />

      {undoPhase === 'full' && undo && (
        <div className="utoast" role="status">{undo.text}<button onClick={doUndo}>Undo</button></div>
      )}
      {note && <div className="note-toast" role="status">{note}</div>}

      {override && <OverrideSheet rec={rec} closedTeams={state.closedTeams} initialAcuity={armed} onCancel={() => setOverride(false)} onAssign={assignOther} />}
      {detail !== null && <TeamDetail teamId={detail} onClose={closeDetail} onNote={setNote} />}
      {showLog && <ActivityDrawer events={activity} onClose={closeLog} />}

      {menu && (
        <Sheet label="Menu" onClose={() => setMenu(false)}>
          <SheetHeader title="Menu" onClose={() => setMenu(false)} />
          <div className="opts">
            <button className="opt" onClick={() => { setMenu(false); onHelp(); }}><b>Help</b></button>
            <button className="opt" onClick={() => { setMenu(false); onHow(); }}><b>How it works</b></button>
            <button className="opt" onClick={() => { setMenu(false); onHome(); }}>
              <span><b>Home</b><small>{mode === 'live' ? 'The shift keeps running. Resume it from Home.' : 'Leaves the sample. Nothing here touches a live shift.'}</small></span>
            </button>
            {mode === 'live' && onEndShift && (
              <button className="btn danger full" style={{ marginTop: 8 }} onClick={() => { setMenu(false); setConfirmEnd(true); }}>End shift</button>
            )}
          </div>
          <Copyright />
        </Sheet>
      )}
      {confirmEnd && onEndShift && (
        <Confirm title="End this shift?" danger confirmLabel="End shift"
          body={<p>This clears the board, the rosters and the shift activity from this device. The activity is not saved anywhere else.</p>}
          onCancel={() => setConfirmEnd(false)} onConfirm={() => { setConfirmEnd(false); onEndShift(); }} />
      )}
    </div>
  );
}
