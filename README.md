# LM Board

A static, hand-curated leaderboard of frontier language-model benchmark scores where every score links to the measurement it came from.

**Live at [www.checklmboard.xyz](https://www.checklmboard.xyz).**

LM Board does not run evals — it curates published ones. Every score is stored with its source URL, retrieval date, reporting provenance (vendor-published vs. third-party), and evaluation settings when the source provides them. Missing measurements stay missing; they are never stored as zero or padded with placeholders. Index-only estimates are derived from measured percentile standing, documented in the methodology, and never become score records. Build-time validation fails on malformed records, duplicate IDs, dangling score references, duplicate model/benchmark pairs, or out-of-range values, so invalid data cannot ship.

## What the board does

The leaderboard computes a transparent, coverage-gated Overall Index and complete category Indexes, with canonical ranks precomputed per scope. Overall requires 60% measured coverage; broadly measured models may use percentile estimates to fill complete category gaps. Every column sorts; benchmark columns and scoped ranking switch by category; provider, search, and weight filters combine; and an inline source panel backs every measured score. Category, sort, direction, projection, filters, and expanded-model state are reflected in the URL, so a specific view can be shared directly.

The board renders in three explicit projections — `table` (every benchmark column), `profile` (compact, with a per-model score spark), and `plot` (price against Index). The server always renders the full table, CSS turns that same markup into ranked cards on phones, and viewport size never changes the selected projection or URL after hydration. Every model has a citable record at `/model/<id>`, and `/compare` puts up to four models side by side.

The static export ships complete social/search metadata: generated site and per-model Open Graph cards, favicons, a web manifest, robots rules, a sitemap, and `llms.txt`. A static `palette.json` powers the deferred command palette.

## Requirements

- Node.js 22 (see `.nvmrc`)
- npm

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The site follows the operating-system color preference until a visitor chooses a theme. That explicit choice is stored locally and takes precedence on later visits.

Set the public site and repository URLs in `.env.local` for production-like metadata and working GitHub/corrections links:

```bash
NEXT_PUBLIC_SITE_URL=https://your-site.example
NEXT_PUBLIC_GITHUB_REPOSITORY_URL=https://github.com/owner/lmboard
```

## Validation and builds

```bash
npm run check
```

`npm run check` is the exact CI and deployment gate: lint, type checking, tests, data validation, the static production build, transfer/payload budgets, and content smoke checks. The individual `lint`, `typecheck`, `test`, `validate:data`, `build`, and `measure` scripts remain available for focused work — [AGENTS.md](./AGENTS.md) documents each one. Production builds intentionally require a non-localhost `NEXT_PUBLIC_SITE_URL` (or a Vercel deployment URL) so a public export can never emit localhost canonicals.

`npm run build` validates all records and cross-file references before Next.js creates a static export in `out/`. `vercel.json` configures Vercel to run the same `npm run check` and to use `.next/` as its deployment output directory.

The project is on Next.js 16. Production builds use its supported `--webpack`
opt-out because the default Turbopack output does not fit the unchanged
homepage raw-JavaScript budget; local development can use Turbopack normally.

The byte gate measures static HTML, Flight, directly linked CSS/executable JS, fonts, DOM size, and request count against the budgets in `REDESIGN_PLAN.md`. It understands both Next 15/Webpack and Next 16/Turbopack asset layouts and excludes only `nomodule` fallbacks that Next 16's supported browsers do not fetch. Deferred interaction chunks are intentionally loaded on demand, so release review also runs Lighthouse against `out/` and exercises the command palette, plot, filters, compare, and a model record in a real browser.

`npm test` runs two Vitest projects: `lib` (index math, sort comparators, URL parsing, data assembly, palette contrast, discovery core — Node environment) and `ui` (component behaviour and an axe-core accessibility pass — jsdom). The contrast suite parses `src/styles/tokens.css` directly, so editing a colour token is checked against WCAG rather than against a stale copy of the palette.

## Data

- `data/models.json` — model identity, release metadata, context, pricing, and official URL
- `data/benchmarks.json` — benchmark metadata and canonical sources
- `data/scores.json` — one sourced score per model/benchmark pair
- `data/upstream-seen.json` — append-only ledger of every upstream model id discovery has ever seen

The TypeScript source of truth for all formats is `src/lib/schema.ts`. Missing scores are omitted; they are never guessed or represented with placeholder values.

Where present, pricing is the current uncached base or short-context API rate in USD per million tokens. Every listed price carries a first-party pricing URL and the date it was checked; `npm run pricing:audit` flags checks older than 30 days. Provider pricing may be tiered by context length or promotional period, so the linked official pricing documentation remains authoritative.

## Automated discovery

A scheduled workflow (`.github/workflows/discover-models.yml`, Mondays 06:17 UTC or manual dispatch) checks the free [Artificial Analysis](https://artificialanalysis.ai/) API for models the leaderboard has never seen. New models from already-tracked providers are scaffolded into `data/models.json` and opened as a draft curation pull request; model metadata in those pull requests is discovered via the Artificial Analysis API. Benchmark scores are never fetched or auto-added — they remain manually curated per [CONTRIBUTING.md](./CONTRIBUTING.md).

Every upstream model id ever seen is recorded in `data/upstream-seen.json`, so dismissed models do not resurface. A scaffold's `url` intentionally points at its Artificial Analysis page; validation rejects that host until a reviewer replaces it with the official vendor announcement, keeping CI red on unfinished curation. `npm run discover:models` runs the same discovery locally (dry-run by default; `--help` for options).

One-time setup:

1. Create a free Artificial Analysis API key and add it to `.env.local` as `AA_API_KEY`.
2. Seed the ledger: `npm run discover:models -- --seed --write`, review the report, and commit `data/upstream-seen.json`.
3. Add the repository secret `AA_API_KEY`. Publishing uses the workflow-scoped
   `GITHUB_TOKEN`. Install, discovery, and validation run in a read-only job;
   only bounded, append-only data files cross into a fresh publishing runner.
   The write token is exposed only to that runner's final branch/PR step, which
   explicitly dispatches CI for the discovery commit.
4. In **Settings → Actions → General → Workflow permissions**, enable
   **Allow GitHub Actions to create and approve pull requests**. Organization
   policy must also permit the workflow's requested Actions, Contents, and Pull
   requests write permissions.
5. Create the labels `aa-discovery`, `bug`, `needs-curation`, and
   `do-not-merge`.

GitHub disables scheduled workflows after 60 days without repository activity; a manual dispatch re-enables the schedule.

## Operations

- **Rollback:** If the site is down or a deploy is bad, open the LM Board project in the Vercel dashboard, go to **Deployments**, select the previous known-good deployment, and choose **Promote**. If a data commit caused the problem, `git revert <commit>` on a new branch, open and merge the resulting pull request, and let Vercel deploy it.
- **Monitoring and alerts:** `.github/workflows/monitor-production.yml` checks
  `/`, `/compare`, and a deterministic model record every 15 minutes. It
  verifies status, content type, content sentinels, redirect origin, response
  size, and security headers with bounded requests. Failures open or update one
  `bug` issue assigned to `@thedanielyuan`; a healthy run closes the incident.
  Run the same probe manually with
  `npm run monitor:production -- --base-url https://www.checklmboard.xyz`.
- **Pricing freshness:** `.github/workflows/audit-pricing.yml` runs weekly and
  maintains one issue when a first-party price check is more than 30 days old.
  Run it locally with `npm run pricing:audit`.
- **Discovery credential:** Discovery needs only `AA_API_KEY`; repository writes
  use the short-lived workflow token on a separate publishing runner, and
  checkout never persists credentials.
- **Access:** Daniel Yuan (GitHub `@thedanielyuan`) is the primary documented
  operator. Repository and Vercel owners must keep at least one second operator
  able to merge, inspect deployments, and promote a rollback; access ownership
  must be verified in those services because it cannot be proven from this
  repository.

## Development and contributing

- [AGENTS.md](./AGENTS.md) — commands, layout, conventions, and gotchas for working in this repo (written for coding agents, useful to humans).
- [CONTRIBUTING.md](./CONTRIBUTING.md) — source requirements, data-file workflow, reasoning-effort consistency rule, and required validation commands.
- [PLAN.md](./PLAN.md) — product spec and the decision log; data and benchmark changes add entries here.
- [REDESIGN_PLAN.md](./REDESIGN_PLAN.md) — the "Observatory" visual system and performance budgets, implemented as cascade layers in `src/styles/`.
- [SECURITY.md](./SECURITY.md) — how to report a vulnerability privately.

## Seed snapshot

The current snapshot contains 63 models, 8 benchmarks, and 463 scores. The original 2026-07-17 seed, the subsequent model refresh, the 2025 back-catalog addition, the 2026 catch-up batch, and the curated discovery pull requests are documented in the decision log in `PLAN.md`.

## License

Code is licensed under the [MIT License](./LICENSE). The dataset's original selection, arrangement, and annotations are licensed under [CC BY 4.0](./data/LICENSE); that license does not cover third-party material — in particular, benchmark measurements attributed to Artificial Analysis remain subject to their own terms, and each record identifies its source.
