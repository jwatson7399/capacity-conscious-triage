// © 2026 New York University. All rights reserved.
import type { AcuityTier, Recommendation, ShiftState, TeamId } from '../types';
import {
  A_SIDE, ACUITIES, ACUITY_CLASS, ACUITY_NAME, ROLE_SHORT, TRAUMA, baseWeight, contribution,
  deceasedMinutesLeft, displayRatio, isCounted, providerLabel, teamName, teamPatients, teamProviders,
} from '../ui/model';

const TEAM_TONE: Record<TeamId, string> = { 1: 'var(--c1)', 2: 'var(--c2)', 3: 'var(--c3)', 4: 'var(--line2)' };
const PREVIEW_TONE: Record<string, string> = { red: 'var(--red-fill)', yellow: 'var(--yellow-fill)', purple: 'var(--purple-fill)' };

export function TeamTags({ state, t, isNext }: { state: ShiftState; t: TeamId; isNext: boolean }) {
  const deceased = deceasedMinutesLeft(state, t);
  return <>
    {isNext && <span className="tag">Recommended</span>}
    {t in state.closedTeams && <span className="tag outline">Closed</span>}
    {deceased > 0 && <span className="tag outline" title="Deceased buffer: this team is ranked last until it ends">Deceased · {deceased} min</span>}
  </>;
}

/** Shared scale for every load strip, in load units, rounded up to a multiple of 4. */
function stripScale(rec: Recommendation, armed: AcuityTier | null): number {
  const max = Math.max(8, ...A_SIDE.map(t => {
    const s = rec.scores.find(x => x.teamId === t)!;
    return s.load + (armed && t === rec.first ? baseWeight(armed) : 0);
  }));
  return Math.ceil(max / 4) * 4;
}

export default function Ledger({ state, rec, armed, onOpen }: {
  state: ShiftState;
  rec: Recommendation;
  armed: AcuityTier | null;
  onOpen: (t: TeamId) => void;
}) {
  const scores = rec.scores;
  const scale = stripScale(rec, armed);
  const tr = scores.find(s => s.teamId === TRAUMA)!;
  const trCounting = teamPatients(state, TRAUMA).filter(p => isCounted(p, state.now)).length;

  return <>
    <div className="lhead"><span className="sc">A-side teams</span><span className="sc">Load by patient</span></div>
    <div className="card lcard" data-tour="ledger">
      {A_SIDE.map(t => {
        const s = scores.find(x => x.teamId === t)!;
        const isNext = t === rec.first;
        const counting = teamPatients(state, t)
          .filter(p => isCounted(p, state.now))
          .sort((a, b) => b.assignedAt - a.assignedAt);
        const providers = teamProviders(state, t);
        const ratio = displayRatio(s, scores);
        return (
          <button key={t} className={`row${isNext ? ' next' : ''}`} style={{ ['--tc' as string]: TEAM_TONE[t] }} onClick={() => onOpen(t)}
            aria-label={`${teamName(t)}, ratio ${ratio === '∞' ? 'infinity' : ratio}${isNext ? ', recommended' : ''}. Open details.`}>
            <div className="g">
              <div className="who">
                <b><span className="sw" />{teamName(t)} <TeamTags state={state} t={t} isNext={isNext} /></b>
                <div className="ros">
                  {providers.length === 0 ? 'No providers' : providers.map((p, i) => (
                    <span key={p.id} style={{ fontSize: 12 }}>{i > 0 && ' · '}{providerLabel(p)} <span>{ROLE_SHORT[p.type]}</span></span>
                  ))}
                </div>
              </div>
              <div className="n num">{ratio}<small>{s.capacity === 0 ? 'no providers' : 'ratio'}</small></div>
            </div>
            <div className="cnt">
              {ACUITIES.map(a => <span key={a} className={ACUITY_CLASS[a]}>{ACUITY_NAME[a]} {counting.filter(p => p.acuity === a).length}</span>)}
            </div>
            <div className="strip" aria-hidden="true">
              {armed && isNext && <span className="seg ghost" style={{ flexBasis: `${baseWeight(armed) / scale * 100}%`, ['--pv' as string]: PREVIEW_TONE[ACUITY_CLASS[armed]] }} />}
              {counting.map(p => (
                <span key={p.id} className={`seg ${ACUITY_CLASS[p.acuity]}`} style={{ flexBasis: `${contribution(p, state.now) / scale * 100}%` }} title={`${p.id} ${ACUITY_NAME[p.acuity]}`} />
              ))}
            </div>
            <div className="smeta num"><span>{s.load.toFixed(2)} load</span><span>{counting.length} counting</span></div>
          </button>
        );
      })}
      <div className="legend">
        <span><i style={{ background: 'var(--red-fill)' }} />Red {baseWeight('tier_one')}</span>
        <span><i style={{ background: 'var(--yellow-fill)' }} />Yellow {baseWeight('tier_two')}</span>
        <span><i style={{ background: 'var(--purple-fill)' }} />Purple {baseWeight('tier_three')}</span>
        <span className="sp" />
        <span>Load units at placement. Bar = {scale} units</span>
      </div>
    </div>
    <button className="trrow" onClick={() => onOpen(TRAUMA)} data-tour="trauma" aria-label="Trauma, Team 4. Open details.">
      <b>Trauma · Team 4 <TeamTags state={state} t={TRAUMA} isNext={false} /></b>
      <span className="num">{displayRatio(tr, scores)} · {trCounting} counting</span>
      <span>Outside A-side ranking</span>
    </button>
  </>;
}
