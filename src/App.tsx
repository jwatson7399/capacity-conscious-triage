import { useEffect, Component, type ReactNode } from 'react';
import { ShiftProvider, useShift } from './context/ShiftContext';
import RoleSelection from './components/RoleSelection';
import ShiftSetup from './components/ShiftSetup';
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

  // Global 1-second ticker
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(id);
  }, [dispatch]);

  if (!state.currentRole) return <RoleSelection />;
  if (!state.shiftStarted && state.currentRole === 'charge_nurse') return <ShiftSetup />;
  return <Dashboard />;
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
