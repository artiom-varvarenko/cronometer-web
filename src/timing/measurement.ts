// User-facing Start/Stop measurement. Distinct from AudioEngine, which times
// the AUDIBLE interval on the audio thread; this times the operator's motor
// response on the main thread.
//
// performance.now() is monotonic and clamped to ~5 µs–1 ms depending on
// browser security settings — well below the human-motor-response noise
// floor we're trying to measure.
//
// When the timestamp is supplied by the caller (e.g. Event.timeStamp from a
// DOM click/key event), use it verbatim. Event.timeStamp is a
// DOMHighResTimeStamp on the same clock as performance.now() but is set by
// the browser when the event was created — BEFORE any JS dispatch latency.
// Preferring it over a fresh performance.now() removes 0–10 ms of variable
// main-thread dispatch delay from each Start/Stop sample.

export class Stopwatch {
  private t0: number | null = null;

  start(timestamp?: number): void {
    this.t0 = timestamp ?? performance.now();
  }

  // Returns elapsed seconds since start(). Throws if start() was never called.
  stopSeconds(timestamp?: number): number {
    if (this.t0 === null) {
      throw new Error('Stopwatch.stopSeconds called before start');
    }
    const t1 = timestamp ?? performance.now();
    const elapsedMs = t1 - this.t0;
    this.t0 = null;
    return elapsedMs / 1000;
  }
}
