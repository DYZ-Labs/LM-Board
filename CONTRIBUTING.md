# Contributing to LM Board

LM Board curates published evaluations; it does not run benchmarks. A contribution is ready to merge only when every new number is traceable, comparable enough to display responsibly, and accepted by the repository validator.

## Before you start

- Use Node.js 22 and npm.
- Create a focused branch from the latest `main`.
- Confirm the source is live and authoritative at the time of the change. Do not enter scores from memory, screenshots without a stable source, or secondary summaries when a canonical result is available.

```bash
npm install
npm run validate:data
```

## Adding or updating a model

1. Add or update the model in `data/models.json`.
2. Use a stable lowercase slug for `id`; existing score records depend on it.
3. Link `url` to the provider's official announcement or model card.
4. Record the public release date, weights status, context window, and base per-million-token pricing when available.
5. Do not invent missing metadata. Optional fields should remain absent when they cannot be verified.

## Adding or updating scores

1. Add one record per model/benchmark pair in `data/scores.json`.
2. Use IDs that already exist in `data/models.json` and `data/benchmarks.json`.
3. Record the measured value, direct source URL, and the date you retrieved it in ISO `YYYY-MM-DD` format.
4. Describe the harness, sample count, tools, pass rate, or other material evaluation settings in `settings` when the source provides them.
5. Set `selfReported` truthfully. Prefer a canonical third-party measurement over a vendor-reported result when both exist.
6. If a run uses a named reasoning effort or budget, set `reasoningEffort`. Every score for the same model must use the same reasoning-effort value, or all of that model's scores must omit it.

Missing results are omitted. Never add a zero or placeholder record to represent missing data.

## Adding a benchmark

Add its metadata to `data/benchmarks.json`, including a concise description, category, unit, and canonical source. Benchmark additions change the Index coverage gate and need an explicit rationale in `PLAN.md`.

## Reviewing a discovery pull request

The scheduled discovery workflow opens pull requests labeled `aa-discovery` containing scaffolded `data/models.json` entries and `data/upstream-seen.json` ledger rows. Curation happens on the pull-request branch:

1. Verify every scaffolded field against the vendor page and replace the placeholder `url` with the official announcement or model card. Validation keeps CI red while any model URL points at artificialanalysis.ai.
2. Curate scores on the branch following the rules above; the workflow never adds scores.
3. To reject a scaffold, delete its `models.json` entry **and** flip its ledger row(s) to `"ignored"`, removing the `modelId`. The validator enforces this consistency, and rejected models never resurface in later runs.
4. Update the README seed-snapshot counts and add a `PLAN.md` decision-log entry before marking the pull request ready.

The ledger records every Artificial Analysis model id ever seen. Do not delete rows to retry a model; flip the status instead.

## Required checks

Run all checks before opening a pull request:

```bash
npm run typecheck
npm run validate:data
npm run build
```

The build must produce a static export in `out/`. If UI behavior changes, check the leaderboard at desktop and narrow widths, in light and dark themes, and with keyboard navigation.

## Pull-request checklist

- [ ] Every score has a direct source URL and retrieval date.
- [ ] Model and benchmark IDs are valid and no pair is duplicated.
- [ ] Evaluation settings and self-reported status are accurate.
- [ ] Reasoning-effort labels are consistent across each affected model.
- [ ] Type checking, data validation, and the static production build pass.
- [ ] The change is focused; unrelated formatting or data churn is excluded.
