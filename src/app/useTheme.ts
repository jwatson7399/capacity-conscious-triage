// © 2026 New York University. All rights reserved.
import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'cct-theme';

/** Dark by default (the saved Carbon preference). The choice is remembered per device. */
export function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) !== 'light'; } catch { return true; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0c0c' : '#e7e7e7');
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* per-device convenience only */ }
  }, [dark]);
  return [dark, useCallback(() => setDark(d => !d), [])];
}
