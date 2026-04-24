import { useEffect, useState } from 'react';
import { useAudio } from './audio/useAudio';
import { IntervalButtons } from './components/IntervalButtons';
import { NameEntry } from './components/NameEntry';
import { SettingsDialog } from './components/SettingsDialog';
import { StartStopButton } from './components/StartStopButton';
import { StatusLine } from './components/StatusLine';
import { ru } from './i18n/ru';
import { useSession } from './state/useSession';
import styles from './App.module.css';

export default function App() {
  const audio = useAudio();
  const sess = useSession(audio);
  const [nameInput, setNameInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Reset the local name draft when the session is reset.
  useEffect(() => {
    if (sess.session.phase === 'setup') setNameInput('');
  }, [sess.session.phase]);

  const phase = sess.session.phase;
  const intervalsLocked =
    phase === 'playing' || phase === 'armed' || phase === 'timing';

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

      <section className={styles.controls}>
        <div className={styles.section}>
          <IntervalButtons
            intervals={sess.session.intervals}
            intervalCounts={sess.intervalCounts}
            disabled={phase !== 'confirmed'}
            onPick={(idx) => {
              void sess.startPlayback(idx);
            }}
          />
        </div>
        <div className={styles.section}>
          <StartStopButton
            phase={phase}
            onStart={() => {
              void sess.startTimer();
            }}
            onStop={() => {
              void sess.stopTimer();
            }}
          />
        </div>
      </section>

      {phase === 'complete' && (
        <div className={styles.completeBanner} role="status">
          {ru.completionMessage}
        </div>
      )}

      <div className={styles.bottom}>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          disabled={intervalsLocked}
        >
          {ru.showIntervalsButton}
        </button>
        {phase === 'complete' && (
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
