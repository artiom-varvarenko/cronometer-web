import { describe, it, expect } from 'vitest';
import { AudioEngine } from '../src/audio/AudioEngine';

// Real timing behavior of AudioEngine can only be verified in a browser —
// see the Phase 2 QA matrix. This test just asserts the module is safe to
// import in jsdom (no AudioContext available) and that construction is
// lazy (no audio graph touched until ensureUnlocked is called).
describe('AudioEngine', () => {
  it('constructs without touching the audio graph', () => {
    const engine = new AudioEngine();
    expect(engine).toBeInstanceOf(AudioEngine);
  });
});
