// User-facing Start/Stop measurement. Distinct from AudioEngine, which times
// the AUDIBLE interval on the audio thread; this times the operator's motor
// response on the main thread.
//
// performance.now() is monotonic and clamped to ~5 µs–1 ms depending on
// browser security settings — well below the human-motor-response noise
// floor we're trying to measure.

export class Stopwatch {
  private t0: number | null = null;

  start(): void {
    this.t0 = performance.now();
  }

  // Returns elapsed seconds since start(). Throws if start() was never called.
  stopSeconds(): number {
    if (this.t0 === null) {
      throw new Error('Stopwatch.stopSeconds called before start');
    }
    const elapsedMs = performance.now() - this.t0;
    this.t0 = null;
    return elapsedMs / 1000;
  }
}
