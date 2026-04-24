import { ru } from '../i18n/ru';
import type { Phase } from '../state/types';
import styles from './ReMeasureControls.module.css';

interface Props {
  pendingReMeasureOf: string | null;
  phase: Phase;
  onCancel(): void;
}

export function ReMeasureControls({
  pendingReMeasureOf,
  phase,
  onCancel,
}: Props) {
  if (pendingReMeasureOf === null) return null;
  // Never let the operator cancel once the stopwatch is running — that
  // captured t0 needs to be consumed by stopTimer (or discarded via cancel
  // before the timer is armed). Locking cancel during `timing` keeps the
  // flow simple.
  const canCancel = phase !== 'timing';
  return (
    <div className={styles.banner} role="status">
      <span className={styles.text}>{ru.reMeasureBanner}</span>
      <button
        type="button"
        className={styles.cancel}
        onClick={onCancel}
        disabled={!canCancel}
      >
        {ru.reMeasureCancel}
      </button>
    </div>
  );
}
