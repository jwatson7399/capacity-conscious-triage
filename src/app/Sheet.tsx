// © 2026 New York University. All rights reserved.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { trapTab } from './focus';

/**
 * Bottom sheet on phones, centered (or side) sheet on tablets. Escape or a tap on the
 * backdrop closes it. Focus moves into the sheet and returns to the opener on close.
 */
export default function Sheet({ label, onClose, children, side = false, wide = false }: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  side?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('button, [href], input, select, textarea');
    first?.focus({ preventScroll: true });
    const isTop = () => {
      const scrims = document.querySelectorAll('.scrim');
      return !!el && scrims[scrims.length - 1] === el.parentElement;
    };
    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); }
      if (e.key === 'Tab' && el) trapTab(e, el);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div className={`scrim${side ? ' side' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        <div className="grab" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.getElementById('cct-root') ?? document.body,
  );
}

export function SheetHeader({ title, sub, onClose }: { title: ReactNode; sub?: ReactNode; onClose: () => void }) {
  return (
    <div className="between" style={{ marginBottom: 6 }}>
      <div>
        <h2>{title}</h2>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <button className="btn quiet icon-btn" onClick={onClose} aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}

export function Confirm({ title, body, confirmLabel, danger, onConfirm, onCancel }: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet label={title} onClose={onCancel}>
      <SheetHeader title={title} onClose={onCancel} />
      <div style={{ color: 'var(--tx2)', margin: '6px 0 4px' }}>{body}</div>
      <div className="sheet-actions">
        <button className="btn" onClick={onCancel} data-autofocus>Cancel</button>
        <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Sheet>
  );
}

export function Copyright() {
  return <div className="foot">© 2026 New York University · Advisory only. You make every assignment.</div>;
}
