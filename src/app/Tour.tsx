// © 2026 New York University. All rights reserved.
//
// Six-step tour on its own sample shift (its own ShiftProvider, clock held still).
// It can never touch a live shift. Skippable and replayable from Home or ?tour.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AcuityTier, TeamId } from '../types';
import { useShift } from '../context/ShiftContext';
import { buildTourShift } from '../ui/samples';
import { baseWeight, teamName } from '../ui/model';
import Board, { type BoardProps } from './Board';

interface Step {
  title: string;
  body: (ctx: { rec: TeamId | null }) => string;
  target: string | null;
  pos: 'top' | 'bottom';
  ui: { armed?: AcuityTier | null; detail?: TeamId | null | 'rec'; activity?: boolean; override?: boolean };
}

const STEPS: Step[] = [
  {
    title: 'Compare teams',
    body: ({ rec }) => `Each column is a team on one shared scale. Fuller means more room. The number is the team's strength divided by its patient load. The outlined column${rec ? `, ${teamName(rec)},` : ''} is recommended next.`,
    target: 'gauge', pos: 'bottom', ui: { armed: null, detail: null, activity: false, override: false },
  },
  {
    title: 'Read patient load',
    body: () => `Each segment is one patient, sized by what it adds right now. A Red starts at ${baseWeight('tier_one')} units and a Purple at ${baseWeight('tier_three')}, so a new Red is four times a Purple. Each shrinks to zero as its time runs out.`,
    target: 'ledger', pos: 'top', ui: { armed: null, detail: null },
  },
  {
    title: 'Inspect a team',
    body: () => 'Tap any column or row to open the team. You see when each patient was placed, what each still adds, and how long until it no longer counts. Timers describe the model, not the patient. A tap never assigns anyone.',
    target: null, pos: 'bottom', ui: { armed: null, detail: 'rec' },
  },
  {
    title: 'Preview an assignment',
    body: () => 'Pick an acuity. The dashed line shows where the recommended team will land and the stripes show what this patient takes. Nothing is placed yet.',
    target: 'assign', pos: 'bottom', ui: { detail: null, armed: 'tier_two' },
  },
  {
    title: 'Place or override',
    body: () => 'Place puts the patient on the recommended team. Other team lets you choose another one and asks why; the reason is saved with the assignment. Try placing this one.',
    target: 'assign', pos: 'bottom', ui: { detail: null, override: false },
  },
  {
    title: 'Activity and undo',
    body: () => 'Every placement, override and undo is listed here with the ratios at that moment. After a placement you have 30 seconds to undo it.',
    target: null, pos: 'top', ui: { armed: null, detail: null, override: false, activity: true },
  },
];

function TourRunner(props: Omit<BoardProps, 'mode' | 'tourUi' | 'onUiChange'> & { onExit: () => void; onDemo: () => void }) {
  const { recommendation } = useShift();
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const [recTeam] = useState(recommendation.first);
  const cardRef = useRef<HTMLDivElement>(null);

  const tourUi = useMemo(() => {
    const u = step.ui;
    return { ...u, detail: u.detail === 'rec' ? recTeam : u.detail };
  }, [step, recTeam]);

  useEffect(() => {
    document.querySelectorAll('.tour-hl').forEach(el => el.classList.remove('tour-hl'));
    if (step.target) {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      el?.classList.add('tour-hl');
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    cardRef.current?.focus();
    return () => { document.querySelectorAll('.tour-hl').forEach(el => el.classList.remove('tour-hl')); };
  }, [i, step.target]);

  const onUiChange = useCallback(() => {}, []);
  const last = i === STEPS.length - 1;

  return <>
    <Board {...props} mode="tour" tourUi={tourUi} onUiChange={onUiChange} />
    <div ref={cardRef} tabIndex={-1} data-focus-companion className="tour-card" role="dialog" aria-label={`Tour step ${i + 1} of ${STEPS.length}`}
      style={step.pos === 'top' ? { top: 12 } : { bottom: 'calc(var(--keys-h, 200px) + 24px)' }}>
      <div className="sc" style={{ opacity: .7 }}>Step {i + 1} of {STEPS.length}</div>
      <h2>{step.title}</h2>
      <p>{step.body({ rec: recTeam })}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={props.onExit}>Skip tour</button>
        <span className="sp" />
        {i > 0 && <button className="btn sm" onClick={() => setI(i - 1)}>Back</button>}
        {last
          ? <><button className="btn sm" onClick={props.onDemo}>Try the demo</button><button className="btn sm primary" onClick={props.onExit}>Done</button></>
          : <button className="btn sm primary" onClick={() => setI(i + 1)}>Next</button>}
      </div>
    </div>
  </>;
}

export default function Tour(props: Omit<BoardProps, 'mode' | 'tourUi' | 'onUiChange'> & { onExit: () => void; onDemo: () => void }) {
  const { state, dispatch } = useShift();
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    dispatch({ type: 'HYDRATE', shift: buildTourShift() });
  }, [dispatch]);
  if (!state.shiftStarted) return null;
  return <TourRunner {...props} />;
}
