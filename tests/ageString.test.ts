import { describe, it, expect } from 'vitest';
import { yearsToAgeString } from '../src/utils/ageString';
import fixtures from './fixtures/ageString.json';

describe('yearsToAgeString (Python parity)', () => {
  for (const { years, expected } of fixtures) {
    it(`years=${years} → ${expected}`, () => {
      expect(yearsToAgeString(years)).toBe(expected);
    });
  }

  it('always reports at least days when all parts are zero', () => {
    // testtime.py:365-366 — parts gains "0д" when empty
    expect(yearsToAgeString(0)).toBe('(0д)');
  });

  it('drops zero months between non-zero years and days', () => {
    // 1.0625 years → 1г + 23д (no 0м)
    expect(yearsToAgeString(1.0625)).toBe('(1г, 23д)');
  });

  it('drops zero days between non-zero years and months', () => {
    // 8.25 cycle (70.08 years) → 70г, 1м (no 0д)
    expect(yearsToAgeString(70.08136718749999)).toBe('(70г, 1м)');
  });
});
