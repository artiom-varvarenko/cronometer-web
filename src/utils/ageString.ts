// Port of testtime.py:334-368 (years_to_age_string).
//
// The Python uses 30.44-day months to split remaining days, then applies a
// correction if the rounded day count is >= 30 — bumping by one month and
// subtracting 30 (not 30.44). That hybrid is intentional: the customer has
// validated the outputs it produces, so the TS port reproduces it exactly.
//
// Notes on the port:
//   - Python int() truncates toward zero; Math.trunc matches.
//   - Python round() uses banker's rounding (ties-to-even); see pythonRound.

function pythonRound(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const floor = Math.floor(abs);
  const frac = abs - floor;
  const EPS = 1e-9;
  let rounded: number;
  if (frac < 0.5 - EPS) {
    rounded = floor;
  } else if (frac > 0.5 + EPS) {
    rounded = floor + 1;
  } else {
    rounded = floor % 2 === 0 ? floor : floor + 1;
  }
  return sign * rounded;
}

export function yearsToAgeString(years: number): string {
  const totalDays = years * 365.25;
  let fullYears = Math.trunc(years);
  let remainingDays = totalDays - fullYears * 365.25;
  let fullMonths = Math.trunc(remainingDays / 30.44);
  remainingDays -= fullMonths * 30.44;
  let fullDays = pythonRound(remainingDays);

  if (fullDays >= 30) {
    fullMonths += 1;
    fullDays -= 30;
  }
  if (fullMonths >= 12) {
    fullYears += 1;
    fullMonths -= 12;
  }

  const parts: string[] = [];
  if (fullYears > 0) parts.push(`${fullYears}г`);
  if (fullMonths > 0) parts.push(`${fullMonths}м`);
  if (fullDays > 0 || parts.length === 0) parts.push(`${fullDays}д`);

  return `(${parts.join(', ')})`;
}
