import { ru } from '../i18n/ru';
import type { IntervalIndex, Phase } from '../state/types';
import { TRIALS_PER_INTERVAL, type BriefStatus } from '../state/useSession';
import { ordinalNominative, ordinalGenitive } from '../utils/ordinals';
import styles from './StatusLine.module.css';

interface Props {
  phase: Phase;
  currentInterval: IntervalIndex | null;
  intervalCounts: readonly [number, number, number, number];
  briefStatus: BriefStatus;
}

function availableIntervalsLabel(
  counts: readonly [number, number, number, number],
): string {
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    if (counts[i]! < TRIALS_PER_INTERVAL) parts.push(ordinalNominative(i + 1));
  }
  return parts.join(', ');
}

export function StatusLine({
  phase,
  currentInterval,
  intervalCounts,
  briefStatus,
}: Props) {
  const text = computeText(
    phase,
    currentInterval,
    intervalCounts,
    briefStatus,
  );
  const className = `${styles.line} ${phase === 'complete' ? styles.complete : ''}`;
  return (
    <p className={className} aria-live="polite">
      {text}
    </p>
  );
}

function computeText(
  phase: Phase,
  currentInterval: IntervalIndex | null,
  intervalCounts: readonly [number, number, number, number],
  briefStatus: BriefStatus,
): string {
  switch (phase) {
    case 'setup':
      return ru.nameEntryInstruction;
    case 'playing':
      if (currentInterval !== null) {
        return `${ru.statusPlayingIntervalPrefix} ${ordinalGenitive(currentInterval + 1)} ${ru.statusPlayingIntervalSuffix}`;
      }
      return '';
    case 'armed':
      return ru.statusReproduceInterval;
    case 'timing':
      return ru.statusTimerStarted;
    case 'complete':
      return ru.statusAllComplete;
    case 'confirmed': {
      if (briefStatus !== null && briefStatus.kind === 'recorded') {
        return ru.statusResultRecorded;
      }
      const total = intervalCounts.reduce((a, b) => a + b, 0);
      if (total === 0) return ru.statusChooseInterval;
      const available = availableIntervalsLabel(intervalCounts);
      return `${ru.statusChooseNextPrefix} ${available}`;
    }
  }
}
