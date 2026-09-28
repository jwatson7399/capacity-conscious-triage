// © 2026 New York University. All rights reserved.
//
// The demo runs in its own ShiftProvider (see CarbonApp), so nothing here can reach a
// live shift. Same board, same engine; only the clock and the sample data differ.
import { useEffect, useRef, useState } from 'react';
import { useShift } from '../context/ShiftContext';
import { buildDemoShift, buildScheduledDemoShift } from '../ui/samples';
import Board, { type BoardProps } from './Board';

const SPEEDS: [number, string, string][] = [[1, '1×', 'Real time'], [60, '60×', '60 times real time'], [240, '240×', '240 times real time']];

function Toolbar() {
  const { state, dispatch } = useShift();
  const [arrivals, setArrivals] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sim = state.simulation;
  const paused = !!sim?.paused;
  const speed = sim?.speed ?? 1;

  const setSpeed = (v: number) => {
    dispatch({ type: 'SET_SIM_SPEED', speed: v });
    if (paused) dispatch({ type: 'TOGGLE_SIM_PAUSE' });
  };
  const toggleArrivals = () => { const on = !arrivals; setArrivals(on); dispatch({ type: 'DEMO_ARRIVALS', on }); };
  const reset = () => { dispatch({ type: 'HYDRATE', shift: buildDemoShift() }); if (arrivals) dispatch({ type: 'DEMO_ARRIVALS', on: true }); };
  const scheduled = async () => {
    setBusy(true); setErr(null);
    try {
      dispatch({ type: 'HYDRATE', shift: await buildScheduledDemoShift() });
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
      <div className="seg-group"><button aria-pressed={arrivals} onClick={toggleArrivals}>Arrivals {arrivals ? 'on' : 'off'}</button></div>
      <div className="seg-group"><button onClick={reset}>Reset</button><button onClick={() => void scheduled()} disabled={busy}>{busy ? 'Loading…' : 'Sample scheduled shift'}</button></div>
      {err && <span role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>{err}</span>}
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
