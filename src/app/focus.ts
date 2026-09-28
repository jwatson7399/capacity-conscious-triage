// © 2026 New York University. All rights reserved.

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab and Shift+Tab inside an open sheet or drawer. Elements marked
 * data-focus-companion (the tour card) stay reachable alongside it.
 */
export function trapTab(e: KeyboardEvent, root: HTMLElement) {
  const companions = [...document.querySelectorAll<HTMLElement>('[data-focus-companion]')];
  const items = [root, ...companions].flatMap(c => [...c.querySelectorAll<HTMLElement>(FOCUSABLE)]).filter(x => x.offsetParent !== null || x === document.activeElement);
  if (items.length === 0) return;
  const active = document.activeElement as HTMLElement | null;
  const idx = active ? items.indexOf(active) : -1;
  e.preventDefault();
  if (idx === -1) { items[e.shiftKey ? items.length - 1 : 0].focus(); return; }
  const next = (idx + (e.shiftKey ? -1 : 1) + items.length) % items.length;
  items[next].focus();
}
