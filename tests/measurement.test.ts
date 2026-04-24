import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Stopwatch } from '../src/timing/measurement';

describe('Stopwatch', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns elapsed seconds between start and stop', () => {
    (performance.now as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(3500);
    const sw = new Stopwatch();
    sw.start();
    expect(sw.stopSeconds()).toBe(2.5);
  });

  it('throws when stopSeconds is called without a prior start', () => {
    const sw = new Stopwatch();
    expect(() => sw.stopSeconds()).toThrow(/before start/);
  });

  it('requires a fresh start before each stopSeconds', () => {
    (performance.now as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1000);
    const sw = new Stopwatch();
    sw.start();
    sw.stopSeconds();
    expect(() => sw.stopSeconds()).toThrow(/before start/);
  });

  it('uses supplied event timestamps verbatim instead of performance.now', () => {
    const nowSpy = performance.now as unknown as ReturnType<typeof vi.fn>;
    const sw = new Stopwatch();
    sw.start(2000);
    expect(sw.stopSeconds(5500)).toBe(3.5);
    // When timestamps are supplied on both ends, the Stopwatch must not
    // fall back to performance.now() — that would reintroduce the
    // dispatch-jitter this override is meant to remove.
    expect(nowSpy).not.toHaveBeenCalled();
  });

  it('falls back to performance.now when only one side supplies a timestamp', () => {
    (performance.now as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      4250,
    );
    const sw = new Stopwatch();
    sw.start(1000);
    expect(sw.stopSeconds()).toBe(3.25);
  });
});
