// © 2026 New York University. All rights reserved.
//
// The demo runs in its own ShiftProvider (see CarbonApp), so nothing here can reach a
// live shift. Same board, same engine; only the clock and the sample data differ.
import { useEffect, useRef, useState } from 'react';
import { useShift } from '../context/ShiftContext';
import { buildDemoShift, buildScheduledDemoShift } from '../ui/samples';
import { ACUITY_CLASS, ACUITY_NAME, clock } from '../ui/model';
import Board, { type BoardProps } from './Board';

const ARRIVAL_WINDOW_MIN = 180;

/** The demo's scheduled arrivals over the next three model hours, so it is clear more are coming. */
function ArrivalStrip() {
  const { state } = useShift();
  const sim = state.simulation;
  if (!sim) return null;
  const now = state.now;
  const windowMs = ARRIVAL_WINDOW_MIN * 60_000;
  const upcoming = sim.timeline.slice(sim.nextArrivalIndex).filter(e => e.arrivalTime > now);
  const shown = upcoming.filter(e => e.arrivalTime <= now + windowMs);
  const next = upcoming[0];
  const mins = next ? Math.max(1, Math.ceil((next.arrivalTime - now) / 60_000)) : 0;
  return (
    <div className="arrivals" role="status" aria-live="off">
      <div className="arr-head">
        <span className="sc k">Upcoming arrivals</span>
        {next
          ? <span className="arr-next">Next <span className="num">{clock(next.arrivalTime)}</span> · {ACUITY_NAME[next.acuity]}{next.isFloor ? ` floor upgrade${next.floorTeamId ? ` on Team ${next.floorTeamId}` : ''}` : ''} · in <span className="num">{mins}</span> min</span>
          : <span className="arr-next">No more arrivals this shift</span>}
        <span className="sp" />
        <span className="arr-count num">{shown.length} in next 3 h</span>
      </div>
      <div className="arr-track" aria-hidden="true">
        {[1, 2].map(h => <div key={h} className="arr-hour" style={{ left: `${(h * 60 / ARRIVAL_WINDOW_MIN) * 100}%` }} />)}
        {shown.map((e, i) => (
          e.isFloor
            ? <svg key={`${e.arrivalTime}-${i}`} className={`arr-up ${ACUITY_CLASS[e.acuity]}`} viewBox="0 0 12 12"
                style={{ left: `${((e.arrivalTime - now) / windowMs) * 100}%` }}><path d="M6 1.5 10.5 7H7.6v3.5H4.4V7H1.5z" /></svg>
            : <span key={`${e.arrivalTime}-${i}`} className={`arr-dot ${ACUITY_CLASS[e.acuity]}`}
                style={{ left: `${((e.arrivalTime - now) / windowMs) * 100}%` }} />
        ))}
      </div>
      <div className="arr-scale num" aria-hidden="true"><span>Now</span><span>+1 h</span><span>+2 h</span><span>+3 h</span></div>
    </div>
  );
}

const SPEEDS: [number, string, string][] = [[1, '1×', 'Real time'], [60, '60×', '60 times real time'], [240, '240×', '240 times real time']];

function Toolbar() {
  const { state, dispatch } = useShift();
  const [arrivals, setArrivals] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [roster, setRoster] = useState<string | null>(null);
  const sim = state.simulation;
  const paused = !!sim?.paused;
  const speed = sim?.speed ?? 1;
  const hasNext = !!sim && sim.nextArrivalIndex < sim.timeline.length;

  const setSpeed = (v: number) => {
    dispatch({ type: 'SET_SIM_SPEED', speed: v });
    if (paused) dispatch({ type: 'TOGGLE_SIM_PAUSE' });
  };
  const toggleArrivals = () => { const on = !arrivals; setArrivals(on); dispatch({ type: 'DEMO_ARRIVALS', on }); };
  const reset = () => { setRoster(null); dispatch({ type: 'HYDRATE', shift: buildDemoShift() }); if (arrivals) dispatch({ type: 'DEMO_ARRIVALS', on: true }); };
  const scheduled = async () => {
    setBusy(true); setErr(null);
    try {
      const { shift, label } = await buildScheduledDemoShift();
      dispatch({ type: 'HYDRATE', shift });
      setRoster(label);
      if (arrivals) dispatch({ type: 'DEMO_ARRIVALS', on: true });
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load the sample schedule.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="demobar" role="toolbar" aria-label="Demo controls">
      <div className="seg-group" role="group" aria-label="Clock">
        <button aria-pressed={paused} onClick={() => dispatch({ type: 'TOGGLE_SIM_PAUSE' })}>{paused ? 'Paused' : 'Pause'}</button>
        {SPEEDS.map(([v, l, a]) => <button key={v} aria-label={a} title={a} aria-pressed={!paused && speed === v} onClick={() => setSpeed(v)}>{l}</button>)}
      </div>
      <div className="seg-group">
        <button aria-pressed={arrivals} onClick={toggleArrivals}>Arrivals {arrivals ? 'on' : 'off'}</button>
        {arrivals && <>
          <button className="step" onClick={() => dispatch({ type: 'DEMO_BACK' })} aria-label="Back to the last arrival" title="Back to the last arrival">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3v10M13 3 6 8l7 5z" /></svg>
          </button>
          <button className="step" onClick={() => dispatch({ type: 'SIM_SKIP_TO_NEXT' })} disabled={!hasNext} aria-label="Skip to the next arrival" title="Skip to the next arrival">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12 3v10M3 3l7 5-7 5z" /></svg>
          </button>
        </>}
      </div>
      <div className="seg-group"><button onClick={reset} title="Restart the demo with its standard teams">Reset</button><button onClick={() => void scheduled()} disabled={busy}
        title="Load the teams from a random day of a sample department schedule (made-up names) and restart the demo">{busy ? 'Loading…' : 'Change Teams'}</button></div>
      {roster && <span className="roster-note">Teams from the sample schedule: {roster}</span>}
      {err && <span role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>{err}</span>}
      {arrivals && <ArrivalStrip />}
    </div>
  );
}

export default function Demo(props: Omit<BoardProps, 'mode' | 'toolbar'>) {
  const { state, dispatch } = useShift();
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    dispatch({ type: 'HYDRATE', shift: buildDemoShift() });
  }, [dispatch]);
  if (!state.shiftStarted) return null;
  return <Board {...props} mode="demo" toolbar={<Toolbar />} />;
}
