import { ru } from '../i18n/ru';
import {
  groupTrialsByInterval,
  summaForInterval,
  tauForInterval,
} from '../state/stats';
import { INDICES, type Phase, type Trial } from '../state/types';
import styles from './ResultsGrid.module.css';

interface Props {
  intervals: readonly [number, number, number, number];
  trials: readonly Trial[];
  phase: Phase;
  pendingReMeasureOf: string | null;
  onReMeasure(trialId: string): void;
}

const ATTEMPTS: readonly number[] = [1, 2, 3, 4, 5];

// Python rounds to 3 decimals (testtime.py:408, 417, 421). Match exactly so
// the grid and Excel export agree on what the operator sees.
function formatSeconds(s: number): string {
  return s.toFixed(3);
}

function formatTau(t: number): string {
  return t.toFixed(3);
}

export function ResultsGrid({
  intervals,
  trials,
  phase,
  pendingReMeasureOf,
  onReMeasure,
}: Props) {
  const idle = phase === 'confirmed' || phase === 'complete';
  const reMeasureActive = pendingReMeasureOf !== null;
  // Operator can launch a new re-measure only while no playback/timing is
  // running and no re-measure is already in flight.
  const canReMeasure = idle && !reMeasureActive;
  const grouped = groupTrialsByInterval(trials);

  return (
    <section
      className={`${styles.wrapper} ${reMeasureActive ? styles.reMeasureActive : ''}`}
      aria-label={ru.excelSheetTitle}
    >
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{ru.excelHeaders[0]}</th>
              {ATTEMPTS.map((a) => (
                <th scope="col" key={a}>
                  {ru.excelHeaders[a]}
                </th>
              ))}
              <th scope="col">{ru.excelHeaders[6]}</th>
              <th scope="col">{ru.excelHeaders[7]}</th>
            </tr>
          </thead>
          <tbody>
            {INDICES.map((idx) => {
              const rowTrials = grouped[idx];
              const sum = summaForInterval(rowTrials);
              const tau = tauForInterval(rowTrials);
              return (
                <tr key={idx}>
                  <th scope="row" className={styles.rowHeader}>
                    {intervals[idx]} {ru.settingsUnitSeconds}
                  </th>
                  {ATTEMPTS.map((attempt) => {
                    const trial = rowTrials.find((t) => t.attempt === attempt);
                    if (!trial) {
                      return (
                        <td key={attempt} className={styles.empty}>
                          {ru.gridEmptyCell}
                        </td>
                      );
                    }
                    const isPending = pendingReMeasureOf === trial.id;
                    return (
                      <td
                        key={attempt}
                        className={`${styles.cell} ${isPending ? styles.pending : ''}`}
                      >
                        <span className={styles.value}>
                          {formatSeconds(trial.userSeconds)}
                        </span>
                        <button
                          type="button"
                          className={styles.redo}
                          onClick={() => onReMeasure(trial.id)}
                          disabled={!canReMeasure}
                          title={ru.reMeasureTooltip}
                          aria-label={`${ru.reMeasureTooltip} — ${ru.excelHeaders[attempt]}`}
                        >
                          <RedoIcon />
                        </button>
                      </td>
                    );
                  })}
                  <td className={styles.summary}>
                    {sum !== null ? formatSeconds(sum) : ru.gridEmptyCell}
                  </td>
                  <td className={styles.summary}>
                    {tau !== null ? formatTau(tau) : ru.gridEmptyCell}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RedoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M 20 12 A 8 8 0 1 1 12 4 V 1 L 17 5 L 12 9 V 6"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
