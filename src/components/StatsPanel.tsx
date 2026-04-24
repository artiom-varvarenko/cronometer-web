import { ru } from '../i18n/ru';
import styles from './StatsPanel.module.css';

interface Props {
  meanTau: number | null;
  sigma: number | null;
}

function format3(n: number): string {
  return n.toFixed(3);
}

export function StatsPanel({ meanTau, sigma }: Props) {
  if (meanTau === null) {
    return <p className={styles.empty}>{ru.noStatsYet}</p>;
  }
  return (
    <dl className={styles.panel}>
      <div className={styles.item}>
        <dt className={styles.label}>{ru.statsMeanTauLabel}</dt>
        <dd className={styles.value}>{format3(meanTau)}</dd>
      </div>
      <div className={styles.item}>
        <dt className={styles.label}>{ru.statsSigmaLabel}</dt>
        <dd className={styles.value}>
          {sigma !== null ? format3(sigma) : ru.gridEmptyCell}
        </dd>
      </div>
    </dl>
  );
}
