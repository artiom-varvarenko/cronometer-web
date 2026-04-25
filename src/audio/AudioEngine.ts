// Timing-critical module. Two rules that must not be broken:
//
//   1. The inter-beep gap is encoded as a fixed sample offset inside a
//      single AudioBuffer, played by ONE AudioBufferSourceNode.start() call.
//      The gap is therefore sample-accurate (~20 µs at 48 kHz) and survives
//      any main-thread stall that would clamp start() to currentTime:
//      clamping shifts the whole buffer, not the beeps relative to each
//      other. Do not split this into two oscillators scheduled at t0 and
//      t1 — that reintroduces a drift mode where beep 1 clamps forward
//      but beep 2 still fires at its original t1, compressing the gap.
//
//   2. Output buffer latency (the absolute delay between scheduling and
//      hearing the first beep) is not the same thing as the inter-beep
//      gap. Latency is a fixed offset both beeps share; the gap is
//      independent of it. Don't "optimize" the scheduler by trying to
//      cancel latency — you'll introduce drift.
//
// See reference/testtime.py for the equivalent Python using winsound +
// time.sleep, which this replaces.

const BEEP_FREQ_HZ = 1000; // testtime.py:323 — winsound.Beep(1000, 100)
const BEEP_DURATION_S = 0.1; // 100 ms
const ENVELOPE_RAMP_S = 0.005; // 5 ms attack/release — avoids click artifacts
const BEEP_GAIN = 0.3;
const PRE_ROLL_S = 0.1; // 100 ms head start so scheduling isn't racing currentTime
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
      // latencyHint: 'interactive' asks the platform for the smallest stable
      // output buffer, which minimises the fixed offset between start() and
      // audible onset. It does not affect the inter-beep gap — that is
      // locked to sample offsets in the rendered buffer — but it reduces
      // the variance of "time from click to first beep" across devices.
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
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

  // Plays two 1 kHz / 100 ms beeps exactly intervalSeconds apart by rendering
  // them into a single AudioBuffer and firing one start(). Resolves when the
  // second beep begins (via a zero-gain 1 ms marker oscillator), with
  // telemetry describing the main-thread-observed gap.
  async playInterval(intervalSeconds: number): Promise<PlayIntervalTelemetry> {
    await this.ensureUnlocked();
    const ctx = this.ctx!;

    const buffer = this.renderBeepPairBuffer(intervalSeconds, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const t0 = ctx.currentTime + PRE_ROLL_S;
    const t1 = t0 + intervalSeconds;
    source.start(t0);

    // Markers exist purely to give the main thread a resolution signal near
    // each beep. Their onended dispatch has main-thread jitter — that jitter
    // shows up in driftMs below, but it does NOT reflect the audible gap,
    // which is sample-accurate inside the rendered buffer.
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
    const buffer = this.renderSingleBeepBuffer(ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(ctx.currentTime + 0.01);
  }

  // Writes one linear-attack / sustain / linear-release beep into `data`
  // starting at sample `offset`. Envelope shape matches the setValueAtTime
  // + linearRampToValueAtTime pattern used previously so beep artefacts
  // (clicks at zero-crossing entry) are still suppressed.
  private writeBeepSamples(
    data: Float32Array,
    offset: number,
    beepSamples: number,
    rampSamples: number,
    omega: number,
  ): void {
    for (let i = 0; i < beepSamples; i++) {
      let envelope: number;
      if (i < rampSamples) {
        envelope = i / rampSamples;
      } else if (i >= beepSamples - rampSamples) {
        envelope = (beepSamples - i) / rampSamples;
      } else {
        envelope = 1;
      }
      data[offset + i] = Math.sin(omega * i) * BEEP_GAIN * envelope;
    }
  }

  private renderBeepPairBuffer(
    intervalSeconds: number,
    sampleRate: number,
  ): AudioBuffer {
    const ctx = this.ctx!;
    const beepSamples = Math.round(BEEP_DURATION_S * sampleRate);
    const rampSamples = Math.max(1, Math.round(ENVELOPE_RAMP_S * sampleRate));
    // The inter-beep interval is defined by this sample offset and nothing
    // else. Everything downstream — scheduling, clamping, device latency —
    // shifts the whole buffer; the offset between beep 1 and beep 2 is
    // invariant.
    const beep2Offset = Math.round(intervalSeconds * sampleRate);
    const totalSamples = beep2Offset + beepSamples;
    const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
    const data = buffer.getChannelData(0);

    const omega = (2 * Math.PI * BEEP_FREQ_HZ) / sampleRate;
    this.writeBeepSamples(data, 0, beepSamples, rampSamples, omega);
    this.writeBeepSamples(data, beep2Offset, beepSamples, rampSamples, omega);
    return buffer;
  }

  private renderSingleBeepBuffer(sampleRate: number): AudioBuffer {
    const ctx = this.ctx!;
    const beepSamples = Math.round(BEEP_DURATION_S * sampleRate);
    const rampSamples = Math.max(1, Math.round(ENVELOPE_RAMP_S * sampleRate));
    const buffer = ctx.createBuffer(1, beepSamples, sampleRate);
    const data = buffer.getChannelData(0);
    const omega = (2 * Math.PI * BEEP_FREQ_HZ) / sampleRate;
    this.writeBeepSamples(data, 0, beepSamples, rampSamples, omega);
    return buffer;
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

    // Failsafe: if onended never fires (context closed, oscillator GC'd
    // before dispatching), reject so playInterval's Promise.all cannot hang
    // indefinitely. Scheduled marker time plus 2 s of main-thread slack.
    const timeoutMs = Math.max(2000, (time - ctx.currentTime) * 1000 + 2000);
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('marker onended timeout')),
        timeoutMs,
      );
      osc.onended = () => {
        clearTimeout(timer);
        resolve(performance.now());
      };
    });
  }
}
