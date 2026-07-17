# LM Board

LM Board is a static, curated leaderboard for frontier language-model benchmark scores. Every published score is stored with its source, retrieval date, reporting provenance, and evaluation settings when applicable.

This repository implements Milestones 1 through 3 from [PLAN.md](./PLAN.md): a Next.js 15 App Router project, shared Zod data schemas, live-sourced seed data, build-time integrity validation, and the polished interactive leaderboard.

The leaderboard computes a transparent coverage-gated Index, supports sorting every column, switches benchmark columns by category, combines provider/search/open-weight filters, and exposes an inline source panel for every model and score. Score bars, canonical best markers, benchmark disclosures, sticky table context, responsive layouts, persisted light/dark themes, and the methodology section complete the M3 experience.

## Requirements

- Node.js 22 (see `.nvmrc`)
- npm

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The site follows the operating-system color preference until a visitor chooses a theme. That explicit choice is stored locally and takes precedence on later visits.

To show the project and corrections links once a GitHub repository exists, provide its full URL at build time:

```bash
NEXT_PUBLIC_GITHUB_REPOSITORY_URL=https://github.com/owner/lmboard npm run build
```

## Validation and builds

```bash
npm run validate:data
npm run typecheck
npm run build
```

`npm run build` validates all records and cross-file references before Next.js creates a static export in `out/`. Validation fails on malformed records, duplicate IDs, dangling score references, duplicate model/benchmark score pairs, or percent values outside `0–100`.

## Data layout

- `data/models.json` — model identity, release metadata, context, pricing, and official URL
- `data/benchmarks.json` — benchmark metadata and canonical sources
- `data/scores.json` — one sourced score per model/benchmark pair

The TypeScript source of truth for all three formats is `src/lib/schema.ts`. Missing scores are omitted; they are never guessed or represented with placeholder values.

## Seed snapshot

The 2026-07-17 seed contains 15 models, 8 benchmarks, and 117 scores independently measured by Artificial Analysis. The suite uses current replacements for benchmarks that have since been retired or superseded; the selection rationale is recorded in `PLAN.md`.

Where present, pricing is the current uncached base or short-context API rate in USD per million tokens. Provider pricing may be tiered by context length or promotional period, so the linked official model source remains authoritative.
