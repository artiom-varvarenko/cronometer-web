import { describe, it, expect } from 'vitest';
import {
  summaForInterval,
  tauForInterval,
  meanTau,
  sigmaTau,
  cyclesTable,
} from '../src/state/stats';
import type { IntervalIndex, Trial } from '../src/state/types';

import sigmaFixtures from './fixtures/sigma.json';
import sessionFixture from './fixtures/session.json';
import cyclesFixture from './fixtures/cycles.json';
import partialFixture from './fixtures/partialTau.json';

function makeTrials(
  userSeconds: number[],
  targetSeconds: number,
  intervalIndex: IntervalIndex,
): Trial[] {
  return userSeconds.map((s, i) => ({
    id: `t-${intervalIndex}-${i}`,
    intervalIndex,
    attempt: i + 1,
    userSeconds: s,
    targetSeconds,
    createdAt: 0,
    measuredAt: 0,
  }));
}

describe('sigmaTau (Python parity)', () => {
  for (const { values, mean, expected } of sigmaFixtures) {
    it(`values=${JSON.stringify(values)} mean=${mean} → ${expected}`, () => {
      expect(sigmaTau(values, mean)).toBeCloseTo(expected, 12);
    });
  }

  it('returns 0 for an empty array', () => {
    expect(sigmaTau([], 0)).toBe(0);
  });

  it('returns 0 for a single sample', () => {
    expect(sigmaTau([1.23], 1.23)).toBe(0);
  });
});

describe('tauForInterval', () => {
  it('returns null for zero trials', () => {
    expect(tauForInterval([])).toBeNull();
  });

  it('divides sum by target × trialCount (1-trial case)', () => {
    const trials = makeTrials([2.1], 2.0, 0);
    expect(tauForInterval(trials)).toBeCloseTo(1.05, 12);
  });

  it('matches Python for 3-trial partial case', () => {
    const trials = makeTrials(partialFixture.trials, partialFixture.target, 0);
    expect(tauForInterval(trials)).toBeCloseTo(partialFixture.tau, 12);
  });

  it('matches Python τ exactly for a full-session fixture', () => {
    for (let i = 0; i < 4; i++) {
      const target = sessionFixture.intervals[i]!;
      const userTimes = sessionFixture.trials[i]!;
      const trials = makeTrials(userTimes, target, i as IntervalIndex);
      const expected = sessionFixture.per_interval_tau[i]!;
      expect(tauForInterval(trials)).toBeCloseTo(expected, 12);
    }
  });
});

describe('summaForInterval', () => {
  it('returns null for zero trials', () => {
    expect(summaForInterval([])).toBeNull();
  });

  it('matches Python per-interval Σ for the session fixture', () => {
    for (let i = 0; i < 4; i++) {
      const target = sessionFixture.intervals[i]!;
      const userTimes = sessionFixture.trials[i]!;
      const trials = makeTrials(userTimes, target, i as IntervalIndex);
      const expected = sessionFixture.per_interval_suma[i]!;
      expect(summaForInterval(trials)).toBeCloseTo(expected, 12);
    }
  });
});

describe('meanTau', () => {
  it('returns null when all entries are null', () => {
    expect(meanTau([null, null])).toBeNull();
  });

  it('ignores null entries in the average', () => {
    expect(meanTau([1, null, 2, null, 3])).toBeCloseTo(2, 12);
  });

  it('matches Python mean τ for the session fixture', () => {
    expect(meanTau(sessionFixture.per_interval_tau)).toBeCloseTo(
      sessionFixture.mean_tau,
      12,
    );
  });
});

describe('Session end-to-end (Python parity)', () => {
  it('σ of per-interval τ matches Python sigma', () => {
    expect(sigmaTau(sessionFixture.per_interval_tau, sessionFixture.mean_tau))
      .toBeCloseTo(sessionFixture.sigma_tau, 12);
  });

  it('cycles table matches Python byte-for-byte', () => {
    const rows = cyclesTable(sessionFixture.mean_tau);
    expect(rows).toHaveLength(sessionFixture.cycles.length);
    rows.forEach((row, i) => {
      const expected = sessionFixture.cycles[i]!;
      expect(row.cycle).toBe(expected.cycle);
      expect(row.multiplier).toBeCloseTo(expected.multiplier, 12);
      expect(row.value).toBeCloseTo(expected.value, 6);
      expect(row.age).toBe(expected.age);
    });
  });
});

describe('cyclesTable structure', () => {
  it('has 48 rows from C0.25 to C12 with step 0.25', () => {
    const rows = cyclesTable(1.0);
    expect(rows).toHaveLength(48);
    expect(rows[0]!.cycle).toBe('C0.25');
    expect(rows.at(-1)!.cycle).toBe('C12');
  });

  it('matches Python fixture for meanτ=1.0', () => {
    const rows = cyclesTable(cyclesFixture.mean_tau);
    expect(rows).toHaveLength(cyclesFixture.rows.length);
    rows.forEach((row, i) => {
      const expected = cyclesFixture.rows[i]!;
      expect(row.cycle).toBe(expected.cycle);
      expect(row.value).toBeCloseTo(expected.value, 6);
      expect(row.age).toBe(expected.age);
    });
  });
});
