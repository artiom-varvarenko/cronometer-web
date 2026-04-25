// Excel export mirrors the layout built by testtime.py:377-512 — the
// customer has already validated the Python output against clinical
// reference sheets, so we match it row-for-row. Behavioral fixes from the
// plan (partial-τ denominator, sanitized filename, etc.) apply here too.
//
// This module is imported lazily from App.tsx so ExcelJS stays out of the
// initial bundle.

import ExcelJS, { type Borders } from 'exceljs';
import { ru } from '../i18n/ru';
import {
  cyclesTable,
  groupTrialsByInterval,
  meanTau as computeMeanTau,
  roundTo3,
  sigmaTau,
  summaForInterval,
  tauForInterval,
} from '../state/stats';
import { INDICES, type Session } from '../state/types';
import { sanitizeFilename } from '../utils/sanitizeFilename';

const THIN_BORDER: Partial<Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

export function buildWorkbook(session: Session): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(ru.excelSheetTitle);

  // ---- Row 1: column headers (bold, centered) ---------------------------
  ru.excelHeaders.forEach((header, idx) => {
    const cell = ws.getCell(1, idx + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center' };
  });

  // ---- Rows 2-5: per-interval data -------------------------------------
  const grouped = groupTrialsByInterval(session.trials);
  const perIntervalSum: readonly [
    number | null,
    number | null,
    number | null,
    number | null,
  ] = [
    summaForInterval(grouped[0]),
    summaForInterval(grouped[1]),
    summaForInterval(grouped[2]),
    summaForInterval(grouped[3]),
  ];
  const perIntervalTau: readonly [
    number | null,
    number | null,
    number | null,
    number | null,
  ] = [
    tauForInterval(grouped[0]),
    tauForInterval(grouped[1]),
    tauForInterval(grouped[2]),
    tauForInterval(grouped[3]),
  ];

  INDICES.forEach((idx) => {
    const row = idx + 2;
    ws.getCell(row, 1).value = ru.excelIntervalRowLabels[idx];

    // 5 attempt cells: numeric values or "-" placeholders (testtime.py:406-412).
    const rowTrials = grouped[idx];
    for (let j = 0; j < 5; j++) {
      const trial = rowTrials[j];
      ws.getCell(row, j + 2).value =
        trial !== undefined ? roundTo3(trial.userSeconds) : ru.excelEmptyCell;
    }

    // Σ and τ — left unset when the row has no trials.
    const sum = perIntervalSum[idx];
    const tau = perIntervalTau[idx];
    if (sum !== null) ws.getCell(row, 7).value = roundTo3(sum);
    if (tau !== null) ws.getCell(row, 8).value = roundTo3(tau);
  });

  // Remaining sections only render when at least one trial exists — matches
  // testtime.py:432 `if row_data:` gate.
  const hasAnyTrials = session.trials.length > 0;
  let meanTauValue: number | null = null;

  if (hasAnyTrials) {
    meanTauValue = computeMeanTau(perIntervalTau);
    const nonNullTaus = perIntervalTau.filter((t): t is number => t !== null);
    const sigmaValue =
      meanTauValue !== null ? sigmaTau(nonNullTaus, meanTauValue) : null;
    const totalSum = perIntervalSum.reduce(
      (acc: number, s) => (s !== null ? acc + s : acc),
      0,
    );

    // ---- Row 6: "Общее" ------------------------------------------------
    ws.getCell(6, 1).value = ru.excelTotalRowLabel;
    for (let col = 2; col <= 6; col++) {
      ws.getCell(6, col).value = ru.excelEmptyCell;
    }
    ws.getCell(6, 7).value = roundTo3(totalSum);
    if (meanTauValue !== null) {
      const meanCell = ws.getCell(6, 8);
      meanCell.value = roundTo3(meanTauValue);
      meanCell.font = { bold: true };
    }

    // ---- Row 7: "Квадр. откл." — σ in col H only, rest are "-" --------
    ws.getCell(7, 1).value = ru.excelStdDevRowLabel;
    for (let col = 2; col <= 7; col++) {
      ws.getCell(7, col).value = ru.excelEmptyCell;
    }
    if (sigmaValue !== null) {
      ws.getCell(7, 8).value = roundTo3(sigmaValue);
    }

    // ---- Row 10: "Циклы (возраст)" merged header (D10:E10) ------------
    const cyclesHeader = ws.getCell(10, 4);
    cyclesHeader.value = ru.excelCyclesSectionHeader;
    cyclesHeader.font = { bold: true };
    cyclesHeader.alignment = { horizontal: 'center' };
    ws.mergeCells('D10:E10');

    // ---- Row 12: cycles table column headers --------------------------
    const cycleColHeader = ws.getCell(12, 4);
    cycleColHeader.value = ru.excelCyclesColumnCycle;
    cycleColHeader.font = { bold: true };
    cycleColHeader.border = THIN_BORDER;

    const valueColHeader = ws.getCell(12, 5);
    valueColHeader.value = ru.excelCyclesColumnValues;
    valueColHeader.font = { bold: true };
    valueColHeader.border = THIN_BORDER;

    // ---- Rows 13-60: 48 cycle value rows ------------------------------
    if (meanTauValue !== null) {
      cyclesTable(meanTauValue).forEach((row, i) => {
        const excelRow = 13 + i;
        const cycleCell = ws.getCell(excelRow, 4);
        cycleCell.value = row.cycle;
        cycleCell.border = THIN_BORDER;

        const valueCell = ws.getCell(excelRow, 5);
        // testtime.py:501 — f"{round(cycle_value, 3)}\n{age_string}".
        // We recompose here so JS Number→String of a 3-decimal round matches
        // Python's float-repr (e.g. 2.124, not 2.124000).
        valueCell.value = `${row.value}\n${row.age}`;
        valueCell.border = THIN_BORDER;
        valueCell.alignment = { wrapText: true, vertical: 'middle' };
      });
    }
  }

  // ---- Column widths (testtime.py:506-512) -----------------------------
  const columnWidths: Record<string, number> = {
    A: 15,
    B: 10,
    C: 10,
    D: 10,
    E: 15,
    F: 10,
    G: 10,
    H: 10,
  };
  for (const [col, width] of Object.entries(columnWidths)) {
    ws.getColumn(col).width = width;
  }

  return wb;
}

// Build and return the xlsx bytes. Split out so tests can roundtrip the
// workbook without depending on a DOM download flow.
export async function buildWorkbookBuffer(
  session: Session,
): Promise<ArrayBuffer> {
  const wb = buildWorkbook(session);
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

// Trigger a browser download of the session as .xlsx. Replaces testtime.py's
// Windows-only `os.startfile` (behavioral fix #8).
export async function exportWorkbook(session: Session): Promise<void> {
  const buffer = await buildWorkbookBuffer(session);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(session.surname)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
