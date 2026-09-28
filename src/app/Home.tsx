// © 2026 New York University. All rights reserved.
import { useShift } from '../context/ShiftContext';
import { clock } from '../ui/model';
import { draftCount } from './draft';

export default function Home({ dark, onToggleDark, onStart, onResume, onDemo, onTour, onHow }: {
  dark: boolean;
  onToggleDark: () => void;
  onStart: () => void;
  onResume: () => void;
  onDemo: () => void;
  onTour: () => void;
  onHow: () => void;
}) {
  const { state, activity } = useShift();
  const running = state.shiftStarted;
  const started = activity.find(e => e.kind === 'shift_start');
  const draft = running ? 0 : draftCount();

  return (
    <div className="home">
      <header className="appbar">
        <div><div className="ttl" style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.2px' }}>Capacity Conscious Triage</div><div className="sub">A-side</div></div>
        <span className="sp" />
        <span className="clock num">{clock(state.now)}</span>
      </header>
      <main>
        <section className="hero">
          <div className="sc muted">{running ? 'Shift in progress' : 'Ready for the next shift'}</div>
          <h1>A shared view<br />of team capacity.</h1>
          <p className="lede">Suggests which A-side team should take the next patient, based on who is on each team and how much load they carry. You make every assignment.</p>
          {running
            ? <button className="btn primary lg full" onClick={onResume}>Resume shift →</button>
            : <button className="btn primary lg full" onClick={onStart}>Start shift →</button>}
          <div className="muted" style={{ fontSize: 13, margin: '10px 2px 22px' }}>
            {running
              ? `Started ${started ? clock(started.at) : ''} · ${state.providers.length} providers · ${state.patients.length} patient${state.patients.length === 1 ? '' : 's'} placed`
              : draft ? `${draft} provider${draft === 1 ? '' : 's'} in your saved draft` : 'Set up the teams, then open the live board.'}
          </div>
          <div className="opts c2">
            <button className="btn" onClick={onDemo}>Try the demo</button>
            <button className="btn" onClick={onTour}>Take the tour</button>
          </div>
          <button className="btn quiet full" style={{ marginTop: 8 }} onClick={onHow}>How it works</button>
        </section>
      </main>
      <footer style={{ padding: '0 16px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="pill" onClick={onToggleDark} aria-pressed={dark}>{dark ? 'Dark mode on' : 'Light mode on'}</button>
        </div>
        <div className="foot">© 2026 New York University · Advisory only. You make every assignment.</div>
      </footer>
    </div>
  );
}
