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

The build produces a plain static `dist/` directory. ExcelJS is lazy-imported
from `src/excel/exportWorkbook.ts`, so it ships as a separate async chunk and
stays out of the initial page load.

## Deployment

The app is a fully-static SPA. Any static host works. The examples below
assume a production build has been produced with `npm run build`.

### Vercel

1. Import the repository from the Vercel dashboard, or run `npx vercel`
   locally.
2. Framework preset: **Vite**.
3. Build command: `npm run build`. Output directory: `dist`.
4. No environment variables are required.

### Netlify

1. Import the repository from the Netlify dashboard, or run
   `npx netlify deploy --prod`.
2. Build command: `npm run build`. Publish directory: `dist`.
3. If deploying via `netlify.toml`, the minimal configuration is:
   ```toml
   [build]
     command = "npm run build"
     publish = "dist"
   ```

### GitHub Pages

1. If serving from a project page (e.g. `https://user.github.io/cronometer-web/`),
   set Vite's base path by running
   `npm run build -- --base=/cronometer-web/`.
   Serving from a user/organisation page or a custom domain keeps the default
   `/` base.
2. Publish the contents of `dist/` to the `gh-pages` branch. The
   [`gh-pages`](https://www.npmjs.com/package/gh-pages) package works:
   ```bash
   npx gh-pages -d dist
   ```
3. In the repository's **Settings → Pages**, choose the `gh-pages` branch as
   the source.

### Any other static host

Copy `dist/` to the host (S3 + CloudFront, nginx, Caddy, Cloudflare Pages,
etc.). No server-side code or rewrite rules are required — the app has a
single entry point (`index.html`) and does not use client-side routing.

## Layout

```
src/
  state/        Session model, stats, state hook  (Phase 1 / 3)
  audio/        Web Audio scheduler + unlock      (Phase 2)
  timing/       performance.now() Stopwatch       (Phase 3)
  components/   UI                                 (Phase 3 / 4 / 7)
  excel/        ExcelJS export (lazy-loaded)      (Phase 5)
  platform/     Browser-platform hooks            (Phase 6)
  utils/        ordinals, age string, filename    (Phase 1)
  i18n/         Russian strings                    (seeded in Phase 0)
  styles/       Global CSS + CSS modules
tests/          Vitest setup + unit tests
reference/      Original Python app (read-only)
```

## Debug harness

Append `?debug=1` to the URL to log per-beep telemetry
(`{ expected, measuredGap, driftMs }`) to the console. Used during the
timing-matrix QA passes described in the plan.
