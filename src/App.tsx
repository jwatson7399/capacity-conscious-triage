// © 2026 New York University. All rights reserved.
import { Component, lazy, Suspense, type ReactNode } from 'react';
import CarbonApp from './app/CarbonApp';

// Research tools load only on the hidden ?lab route.
const LabApp = lazy(() => import('./lab/LabApp'));

function isLab(): boolean {
  try { return new URLSearchParams(window.location.search).has('lab'); } catch { return false; }
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
          <b>Something went wrong.</b>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{this.state.error.message}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ minHeight: 44, padding: '0 16px' }}>Try again</button>
          <p style={{ fontSize: 12 }}>© 2026 New York University</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return <ErrorBoundary>{isLab() ? <Suspense fallback={null}><LabApp /></Suspense> : <CarbonApp />}</ErrorBoundary>;
}
