// © 2026 New York University. All rights reserved.
//
// How it works: "Walk through the method" opens the slide walkthrough
// (public/walkthrough-v4.html) full screen. Its numbers come from
// public/walkthrough-model.js, which src/walkthrough/walkthroughModel.test.ts ties to the
// engine. The top bar or Escape returns to How it works; the walkthrough's own Home button
// (a same-origin postMessage) goes to the home screen.
import { useEffect, useRef } from 'react';

export default function WalkthroughFrame({ onClose, onHome }: { onClose: () => void; onHome?: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);

  const homeRef = useRef(onHome);
  useEffect(() => { homeRef.current = onHome; });
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === 'cct-home') homeRef.current?.();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const dark = document.documentElement.classList.contains('dark');
  const src = `${import.meta.env.BASE_URL}walkthrough-v4.html?dark=${dark ? '1' : '0'}`;

  // Escape closes only the walkthrough, not the page beneath it, whether focus is in
  // the app or inside the walkthrough (same origin).
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  const onKey = useRef((e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeRef.current(); }
  });
  useEffect(() => {
    const h = onKey.current;
    const f = frame.current;
    window.addEventListener('keydown', h, true);
    return () => {
      window.removeEventListener('keydown', h, true);
      try { f?.contentWindow?.removeEventListener('keydown', h, true); } catch { /* not reachable */ }
    };
  }, []);
  const onLoad = () => {
    const w = frame.current?.contentWindow;
    try { w?.addEventListener('keydown', onKey.current, true); } catch { /* not reachable */ }
    w?.focus();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Walk through the method"
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <header className="appbar" style={{ padding: '6px 12px', maxWidth: 'none', borderBottom: '1px solid var(--line)' }}>
        <button className="btn quiet sm" onClick={onClose}>‹ How it works</button>
        <span className="sp" />
        <span className="sub">Walk through the method</span>
      </header>
      <iframe ref={frame} src={src} title="Walk through the method"
        onLoad={onLoad}
        style={{ flex: 1, width: '100%', border: 0, display: 'block' }} />
    </div>
  );
}
