import type { Trial } from './types';
import { yearsToAgeString } from '../utils/ageString';

// Multiplier that converts mean τ (dimensionless) into "cycle years" in the
// Excel cycles table. Sourced from testtime.py:499 where it appears as a
// magic 8.5. TODO(customer): confirm provenance and meaning of this constant.
export const CYCLE_CONSTANT = 8.5;

export interface CycleRow {
  cycle: string;
  multiplier: number;
  value: number;
  age: string;
}

// Sum of user-produced seconds for a given interval's trials.
export function summaForInterval(trials: readonly Trial[]): number | null {
  if (trials.length === 0) return null;
  let sum = 0;
  for (const t of trials) sum += t.userSeconds;
  return sum;
}

// τ = Σ userSeconds / (targetSeconds × trialCount).
//
// testtime.py:420 divides by (target × 5) — identical to this formula for
// full 5-trial intervals, and correct for the new partial-export path.
export function tauForInterval(trials: readonly Trial[]): number | null {
  if (trials.length === 0) return null;
  const target = trials[0]!.targetSeconds;
  let sum = 0;
  for (const t of trials) sum += t.userSeconds;
  return sum / (target * trials.length);
}

export function meanTau(taus: readonly (number | null)[]): number | null {
  const vals = taus.filter((t): t is number => t !== null);
  if (vals.length === 0) return null;
  let s = 0;
  for (const v of vals) s += v;
  return s / vals.length;
}

// Sample standard deviation (testtime.py:327-332). Returns 0 for ≤ 1 sample.
export function sigmaTau(values: readonly number[], mean: number): number {
  if (values.length <= 1) return 0;
  let variance = 0;
  for (const v of values) variance += (v - mean) ** 2;
  variance /= values.length - 1;
  return Math.sqrt(variance);
}

function cycleName(multiplier: number): string {
  // testtime.py:489 — f"C{m:.2f}".rstrip('0').rstrip('.')
  const s = multiplier.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `C${s}`;
}

// Python's round(x, 3) is not equivalent to Math.round(x * 1000) / 1000:
// multiplying by 1000 can absorb tiny FP undershoots, flipping values that
// round DOWN in Python into values that round UP in JS. toFixed(3) evaluates
// the original FP value against the true halfway point and matches Python
// in the cases we care about.
function roundTo3(x: number): number {
  return Number(x.toFixed(3));
}

// 48 rows from C0.25 to C12 step 0.25, each carrying value and age string.
export function cyclesTable(meanTauValue: number): CycleRow[] {
  const rows: CycleRow[] = [];
  let multiplier = 0.25;
  while (multiplier <= 12) {
    const value = meanTauValue * CYCLE_CONSTANT * multiplier;
    rows.push({
      cycle: cycleName(multiplier),
      multiplier,
      value: roundTo3(value),
      age: yearsToAgeString(value),
    });
    multiplier += 0.25;
  }
  return rows;
}
