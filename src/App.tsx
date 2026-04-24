import { useEffect, useMemo, useState } from 'react';
import { useAudio } from './audio/useAudio';
import { CyclesTable } from './components/CyclesTable';
import { IntervalButtons } from './components/IntervalButtons';
import { NameEntry } from './components/NameEntry';
import { ReMeasureControls } from './components/ReMeasureControls';
import { ResultsGrid } from './components/ResultsGrid';
import { SettingsDialog } from './components/SettingsDialog';
import { StartStopButton } from './components/StartStopButton';
import { StatsPanel } from './components/StatsPanel';
import { StatusLine } from './components/StatusLine';
import { ru } from './i18n/ru';
import { useWakeLock } from './platform/useWakeLock';
import {
  meanTau as computeMeanTau,
  sigmaTau,
  tauForInterval,
} from './state/stats';
import type { IntervalIndex } from './state/types';
import { useSession } from './state/useSession';
import styles from './App.module.css';

const INDICES: readonly IntervalIndex[] = [0, 1, 2, 3];

export default function App() {
  const audio = useAudio();
  const sess = useSession(audio);
  const [nameInput, setNameInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [visibilityAborted, setVisibilityAborted] = useState(false);

  // Reset the local name draft when the session is reset.
  useEffect(() => {
    if (sess.session.phase === 'setup') setNameInput('');
  }, [sess.session.phase]);

  const phase = sess.session.phase;
  const intervalsLocked =
    phase === 'playing' || phase === 'armed' || phase === 'timing';

  // Wake lock is live from surname confirm until the session completes or
  // the component unmounts. Feature-detected inside the hook.
  useWakeLock(phase !== 'setup' && phase !== 'complete');

  // Abort any in-flight trial when the tab is backgrounded. Playback scheduled
  // on the audio thread keeps running in the background on most browsers, so
  // the measured interval would no longer reflect what the subject heard.
  const { abortTrialIfRunning } = sess;
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (abortTrialIfRunning()) {
          setVisibilityAborted(true);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [abortTrialIfRunning]);

  // Dismiss the abort banner as soon as the operator starts any new
  // interaction — they have acknowledged it by retrying.
  useEffect(() => {
    if (phase === 'playing' || phase === 'timing' || phase === 'armed') {
      setVisibilityAborted(false);
    }
  }, [phase]);

  const reMeasureActive = sess.session.pendingReMeasureOf !== null;
  const trialCount = sess.session.trials.length;
  const canExport = trialCount > 0 && !intervalsLocked && !exporting;

  const handleExport = async () => {
    if (!canExport) return;
    if (
      trialCount < 20 &&
      !window.confirm(ru.partialExportConfirm)
    ) {
      return;
    }
    setExporting(true);
    try {
      // Lazy import keeps ExcelJS (~50 kB gzipped) out of the initial chunk.
      const { exportWorkbook } = await import('./excel/exportWorkbook');
      await exportWorkbook(sess.session);
    } catch (err) {
      console.error('exportWorkbook failed', err);
      window.alert(
        `${ru.errorFileSavePrefix} ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setExporting(false);
    }
  };

  // Derived stats — recomputed on every trials change, so re-measure is
  // automatically reflected in mean τ, σ and the cycles table without any
  // extra wiring (see the Phase 4 contract in the plan).
  const { meanTauValue, sigmaValue } = useMemo(() => {
    const perIntervalTaus = INDICES.map((idx) =>
      tauForInterval(
        sess.session.trials.filter((t) => t.intervalIndex === idx),
      ),
    );
    const m = computeMeanTau(perIntervalTaus);
    const nonNull = perIntervalTaus.filter((t): t is number => t !== null);
    const s = m !== null ? sigmaTau(nonNull, m) : null;
    return { meanTauValue: m, sigmaValue: s };
  }, [sess.session.trials]);

  const showResults = phase !== 'setup' && sess.session.trials.length > 0;

  return (
    <main className={styles.shell}>
      <header>
        <h1 className={styles.title}>{ru.appTitle}</h1>
        {sess.session.surname.length > 0 && phase !== 'setup' && (
          <p className={styles.surnameLine}>{sess.session.surname}</p>
        )}
      </header>

      <NameEntry
        value={nameInput}
        onChange={setNameInput}
        surname={sess.session.surname}
        locked={phase !== 'setup'}
        onConfirm={() => sess.confirmSurname(nameInput)}
      />

      <StatusLine
        phase={phase}
        currentInterval={sess.session.currentInterval}
        intervalCounts={sess.intervalCounts}
        briefStatus={sess.briefStatus}
      />

      <ReMeasureControls
        pendingReMeasureOf={sess.session.pendingReMeasureOf}
        phase={phase}
        onCancel={sess.cancelReMeasure}
      />

      {visibilityAborted && (
        <div className={styles.abortBanner} role="alert">
          <span className={styles.abortText}>{ru.visibilityAbortError}</span>
          <button
            type="button"
            className={styles.abortDismiss}
            onClick={() => setVisibilityAborted(false)}
            aria-label={ru.dismiss}
          >
            ×
          </button>
        </div>
      )}

      <section className={styles.controls}>
        <div className={styles.section}>
          <IntervalButtons
            intervals={sess.session.intervals}
            intervalCounts={sess.intervalCounts}
            disabled={phase !== 'confirmed' || reMeasureActive}
            onPick={(idx) => {
              void sess.startPlayback(idx);
            }}
          />
        </div>
        <div className={styles.section}>
          <StartStopButton
            phase={phase}
            onStart={(ts) => {
              void sess.startTimer(ts);
            }}
            onStop={(ts) => {
              void sess.stopTimer(ts);
            }}
          />
        </div>
      </section>

      {phase === 'complete' && !reMeasureActive && (
        <div className={styles.completeBanner} role="status">
          {ru.completionMessage}
        </div>
      )}

      {showResults && (
        <>
          <ResultsGrid
            intervals={sess.session.intervals}
            trials={sess.session.trials}
            phase={phase}
            pendingReMeasureOf={sess.session.pendingReMeasureOf}
            onReMeasure={(trialId) => {
              void sess.reMeasure(trialId);
            }}
          />
          <StatsPanel meanTau={meanTauValue} sigma={sigmaValue} />
          <CyclesTable meanTau={meanTauValue} />
        </>
      )}

      <div className={styles.bottom}>
        <button
          type="button"
          onClick={handleExport}
          disabled={!canExport}
          title={trialCount === 0 ? ru.tooltipExportNoTrials : undefined}
        >
          {ru.showResultsButton}
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          disabled={intervalsLocked}
        >
          {ru.showIntervalsButton}
        </button>
        {phase === 'complete' && !reMeasureActive && (
          <button type="button" onClick={sess.newSession}>
            {ru.newSessionButton}
          </button>
        )}
      </div>

      <SettingsDialog
        open={settingsOpen}
        intervals={sess.session.intervals}
        onSave={(next) => {
          sess.updateIntervals(next);
          setSettingsOpen(false);
        }}
        onCancel={() => setSettingsOpen(false)}
      />
    </main>
  );
}
