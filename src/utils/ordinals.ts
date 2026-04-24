import { ru } from '../i18n/ru';

export function ordinalNominative(n: number): string {
  const v = ru.ordinalsNominative[n - 1];
  if (v === undefined) {
    throw new RangeError(`ordinalNominative: expected 1..4, got ${n}`);
  }
  return v;
}

export function ordinalGenitive(n: number): string {
  const v = ru.ordinalsGenitive[n - 1];
  if (v === undefined) {
    throw new RangeError(`ordinalGenitive: expected 1..4, got ${n}`);
  }
  return v;
}
