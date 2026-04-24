import { describe, it, expect } from 'vitest';
import { sanitizeFilename } from '../src/utils/sanitizeFilename';

describe('sanitizeFilename', () => {
  it('returns a valid name unchanged', () => {
    expect(sanitizeFilename('Иванов')).toBe('Иванов');
    expect(sanitizeFilename('Smith-Jones')).toBe('Smith-Jones');
  });

  it('strips forbidden characters', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeFilename('   Иванов   ')).toBe('Иванов');
  });

  it('falls back to "results" when empty after cleanup', () => {
    expect(sanitizeFilename('')).toBe('results');
    expect(sanitizeFilename('   ')).toBe('results');
    expect(sanitizeFilename('/\\:*?"<>|')).toBe('results');
  });
});
