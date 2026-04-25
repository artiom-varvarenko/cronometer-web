import { ru } from '../i18n/ru';
import { INDICES, type IntervalIndex } from '../state/types';
import { TRIALS_PER_INTERVAL } from '../state/useSession';
import styles from './IntervalButtons.module.css';

interface Props {
  intervalCounts: readonly [number, number, number, number];
  disabled: boolean;
  onPick(idx: IntervalIndex): void;
}

export function IntervalButtons({
  intervalCounts,
  disabled,
  onPick,
}: Props) {
  return (
    <ul className={styles.list}>
      {INDICES.map((i) => {
        const exhausted = intervalCounts[i] >= TRIALS_PER_INTERVAL;
        const isDisabled = disabled || exhausted;
        const tooltip = exhausted ? ru.tooltipIntervalExhausted : undefined;
        return (
          <li key={i}>
            <button
              type="button"
              className={`${styles.button} ${exhausted ? styles.exhausted : ''}`}
              disabled={isDisabled}
              title={tooltip}
              onClick={() => onPick(i)}
            >
              {ru.intervalButtons[i]}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
