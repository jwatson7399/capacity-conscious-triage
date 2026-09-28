// © 2026 New York University. All rights reserved.
//
// Hidden ?lab route: research tools in the same build (Roundtable 2026-09-28,
// Decision 5). Simulations still run on the pre-Carbon Dashboard, which stays here only
// for research. It shares the frozen weights and the unchanged engine.
import { ShiftProvider, useShift } from '../context/ShiftContext';
import Dashboard from '../components/Dashboard';
import Ticker from '../app/Ticker';
import { useTheme } from '../app/useTheme';
import LabHome from './LabHome';

function LabInner() {
  const { state } = useShift();
  const [dark, toggleDark] = useTheme();
  if (!state.shiftStarted) return <LabHome darkMode={dark} onToggleDarkMode={toggleDark} />;
  return <Dashboard darkMode={dark} onToggleDarkMode={toggleDark} />;
}

export default function LabApp() {
  return (
    <ShiftProvider>
      <Ticker />
      <LabInner />
    </ShiftProvider>
  );
}
