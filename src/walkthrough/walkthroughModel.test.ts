// © 2026 New York University. All rights reserved.
//
// Ties the walkthrough (public/walkthrough-v4.html) to the app. Its numbers all come from
// public/walkthrough-model.js; these tests fail if that file's weights, decay, ratios or
// suggestions drift from src/constants.ts and the scoring engine, or if the slides go back
// to typed-in numbers.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AcuityTier, Patient, Provider, ProviderType, TeamId } from '../types';
import { ACUITY_DECAY, ACUITY_WEIGHTS, CAPACITY_WEIGHTS } from '../constants';
import { getRecommendation } from '../engine/recommendation';

const root = resolve(__dirname, '../..');
const src = readFileSync(resolve(root, 'public/walkthrough-model.js'), 'utf8');
const html = readFileSync(resolve(root, 'public/walkthrough-v4.html'), 'utf8');
const mod = { exports: {} as Record<string, unknown> };
new Function('module', 'window', src)(mod, {});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const W = mod.exports as any;

const TIER: Record<string, AcuityTier> = { Red: 'tier_one', Yellow: 'tier_two', Purple: 'tier_three' };
const TEAM: Record<string, TeamId> = { T1: 1, T2: 2, T3: 3 };
const T0 = 10 * 3600_000;
const ms = (min: number) => T0 + min * 60_000;

function engineAt(min: number, assigns: { acuity: string; team: string; t: number }[]) {
  const providers: Provider[] = (W.ROSTER as { team: string; role: ProviderType; from: number }[])
    .filter(r => r.from <= min)
    .map((r, i) => ({ id: `p${i}`, name: r.role, type: r.role, status: 'active', statusExpiresAt: null, teamId: TEAM[r.team] }));
  const patients: Patient[] = assigns.filter(a => a.t <= min)
    .map((a, i) => ({ id: `x${i}`, acuity: TIER[a.acuity], assignedTeamId: TEAM[a.team], assignedAt: ms(a.t) }));
  return getRecommendation(providers, patients, [], ms(min));
}

describe('walkthrough model matches the app', () => {
  it('provider weights match constants.ts', () => {
    expect(W.WEIGHTS).toEqual(CAPACITY_WEIGHTS);
  });

  it('acuity weights and decay match constants.ts', () => {
    for (const [name, tier] of Object.entries(TIER)) {
      expect(W.ACUITY[name].w).toBe(ACUITY_WEIGHTS[tier]);
      expect(W.ACUITY[name].minutes * 60_000).toBe(ACUITY_DECAY[tier][ACUITY_DECAY[tier].length - 1].afterMs);
    }
  });

  for (const strategy of ['actual', 'formula']) {
    it(`${strategy} replay: every ratio and suggestion matches the engine`, () => {
      const steps = W.replay(strategy);
      const placed: { acuity: string; team: string; t: number }[] = [];
      for (const s of steps) {
        const rec = engineAt(s.t, placed);
        expect(`T${rec.first}`).toBe(s.suggested);
        for (const id of ['T1', 'T2', 'T3']) {
          const e = rec.scores[TEAM[id] - 1].capacityRatio;
          if (isFinite(e)) expect(s.ratios[id]).toBeCloseTo(e, 9);
          else expect(s.ratios[id]).toBe(Infinity);
        }
        placed.push({ acuity: s.acuity, team: s.team, t: s.t });
      }
    });
  }

  it('intro team strengths match the engine', () => {
    for (const id of ['T1', 'T2', 'T3']) {
      const roles: ProviderType[] = W.INTRO_TEAMS[id];
      const providers = roles.map((r, i) => ({ id: `i${i}`, name: r, type: r, status: 'active' as const, statusExpiresAt: null, teamId: 1 as TeamId }));
      const cap = getRecommendation(providers, [], [], T0).scores[0].capacity;
      expect(W.strengthOf(roles)).toBeCloseTo(cap, 9);
    }
  });
});

describe('the story the slides tell', () => {
  it('suggestions along the real morning are 1, 2, 2, 3, 3, 3, 3, 1 with four disagreements', () => {
    const steps = W.replay('actual');
    expect(steps.map((s: { suggested: string }) => s.suggested)).toEqual(['T1', 'T2', 'T2', 'T3', 'T3', 'T3', 'T3', 'T1']);
    expect(steps.filter((s: { suggested: string; actual: string }) => s.suggested !== s.actual).length).toBe(4);
  });

  it('counts and the worst peak', () => {
    expect(W.counts('actual')).toEqual({ T1: 4, T2: 3, T3: 1 });
    expect(W.counts('formula')).toEqual({ T1: 4, T2: 2, T3: 2 });
    const h = W.worstPeak('actual');
    const f = W.worstPeak('formula');
    expect([h.team, h.load.toFixed(1), W.clock(h.t)]).toEqual(['T2', '5.9', '12:02']);
    expect(f.load.toFixed(1)).toBe('4.9');
  });

  it('load-minutes total the same under both, 765', () => {
    const total = (s: string) => ['T1', 'T2', 'T3'].reduce((a, t) => a + W.loadMinutes(t, s), 0);
    expect(Math.round(total('actual'))).toBe(765);
    expect(Math.round(total('formula'))).toBe(765);
  });
});

describe('the slides', () => {
  it('load the model and type in no weights or ratios by hand', () => {
    expect(html).toContain('<script src="walkthrough-model.js"></script>');
    // Old or stray weights that must not reappear as literals.
    for (const bad of ['11.6', '10.9', '6.7', '2.3]', '57.7', '38.3', '37.5', '42.5', 'capOverride', 'ESI-']) {
      expect(html, bad).not.toContain(bad);
    }
  });

  it('have no em dashes and carry the NYU copyright line', () => {
    expect(html).not.toMatch(/—|&mdash;/);
    expect(html).toContain('© 2026 New York University');
  });
});
