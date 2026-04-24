export type IntervalIndex = 0 | 1 | 2 | 3;

export interface Trial {
  id: string;
  intervalIndex: IntervalIndex;
  attempt: number;
  userSeconds: number;
  targetSeconds: number;
  // Split into two fields to resolve the "timestamp" ambiguity in the plan:
  // createdAt freezes at first recording; measuredAt updates on re-measure.
  createdAt: number;
  measuredAt: number;
}

export type Phase =
  | 'setup'
  | 'confirmed'
  | 'playing'
  | 'armed'
  | 'timing'
  | 'complete';

export interface Session {
  surname: string;
  intervals: [number, number, number, number];
  trials: Trial[];
  phase: Phase;
  currentInterval: IntervalIndex | null;
  pendingReMeasureOf: string | null;
}
