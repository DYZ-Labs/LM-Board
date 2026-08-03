# LM Board

[![CI](https://github.com/DYZ-Labs/LM-Board/actions/workflows/ci.yml/badge.svg)](https://github.com/DYZ-Labs/LM-Board/actions/workflows/ci.yml)
[![Model discovery](https://github.com/DYZ-Labs/LM-Board/actions/workflows/discover-models.yml/badge.svg)](https://github.com/DYZ-Labs/LM-Board/actions/workflows/discover-models.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-111827.svg)](./LICENSE)

**A source-linked benchmark leaderboard for frontier language models.**

[Open the leaderboard](https://www.checklmboard.xyz) ·
[Read the methodology](https://www.checklmboard.xyz/methodology) ·
[Compare models](https://www.checklmboard.xyz/compare)

[![LM Board — frontier models ranked on cited benchmark scores](https://www.checklmboard.xyz/og/home.png)](https://www.checklmboard.xyz)

LM Board curates published evaluation results; it does not run benchmarks.
Every displayed score is connected to its publisher, retrieval date, provenance,
and available evaluation settings. LM Board turns that evidence into a
transparent, coverage-gated Index.

> **Current snapshot:** 62 models, 8 benchmarks, and 456 source-linked scores.

## What LM Board provides

- **Evidence first.** Open any score to inspect its source and reporting details.
- **Transparent ranking.** Overall and category-specific ranks are derived from
  the same documented Index.
- **Honest gaps.** Missing measurements are omitted, never entered as zero or
  guessed.
- **Useful research views.** Sort every column, filter by provider or weights,
  search models, switch projections, compare up to four models, and share the
  resulting URL.
- **Citable records.** Every model has a stable `/model/<id>` page, and the
  static export includes a sitemap, `llms.txt`, and generated Open Graph cards.

## How the Index works

1. Only percentage benchmarks enter the Index; their 0–100 scores are averaged
   directly.
2. A model must have measured results for at least 60% of the suite to receive
   an Index.
3. Above that coverage gate, remaining gaps are estimated from the model's
   measured percentile standing and clearly disclosed. Below it, no gaps are
   filled.
4. Benchmarks receive equal weight, and identical Index values share a rank.

The full calculation, coverage rules, and source policy are documented on the
[methodology page](https://www.checklmboard.xyz/methodology).

## Run locally

```bash
git clone https://github.com/DYZ-Labs/LM-Board.git
cd LM-Board
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The project requires
Node.js 22, as declared in `.nvmrc`.

The example environment file documents three settings:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical public URL used by production metadata |
| `NEXT_PUBLIC_GITHUB_REPOSITORY_URL` | Repository URL used by correction and GitHub links |
| `AA_API_KEY` | Artificial Analysis API key; only needed for model discovery |

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js development server |
| `npm run validate:data` | Validate schemas, references, score ranges, and discovery-ledger consistency |
| `npm test` | Run library, UI, accessibility, and discovery tests |
| `npm run build` | Validate data and create the static production build |
| `npm run check` | Run the complete CI and deployment gate |
| `npm run discover:models` | Preview unseen upstream models without writing files |
| `npm run monitor:production -- --base-url <url>` | Run the production health probe |

`npm run check` covers linting, type checking, tests, data validation, the
production build, transfer and payload budgets, and content smoke checks.
Production builds require a public site URL so exported metadata can never
silently point to localhost. [AGENTS.md](./AGENTS.md) documents the full
command set — including running a single test file — plus layout, conventions,
and gotchas for working in this repo.

## Data

| File | Contents |
| --- | --- |
| `data/models.json` | Model identity, release metadata, context, pricing, and official URL |
| `data/benchmarks.json` | Benchmark metadata, category, unit, and canonical source |
| `data/scores.json` | One sourced score per model and benchmark pair |
| `data/upstream-seen.json` | Ledger of every upstream model ID already reviewed |

The schemas live in `src/lib/schema.ts`. Validation rejects malformed records,
duplicate IDs, dangling references, duplicate model/benchmark pairs, invalid
percentage values, and inconsistent discovery-ledger entries. Pricing records
the current uncached base or short-context provider rate when one is available;
the linked official model source remains authoritative.

## Automated discovery

[Run or inspect model discovery](https://github.com/DYZ-Labs/LM-Board/actions/workflows/discover-models.yml) ·
[View open discovery pull requests](https://github.com/DYZ-Labs/LM-Board/pulls?q=is%3Apr+is%3Aopen+label%3Aaa-discovery)

The **Discover upstream models** workflow runs every Monday at 06:17 UTC and
can also be started manually. It checks the
[Artificial Analysis](https://artificialanalysis.ai/) API for upstream model
IDs the repository has not seen before.

Discovery is deliberately conservative:

- It scaffolds only models from providers already tracked by LM Board.
- It never fetches or adds benchmark scores.
- It records every reviewed upstream ID so ignored models do not reappear.
- It opens a draft curation pull request instead of changing `main`.
- A placeholder Artificial Analysis model URL intentionally keeps validation
  red until a reviewer replaces it with an official vendor source.

### Where to check whether a run found an update

1. Open the
   [workflow page](https://github.com/DYZ-Labs/LM-Board/actions/workflows/discover-models.yml)
   and select the newest run.
2. Open the **discover** job.
3. Expand **Discover new upstream models** and interpret the result:

| Result | Meaning | Where to look next |
| --- | --- | --- |
| `No new upstream models.` | The ledger is current; nothing was published | No pull request is created |
| New upstream IDs are reported | The `publish` job creates a curation branch | Open the new draft PR labeled `aa-discovery` |
| The `guard` job says a discovery PR is already open | The run was intentionally skipped | Review the existing `aa-discovery` PR |
| The run fails | Discovery, validation, or publishing failed | Open the linked issue labeled `aa-discovery` and `bug` |

When an update exists, the pull request contains changes to
`data/models.json`, `data/upstream-seen.json`, or both. Reviewers verify model
metadata against official vendor sources and curate scores manually by
following [CONTRIBUTING.md](./CONTRIBUTING.md).

<details>
<summary>One-time repository setup</summary>

1. Create a free Artificial Analysis API key.
2. Add it locally as `AA_API_KEY`, then seed and review the ledger with
   `npm run discover:models -- --seed --write`.
3. Add `AA_API_KEY` as a repository secret.
4. In **Settings → Actions → General → Workflow permissions**, enable
   **Allow GitHub Actions to create and approve pull requests**.
5. Create the `aa-discovery`, `bug`, `needs-curation`, and `do-not-merge`
   labels.

The workflow keeps installation, discovery, and validation read-only. Only
bounded, append-only data files cross into a fresh publishing runner, where a
short-lived workflow token creates the branch and pull request.

</details>

GitHub disables scheduled workflows after 60 days without repository activity.
A manual dispatch re-enables the schedule.

## Architecture

- Next.js 15 App Router, TypeScript, React, and Zod
- Build-time data assembly and a static production export
- Vitest projects for ranking logic, data, UI behavior, accessibility, and
  discovery
- Generated metadata, structured data, social cards, manifest, sitemap, and
  `llms.txt`
- Vercel deployment with strict response headers

## Operations

- **Rollback:** If the site is down or a deploy is bad, open the LM Board
  project in the Vercel dashboard, go to **Deployments**, select the previous
  known-good deployment, and choose **Promote**. If a data commit caused the
  problem, `git revert <commit>` on a new branch, open and merge the resulting
  pull request, and let Vercel deploy it.
- **Monitoring and alerts:**
  [`monitor-production.yml`](https://github.com/DYZ-Labs/LM-Board/actions/workflows/monitor-production.yml)
  probes `/`, `/compare`, and a deterministic model record every 15 minutes,
  verifying status, content type, content sentinels, redirect origin, response
  size, and security headers with bounded requests. Failures open or update one
  `bug` issue assigned to `@thedanielyuan`; a healthy run closes the incident.
  Run the same probe manually with
  `npm run monitor:production -- --base-url https://www.checklmboard.xyz`.
- **Discovery credential:** Discovery needs only `AA_API_KEY`; repository writes
  use the short-lived workflow token on a separate publishing runner, and
  checkout never persists credentials.
- **Access:** Daniel Yuan (GitHub `@thedanielyuan`) is the primary documented
  operator. Repository and Vercel owners must keep at least one second operator
  able to merge, inspect deployments, and promote a rollback; access ownership
  must be verified in those services because it cannot be proven from this
  repository.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before changing models, benchmarks, or
scores. It defines source requirements, curation rules, discovery-PR review,
reasoning-effort consistency, and the required checks.

Additional project documentation:

- [AGENTS.md](./AGENTS.md) — commands, layout, conventions, and gotchas for
  working in this repo (written for coding agents, useful to humans)
- [Decision log and product specification](./PLAN.md)
- [Visual design specification](./REDESIGN_PLAN.md)
- [Production-readiness review](./PRODUCTION_READINESS.md)
- [Security policy](./SECURITY.md)

## License

The application source is available under the [MIT License](./LICENSE).
LM Board contributors license their original selection, arrangement, and
annotations in `data/` under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as described in
[data/LICENSE](./data/LICENSE). Third-party benchmark measurements are excluded
from that data license and remain subject to their publishers' terms.
