import { type FormEvent, useState } from 'react';
import { ru } from '../i18n/ru';
import { EmptySurnameError } from '../state/useSession';
import styles from './NameEntry.module.css';

interface Props {
  value: string;
  onChange(next: string): void;
  surname: string;
  locked: boolean;
  onConfirm(): Promise<void>;
}

export function NameEntry({
  value,
  onChange,
  surname,
  locked,
  onConfirm,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (locked || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
    } catch (err) {
      if (err instanceof EmptySurnameError) {
        setError(ru.nameEntryError);
      } else {
        console.error('NameEntry confirm failed', err);
        setError(ru.audioUnlockError);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <input
        type="text"
        value={locked ? surname : value}
        onChange={(e) => onChange(e.target.value)}
        disabled={locked || submitting}
        aria-label="Фамилия"
        className={styles.input}
        autoFocus={!locked}
      />
      <button
        type="submit"
        disabled={locked || submitting}
        className={styles.button}
      >
        {ru.nameEntryConfirm}
      </button>
      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
