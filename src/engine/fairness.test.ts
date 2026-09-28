// © 2026 New York University. All rights reserved.
import { describe, expect, it } from 'vitest';
import type { ShadowEntry, TeamId } from '../types';
import {
  statsFromEntries, computeFairness, computeFairnessDetailed, computeFairnessV1, computeFairnessDetailedV1,
  countBackToBackHA, countSlams, countSpread, acuitySpread,
} from './fairness';

const MIN = 60_000;
let idx = 0;
function e(teamId: TeamId, acuity: ShadowEntry['acuity'], atMin: number, ratio = 20): ShadowEntry {
  return { arrivalIndex: idx++, arrivalTime: atMin * MIN, acuity, teamId, ratioAtAssignment: ratio };
}

// Team 1 gets two Reds, team 2 four Yellows, team 3 four Purples: the 5:3:1 and 4:2:1
// scales give different acuity balance for the same routing.
const ENTRIES = [
  e(1, 'tier_one', 0), e(1, 'tier_one', 90),
  e(2, 'tier_two', 10), e(2, 'tier_two', 100), e(2, 'tier_two', 200), e(2, 'tier_two', 300),
  e(3, 'tier_three', 20), e(3, 'tier_three', 110), e(3, 'tier_three', 210), e(3, 'tier_three', 310),
];
const CAPS = { 1: 40, 2: 40, 3: 30 };

function balance(loads: number[]): number {
  const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
  const sd = Math.sqrt(loads.reduce((s, l) => s + (l - mean) ** 2, 0) / loads.length);
  return Math.max(0, Math.min(1, 1 - sd / mean));
}

describe('composite fairness versions', () => {
  const stats = statsFromEntries(ENTRIES);

  it('v1 keeps the legacy 5:3:1 acuity balance', () => {
    const v1 = computeFairnessDetailedV1(stats, [], CAPS);
    expect(v1.acuityBalance).toBeCloseTo(balance([10, 12, 4]), 12);
  });

  it('v2 measures acuity balance on the model weights (4:2:1)', () => {
    const v2 = computeFairnessDetailed(stats, [], CAPS);
    expect(v2.acuityBalance).toBeCloseTo(balance([8, 8, 4]), 12);
  });

  it('only the acuity-balance part differs between versions', () => {
    const v1 = computeFairnessDetailedV1(stats, [], CAPS);
    const v2 = computeFairnessDetailed(stats, [], CAPS);
    expect(v2.capacityBalance).toBe(v1.capacityBalance);
    expect(v2.overwhelmAvoidance).toBe(v1.overwhelmAvoidance);
    expect(v2.minRatioScore).toBe(v1.minRatioScore);
    expect(v2.stressEquity).toBe(v1.stressEquity);
    expect(v2.composite - v1.composite).toBeCloseTo((v2.acuityBalance - v1.acuityBalance) * 15, 10);
    expect(computeFairness(stats, [], CAPS)).toBe(v2.composite);
    expect(computeFairnessV1(stats, [], CAPS)).toBe(v1.composite);
  });

  it('v2 with explicit weights uses them, so 5:3:1 passed in matches v1', () => {
    const explicit = computeFairnessDetailed(stats, [], CAPS, { tier_one: 5, tier_two: 3, tier_three: 1 });
    expect(explicit).toEqual(computeFairnessDetailedV1(stats, [], CAPS));
  });
});

describe('individual metrics', () => {
  it('B2B counts Red or Yellow within 30 minutes, inclusive', () => {
    expect(countBackToBackHA([e(1, 'tier_one', 0), e(1, 'tier_two', 30)])).toBe(1);
    expect(countBackToBackHA([e(1, 'tier_one', 0), e(1, 'tier_two', 31)])).toBe(0);
    expect(countBackToBackHA([e(1, 'tier_one', 0), e(1, 'tier_three', 5), e(1, 'tier_one', 20)])).toBe(1);
  });

  it('slams count any arrival within 60 minutes, inclusive, once per arrival', () => {
    expect(countSlams([e(1, 'tier_three', 0), e(1, 'tier_three', 60)])).toBe(1);
    expect(countSlams([e(1, 'tier_three', 0), e(1, 'tier_three', 61)])).toBe(0);
    expect(countSlams([e(1, 'tier_three', 0), e(1, 'tier_three', 10), e(1, 'tier_three', 20)])).toBe(2);
  });

  it('spreads use only the eligible teams', () => {
    const stats = statsFromEntries(ENTRIES);
    expect(countSpread(stats, [1, 2, 3])).toBe(2);
    expect(countSpread(stats, [2, 3])).toBe(0);
    expect(acuitySpread(stats, [1, 2, 3])).toBe(4);
    expect(acuitySpread(stats, [1, 2])).toBe(0);
  });
});
