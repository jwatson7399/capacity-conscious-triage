// © 2026 New York University. All rights reserved.
//
// The Carbon interface. One role, one shared device.
// The live shift's provider is mounted for the whole session, so going Home never wipes
// a shift. The demo and the tour mount their own providers inside it; they cannot reach
// the live shift's state.
import { useCallback, useState } from 'react';
import type { Provider } from '../types';
import { ShiftProvider, useShift } from '../context/ShiftContext';
import Home from './Home';
import SetupScreen from './SetupScreen';
import { clearDraft } from './draft';
import { useTheme } from './useTheme';
import Ticker from './Ticker';
import Board from './Board';
import Demo from './Demo';
import Tour from './Tour';
import { Help, HowItWorks } from './Help';

type Screen = 'home' | 'setup' | 'board' | 'demo' | 'tour';
type Overlay = 'help' | 'how' | null;

function hasParam(name: string): boolean {
  try { return new URLSearchParams(window.location.search).has(name); } catch { return false; }
}

function Screens() {
  const { state, dispatch } = useShift();
  const [dark, toggleDark] = useTheme();
  const [screen, setScreen] = useState<Screen>(() => (hasParam('tour') ? 'tour' : 'home'));
  const [overlay, setOverlay] = useState<Overlay>(() => (hasParam('walkthrough') ? 'how' : null));

  const go = useCallback((s: Screen) => {
    setScreen(s);
    window.scrollTo(0, 0);
    if (s !== 'tour' && hasParam('tour')) history.replaceState(null, '', window.location.pathname);
  }, []);
  const home = useCallback(() => go('home'), [go]);
  const help = useCallback(() => setOverlay('help'), []);
  const how = useCallback(() => setOverlay('how'), []);
  const closeOverlay = useCallback(() => {
    setOverlay(null);
    if (hasParam('walkthrough')) history.replaceState(null, '', window.location.pathname);
  }, []);

  const start = (providers: Provider[], floats: string[]) => {
    dispatch({ type: 'START_SHIFT', providers });
    dispatch({ type: 'SET_FLOAT_ATTENDINGS', names: floats });
    clearDraft();
    go('board');
  };
  const endShift = () => { dispatch({ type: 'RESET' }); go('home'); };

  const common = { dark, onToggleDark: toggleDark, onHome: home, onHelp: help, onHow: how };

  return <>
    {screen === 'home' && <Home dark={dark} onToggleDark={toggleDark} onStart={() => go('setup')} onResume={() => go('board')}
      onDemo={() => go('demo')} onTour={() => go('tour')} onHow={how} />}
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
