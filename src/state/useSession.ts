import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import type { IntervalIndex, Phase, Session, Trial } from './types';
import { Stopwatch } from '../timing/measurement';

// Minimal surface so this hook is testable without spinning up a real
// AudioContext (jsdom has none). The full AudioEngine class implements
// this implicitly.
export interface AudioEngineLike {
  ensureUnlocked(): Promise<void>;
  playInterval(seconds: number): Promise<unknown>;
  playClick(): Promise<void>;
}

export const DEFAULT_INTERVALS: readonly [number, number, number, number] = [
  2, 3, 4, 5,
];
export const TRIALS_PER_INTERVAL = 5;
export const TOTAL_TRIALS = 20;

// testtime.py:273 — root.after(1000, enable_interval_buttons). The "Результат
// записан…" line lingers for ~1 s before the status switches back to
// "Выберите следующий интервал…". Faithfully reproduced for operator
// familiarity; not timing-critical.
const RECORDED_DISPLAY_MS = 1000;

function makeInitialSession(): Session {
  return {
    surname: '',
    intervals: [...DEFAULT_INTERVALS] as [number, number, number, number],
    trials: [],
    phase: 'setup',
    currentInterval: null,
    pendingReMeasureOf: null,
  };
}

export type BriefStatus = { kind: 'recorded'; trialNumber: number } | null;

export interface UseSession {
  session: Session;
  intervalCounts: [number, number, number, number];
  briefStatus: BriefStatus;
  confirmSurname(rawName: string): Promise<void>;
  updateIntervals(intervals: [number, number, number, number]): void;
  startPlayback(idx: IntervalIndex): Promise<void>;
  startTimer(): Promise<void>;
  stopTimer(): Promise<void>;
  reMeasure(trialId: string): Promise<void>;
  cancelReMeasure(): void;
  newSession(): void;
  // Phase 6: tab hidden while playing/timing. Returns true if a trial was
  // actually in flight and has been rolled back, so the caller can decide
  // whether to show the operator an error banner.
  abortTrialIfRunning(): boolean;
}

export class EmptySurnameError extends Error {
  constructor() {
    super('empty-surname');
    this.name = 'EmptySurnameError';
  }
}

function countByInterval(
  trials: readonly Trial[],
): [number, number, number, number] {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const t of trials) counts[t.intervalIndex] += 1;
  return counts;
}

// After a re-measure completes or is cancelled, we return to whichever idle
// phase reflects current trial count.
function idlePhaseForTrialCount(trialCount: number): Phase {
  return trialCount >= TOTAL_TRIALS ? 'complete' : 'confirmed';
}

export function useSession(audio: AudioEngineLike): UseSession {
  const [session, setSession] = useState<Session>(makeInitialSession);
  const [briefStatus, setBriefStatus] = useState<BriefStatus>(null);

  // Mirror of the latest session for synchronous reads inside event handlers.
  // Updated via useEffect so the ref reflects the committed render.
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const stopwatchRef = useRef<Stopwatch>(new Stopwatch());
  const briefStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearBriefStatusTimer = useCallback(() => {
    if (briefStatusTimerRef.current !== null) {
      clearTimeout(briefStatusTimerRef.current);
      briefStatusTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearBriefStatusTimer;
  }, [clearBriefStatusTimer]);

  const confirmSurname = useCallback(
    async (rawName: string) => {
      const name = rawName.trim();
      if (name.length === 0) throw new EmptySurnameError();
      // First user gesture — must be the place we unlock the AudioContext
      // (Safari/iOS will reject scheduling otherwise).
      await audio.ensureUnlocked();
      setSession((prev) =>
        prev.phase === 'setup'
          ? { ...prev, surname: name, phase: 'confirmed' }
          : prev,
      );
    },
    [audio],
  );

  const updateIntervals = useCallback(
    (intervals: [number, number, number, number]) => {
      // Validation is the dialog's job. Existing trials keep their original
      // targetSeconds (frozen at recording time) so τ stays correct — see
      // the doc-comment on Trial in state/types.ts.
      setSession((prev) => ({ ...prev, intervals }));
    },
    [],
  );

  const startPlayback = useCallback(
    async (idx: IntervalIndex) => {
      const current = sessionRef.current;
      if (current.phase !== 'confirmed') return;
      const counts = countByInterval(current.trials);
      if (counts[idx] >= TRIALS_PER_INTERVAL) return;

      const target = current.intervals[idx];

      clearBriefStatusTimer();
      setBriefStatus(null);

      setSession((prev) =>
        prev.phase === 'confirmed'
          ? { ...prev, phase: 'playing', currentInterval: idx }
          : prev,
      );

      try {
        await audio.playInterval(target);
      } catch (err) {
        // Roll back to confirmed so the operator can retry.
        setSession((prev) =>
          prev.phase === 'playing'
            ? { ...prev, phase: 'confirmed', currentInterval: null }
            : prev,
        );
        throw err;
      }

      setSession((prev) =>
        prev.phase === 'playing' ? { ...prev, phase: 'armed' } : prev,
      );
    },
    [audio, clearBriefStatusTimer],
  );

  // Play the reference interval for an existing trial so the operator can
  // produce a fresh userSeconds value. The trial is replaced in place by
  // stopTimer — see the pendingReMeasureOf branch there.
  const reMeasure = useCallback(
    async (trialId: string) => {
      const current = sessionRef.current;
      if (current.phase !== 'confirmed' && current.phase !== 'complete') return;
      if (current.pendingReMeasureOf !== null) return;
      const trial = current.trials.find((t) => t.id === trialId);
      if (!trial) return;

      const idx = trial.intervalIndex;
      const target = current.intervals[idx];

      clearBriefStatusTimer();
      setBriefStatus(null);

      setSession((prev) => {
        if (prev.phase !== 'confirmed' && prev.phase !== 'complete') {
          return prev;
        }
        if (prev.pendingReMeasureOf !== null) return prev;
        return {
          ...prev,
          phase: 'playing',
          currentInterval: idx,
          pendingReMeasureOf: trialId,
        };
      });

      try {
        await audio.playInterval(target);
      } catch (err) {
        // Cancel silently rolls pendingReMeasureOf back to null; our rollback
        // must only apply if that cancel hasn't already happened.
        setSession((prev) => {
          if (prev.pendingReMeasureOf !== trialId) return prev;
          return {
            ...prev,
            phase: idlePhaseForTrialCount(prev.trials.length),
            currentInterval: null,
            pendingReMeasureOf: null,
          };
        });
        throw err;
      }

      setSession((prev) =>
        prev.phase === 'playing' && prev.pendingReMeasureOf === trialId
          ? { ...prev, phase: 'armed' }
          : prev,
      );
    },
    [audio, clearBriefStatusTimer],
  );

  const cancelReMeasure = useCallback(() => {
    setSession((prev) => {
      if (prev.pendingReMeasureOf === null) return prev;
      return {
        ...prev,
        phase: idlePhaseForTrialCount(prev.trials.length),
        currentInterval: null,
        pendingReMeasureOf: null,
      };
    });
    clearBriefStatusTimer();
    setBriefStatus(null);
  }, [clearBriefStatusTimer]);

  const startTimer = useCallback(async () => {
    const current = sessionRef.current;
    if (current.phase !== 'armed') return;
    // Match testtime.py:241 — capture t0 BEFORE the click beep.
    stopwatchRef.current.start();
    setSession((prev) =>
      prev.phase === 'armed' ? { ...prev, phase: 'timing' } : prev,
    );
    await audio.playClick();
  }, [audio]);

  const stopTimer = useCallback(async () => {
    const current = sessionRef.current;
    if (current.phase !== 'timing' || current.currentInterval === null) return;

    // Capture elapsed BEFORE any state work, mirroring testtime.py:248.
    const elapsed = stopwatchRef.current.stopSeconds();

    const intervalIndex = current.currentInterval;
    const target = current.intervals[intervalIndex];
    const now = Date.now();

    // Re-measure replaces an existing trial in place; the original createdAt,
    // id, intervalIndex, and attempt number are preserved so the grid cell
    // stays stable and derived stats recompute automatically on trials[].
    if (current.pendingReMeasureOf !== null) {
      const trialId = current.pendingReMeasureOf;
      setSession((prev) => {
        if (prev.phase !== 'timing' || prev.pendingReMeasureOf !== trialId) {
          return prev;
        }
        const nextTrials = prev.trials.map((t) =>
          t.id === trialId
            ? {
                ...t,
                userSeconds: elapsed,
                targetSeconds: target,
                measuredAt: now,
              }
            : t,
        );
        return {
          ...prev,
          trials: nextTrials,
          phase: idlePhaseForTrialCount(nextTrials.length),
          currentInterval: null,
          pendingReMeasureOf: null,
        };
      });
      clearBriefStatusTimer();
      setBriefStatus(null);
      await audio.playClick();
      return;
    }

    const existingForInterval = current.trials.filter(
      (t) => t.intervalIndex === intervalIndex,
    ).length;
    const trial: Trial = {
      id: uuid(),
      intervalIndex,
      attempt: existingForInterval + 1,
      userSeconds: elapsed,
      targetSeconds: target,
      createdAt: now,
      measuredAt: now,
    };

    // Pre-compute outcome from the latest committed snapshot. We can't read
    // the result of setSession's updater synchronously — React 18 defers it
    // to the next render, so any side effects placed inside an updater
    // would not be visible to this function body.
    const newTrialNumber = current.trials.length + 1;
    const nextPhase: Phase =
      newTrialNumber >= TOTAL_TRIALS ? 'complete' : 'confirmed';

    setSession((prev) =>
      prev.phase === 'timing'
        ? {
            ...prev,
            trials: [...prev.trials, trial],
            phase: nextPhase,
            currentInterval: null,
          }
        : prev,
    );

    if (nextPhase !== 'complete') {
      clearBriefStatusTimer();
      setBriefStatus({ kind: 'recorded', trialNumber: newTrialNumber });
      briefStatusTimerRef.current = setTimeout(() => {
        setBriefStatus(null);
        briefStatusTimerRef.current = null;
      }, RECORDED_DISPLAY_MS);
    } else {
      clearBriefStatusTimer();
      setBriefStatus(null);
    }

    await audio.playClick();
  }, [audio, clearBriefStatusTimer]);

  const newSession = useCallback(() => {
    clearBriefStatusTimer();
    setBriefStatus(null);
    setSession(makeInitialSession());
  }, [clearBriefStatusTimer]);

  const abortTrialIfRunning = useCallback((): boolean => {
    const current = sessionRef.current;
    if (current.phase !== 'playing' && current.phase !== 'timing') {
      return false;
    }
    // Any in-flight playInterval promise that resolves after this point is
    // guarded by `prev.phase === 'playing'` in startPlayback / reMeasure, so
    // it cannot re-arm a trial we just aborted.
    clearBriefStatusTimer();
    setBriefStatus(null);
    setSession((prev) => {
      if (prev.phase !== 'playing' && prev.phase !== 'timing') return prev;
      return {
        ...prev,
        phase: idlePhaseForTrialCount(prev.trials.length),
        currentInterval: null,
        pendingReMeasureOf: null,
      };
    });
    return true;
  }, [clearBriefStatusTimer]);

  const intervalCounts = countByInterval(session.trials);

  return {
    session,
    intervalCounts,
    briefStatus,
    confirmSurname,
    updateIntervals,
    startPlayback,
    startTimer,
    stopTimer,
    reMeasure,
    cancelReMeasure,
    newSession,
    abortTrialIfRunning,
  };
}
