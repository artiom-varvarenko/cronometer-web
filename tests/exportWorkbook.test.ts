import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  buildWorkbook,
  buildWorkbookBuffer,
} from '../src/excel/exportWorkbook';
import { ru } from '../src/i18n/ru';
import type { IntervalIndex, Session, Trial } from '../src/state/types';

import sessionFixture from './fixtures/session.json';

function makeTrial(
  intervalIndex: IntervalIndex,
  attempt: number,
  userSeconds: number,
  targetSeconds: number,
): Trial {
  return {
    id: `t-${intervalIndex}-${attempt}`,
    intervalIndex,
    attempt,
    userSeconds,
    targetSeconds,
    createdAt: 0,
    measuredAt: 0,
  };
}

function sessionFromFixture(): Session {
  const intervals = sessionFixture.intervals as [number, number, number, number];
  const trials: Trial[] = [];
  for (let i = 0; i < 4; i++) {
    const target = intervals[i]!;
    (sessionFixture.trials[i] as number[]).forEach((user, j) => {
      trials.push(makeTrial(i as IntervalIndex, j + 1, user, target));
    });
  }
  return {
    surname: 'Иванов',
    intervals,
    trials,
    phase: 'complete',
    currentInterval: null,
    pendingReMeasureOf: null,
  };
}

async function roundtrip(session: Session): Promise<ExcelJS.Worksheet> {
  const buffer = await buildWorkbookBuffer(session);
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  const ws = reloaded.getWorksheet(ru.excelSheetTitle);
  if (!ws) throw new Error('worksheet missing after roundtrip');
  return ws;
}

// ExcelJS may decode numbers as either raw Number or as a `{ result }` object
// depending on source; .value.valueOf() normalizes both.
function numericCell(ws: ExcelJS.Worksheet, addr: string): number {
  const raw = ws.getCell(addr).value;
  if (typeof raw === 'number') return raw;
  if (raw !== null && typeof raw === 'object' && 'result' in raw) {
    return Number((raw as { result: number }).result);
  }
  return Number(raw);
}

describe('buildWorkbook — full-session roundtrip against Python fixture', () => {
  it('worksheet is named "Результаты"', async () => {
    const ws = await roundtrip(sessionFromFixture());
    expect(ws.name).toBe(ru.excelSheetTitle);
  });

  it('row 1 carries the 8 Russian column headers (bold, centered)', async () => {
    const ws = await roundtrip(sessionFromFixture());
    ru.excelHeaders.forEach((expected, idx) => {
      const cell = ws.getCell(1, idx + 1);
      expect(cell.value).toBe(expected);
      expect(cell.font?.bold).toBe(true);
      expect(cell.alignment?.horizontal).toBe('center');
    });
  });

  it('row 2 is the 2-second interval: label, 5 trial values, Σ, τ', async () => {
    const ws = await roundtrip(sessionFromFixture());
    expect(ws.getCell('A2').value).toBe('2 секунды');
    const expectedTrials = sessionFixture.trials[0] as number[];
    expectedTrials.forEach((expected, i) => {
      expect(numericCell(ws, `${columnLetter(i + 2)}2`)).toBeCloseTo(
        Number(expected.toFixed(3)),
        5,
      );
    });
    expect(numericCell(ws, 'G2')).toBeCloseTo(
      Number(sessionFixture.per_interval_suma[0]!.toFixed(3)),
      5,
    );
    expect(numericCell(ws, 'H2')).toBeCloseTo(
      Number(sessionFixture.per_interval_tau[0]!.toFixed(3)),
      5,
    );
  });

  it('row 6 holds "Общее", dash fillers, total Σ, bold mean τ', async () => {
    const ws = await roundtrip(sessionFromFixture());
    expect(ws.getCell('A6').value).toBe(ru.excelTotalRowLabel);
    for (const col of ['B', 'C', 'D', 'E', 'F']) {
      expect(ws.getCell(`${col}6`).value).toBe(ru.excelEmptyCell);
    }
    const expectedTotal = sessionFixture.per_interval_suma.reduce(
      (a, b) => a + b,
      0,
    );
    expect(numericCell(ws, 'G6')).toBeCloseTo(
      Number(expectedTotal.toFixed(3)),
      5,
    );
    const meanCell = ws.getCell('H6');
    expect(numericCell(ws, 'H6')).toBeCloseTo(
      Number(sessionFixture.mean_tau.toFixed(3)),
      5,
    );
    expect(meanCell.font?.bold).toBe(true);
  });

  it('row 7 holds "Квадр. откл." with σ in H7 and dashes in cols B–G', async () => {
    const ws = await roundtrip(sessionFromFixture());
    expect(ws.getCell('A7').value).toBe(ru.excelStdDevRowLabel);
    for (const col of ['B', 'C', 'D', 'E', 'F', 'G']) {
      expect(ws.getCell(`${col}7`).value).toBe(ru.excelEmptyCell);
    }
    expect(numericCell(ws, 'H7')).toBeCloseTo(
      Number(sessionFixture.sigma_tau.toFixed(3)),
      5,
    );
  });

  it('row 10 is the merged "Циклы (возраст)" section header in D10:E10', async () => {
    const ws = await roundtrip(sessionFromFixture());
    expect(ws.getCell('D10').value).toBe(ru.excelCyclesSectionHeader);
    expect(ws.getCell('D10').font?.bold).toBe(true);
    expect(ws.getCell('D10').alignment?.horizontal).toBe('center');
    // ExcelJS exposes the merge range via `_merges` internally; reading E10
    // returns the same value as D10 when the cells are merged.
    expect(ws.getCell('E10').value).toBe(ru.excelCyclesSectionHeader);
  });

  it('row 12 is the cycle table header row with bordered, bold cells', async () => {
    const ws = await roundtrip(sessionFromFixture());
    expect(ws.getCell('D12').value).toBe(ru.excelCyclesColumnCycle);
    expect(ws.getCell('E12').value).toBe(ru.excelCyclesColumnValues);
    expect(ws.getCell('D12').font?.bold).toBe(true);
    expect(ws.getCell('E12').font?.bold).toBe(true);
    expect(ws.getCell('D12').border?.top?.style).toBe('thin');
    expect(ws.getCell('E12').border?.bottom?.style).toBe('thin');
  });

  it('row 13 is the first cycle (C0.25) with "{value}\\n{age}" in E13', async () => {
    const ws = await roundtrip(sessionFromFixture());
    const firstCycle = sessionFixture.cycles[0]!;
    expect(ws.getCell('D13').value).toBe(firstCycle.cycle);
    expect(ws.getCell('E13').value).toBe(
      `${firstCycle.value}\n${firstCycle.age}`,
    );
    expect(ws.getCell('E13').alignment?.wrapText).toBe(true);
    expect(ws.getCell('E13').alignment?.vertical).toBe('middle');
    expect(ws.getCell('D13').border?.top?.style).toBe('thin');
    expect(ws.getCell('E13').border?.right?.style).toBe('thin');
  });

  it('row 60 is the last cycle (C12) with the Python-formatted age string', async () => {
    const ws = await roundtrip(sessionFromFixture());
    const lastCycle = sessionFixture.cycles.at(-1)!;
    expect(ws.getCell('D60').value).toBe(lastCycle.cycle);
    expect(ws.getCell('E60').value).toBe(
      `${lastCycle.value}\n${lastCycle.age}`,
    );
  });

  it('column widths match the Python layout: A=15, E=15, others=10', async () => {
    const ws = await roundtrip(sessionFromFixture());
    expect(ws.getColumn('A').width).toBe(15);
    expect(ws.getColumn('E').width).toBe(15);
    for (const col of ['B', 'C', 'D', 'F', 'G', 'H']) {
      expect(ws.getColumn(col).width).toBe(10);
    }
  });
});

describe('buildWorkbook — partial session', () => {
  it('renders "-" for missing attempts and correct τ with actual count', async () => {
    const session: Session = {
      surname: 'partial',
      intervals: [2, 3, 4, 5],
      phase: 'confirmed',
      currentInterval: null,
      pendingReMeasureOf: null,
      // Interval 0: 3 trials. Other intervals: empty.
      trials: [
        makeTrial(0, 1, 1.98, 2),
        makeTrial(0, 2, 2.03, 2),
        makeTrial(0, 3, 1.95, 2),
      ],
    };
    const ws = await roundtrip(session);

    // First three attempt cells are numeric; last two are "-".
    expect(numericCell(ws, 'B2')).toBeCloseTo(1.98, 5);
    expect(numericCell(ws, 'C2')).toBeCloseTo(2.03, 5);
    expect(numericCell(ws, 'D2')).toBeCloseTo(1.95, 5);
    expect(ws.getCell('E2').value).toBe(ru.excelEmptyCell);
    expect(ws.getCell('F2').value).toBe(ru.excelEmptyCell);

    // τ with 3 trials: sum / (target × 3), not sum / (target × 5).
    const expectedTau = (1.98 + 2.03 + 1.95) / (2 * 3);
    expect(numericCell(ws, 'H2')).toBeCloseTo(
      Number(expectedTau.toFixed(3)),
      5,
    );

    // Rows for empty intervals have "-" across all 5 attempt cells and no
    // numeric Σ / τ (ExcelJS reports empty cells as null).
    for (const col of ['B', 'C', 'D', 'E', 'F']) {
      expect(ws.getCell(`${col}3`).value).toBe(ru.excelEmptyCell);
    }
    expect(ws.getCell('G3').value).toBeNull();
    expect(ws.getCell('H3').value).toBeNull();
  });
});

describe('buildWorkbook — empty session', () => {
  it('still builds a valid header-only worksheet with no total row', () => {
    const session: Session = {
      surname: '',
      intervals: [2, 3, 4, 5],
      phase: 'confirmed',
      currentInterval: null,
      pendingReMeasureOf: null,
      trials: [],
    };
    const wb = buildWorkbook(session);
    const ws = wb.getWorksheet(ru.excelSheetTitle)!;
    // Row 1 headers still present.
    expect(ws.getCell('A1').value).toBe(ru.excelHeaders[0]);
    // Row 6 / 7 / 10 / 12 / 13 all empty — no total row.
    expect(ws.getCell('A6').value).toBeNull();
    expect(ws.getCell('A7').value).toBeNull();
    expect(ws.getCell('D10').value).toBeNull();
    expect(ws.getCell('D12').value).toBeNull();
    expect(ws.getCell('D13').value).toBeNull();
  });
});

function columnLetter(col: number): string {
  return String.fromCharCode('A'.charCodeAt(0) + col - 1);
}
