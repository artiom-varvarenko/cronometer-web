import { ru } from '../i18n/ru';
import type { Phase } from '../state/types';
import styles from './StartStopButton.module.css';

interface Props {
  phase: Phase;
  onStart(eventTimestamp: number): void;
  onStop(eventTimestamp: number): void;
}

export function StartStopButton({ phase, onStart, onStop }: Props) {
  const isTiming = phase === 'timing';
  const enabled = phase === 'armed' || phase === 'timing';
  const label = isTiming ? ru.stopButton : ru.startButton;
  // event.timeStamp is a DOMHighResTimeStamp set when the browser created
  // the click — strictly earlier than performance.now() inside this handler.
  // Forwarding it upstream anchors the Stopwatch sample to the physical
  // click rather than to the React handler's dispatch moment.
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isTiming) onStop(e.timeStamp);
    else onStart(e.timeStamp);
  };
  return (
    <button
      type="button"
      className={`${styles.button} ${isTiming ? styles.timing : ''}`}
      disabled={!enabled}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}
