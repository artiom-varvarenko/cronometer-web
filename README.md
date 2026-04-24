# cronometer-web

Web port of the τ-test chronometer originally implemented as a Windows-only
Python/Tkinter app (`reference/testtime.py`). The operator runs a subject
through 20 timed-reproduction trials across four reference intervals, and
exports the results to a formatted Excel workbook.

The implementation plan (phases, architecture, Python-to-web behavioral
mapping) lives in `it-doesnt-matter-now-streamed-hare.md` in the repo root.

## Requirements

- Node.js ≥ 20 (tested on 24)
- npm ≥ 10

## Local development

```bash
npm install
npm run dev          # Vite dev server, usually http://localhost:5173
```

## Tests

```bash
npm test             # Vitest, watch mode
npm run test:run     # Vitest, single run (CI)
```

## Lint / format

```bash
npm run lint
npm run format
```

## Production build

```bash
npm run build        # Type-checks, then builds into dist/
npm run preview      # Serves the built output locally
```

The build produces a plain static `dist/` directory. Any static host works
(Vercel, Netlify, GitHub Pages, S3, nginx).

## Layout

```
src/
  state/        Session model, stats, state hook  (Phase 1 / 3)
  audio/        Web Audio scheduler + unlock      (Phase 2)
  timing/       performance.now() Stopwatch       (Phase 3)
  components/   UI                                 (Phase 3 / 4)
  excel/        ExcelJS export (lazy-loaded)      (Phase 5)
  utils/        ordinals, age string, filename    (Phase 1)
  i18n/         Russian strings                    (seeded in Phase 0)
  styles/       Global CSS + CSS modules
tests/          Vitest setup + unit tests
reference/      Original Python app (read-only)
```
