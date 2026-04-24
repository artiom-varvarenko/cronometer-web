import { describe, it, expect } from 'vitest';
import {
  ordinalNominative,
  ordinalGenitive,
} from '../src/utils/ordinals';

describe('ordinalNominative', () => {
  it('returns the four Russian nominative interval ordinals', () => {
    expect(ordinalNominative(1)).toBe('1-ый');
    expect(ordinalNominative(2)).toBe('2-ой');
    expect(ordinalNominative(3)).toBe('3-ий');
    expect(ordinalNominative(4)).toBe('4-ый');
  });

  it('throws for out-of-range inputs', () => {
    expect(() => ordinalNominative(0)).toThrow(RangeError);
    expect(() => ordinalNominative(5)).toThrow(RangeError);
    expect(() => ordinalNominative(-1)).toThrow(RangeError);
  });
});

describe('ordinalGenitive', () => {
  it('returns the four Russian genitive interval ordinals', () => {
    expect(ordinalGenitive(1)).toBe('1-го');
    expect(ordinalGenitive(2)).toBe('2-го');
    expect(ordinalGenitive(3)).toBe('3-го');
    expect(ordinalGenitive(4)).toBe('4-го');
  });

  it('throws for out-of-range inputs', () => {
    expect(() => ordinalGenitive(0)).toThrow(RangeError);
    expect(() => ordinalGenitive(5)).toThrow(RangeError);
  });
});
