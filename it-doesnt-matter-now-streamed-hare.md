# Cronometer Web — Implementation Plan

> Plan for a fresh repo `cronometer-web`. Copy this file and the original
> `testtime.py` (place it at `reference/testtime.py`) into the new repo before
> handing off to the coding agent. Each phase ends in a runnable, demoable
> state — commit between phases.

---

## Context

We are porting an existing Python/Tkinter desktop app (`reference/testtime.py`)
to a responsive web app. The original is a **τ-test chronometer**: the subject
hears four reference intervals (default 2 / 3 / 4 / 5 s), then tries to
reproduce each one five times by pressing Start/Stop. 20 trials total. Results
are exported to Excel with per-interval τ, mean τ, σ, and a derived
"cycles / age" table.

**Why a rewrite, not a port**
- Runs on any OS and any device. The original is Windows-only (`winsound`,
  `os.startfile`).
- Web Audio API gives **higher-precision interval playback** than Tkinter +
  `time.sleep`, which is critical to this customer.
- **New customer requirement**: the operator must be able to re-measure a
  single trial and have all statistics recalculate automatically. The Python
  app offers no in-session editing.

**Primary non-functional requirements (from the customer)**
1. **Beep timing accuracy is critical.** The reference intervals must be as
   precise as the platform allows. This drives the audio design (AudioContext
   scheduling, *never* `setTimeout`/`setInterval`).
2. **Must work on mobile, tablet, and desktop** — not desktop-only.
3. Russian UI (same as the original). English is out of scope unless asked.
4. Functional completeness beats code minimalism. More files / more structure
   is acceptable.

**Reference**
`reference/testtime.py` is the source of truth for **behavior** (ordinal
labels, ×8.5 cycle formula, Excel layout, interval caps at 5 uses). It is
**not** a line-by-line porting target — fix its bugs as you go (see
"Behavioral fixes vs the Python original" near the end).

---

## Target stack

| Area        | Choice                          | Why                                                                                   |
|-------------|---------------------------------|---------------------------------------------------------------------------------------|
| Framework   | **React 18 + TypeScript**       | Reactive state for live-recalculated stats; typed model for the 20-trial grid         |
| Build       | **Vite**                        | Fast dev, ESM, small static build                                                     |
| Excel       | **ExcelJS**                     | Bold headers, borders, merged cells, column widths — matches the Python layout        |
| Audio       | **Web Audio API (OscillatorNode)** | Sample-accurate scheduling on the audio thread; survives main-thread throttling     |
| User timer  | **`performance.now()`**         | Sub-ms Start/Stop measurement                                                         |
| Styles      | **CSS Modules + CSS variables** | Scoped, no runtime cost, responsive via media queries + `clamp()`                     |
| Linting     | ESLint + Prettier               | Standard                                                                              |
| Testing     | Vitest + Testing Library        | Pure-function stats, component smoke tests                                            |

No state-management library — React hooks are sufficient at this size.

---

## File layout

```
cronometer-web/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── favicon.svg
├── reference/
│   └── testtime.py                # original, read-only reference
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── state/
│   │   ├── types.ts               # Trial, Session, IntervalIndex
│   │   ├── useSession.ts          # core hook: state + derived stats
│   │   └── stats.ts               # pure: tau, sigma, cycles
│   ├── audio/
│   │   ├── AudioEngine.ts         # AudioContext + scheduled beeps
│   │   └── useAudio.ts            # hook wrapper, unlocks on first gesture
│   ├── timing/
│   │   └── measurement.ts         # performance.now wrapper
│   ├── components/
│   │   ├── NameEntry.tsx
│   │   ├── IntervalButtons.tsx
│   │   ├── StartStopButton.tsx
│   │   ├── StatusLine.tsx
│   │   ├── ResultsGrid.tsx
│   │   ├── StatsPanel.tsx
│   │   ├── CyclesTable.tsx
│   │   ├── SettingsDialog.tsx
│   │   └── ReMeasureControls.tsx
│   ├── excel/
│   │   └── exportWorkbook.ts      # ExcelJS builder, lazy-loaded
│   ├── utils/
│   │   ├── ordinals.ts            # 1→"1-ый", 2→"2-ой", 3→"3-ий", 4→"4-ый"
│   │   ├── ageString.ts           # years → "(Nг, Nм, Nд)"
│   │   └── sanitizeFilename.ts
│   ├── i18n/
│   │   └── ru.ts                  # All user-facing strings, one place
│   └── styles/
│       ├── globals.css
│       └── *.module.css
├── tests/
│   ├── stats.test.ts
│   ├── ageString.test.ts
│   ├── ordinals.test.ts
│   └── exportWorkbook.test.ts
└── README.md
```

---

## Architecture

### Data model (`src/state/types.ts`)

```ts
export type IntervalIndex = 0 | 1 | 2 | 3;

export interface Trial {
  id: string;                         // uuid — stable key, re-measure target
  intervalIndex: IntervalIndex;
  attempt: number;                    // 1..5 within its interval
  userSeconds: number;                // what the subject produced
  targetSeconds: number;              // interval duration at measurement time
  timestamp: number;                  // Date.now() — preserved across re-measures for audit
}

export type Phase =
  | 'setup'      // name entry editable
  | 'confirmed'  // name locked, interval buttons armed, Start disabled
  | 'playing'    // reference beep sequence in flight, everything disabled
  | 'armed'      // Start enabled (big button), interval buttons disabled
  | 'timing'     // Start became Stop
  | 'complete';  // 20 trials recorded, export available

export interface Session {
  surname: string;
  intervals: [number, number, number, number];  // defaults [2, 3, 4, 5]
  trials: Trial[];                               // grows to 20, mutated by re-measure
  phase: Phase;
  currentInterval: IntervalIndex | null;
  pendingReMeasureOf: string | null;             // Trial.id being re-measured
}
```

Storing `targetSeconds` **on each trial** is deliberate: if the operator edits
interval durations mid-session via the settings dialog, existing trials keep
their original reference value so τ per trial stays correct.

### State hook (`src/state/useSession.ts`)

One custom hook exposes the session and the actions:

- `session: Session`
- `confirmSurname(name)`
- `updateIntervals(intervals)`           — settings dialog
- `startPlayback(idx)`                   — user picks an interval
- `armStartStop()`                       — called by `AudioEngine` after the second beep fires
- `startTimer()`, `stopTimer()`          — user Start / Stop
- `reMeasure(trialId)`                   — runs the play-then-record flow for that trial
- `cancelReMeasure()`                    — aborts without replacing

Derived values (per-interval sum, τ, mean τ, σ, cycles) are computed with
`useMemo` directly from `session.trials` on every render — no cached/stale
state, so the re-measure requirement is satisfied automatically.

### Stats (`src/state/stats.ts` — pure, fully unit-tested)

Port the math from `testtime.py:327–368` (std dev, age string) and
`testtime.py:380–505` (τ, cycles), with fixes:

```ts
export function summaForInterval(trials: Trial[]): number | null;
export function tauForInterval(trials: Trial[]): number | null;  // sum / (target * n)
export function meanTau(taus: (number | null)[]): number | null;
export function sigmaTau(taus: number[], mean: number): number;  // sample, n-1
export function yearsToAgeString(years: number): string;         // "(Nг, Nм, Nд)"
export function cyclesTable(mean: number): CycleRow[];           // k = 0.25..12 step 0.25
export const CYCLE_CONSTANT = 8.5;                               // TODO: ask customer for the source/name
```

**Fixes vs the Python version** (see the table near the end for the full list):
- `tauForInterval` divides by `target × trials.length`, not `target × 5`.
  Mid-session τ stays correct.
- `yearsToAgeString` uses **30.44-day months consistently** — no mixed 30 vs
  30.44 correction.
- `CYCLE_CONSTANT = 8.5` is named and doc-commented, not magic.

### Audio engine (`src/audio/AudioEngine.ts`) — **timing-critical**

The biggest correctness risk in the whole app. Design:

```ts
class AudioEngine {
  private ctx: AudioContext | null = null;

  async ensureUnlocked(): Promise<void> {
    // Must be invoked from a user gesture (first button click).
    // Creates AudioContext lazily, resume()s it, and plays a 0-volume
    // tick to unlock Safari/iOS.
  }

  /**
   * Schedules two 1 kHz / 100 ms beeps separated by exactly
   * `intervalSeconds`. Resolves as soon as the SECOND beep begins, so the
   * UI can arm Start. Returns telemetry for the debug harness.
   */
  async playInterval(intervalSeconds: number):
    Promise<{ scheduledGap: number; measuredGap: number }>;

  /** Short confirmation beep on user Start / Stop (matches testtime.py:243,249). */
  async playClick(): Promise<void>;
}
```

**Timing rules — these are non-negotiable:**

1. **Never use `setTimeout` / `setInterval` to time the interval.** They drift,
   especially on throttled mobile browsers. Schedule the audio graph once:
   ```ts
   const t0 = ctx.currentTime + 0.05;        // 50 ms pre-roll buffer
   const t1 = t0 + intervalSeconds;
   scheduleBeep(t0);                          // first beep
   scheduleBeep(t1);                          // second beep — sample-accurate gap
   ```
   `scheduleBeep(t)` builds an `OscillatorNode` + `GainNode` with a 5 ms
   attack / release envelope (avoids click artifacts) and calls
   `osc.start(t); osc.stop(t + 0.1)`.

2. **UI arms Start from the `onended` event of the second oscillator** — not
   from a timer. This cannot drift relative to the audible beep.

3. **Distinguish latency from jitter.** Output buffer latency (20–50 ms
   typical) is fine and unavoidable — the subject hears both beeps late by the
   same amount. What matters is the **gap between beeps**, which Web Audio
   guarantees to sample accuracy (±~20 µs at 48 kHz). Document this in
   `AudioEngine.ts` so future contributors do not "optimize" by replacing the
   scheduler with timers.

4. **iOS Safari** starts AudioContext in `suspended`. `ensureUnlocked()` is
   hooked into the surname "Подтвердить" button (first required gesture).
   Re-check `ctx.state === 'running'` before each trial and re-resume if
   needed.

5. **Background-tab throttling:** if `document.visibilityState === 'hidden'`
   when a test is in `playing` or `timing`, abort the trial with a
   user-visible Russian error. Re-check on `visibilitychange`.

6. **Wake Lock:** `navigator.wakeLock.request('screen')` on session confirm,
   release on `complete` or unmount. Feature-detect; silent no-op if absent.

7. **Debug harness:** a `?debug=1` query flag enables console telemetry
   `{ expected, measuredGap, driftMs }` for every `playInterval` call, used
   in the manual QA matrix (Phase 2, Phase 6).

### User-time measurement (`src/timing/measurement.ts`)

```ts
export class Stopwatch {
  private t0 = 0;
  start() { this.t0 = performance.now(); }
  stopSeconds(): number { return (performance.now() - this.t0) / 1000; }
}
```

`performance.now()` is clamped to 5 µs – 1 ms depending on browser security
settings — more than enough precision for a human motor response.

### Excel export (`src/excel/exportWorkbook.ts` — lazy-imported)

Replicate the layout from `testtime.py:377–512` with ExcelJS. The exact shape:

- Worksheet title: `"Результаты"`.
- Row 1 (bold, centered): `Интервал | Попытка 1 | Попытка 2 | Попытка 3 | Попытка 4 | Попытка 5 | Сумма | Тау (т)`
- Rows 2–5: one per interval `("2 секунды", "3 секунды", "4 секунды", "5 секунд")`.
  Empty attempts render as `"-"`. Sum and τ blank when the row has zero trials.
- Row 6: `"Общее"` — total sum, mean τ (bold). Attempt cells are `"-"`.
- Row 7: `"Квадр. откл."` — σ of τ only; cells 2–7 are `"-"`.
- Row 10 (D:E merged, bold, centered): `"Циклы (возраст)"`.
- Row 12: `"Цикл" | "Значения"` headers with thin borders.
- Rows 13–60: cycles `C0.25 .. C12.00` step `0.25` (48 rows).
  Value formatted as `"{round(meanτ × 8.5 × k, 3)}\n{yearsToAgeString(...)}"`
  with `wrap_text=true, vertical=center` and a thin border on both cells.
- Column widths: `A=15`, `E=15`, others `=10`.

Trigger download via `workbook.xlsx.writeBuffer()` → `Blob` → programmatic
`<a download>`. Filename: `sanitizeFilename(surname) + '.xlsx'`. Lazy-import
the module (`const { exportWorkbook } = await import('./excel/exportWorkbook')`)
so ExcelJS stays out of the initial bundle.

---

## Responsive layout

Three breakpoints, CSS-only — no JS layout logic.

| Class   | Width      | Layout                                                                                                 |
|---------|------------|--------------------------------------------------------------------------------------------------------|
| Desktop | ≥ 900 px   | Two-column, matches the Tkinter original. Interval buttons on the left, Start/Stop panel on the right. |
| Tablet  | 600–899 px | Stacked column. Interval buttons in a 2×2 grid, Start/Stop below.                                      |
| Phone   | < 600 px   | Single column, interval buttons full-width. Results grid horizontally scrollable.                      |

Tools: CSS Grid, `clamp()` for typography, `dvh` for heights (handles mobile
URL bar), `@media (pointer: coarse)` to enforce 48×48 CSS-px tap targets.

---

## Phased build

Each phase ends in a runnable, demoable state. Commit after each phase. The
coding agent should treat phase boundaries as review checkpoints.

### Phase 0 — Scaffolding

**Deliverable:** `npm run dev` starts Vite and shows a placeholder page.

- `npm create vite@latest cronometer-web -- --template react-ts`
- Install deps: `exceljs`, `uuid`.
- Install dev deps: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`,
  `jsdom`, `eslint-config-prettier`, `prettier`.
- `tsconfig.json`: strict mode on. Add Vitest config to `vite.config.ts`.
- Create the folder skeleton from "File layout".
- Seed `src/i18n/ru.ts` with every Russian string from `reference/testtime.py`
  (titles, button labels, interval names, status messages, error messages,
  dialog labels, Excel headers). One export object, flat keys.
- Write a starter `README.md`: local dev, build, deploy.
- `.gitignore`: `node_modules`, `dist`, `.DS_Store`, `*.xlsx`, `.env.local`.

### Phase 1 — Pure stats + utils (TDD)

**Deliverable:** `npm test` passes. No UI work.

- Implement `state/stats.ts`, `utils/ageString.ts`, `utils/ordinals.ts`,
  `utils/sanitizeFilename.ts`.
- Vitest coverage:
  - `tauForInterval`: 0, 1, 3, 5 attempts. Verify denominator is
    `target × trials.length`, not `target × 5`.
  - `sigmaTau`: ≤ 1 sample → 0 (matches `testtime.py:329`). Known 4-sample
    case checked against a hand-computed value.
  - `yearsToAgeString`: boundaries at 0, 0.5, 1.0, 1.9999, 12×0.25 = 3.0,
    12.0. Assert months never report as 30+.
  - `cyclesTable`: length 48, step 0.25, first key `"C0.25"`, last `"C12"`.
  - `ordinals`: 1 → `"1-ый"`, 2 → `"2-ой"`, 3 → `"3-ий"`, 4 → `"4-ый"`.
    This fixes the bug at `testtime.py:124` where all three branches return
    `'й'`.
  - `sanitizeFilename`: strips `/ \ : * ? " < > |`, trims, falls back to
    `"results"` if empty.

### Phase 2 — Audio engine + unlock

**Deliverable:** a throwaway dev page plays the 2-second interval (beep, 2 s
pause, beep). Verified on desktop Chrome, Firefox, Safari.

- Implement `AudioEngine` per the spec above.
- `useAudio()` hook: one engine instance, wires `ensureUnlocked()` into the
  first real user gesture via a context provider.
- Add the `?debug=1` telemetry harness (console logs `driftMs`).
- **Manual QA matrix in this phase** (before moving on): desktop Chrome +
  Firefox + Safari, iOS Safari, Android Chrome. 5 trials each at the 5 s
  interval. Record mean and max drift — target: mean < 5 ms, max < 25 ms.

### Phase 3 — Core flow UI (no editing yet)

**Deliverable:** a full 20-trial session can be completed end-to-end,
excluding Excel export and re-measure.

- Components: `NameEntry`, `IntervalButtons`, `StartStopButton`,
  `StatusLine`, `SettingsDialog`.
- `useSession` wired to `AudioEngine`.
- Phase state machine per the `Phase` type. Transitions, with references to
  the Python behavior being reproduced:
  - `setup → confirmed`          — name submitted. (`testtime.py:148`)
  - `confirmed → playing`        — user picks an interval. (`testtime.py:191`)
  - `playing → armed`            — second beep fires. (`testtime.py:230`)
  - `armed → timing`             — Start pressed, click beep. (`testtime.py:238`)
  - `timing → confirmed`         — Stop pressed, trial recorded, click beep,
    if `trials.length < 20`. (`testtime.py:246`)
  - `timing → complete`          — Stop pressed, `trials.length === 20`.
    (`testtime.py:269`)
- Enforce the **5-trials-per-interval cap**: once `interval_counts[i] === 5`,
  that button is disabled with a tooltip in Russian. (`testtime.py:197`)
- `SettingsDialog`: editable durations with validation `0 < value ≤ 60`.
  Includes a Cancel button (fixing a Python UX gap) and displays a clear
  Russian error message on invalid input.
- `StatusLine` text comes from `src/i18n/ru.ts`; matches `testtime.py`'s
  wording exactly for operator familiarity.
- Manual test: run a full 20-trial session with all four intervals without
  touching the results grid — all trials land and the `complete` phase is
  reached.

### Phase 4 — Results grid + re-measurement

**Deliverable:** operator can click a cell's redo icon, the reference
interval plays, Start/Stop records a new value, the old value is replaced,
and sum / τ / σ / cycles all update immediately.

- `ResultsGrid` renders the Python Excel shape: 4 interval rows × 5 attempt
  cells, plus Σ and τ columns. Empty attempt cells show `—`.
- Each populated cell has a small redo control (inline SVG). Always visible
  on coarse-pointer devices; appears on hover on fine-pointer devices.
- Redo click:
  - Sets `session.pendingReMeasureOf = trial.id`.
  - Disables all other interaction (greyed out with a subtle overlay).
  - Auto-plays the reference interval for that trial's `intervalIndex`.
  - Arms Start/Stop.
  - On Stop: mutates the trial in place — same `id`, new `userSeconds`,
    updated `timestamp`. Clears `pendingReMeasureOf`. Returns to `confirmed`
    or `complete` as appropriate.
- `ReMeasureControls` shows an `"Отменить"` button during a pending
  re-measure so the operator can abort without replacing.
- `StatsPanel` and `CyclesTable` re-render automatically via `useMemo` on
  `session.trials` — no extra wiring.
- Manual test: complete all 20 trials → click redo on an arbitrary cell →
  confirm the reference beep plays → Start/Stop → confirm the specific cell
  updates, the row Σ and τ recompute, mean τ and σ recompute, and every row
  of the cycles table recomputes.

**Explicitly out of scope for v1:** multi-level undo history, deletion of
trials, appending more than 5 attempts per interval. If the customer later
wants an audit trail, the `timestamp` field is already reserved for it.

### Phase 5 — Excel export

**Deliverable:** the `"Отобразить таблицу результатов"` button triggers a
formatted `.xlsx` download matching the Python output.

- Implement `exportWorkbook.ts` per the spec in "Architecture".
- Button disabled until `trials.length > 0`; tooltip in Russian explains why.
- Filename: `sanitizeFilename(surname) + '.xlsx'`. Browser handles conflicts
  with its default rename behavior.
- If `trials.length < 20`, show a Russian confirm dialog
  (`"Экспортировать частичные результаты?"`) before downloading. Partial τ
  uses actual per-interval counts — not 5.
- Automated test: render a fixture session, call `exportWorkbook`, load the
  buffer with ExcelJS again, and assert key cells (headers, row 2 τ,
  row 6 mean τ, row 13 C0.25 value) match expected values.
- Manual test: download the file, open in Excel and LibreOffice, compare
  layout side-by-side against a `.xlsx` generated by running `testtime.py`
  on Windows (customer can supply one).

### Phase 6 — Responsive + mobile hardening

**Deliverable:** usable on iPhone SE and iPad; beep-timing drift measured on
both and meets the Phase 2 targets.

- Apply the three breakpoints from "Responsive layout".
- Enforce 48×48 CSS-px minimum on `@media (pointer: coarse)` for every
  interactive control, including redo icons.
- `navigator.wakeLock.request('screen')` on session confirm; release on
  `complete` or unmount. Feature-detect.
- `visibilitychange` handler: if hidden during `playing` or `timing`, abort
  the current trial with a Russian error banner.
- Verify AudioContext unlock on iOS: first tap of "Подтвердить" must resume
  the context. Add an explicit assertion in the debug harness.
- Manual QA on real devices: iPhone Safari, Android Chrome, iPad Safari.
  Re-run the timing matrix from Phase 2 on each; same drift targets.

### Phase 7 — Polish + production build

**Deliverable:** production-ready static build.

- `README.md` updated with dev, build, and deploy instructions (Vercel /
  Netlify / GitHub Pages; plain `vite build` produces a static `dist/` that
  works for all three).
- `<title>`, favicon, `meta description`, `meta viewport`.
- Ask the customer before locking pinch-zoom (`user-scalable=no`) — it hurts
  accessibility.
- Error boundary at the app root, with a Russian fallback UI.
- Accessibility pass: keyboard-only flow (Tab, Enter), `aria-live="polite"`
  on `StatusLine`, `<label>`s for inputs, visible focus rings.
- Bundle-size check: gzip ≤ 250 KB target. ExcelJS is the largest dep —
  confirm it is only in the async chunk from the lazy import.
- Optional (ask the customer): PWA manifest + service worker so the app can
  be installed to the home screen and run offline. Skip if not requested.

---

## Behavioral fixes vs the Python original

These are bugs in `reference/testtime.py` that must **not** be reproduced.
Where helpful, the web version should include a one-line code comment
pointing at the fixed behavior.

| # | Python location       | Issue                                                                | Resolution in web version                                                  |
|---|-----------------------|----------------------------------------------------------------------|----------------------------------------------------------------------------|
| 1 | `testtime.py:124`     | All three Russian ordinal branches collapse to `'й'`                 | Single `ordinal(n)` helper in `utils/ordinals.ts`, unit-tested             |
| 2 | `testtime.py:420`     | τ divides by `target × 5` even with fewer attempts                   | `tauForInterval` divides by `target × trials.length`                        |
| 3 | `testtime.py:350`     | `years_to_age_string` mixes 30- and 30.44-day months                 | `yearsToAgeString` uses 30.44 consistently; tested at boundaries            |
| 4 | `testtime.py:314`     | `"Скрыть интервалы"` button bound to `lambda: None`                   | Removed. `complete` phase shows `"Новая сессия"` + export actions           |
| 5 | `testtime.py:166`     | "Show results" enabled before any trial exists                       | Disabled until `trials.length > 0`, Russian tooltip explains                |
| 6 | `testtime.py:515`     | Filename not sanitized                                               | `sanitizeFilename()` strips `/ \ : * ? " < > |` and trims                   |
| 7 | `testtime.py:5`       | `winsound` module-level import breaks non-Windows                    | Web Audio API — cross-platform by construction                              |
| 8 | `testtime.py:518`     | `os.startfile` is Windows-only                                       | Browser download via `Blob` + `<a download>`                                |
| 9 | Settings dialog       | No Cancel button, no upper bound on duration                         | Cancel button, range `(0, 60]`, clear error message                          |
| 10| `testtime.py:499`     | `8.5` cycle factor is magic                                          | Named `CYCLE_CONSTANT` in `stats.ts` with doc-comment requesting source     |

---

## Verification

**Automated**
- `npm test` — Vitest covers `stats.ts`, `ageString.ts`, `ordinals.ts`,
  `sanitizeFilename.ts`, and an `exportWorkbook` round-trip test.
- `npm run build` — no TypeScript errors, produces `dist/`.
- `npm run lint` — ESLint clean, Prettier clean.

**Manual (required before shipping)**
- **Full desktop session**: enter name → run all 20 trials → verify the
  results grid matches trial order → export `.xlsx` → open in Excel and
  LibreOffice → compare layout against a Python reference export.
- **Re-measure**: complete a trial → click redo → confirm the reference
  beep plays → Start/Stop → confirm only the target cell updates and that
  τ / σ / cycles all recompute.
- **Audio-timing harness** (`?debug=1`): run the 5 s interval 10 times on
  each target browser/OS; mean drift < 5 ms, max drift < 25 ms.
- **Mobile**: iPhone Safari + Android Chrome full session, including
  AudioContext unlock on first tap, wake lock holding the screen on, and
  `visibilitychange` correctly aborting when the user swipes the tab away.
- **Settings dialog**: boundary inputs (0, 0.001, 60, 60.001, -1, `"abc"`,
  empty). Cancel discards changes. Save applies them.
- **Partial export**: after 7 trials, trigger export → confirm τ is
  computed against actual counts, not 5 → confirm the partial-export confirm
  dialog appears.
- **Interval cap**: use an interval 5 times → verify its button disables and
  its tooltip explains why.

---

## Open questions for the customer (raise during Phase 1–2)

1. **Source / interpretation of the ×8.5 cycle factor** — where does it come
   from? (So we can document it and have confidence the output is correct.)
2. **Re-measure history**: the current plan silently replaces the old value
   (keeping only `timestamp`). If an audit trail of previous attempts is
   required for clinical/scientific reasons, we need to keep the replaced
   values and possibly surface them in the Excel export.
3. **Pinch-zoom policy** on mobile: lock via `user-scalable=no` (cleaner
   during measurement) or allow (better accessibility)?
4. **PWA / home-screen install**: desired, or overkill for v1?
