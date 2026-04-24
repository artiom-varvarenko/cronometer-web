import { ru } from '../i18n/ru';
import type { Phase } from '../state/types';
import styles from './StartStopButton.module.css';

interface Props {
  phase: Phase;
  onStart(): void;
  onStop(): void;
}

export function StartStopButton({ phase, onStart, onStop }: Props) {
  const isTiming = phase === 'timing';
  const enabled = phase === 'armed' || phase === 'timing';
  const label = isTiming ? ru.stopButton : ru.startButton;
  const onClick = isTiming ? onStop : onStart;
  return (
    <button
      type="button"
      className={`${styles.button} ${isTiming ? styles.timing : ''}`}
      disabled={!enabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
