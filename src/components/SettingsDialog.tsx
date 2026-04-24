import { useEffect, useRef, useState } from 'react';
import { ru } from '../i18n/ru';
import styles from './SettingsDialog.module.css';

interface Props {
  open: boolean;
  intervals: readonly [number, number, number, number];
  onSave(intervals: [number, number, number, number]): void;
  onCancel(): void;
}

const MAX_SECONDS = 60;

function parseIntervals(
  raw: readonly [string, string, string, string],
): [number, number, number, number] | null {
  const out: number[] = [];
  for (const s of raw) {
    // Accept comma OR dot as decimal separator (matches typical RU locale).
    const normalized = s.trim().replace(',', '.');
    if (normalized.length === 0) return null;
    const n = Number(normalized);
    if (!Number.isFinite(n)) return null;
    if (n <= 0 || n > MAX_SECONDS) return null;
    out.push(n);
  }
  return out as [number, number, number, number];
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toString();
}

export function SettingsDialog({ open, intervals, onSave, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [values, setValues] = useState<[string, string, string, string]>([
    formatNumber(intervals[0]),
    formatNumber(intervals[1]),
    formatNumber(intervals[2]),
    formatNumber(intervals[3]),
  ]);
  const [error, setError] = useState<string | null>(null);

  // Re-seed inputs from props each time the dialog opens, so a Cancel→reopen
  // cycle starts from the saved values, not stale draft input.
  useEffect(() => {
    if (open) {
      setValues([
        formatNumber(intervals[0]),
        formatNumber(intervals[1]),
        formatNumber(intervals[2]),
        formatNumber(intervals[3]),
      ]);
      setError(null);
    }
  }, [open, intervals]);

  // Drive native modality imperatively — the `open` attribute alone is
  // non-modal (no backdrop, no focus trap, no ESC).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  const handleSave = () => {
    const parsed = parseIntervals(values);
    if (parsed === null) {
      setError(ru.settingsError);
      return;
    }
    setError(null);
    onSave(parsed);
  };

  const handleCancelEvent = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    // Native ESC fires a "cancel" event; route it through our handler so
    // parent state stays in sync.
    e.preventDefault();
    onCancel();
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onCancel={handleCancelEvent}
      aria-labelledby="settings-title"
    >
      <h2 id="settings-title" className={styles.title}>
        {ru.settingsTitle}
      </h2>
      <p className={styles.prompt}>{ru.settingsPrompt}</p>

      {([0, 1, 2, 3] as const).map((i) => (
        <div key={i} className={styles.row}>
          <label htmlFor={`interval-${i}`} className={styles.rowLabel}>
            {ru.settingsIntervalRow[i]}
          </label>
          <input
            id={`interval-${i}`}
            className={styles.rowInput}
            type="text"
            inputMode="decimal"
            value={values[i]}
            onChange={(e) =>
              setValues((prev) => {
                const next = [...prev] as [string, string, string, string];
                next[i] = e.target.value;
                return next;
              })
            }
          />
          <span className={styles.rowUnit}>{ru.settingsUnitSeconds}</span>
        </div>
      ))}

      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" onClick={onCancel}>
          {ru.settingsCancel}
        </button>
        <button type="button" onClick={handleSave}>
          {ru.settingsSave}
        </button>
      </div>
    </dialog>
  );
}
