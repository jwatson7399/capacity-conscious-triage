import { useState, useEffect, Component, type ReactNode } from 'react';
import { ShiftProvider, useShift } from './context/ShiftContext';
import RoleSelection from './components/RoleSelection';
import Dashboard from './components/Dashboard';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4 bg-red-100 text-red-900 text-sm font-mono whitespace-pre-wrap">
          <div className="font-bold mb-2">Crash caught:</div>
          {this.state.error.message}
          {'\n\n'}
          {this.state.error.stack}
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 bg-red-600 text-white px-4 py-2 rounded block"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppInner() {
  const { state, dispatch } = useShift();
  const [tourActive, setTourActive] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('er-triage-dark') === 'true';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('er-triage-dark', String(darkMode));
  }, [darkMode]);

  // Global 1-second ticker
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(id);
  }, [dispatch]);

  // Auto-start tour from ?tour URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('tour')) {
      dispatch({ type: 'LOAD_TOUR_DEMO' });
      setTourActive(true);
    }
  }, [dispatch]);

  const handleTourComplete = () => {
    setTourActive(false);
    history.replaceState(null, '', window.location.pathname);
  };

  const handleStartTour = () => {
    dispatch({ type: 'LOAD_TOUR_DEMO' });
    setTourActive(true);
  };

  // Auto-start shift with no providers for nurse roles (skip ShiftSetup)
  useEffect(() => {
    if ((state.currentRole === 'charge_nurse' || state.currentRole === 'triage_nurse') && !state.shiftStarted) {
      dispatch({ type: 'START_SHIFT', providers: [] });
    }
  }, [state.currentRole, state.shiftStarted, dispatch]);

  if (!state.currentRole) return <RoleSelection onStartTour={handleStartTour} darkMode={darkMode} onToggleDarkMode={() => setDarkMode(d => !d)} />;
  if (!state.shiftStarted) return null; // brief flash while auto-starting
  return <Dashboard tourActive={tourActive} onTourComplete={handleTourComplete} darkMode={darkMode} onToggleDarkMode={() => setDarkMode(d => !d)} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ShiftProvider>
        <AppInner />
      </ShiftProvider>
    </ErrorBoundary>
  );
}
