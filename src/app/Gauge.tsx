// © 2026 New York University. All rights reserved.
import type { AcuityTier, Recommendation, TeamId } from '../types';
import {
  ACUITY_CLASS, ALL_TEAMS, GAUGE_TICKS, TRAUMA, displayRatio, formatRatio, gaugeLevel, highCount, ratioAfter, teamName,
} from '../ui/model';

const TEAM_TONE: Record<TeamId, string> = { 1: 'var(--c1)', 2: 'var(--c2)', 3: 'var(--c3)', 4: 'var(--line2)' };
const PREVIEW_TONE: Record<string, string> = { red: 'var(--red-fill)', yellow: 'var(--yellow-fill)', purple: 'var(--purple-fill)' };

/**
 * Shared vertical gauge: one column per team on one scale, ratio / (ratio + 22).
 * Reads the same recommendation snapshot as the ledger rows, so the numbers match.
 */
export default function Gauge({ rec, closedTeams, deceased, armed, onOpen }: {
  rec: Recommendation;
  closedTeams: Record<number, number>;
  /** Minutes left on each team's deceased buffer (0 when none). */
  deceased: Record<number, number>;
  armed: AcuityTier | null;
  onOpen: (t: TeamId) => void;
}) {
  const scores = rec.scores;
  const high = highCount(scores);
  const first = rec.first;
  const s1 = scores.find(s => s.teamId === first);
  const s2 = scores.find(s => s.teamId === rec.second);

  return (
    <div className={`card gcard${ALL_TEAMS.some(t => t in closedTeams || deceased[t] > 0) ? ' marked' : ''}`} data-tour="gauge">
      <div className="ghead">
        <div>
          <div className="sc k">Next recommended</div>
          <b>{first ? teamName(first) : 'No eligible team'}{s1 && <>{' '}<small className="num rchip">{displayRatio(s1, scores)}</small></>}</b>
        </div>
        <span className="sp" />
        {s2 && <span className="then">Next after: {teamName(s2.teamId)} <span className="num rchip">{displayRatio(s2, scores)}</span></span>}
      </div>
      <div className="gdirection gtop"><span aria-hidden="true">↑</span> More Capacity</div>
      <div className="gwrap">
        <div className="axis" aria-hidden="true">
          {GAUGE_TICKS.map(([r, l]) => <span key={l} className="num" style={{ bottom: `${gaugeLevel(r, 1)}%` }}>{l}</span>)}
        </div>
        <div className="tubes">
          {GAUGE_TICKS.map(([r, l]) => <div key={l} className="gridline" style={{ bottom: `${gaugeLevel(r, 1)}%` }} />)}
          {ALL_TEAMS.map(t => {
            const s = scores.find(x => x.teamId === t)!;
            const level = gaugeLevel(s.capacityRatio, s.capacity);
            const isNext = t === first;
            const closed = t in closedTeams;
            const preview = armed && isNext;
            const after = preview ? ratioAfter(s, armed) : 0;
            const afterLevel = preview ? gaugeLevel(after, s.capacity) : 0;
            const label = displayRatio(s, scores);
            const pv = armed ? PREVIEW_TONE[ACUITY_CLASS[armed]] : undefined;
            return (
              <button
                key={t}
                className={`tube${t === TRAUMA ? ' tr' : ''}${isNext ? ' next' : ''}${closed ? ' closed' : ''}`}
                style={{ ['--tc' as string]: TEAM_TONE[t], ['--pv' as string]: pv }}
                onClick={() => onOpen(t)}
                aria-label={`${teamName(t)}, ratio ${label === '∞' ? 'infinity' : label}${isNext ? ', recommended' : ''}${closed ? ', closed' : ''}${deceased[t] > 0 ? `, deceased buffer ${deceased[t]} minutes left` : ''}. Open details.`}
              >
                <div className="clip">
                  <div className="fill" style={{ height: `${level}%` }} />
                  {preview && <div className="gdrain" style={{ bottom: `${afterLevel}%`, height: `${Math.max(0, level - afterLevel)}%` }} />}
                </div>
                {preview && <>
                  <div className="gz" style={{ bottom: `${afterLevel}%` }} />
                  <div className="garrow" style={{ bottom: `${afterLevel}%`, height: `calc(${Math.max(0, level - afterLevel)}% - 14px)` }} />
                  <div className="gval num" style={{ bottom: `calc(${afterLevel}% - 26px)` }}>→ {formatRatio(after, s.capacity, high)}</div>
                </>}
                <div className="surf num" style={{ bottom: `${Math.min(level, 91)}%` }}>{label}</div>
                {(closed || deceased[t] > 0) && (
                  <div className="gmark">
                    {closed && <span>Closed</span>}
                    {deceased[t] > 0 && <span title="Deceased buffer: ranked last until it ends">{t === TRAUMA ? <>Dec.<br />{deceased[t]}m</> : <>Deceased<br />{deceased[t]} min</>}</span>}
                  </div>
                )}
                <div className="tlab">{t === TRAUMA ? 'T4' : teamName(t)}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="gdirection gfoot"><span aria-hidden="true">↓</span> Less Capacity</div>
    </div>
  );
}
