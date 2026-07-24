# LM Board

LM Board is a static, curated leaderboard for frontier language-model benchmark scores. Every published score is stored with its source, retrieval date, reporting provenance, and evaluation settings when applicable.

This repository implements the MVP described in [PLAN.md](./PLAN.md): a Next.js 15 App Router project, shared Zod data schemas, live-sourced seed data, build-time integrity validation, a polished interactive leaderboard, and a dependency-free static export.

The leaderboard computes a transparent coverage-gated Index for Overall and each benchmark category, with canonical ranks precomputed per scope. It supports sorting every column, switches benchmark columns and scoped ranking by category, combines provider/search/open-weight filters, and exposes an inline source panel for every model and score. Category, sort, direction, and expanded-model state are reflected in the URL so a specific view can be shared directly.

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
npm run validate:data
npm run typecheck
npm run build
```

`npm run build` validates all records and cross-file references before Next.js creates a static export in `out/`. Validation fails on malformed records, duplicate IDs, dangling score references, duplicate model/benchmark score pairs, or percent values outside `0–100`.

The export includes complete social/search metadata, a generated Open Graph image, favicon, web manifest, robots rules, and sitemap. `vercel.json` configures Vercel to use `.next/` as its deployment output directory.

## Data layout

- `data/models.json` — model identity, release metadata, context, pricing, and official URL
- `data/benchmarks.json` — benchmark metadata and canonical sources
- `data/scores.json` — one sourced score per model/benchmark pair

The TypeScript source of truth for all three formats is `src/lib/schema.ts`. Missing scores are omitted; they are never guessed or represented with placeholder values.

## Automated discovery

A scheduled workflow (`.github/workflows/discover-models.yml`, Mondays 06:17 UTC or manual dispatch) checks the free [Artificial Analysis](https://artificialanalysis.ai/) API for models the leaderboard has never seen. New models from already-tracked providers are scaffolded into `data/models.json` and opened as a draft curation pull request; model metadata in those pull requests is discovered via the Artificial Analysis API. Benchmark scores are never fetched or auto-added — they remain manually curated per [CONTRIBUTING.md](./CONTRIBUTING.md).

Every upstream model id ever seen is recorded in `data/upstream-seen.json`, so dismissed models do not resurface. A scaffold's `url` intentionally points at its Artificial Analysis page; validation rejects that host until a reviewer replaces it with the official vendor announcement, keeping CI red on unfinished curation. `npm run discover:models` runs the same discovery locally (dry-run by default; `--help` for options).

One-time setup:

1. Create a free Artificial Analysis API key and add it to `.env.local` as `AA_API_KEY`.
2. Seed the ledger: `npm run discover:models -- --seed --write`, review the report, and commit `data/upstream-seen.json`.
3. Add repository secrets `AA_API_KEY` and `DISCOVERY_PAT` — a fine-grained personal access token scoped to this repository with Contents and Pull requests read/write. The default workflow token cannot be used because pull requests it creates would not trigger CI. Note the PAT expiry and rotate it before it lapses.
4. Create the labels `aa-discovery`, `needs-curation`, and `do-not-merge`.

GitHub disables scheduled workflows after 60 days without repository activity; a manual dispatch re-enables the schedule.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the source requirements, data-file workflow, reasoning-effort consistency rule, and required validation commands.

## Seed snapshot

The current snapshot contains 61 models, 8 benchmarks, and 449 scores. The original 2026-07-17 seed, the subsequent model refresh, the 2025 back-catalog addition, and the 2026 catch-up batch are documented in the decision log in `PLAN.md`.

Where present, pricing is the current uncached base or short-context API rate in USD per million tokens. Provider pricing may be tiered by context length or promotional period, so the linked official model source remains authoritative.
