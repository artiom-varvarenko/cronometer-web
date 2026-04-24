import { useMemo } from 'react';
import { ru } from '../i18n/ru';
import { cyclesTable } from '../state/stats';
import styles from './CyclesTable.module.css';

interface Props {
  meanTau: number | null;
}

export function CyclesTable({ meanTau }: Props) {
  const rows = useMemo(
    () => (meanTau !== null ? cyclesTable(meanTau) : []),
    [meanTau],
  );
  if (meanTau === null || rows.length === 0) return null;

  return (
    <section
      className={styles.wrapper}
      aria-label={ru.excelCyclesSectionHeader}
    >
      <h3 className={styles.title}>{ru.excelCyclesSectionHeader}</h3>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{ru.cyclesColumnCycle}</th>
              <th scope="col">{ru.cyclesColumnValue}</th>
              <th scope="col">{ru.cyclesColumnAge}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.cycle}>
                <th scope="row">{row.cycle}</th>
                <td className={styles.numeric}>{row.value.toFixed(3)}</td>
                <td>{row.age}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
