# AGENTS.md

LM Board is a static, hand-curated leaderboard of frontier language-model benchmark
scores, live at https://www.checklmboard.xyz. Next.js 16 App Router, strict
TypeScript, Zod 4, plain CSS; `output: "export"` produces a pure static site in
`out/` — no backend, no database. The thesis: we don't run evals, we curate
published ones, and every score carries a source URL and retrieval date.

## Setup

```bash
# Node 22 (.nvmrc / engines). npm — the lockfile is package-lock.json.
npm install
cp .env.example .env.local
```

`npm run dev` and `npm test` work with the example env as-is. Production builds
refuse a localhost `NEXT_PUBLIC_SITE_URL` (`src/lib/site.ts` throws), so before
`npm run build` or `npm run check`, set in `.env.local`:

```bash
NEXT_PUBLIC_SITE_URL=https://www.checklmboard.xyz
```

## Commands

```bash
npm run dev                            # dev server on http://localhost:3000
npm test                               # full Vitest suite (~370 tests, ~20 s)
npm test -- src/lib/urlState.test.ts   # one test file (<1 s) — use while iterating
npm run lint                           # ESLint, zero warnings allowed
npm run typecheck                      # tsc --noEmit
npm run validate:data                  # Zod + cross-file integrity on data/*.json
npm run pricing:audit                  # fail on future or >30-day-old listed prices
npm run extract:candidates -- --url <url> --source <slug> --publisher <id>
npm run review:candidates -- --resume  # human acceptance/rejection, persisted per decision
npm run promote:candidates -- --source <slug>  # dry-run accepted candidates
npm run build                          # validate:data + static export to out/
npm run measure -- --check             # payload budgets; reads out/, so build first
npm run check                          # full gate: lint, typecheck, test, build, budgets
```

`npm run check` is the exact command CI (`.github/workflows/ci.yml`) and Vercel
(`vercel.json` buildCommand) run. Green `check` locally means green CI.
Production builds intentionally pass Next 16's `--webpack` opt-out: its default
Turbopack output exceeds the unchanged homepage raw-JS budget. Development may
still use the default Turbopack compiler.

Vitest has two projects: `lib` (Node env — `src/lib/**/*.test.ts` and
`scripts/**/*.test.ts`) and `ui` (jsdom — `src/components/**/*.test.tsx`, setup
in `vitest.setup.ts`).

Occasional:

```bash
npm run og -- --only <model-id>    # one OG card (`home`, `compare`, etc. also work)
npm run og:verify                  # pixel checks on the generated cards
npm run icons                      # rebuild derived icons from committed source PNGs
npm run discover:models -- --help  # AA discovery CLI; dry-run by default, needs AA_API_KEY
npm run monitor:production -- --base-url https://www.checklmboard.xyz
```

## Layout

- `data/` — the dataset: `models.json`, `benchmarks.json`, `publishers.json`,
  `measurements.json`, source-page staging in `candidates/`, and the discovery
  ledger `upstream-seen.json`. Licensed CC BY 4.0 (`data/LICENSE`).
- `src/lib/` — all logic, tests colocated. `schema.ts` is the Zod source of truth
  for the data files (types inferred from it). `index.ts` is the ranking/Index
  math, not a barrel export.
- `src/components/` — React components, colocated `*.test.tsx`.
- `src/app/` — routes: `/`, `/model/[id]`, `/compare`, `/methodology`, plus
  `llms.txt`, `palette.json`, sitemap, robots, manifest.
- `src/styles/` — hand-authored CSS cascade layers; design tokens in `tokens.css`.
- `scripts/` — tsx CLIs: data validation, OG cards, icons, payload budgets,
  discovery, production monitor. Tests colocated.
- `.github/workflows/` — `ci.yml`; `discover-models.yml` (weekly, opens scaffold
  PRs); `audit-pricing.yml` (weekly freshness issue); `monitor-production.yml`
  (probes prod every 15 min, files issues).

## Data rules

- Schemas are `.strict()` — unknown keys fail validation. IDs are kebab-case
  slugs; dates are `YYYY-MM-DD`.
- Every measurement needs `publisherId`, `source.url`, and `source.retrieved`.
  Record the named eval scaffold in `harness`, using `"undisclosed"` when the
  source does not identify one. Missing measurements are omitted — never zero,
  never a placeholder.
- Measurements are unique by `(modelId, benchmarkId, publisherId)`. Canonical
  scores resolve as `independent`, `benchmark-author`, `competitor-reported`,
  then `self-reported`, followed by newest retrieval and ascending publisher id.
  Conflicting measurements remain as alternates; never average or drop publisher
  disagreement.
- Vendor provenance is derived, not stored: a vendor measuring its own
  `vendorForLab` is self-reported, while the same vendor measuring another lab is
  competitor-reported. Every measurement source must match one of its publisher's
  exact `sourceHosts` entries; entries containing a path pin that host to a full
  path-segment prefix, including vendor-controlled Hugging Face namespaces.
- Vendor-page extraction writes only pending records in `data/candidates/`.
  Every candidate needs a verbatim page quote and printed benchmark/header
  evidence. Review with `npm run review:candidates`; promote only a fully
  reviewed source with `npm run promote:candidates -- --source <slug> --write`.
  Never hand-edit `data/measurements.json`.
- Permanent evidence is ratcheted per publisher: once one of a publisher's
  measurements carries a source quote, all of that publisher's measurements
  must carry one. Publishers with no evidence-backed records remain valid as
  disclosed legacy sources.
- Every printed benchmark name must pass `mapPrintedBenchmark`. Reject and
  ambiguous results remain in the source's `.skipped.json`; do not override a
  conservative mapping by changing only the candidate's `benchmarkId`.
- Every optional price needs first-party `source.url` and `source.retrieved`.
  Validation rejects Artificial Analysis pricing URLs; the weekly audit flags
  prices older than 30 days without removing them.
- `reasoningEffort` must be identical across a model's canonical scores, or
  absent from all of them. Alternates may legitimately use different efforts.
- `model.url` must be the official vendor announcement or model card. Validation
  rejects `artificialanalysis.ai` URLs (the discovery scaffold placeholder);
  that is what keeps CI red on uncurated discovery PRs.
- `data/upstream-seen.json` is append-only. To reject a scaffolded model, delete
  its `models.json` entry and flip its ledger row to `"ignored"` (removing
  `modelId`). Never delete ledger rows.
- Data changes also update the README snapshot counts and add a decision-log
  entry in `PLAN.md` (see CONTRIBUTING.md).

## Conventions

- No new runtime dependencies — a load-bearing PLAN.md decision. Sorting, charts,
  and state are hand-rolled; only `next`, `react`, `react-dom`, `zod`, and
  `@vercel/analytics` ship.
- Styling is cascade-layer CSS in `src/styles/`, not CSS modules or CSS-in-JS.
  Color edits in `tokens.css` are WCAG-checked by `src/lib/contrast.test.ts`,
  which parses that file directly.
- Comments state rationale — why this, why not the obvious alternative — not
  mechanics. Match that.
- Accessibility is tested: `src/components/a11y.test.tsx` runs axe-core, and
  component tests assert aria labels. Treat aria text as load-bearing.
- Imports use the `@/*` → `src/*` alias.
- Commits: `type: summary`, lowercase — `feat:`, `fix:`, `data:`, `docs:`,
  `chore:`, `refactor:`.

## Gotchas

- `public/og/` is generated output (gitignored), rebuilt by the `prebuild` hook —
  never hand-edit it. The icons directly in `public/` *are* committed:
  `favicon-32.png`, `icon-64.png`, `icon-192.png`, and `icon-512.png` are
  supplied source art, and `npm run icons` derives `favicon.ico`,
  `apple-touch-icon.png`, and `icon-maskable-512.png` from them — regenerate the
  derived three, never hand-edit them.
- jsdom is forced to 1440 px wide in `vitest.setup.ts` so the board hydrates into
  the desktop table projection; tests for narrow-viewport behavior set
  `window.innerWidth` themselves.
- UI tests intentionally render the full production board (62 models × 8
  benchmarks); the `ui` project has a 15 s timeout. Don't "fix" slow tests by
  shrinking fixtures.
- `npm run measure` reads whatever is in `out/` — build first or the numbers are
  stale.
- `PLAN.md` (product spec + decision log) and `REDESIGN_PLAN.md` (visual system
  and performance budgets) are binding. Changing a decision recorded there takes
  a decision-log entry, not a silent diff.

## Requires human confirmation

- Merging to `main` deploys production via Vercel. Rollback is manual (Vercel
  dashboard → promote a previous deployment).
- `npm run discover:models -- --write` (and `--seed --write`) mutate the ledger;
  discovery normally runs via the scheduled workflow. Dry-run is the default.
- Candidate acceptance is a human source-check. `promote:candidates --write`
  mutates `data/measurements.json` and must run only after every record for that
  source has an explicit review decision.
- Anything involving repo secrets (`AA_API_KEY`), GitHub labels, or workflow
  permission settings.
