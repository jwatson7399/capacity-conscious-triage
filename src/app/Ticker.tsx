// © 2026 New York University. All rights reserved.
import { useEffect } from 'react';
import { useShift } from '../context/ShiftContext';

/** One-second clock for the ShiftProvider it sits in. */
export default function Ticker() {
  const { dispatch } = useShift();
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(id);
  }, [dispatch]);
  return null;
}
