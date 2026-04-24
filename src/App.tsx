import { useState } from 'react';
import { useAudio } from './audio/useAudio';
import type { PlayIntervalTelemetry } from './audio/AudioEngine';

// Phase 2 dev harness. Replaced in Phase 3 by the real Russian UI.
// Add ?debug=1 to the URL for console telemetry on every playInterval.

interface LogEntry {
  at: string;
  label: string;
  info?: PlayIntervalTelemetry;
  error?: string;
}

const INTERVALS = [2, 3, 4, 5] as const;

export default function App() {
  const audio = useAudio();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  const pushLog = (entry: LogEntry) => {
    setLog((prev) => [entry, ...prev].slice(0, 20));
  };

  const playInterval = async (seconds: number) => {
    setBusy(true);
    try {
      const info = await audio.playInterval(seconds);
      pushLog({
        at: new Date().toLocaleTimeString(),
        label: `playInterval(${seconds})`,
        info,
      });
    } catch (err) {
      pushLog({
        at: new Date().toLocaleTimeString(),
        label: `playInterval(${seconds})`,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const playClick = async () => {
    setBusy(true);
    try {
      await audio.playClick();
      pushLog({ at: new Date().toLocaleTimeString(), label: 'playClick()' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-shell">
      <h1>Phase 2 audio harness</h1>
      <p className="hint">
        Tap one of the interval buttons to hear two 1 kHz / 100 ms beeps
        separated by that many seconds. The telemetry panel shows the
        main-thread-observed gap and drift.
      </p>

      <div className="button-row">
        {INTERVALS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => playInterval(s)}
            disabled={busy}
          >
            {s}s interval
          </button>
        ))}
        <button type="button" onClick={playClick} disabled={busy}>
          Click beep
        </button>
      </div>

      <h2>Telemetry</h2>
      {log.length === 0 ? (
        <p className="hint">No runs yet.</p>
      ) : (
        <table className="telemetry">
          <thead>
            <tr>
              <th>Time</th>
              <th>Call</th>
              <th>Scheduled (s)</th>
              <th>Measured (s)</th>
              <th>Drift (ms)</th>
            </tr>
          </thead>
          <tbody>
            {log.map((e, i) => (
              <tr key={i}>
                <td>{e.at}</td>
                <td>{e.label}</td>
                <td>{e.info ? e.info.scheduledGap.toFixed(3) : '—'}</td>
                <td>{e.info ? e.info.measuredGap.toFixed(4) : '—'}</td>
                <td
                  className={
                    e.info && Math.abs(e.info.driftMs) > 25 ? 'drift-high' : ''
                  }
                >
                  {e.info
                    ? e.info.driftMs.toFixed(2)
                    : e.error
                      ? `error: ${e.error}`
                      : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="hint">
        Append <code>?debug=1</code> to the URL to log each result to the
        browser console.
      </p>
    </main>
  );
}
