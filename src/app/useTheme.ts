// © 2026 New York University. All rights reserved.
import { useCallback, useEffect, useState } from 'react';

// v2: light became the default on 2026-09-28. The old key held 'dark' on every device that had
// opened the app (it was saved on first load), so a new key lets the new default reach them.
const THEME_KEY = 'cct-theme-v2';

/** Light by default. The choice is remembered per device. */
export function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0c0c' : '#e7e7e7');
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* per-device convenience only */ }
  }, [dark]);
  return [dark, useCallback(() => setDark(d => !d), [])];
}
