# LM Board

LM Board is a static, curated leaderboard for frontier language-model benchmark scores. Every published score is stored with its source, retrieval date, reporting provenance, and evaluation settings when applicable.

This repository implements the MVP described in [PLAN.md](./PLAN.md): a Next.js 15 App Router project, shared Zod data schemas, live-sourced seed data, build-time integrity validation, a polished interactive leaderboard, and a dependency-free static export.

The leaderboard computes a transparent coverage-gated Index, supports sorting every column, switches benchmark columns by category, combines provider/search/open-weight filters, and exposes an inline source panel for every model and score. Category, sort, direction, and expanded-model state are reflected in the URL so a specific view can be shared directly.

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

The export includes complete social/search metadata, a generated Open Graph image, favicon, web manifest, robots rules, and sitemap. `vercel.json` configures Vercel to publish `out/`.

## Data layout

- `data/models.json` — model identity, release metadata, context, pricing, and official URL
- `data/benchmarks.json` — benchmark metadata and canonical sources
- `data/scores.json` — one sourced score per model/benchmark pair

The TypeScript source of truth for all three formats is `src/lib/schema.ts`. Missing scores are omitted; they are never guessed or represented with placeholder values.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the source requirements, data-file workflow, reasoning-effort consistency rule, and required validation commands.

## Seed snapshot

The current snapshot contains 17 models, 8 benchmarks, and 132 scores. The original 2026-07-17 seed and subsequent model refresh are documented in the decision log in `PLAN.md`.

Where present, pricing is the current uncached base or short-context API rate in USD per million tokens. Provider pricing may be tiered by context length or promotional period, so the linked official model source remains authoritative.
