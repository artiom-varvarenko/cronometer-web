import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntervalIndex } from '../src/state/types';
import {
  EmptySurnameError,
  TOTAL_TRIALS,
  TRIALS_PER_INTERVAL,
  useSession,
  type AudioEngineLike,
} from '../src/state/useSession';

// Mock Stopwatch so trial timing is deterministic and independent of
// performance.now (which jsdom + React + fake timers all touch).
const STOPWATCH_ELAPSED_S = 1.5;
vi.mock('../src/timing/measurement', () => ({
  Stopwatch: class {
    private started = false;
    start(): void {
      this.started = true;
    }
    stopSeconds(): number {
      if (!this.started) throw new Error('Stopwatch not started');
      this.started = false;
      return STOPWATCH_ELAPSED_S;
    }
  },
}));

type Deferred = {
  promise: Promise<void>;
  resolve(): void;
  reject(err: unknown): void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface FakeAudio {
  audio: AudioEngineLike;
  pending: Deferred[];
  ensureUnlockedCalls: number;
  playClickCalls: number;
}

function makeFakeAudio(): FakeAudio {
  const pending: Deferred[] = [];
  const fake: FakeAudio = {
    audio: undefined as unknown as AudioEngineLike,
    pending,
    ensureUnlockedCalls: 0,
    playClickCalls: 0,
  };
  fake.audio = {
    ensureUnlocked: vi.fn(async () => {
      fake.ensureUnlockedCalls++;
    }),
    playInterval: vi.fn(() => {
      const d = deferred();
      pending.push(d);
      return d.promise;
    }),
    playClick: vi.fn(async () => {
      fake.playClickCalls++;
    }),
  };
  return fake;
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function recordTrial(
  hook: ReturnType<typeof renderHook<ReturnType<typeof useSession>, void>>,
  fake: FakeAudio,
  idx: IntervalIndex,
) {
  await act(async () => {
    void hook.result.current.startPlayback(idx);
  });
  const d = fake.pending.shift();
  if (!d) throw new Error('expected a pending playInterval');
  await act(async () => {
    d.resolve();
  });
  await flushMicrotasks();
  await act(async () => {
    void hook.result.current.startTimer();
  });
  await flushMicrotasks();
  await act(async () => {
    void hook.result.current.stopTimer();
  });
  await flushMicrotasks();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useSession', () => {
  it('starts in setup phase with default intervals and no trials', () => {
    const fake = makeFakeAudio();
    const { result } = renderHook(() => useSession(fake.audio));
    expect(result.current.session.phase).toBe('setup');
    expect(result.current.session.surname).toBe('');
    expect(result.current.session.intervals).toEqual([2, 3, 4, 5]);
    expect(result.current.session.trials).toEqual([]);
    expect(result.current.intervalCounts).toEqual([0, 0, 0, 0]);
  });

  it('confirmSurname rejects empty input and stays in setup', async () => {
    const fake = makeFakeAudio();
    const { result } = renderHook(() => useSession(fake.audio));
    await expect(
      act(async () => {
        await result.current.confirmSurname('   ');
      }),
    ).rejects.toBeInstanceOf(EmptySurnameError);
    expect(result.current.session.phase).toBe('setup');
    expect(fake.ensureUnlockedCalls).toBe(0);
  });

  it('confirmSurname trims, unlocks audio, and transitions to confirmed', async () => {
    const fake = makeFakeAudio();
    const { result } = renderHook(() => useSession(fake.audio));
    await act(async () => {
      await result.current.confirmSurname('  Иванов  ');
    });
    expect(result.current.session.surname).toBe('Иванов');
    expect(result.current.session.phase).toBe('confirmed');
    expect(fake.ensureUnlockedCalls).toBe(1);
  });

  it('startPlayback transitions confirmed → playing → armed', async () => {
    const fake = makeFakeAudio();
    const { result } = renderHook(() => useSession(fake.audio));
    await act(async () => {
      await result.current.confirmSurname('Иванов');
    });

    await act(async () => {
      void result.current.startPlayback(2);
    });
    expect(result.current.session.phase).toBe('playing');
    expect(result.current.session.currentInterval).toBe(2);
    expect(fake.audio.playInterval).toHaveBeenCalledWith(4);

    await act(async () => {
      fake.pending[0]!.resolve();
    });
    await flushMicrotasks();
    expect(result.current.session.phase).toBe('armed');
  });

  it('startTimer transitions armed → timing and plays the click beep', async () => {
    const fake = makeFakeAudio();
    const { result } = renderHook(() => useSession(fake.audio));
    await act(async () => {
      await result.current.confirmSurname('Иванов');
    });
    await act(async () => {
      void result.current.startPlayback(0);
    });
    await act(async () => {
      fake.pending[0]!.resolve();
    });
    await flushMicrotasks();

    await act(async () => {
      void result.current.startTimer();
    });
    await flushMicrotasks();
    expect(result.current.session.phase).toBe('timing');
    expect(fake.playClickCalls).toBe(1);
  });

  it('stopTimer records a trial with elapsed seconds and target snapshot', async () => {
    const fake = makeFakeAudio();
    const hook = renderHook(() => useSession(fake.audio));
    await act(async () => {
      await hook.result.current.confirmSurname('Иванов');
    });
    await recordTrial(hook, fake, 1);

    expect(hook.result.current.session.trials).toHaveLength(1);
    const trial = hook.result.current.session.trials[0]!;
    expect(trial.intervalIndex).toBe(1);
    expect(trial.attempt).toBe(1);
    expect(trial.userSeconds).toBeCloseTo(STOPWATCH_ELAPSED_S, 5);
    expect(trial.targetSeconds).toBe(3);
    expect(typeof trial.id).toBe('string');
    expect(trial.id.length).toBeGreaterThan(0);
    expect(trial.createdAt).toBe(trial.measuredAt);
    expect(hook.result.current.session.phase).toBe('confirmed');
    expect(hook.result.current.session.currentInterval).toBeNull();
  });

  it('caps each interval at 5 trials', async () => {
    const fake = makeFakeAudio();
    const hook = renderHook(() => useSession(fake.audio));
    await act(async () => {
      await hook.result.current.confirmSurname('Иванов');
    });

    for (let i = 0; i < TRIALS_PER_INTERVAL; i++) {
      await recordTrial(hook, fake, 0);
    }
    expect(hook.result.current.intervalCounts[0]).toBe(TRIALS_PER_INTERVAL);

    const beforePending = fake.pending.length;
    await act(async () => {
      await hook.result.current.startPlayback(0);
    });
    expect(hook.result.current.session.phase).toBe('confirmed');
    expect(fake.pending.length).toBe(beforePending);
    expect(hook.result.current.session.trials).toHaveLength(
      TRIALS_PER_INTERVAL,
    );
  });

  it('reaches the complete phase after all 20 trials', async () => {
    const fake = makeFakeAudio();
    const hook = renderHook(() => useSession(fake.audio));
    await act(async () => {
      await hook.result.current.confirmSurname('Иванов');
    });

    const indices: IntervalIndex[] = [0, 1, 2, 3];
    for (const idx of indices) {
      for (let i = 0; i < TRIALS_PER_INTERVAL; i++) {
        await recordTrial(hook, fake, idx);
      }
    }

    expect(hook.result.current.session.trials).toHaveLength(TOTAL_TRIALS);
    expect(hook.result.current.session.phase).toBe('complete');
    expect(hook.result.current.intervalCounts).toEqual([5, 5, 5, 5]);
  });

  it('updateIntervals only affects future trials, not recorded ones', async () => {
    const fake = makeFakeAudio();
    const hook = renderHook(() => useSession(fake.audio));
    await act(async () => {
      await hook.result.current.confirmSurname('Иванов');
    });
    await recordTrial(hook, fake, 0);
    expect(hook.result.current.session.trials[0]!.targetSeconds).toBe(2);

    act(() => {
      hook.result.current.updateIntervals([10, 11, 12, 13]);
    });
    expect(hook.result.current.session.trials[0]!.targetSeconds).toBe(2);
    expect(hook.result.current.session.intervals).toEqual([10, 11, 12, 13]);
  });

  it('newSession resets to a fresh setup state', async () => {
    const fake = makeFakeAudio();
    const hook = renderHook(() => useSession(fake.audio));
    await act(async () => {
      await hook.result.current.confirmSurname('Иванов');
    });
    await recordTrial(hook, fake, 0);
    expect(hook.result.current.session.trials.length).toBe(1);

    act(() => {
      hook.result.current.newSession();
    });
    expect(hook.result.current.session.phase).toBe('setup');
    expect(hook.result.current.session.surname).toBe('');
    expect(hook.result.current.session.trials).toEqual([]);
    expect(hook.result.current.session.intervals).toEqual([2, 3, 4, 5]);
  });

  it('briefStatus shows recorded after a trial and clears after ~1 s', async () => {
    const fake = makeFakeAudio();
    const hook = renderHook(() => useSession(fake.audio));
    await act(async () => {
      await hook.result.current.confirmSurname('Иванов');
    });

    // Use fake timers AFTER setup so confirmSurname's microtasks aren't
    // entangled with timer faking.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await recordTrial(hook, fake, 0);
    expect(hook.result.current.briefStatus).toEqual({
      kind: 'recorded',
      trialNumber: 1,
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(hook.result.current.briefStatus).toBeNull();
  });
});
