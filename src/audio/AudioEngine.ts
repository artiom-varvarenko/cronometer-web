// Timing-critical module. Two rules that must not be broken:
//
//   1. Inter-beep gap is scheduled on the audio thread via osc.start(time).
//      Web Audio guarantees this to sample accuracy (~20 µs at 48 kHz).
//      Never use setTimeout/setInterval to time the interval — they drift,
//      especially under background-tab throttling.
//
//   2. Output buffer latency (the absolute delay between scheduling and
//      hearing the first beep) is not the same thing as jitter in the GAP
//      between beeps. Latency is a fixed offset both beeps share; the gap
//      is independent of it. Don't "optimize" the scheduler by trying to
//      cancel latency — you'll introduce drift.
//
// See reference/testtime.py for the equivalent Python using winsound +
// time.sleep, which this replaces.

const BEEP_FREQ_HZ = 1000; // testtime.py:323 — winsound.Beep(1000, 100)
const BEEP_DURATION_S = 0.1; // 100 ms
const ENVELOPE_RAMP_S = 0.005; // 5 ms attack/release — avoids click artifacts
const BEEP_GAIN = 0.3;
const PRE_ROLL_S = 0.05; // 50 ms head start so scheduling isn't racing currentTime
const MARKER_DURATION_S = 0.001; // 1 ms silent marker used to resolve on beep begin

const DEBUG =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('debug');

export interface PlayIntervalTelemetry {
  scheduledGap: number;
  measuredGap: number;
  driftMs: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private unlocked = false;

  // Must be invoked from a user-gesture handler the first time it's called
  // (click, tap, keydown). Subsequent calls are idempotent.
  async ensureUnlocked(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    if (!this.unlocked) {
      // Silent 1-sample buffer — iOS Safari needs an actual playback
      // event before it considers the context fully unlocked.
      const buffer = this.ctx.createBuffer(1, 1, 22050);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.start(0);
      this.unlocked = true;
    }
    if (DEBUG && this.ctx.state !== 'running') {
      // iOS Safari sometimes leaves the context in 'interrupted' or
      // 'suspended' even after resume() resolves. Surface it loudly during
      // manual QA so the operator knows the unlock gesture did not take.
      console.warn(
        '[AudioEngine.ensureUnlocked] ctx.state not running after unlock:',
        this.ctx.state,
      );
    }
  }

  // Schedules two 1 kHz / 100 ms beeps exactly intervalSeconds apart.
  // Resolves when the second beep begins (via a zero-gain 1 ms marker
  // oscillator), with telemetry describing the main-thread-observed gap.
  async playInterval(intervalSeconds: number): Promise<PlayIntervalTelemetry> {
    await this.ensureUnlocked();
    const ctx = this.ctx!;

    const t0 = ctx.currentTime + PRE_ROLL_S;
    const t1 = t0 + intervalSeconds;

    this.scheduleBeep(t0);
    this.scheduleBeep(t1);

    // Schedule both markers up-front, not sequentially. The audio graph
    // is deterministic once committed; awaiting marker1 before creating
    // marker2 lets main-thread work between callbacks contaminate the
    // measurement (and risks clamping `osc.start(t1)` if the main thread
    // blocks past t1). The remaining driftMs reflects main-thread
    // dispatch jitter on `onended`, not the inter-beep gap itself —
    // that gap is sample-accurate on the audio thread by construction.
    const marker1 = this.scheduleMarkerAt(t0);
    const marker2 = this.scheduleMarkerAt(t1);
    const [beep1Perf, beep2Perf] = await Promise.all([marker1, marker2]);

    const measuredGap = (beep2Perf - beep1Perf) / 1000;
    const driftMs = (measuredGap - intervalSeconds) * 1000;
    const telemetry: PlayIntervalTelemetry = {
      scheduledGap: intervalSeconds,
      measuredGap,
      driftMs,
    };
    if (DEBUG) {
      console.log('[AudioEngine.playInterval]', telemetry);
    }
    return telemetry;
  }

  // Short confirmation beep for Start/Stop (testtime.py:243, 249).
  async playClick(): Promise<void> {
    await this.ensureUnlocked();
    const ctx = this.ctx!;
    this.scheduleBeep(ctx.currentTime + 0.01);
  }

  private scheduleBeep(startTime: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = BEEP_FREQ_HZ;
    osc.type = 'sine';

    // Linear attack/release envelope so the beep doesn't produce a click
    // when the oscillator starts/stops at non-zero amplitude.
    const end = startTime + BEEP_DURATION_S;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(BEEP_GAIN, startTime + ENVELOPE_RAMP_S);
    gain.gain.setValueAtTime(BEEP_GAIN, end - ENVELOPE_RAMP_S);
    gain.gain.linearRampToValueAtTime(0, end);

    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(end);
  }

  // Zero-gain marker used only to fire an onended callback near `time`.
  // Returns performance.now() captured at the callback.
  private scheduleMarkerAt(time: number): Promise<number> {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + MARKER_DURATION_S);

    return new Promise<number>((resolve) => {
      osc.onended = () => resolve(performance.now());
    });
  }
}
