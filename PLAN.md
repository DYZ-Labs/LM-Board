# LM Board — MVP Plan & Design Spec

> **Status:** M1 + M2 + M3 complete; M4 shipping in progress.
> **Audience:** this file is the single source of truth for any agent or contributor implementing the MVP. It is self-contained — no other context is required. Update the milestone checkboxes as work lands.

## 1. Product definition

A fast, trustworthy, single-page leaderboard: ~15–20 frontier language models scored across ~8 published benchmarks, sortable and filterable, with a source citation behind every number.

**Thesis:** we don't run evals, we curate them. The product's value is careful aggregation with provenance, presented in a table that's nicer to read than anyone else's.

## 2. Load-bearing decisions (do not revisit without owner sign-off)

1. **Curated data, not measured data.** Scores come from official model cards, papers, and canonical benchmark leaderboards, hand-entered into JSON. Every score carries a source URL, retrieval date, and eval-settings note. We never run benchmarks ourselves in MVP.
2. **Static site, no backend.** Dataset is tiny (~160 scores, a few KB). Everything prerenders at build time; sorting/filtering is client-side. Updating data = edit JSON → merge → redeploy. No database, no API, no auth.
3. **One page.** Leaderboard + inline expandable row details + methodology section. No routing, no per-model pages in MVP.

## 3. Stack

- **Next.js 15 (App Router) + TypeScript + plain CSS**, built with `output: 'export'` → pure static files (deploy to Vercel/Netlify/GitHub Pages).
- **Zod** for data validation at build time and in CI. A typo'd score or dangling `modelId` must fail the build, never ship.
- **No other runtime dependencies.** No table library (20 rows — hand-roll a sort hook), no chart library (score bars are plain CSS), no state library.

## 4. Data model

Three flat JSON files in `data/`, validated by shared Zod schemas in `src/lib/schema.ts`. TypeScript types are inferred from the Zod schemas (single definition).

```ts
type Model = {
  id: string;                    // slug: "anthropic-claude-opus-4-8"
  name: string;                  // "Claude Opus 4.8"
  lab: string;                   // "Anthropic"
  releaseDate: string;           // ISO date
  openWeights: boolean;
  contextWindow?: number;        // tokens
  pricing?: { input: number; output: number };  // USD per Mtok
  url: string;                   // official announcement / model card
};

type Benchmark = {
  id: string;                    // "gpqa-diamond"
  name: string;                  // "GPQA Diamond"
  category: "reasoning" | "coding" | "math" | "agentic";
  description: string;           // one sentence, shown in header tooltip
  unit: "percent" | "score";     // MVP seed data should prefer percent-scaled benchmarks
  sourceUrl: string;             // the benchmark's canonical home
};

type Score = {
  modelId: string;               // must reference an existing Model.id
  benchmarkId: string;           // must reference an existing Benchmark.id
  value: number;
  source: { url: string; retrieved: string };   // REQUIRED — provenance is the product
  settings?: string;             // e.g. "pass@1, extended thinking", "no tools"
  selfReported: boolean;         // vendor-reported vs third-party measurement
};
```

**Rules:**

- `source` is mandatory on every score. No citation → no score.
- Where a benchmark has a canonical third-party leaderboard (e.g. SWE-bench Verified), prefer that number over the vendor's. `selfReported: true` renders as a small visible marker.
- At most one score per (model, benchmark) pair. If a lab reports multiple configurations, record the flagship configuration and note it in `settings`.
- Missing scores render as a muted "—" and sort to the bottom of that column.
- The site-wide "last updated" stamp is derived from the max `source.retrieved` date (no manual stamp to forget).

**Ranking — the LM Board Index:**

- Plain mean of a model's percent-scaled scores, equal-weighted.
- Computed only for models with **≥60% benchmark coverage**; below that, the row shows "insufficient data" and sits unranked (but still visible and sortable by individual columns).
- Deliberately simple; document the exact formula in the methodology section. Transparency beats cleverness.
- Every column is independently sortable, so nobody is stuck with our index.

## 5. Seed content

Target: ~8 benchmarks across four categories, ~15 models.

- **Current seed benchmarks (curated 2026-07-17):** GPQA Diamond, HLE, AA-LCR, IFBench (reasoning); Terminal-Bench v2.1, SciCode (coding); CritPt (math); τ³-Banking (agentic). The original candidates were updated during live curation as described in the decision log.
- **Model coverage:** current frontier models from OpenAI, Anthropic, Google, Meta, DeepSeek, Alibaba/Qwen, Mistral, xAI — mix of closed and open-weights.

> ⚠️ **Critical instruction for the curating agent:** all numbers, the current model list, and final benchmark picks MUST be curated from live sources (web search → model cards, papers, canonical leaderboards) at curation time. Do NOT fill scores from model memory/training data — scores move monthly and will be stale or wrong. Record the real source URL and retrieval date for every value.

## 6. Page design spec

One page, top to bottom:

1. **Header** — "LM Board" wordmark, tagline ("Curated benchmark scores for frontier language models"), theme toggle, GitHub link.
2. **Controls row** — one row above the table: category tabs (Overall · Reasoning · Coding · Math · Agentic) switching the visible score columns and active scoped Index/rank; provider multi-select; "open weights" toggle; search box.
3. **Leaderboard table** (the product):
   - Columns: rank · model (name + lab + open-weights badge) · Index · visible benchmark columns · price.
   - Sticky header row and sticky model column (row identity survives horizontal scroll on narrow screens).
   - **Score cell:** numeral + a thin **3px rounded-end bar** underneath, filled proportionally on a 0–100 scale.
   - Real `<table>` markup (screen readers get the data model for free).
   - Sorting via real `<button>`s inside header cells with `aria-sort`, a visible active-column indicator, stable tie-break by model name. Inactive indicators reveal on hover/focus. Default sort: Index, descending.
   - Benchmark header tooltips: what it measures, unit/settings, link to source.
   - **Row click → inline detail panel:** all scores with citations and settings, pricing, context window, release date. (This replaces per-model pages.)
4. **Methodology + footer** — how scores are sourced, exact Index formula, self-reported caveat, disclaimer, "corrections welcome" link to GitHub issues.

### Visual system (binding constraints)

Neutral, data-dense, restrained. The table is the hero; chrome recedes.

- **Score bars use ONE sequential blue for every column.** Magnitude is one job → one hue. Per-column different hues (rainbow columns) is a hard anti-pattern — do not do it.
- **Numerals stay in normal text ink**, never colored. Use `font-variant-numeric: tabular-nums` in score columns only. Scores, the Index, and prices render to one decimal; percent units live in benchmark tooltips instead of every cell, and price units live in the Price header.
- **Best-in-column:** bold numeral + a small dot marker. Never color alone.
- **No meaning by color alone anywhere:** numbers are always printed, badges always have text labels, the self-reported marker has a tooltip/label.
- **Dark mode is designed, not inverted.** Both palettes defined as CSS custom properties; swap via `prefers-color-scheme` AND a `data-theme` attribute toggle that must win over the OS setting in both directions.
- Typography: system sans stack (`system-ui, -apple-system, "Segoe UI", sans-serif`). No display/serif faces.
- Interface type uses only `11px`, `12px`, `13px`, `14px`, and `16px`, with an `11px` floor. The hero uses `clamp(2.5rem, 4vw, 4rem)`; page section headings use `28px`.
- Corner radii use only `6px`, `12px`, or `999px` pills.
- Rows ~44px; hairline gridlines; hover wash instead of zebra striping.
- Accessibility: AA contrast for all ink, keyboard-operable sorting, focus-visible states.

**Design tokens (validated palette — use as given):**

| Role | Light | Dark |
|---|---|---|
| Page plane | `#f9f9f7` | `#0d0d0d` |
| Surface (table/cards) | `#fcfcfb` | `#1a1a19` |
| Primary ink | `#0b0b0b` | `#ffffff` |
| Secondary ink | `#52514e` | `#c3c2b7` |
| Hairline gridline | `#e1e0d9` | `#2c2c2a` |
| Accent / bar fill (blue) | `#2a78d6` | `#3987e5` |
| Bar track: use hairline gridline color | | |

If any additional data-color is ever needed, it must be validated for CVD safety and contrast (colorblind-safe, ≥3:1 on its surface or paired with labels) — don't eyeball new colors.

### Responsive

- ≥1024px: full table.
- Narrow: horizontal scroll inside the table container with sticky model column; the page body itself never scrolls horizontally.
- Card layout is a v2 option, not MVP.

## 7. Repo structure

```
lmboard/
  PLAN.md                       # this file
  data/
    models.json
    benchmarks.json
    scores.json
  scripts/
    validate-data.ts            # zod check + referential integrity; run in build & CI
  src/
    lib/                        # schema.ts, data.ts (load+join), index.ts (LM Board Index), useSort.ts
    components/                 # LeaderboardTable, ScoreCell, FilterBar, CategoryTabs,
                                # DetailPanel, Badge, ThemeToggle, Tooltip
    app/                        # layout.tsx, page.tsx, methodology content, og image, favicon
```

## 8. Milestones & tasks

### M1 — Foundation
- [x] Scaffold Next.js 15 + TS, `output: 'export'`, repo hygiene (README, .gitignore, git init)
- [x] Zod schemas + inferred types in `src/lib/schema.ts`
- [x] `scripts/validate-data.ts`: schema check + referential integrity (every score's modelId/benchmarkId exists; no duplicate (model, benchmark) pairs); wire into `npm run build` and CI
- [x] Seed data curated **from live sources** (see §5 warning): `benchmarks.json`, `models.json`, `scores.json`

### M2 — Core table (MVP line: M1+M2 = shippable)
- [x] Data loading + join layer; Index computation with coverage rule
- [x] Leaderboard table: all columns, default sort, column sorting with `aria-sort`
- [x] Category tabs switching visible benchmark columns
- [x] Filters: provider multi-select, open-weights toggle, search
- [x] Expandable row detail panel with per-score citations

### M3 — Polish
- [x] Score bars, best-in-column markers, badges, header tooltips
- [x] Dark mode (tokens above, `data-theme` toggle + `prefers-color-scheme`)
- [x] Sticky header + sticky first column; responsive behavior
- [x] Stat strip; methodology section; footer
- [x] Accessibility pass: keyboard sort, focus states, contrast check, screen-reader sanity check

### M4 — Ship
- [ ] Static export deployed (Vercel default)
- [x] OG image + favicon + metadata
- [x] README + CONTRIBUTING (how to add a model/score via PR; validation must pass)

## 9. Explicitly out of scope (v2 candidates — do not build in MVP)

Arena-style ELO/voting · running our own evals · historical score trends · per-model pages · price-vs-performance scatter plot · public API · admin UI. All layer onto the static architecture later without a rewrite. The scatter plot is the first v2 candidate.

## 10. Risks & mitigations

- **Comparability:** the same benchmark yields different numbers under different harnesses/settings (thinking budgets, tools, pass@k). → per-score `settings`, prefer one canonical source per benchmark, say so in methodology.
- **Staleness:** a month-old leaderboard is dead. → one-file data PRs, per-score `retrieved` dates, derived "last updated" stamp.
- **Vendor bias:** self-reported numbers skew favorable. → `selfReported` marker, prefer third-party sources where they exist.

## 11. Notes for implementing agents

- Data curation is the dominant time cost, not code. Verify every number against its live source.
- Keep dependencies at zero beyond the stack in §3 — resist adding libraries.
- The visual constraints in §6 are binding, not suggestions; when adding any chart/visualization later, follow the same rules (one hue for magnitude, no color-alone meaning, validate any new palette color).
- If a decision isn't covered here, prefer the simplest option consistent with §2 and record it in this file under a "Decision log" section you create.

## 12. Decision log

- **2026-07-17 — Current benchmark suite:** live curation replaced retired or superseded candidates (AIME 2025, MATH-500, Terminal-Bench Hard, and τ² Telecom) with the eight-benchmark suite in §5. CritPt is grouped under Math because its answers are quantitative, symbolic, or executable functions. The initial seed contained 117 independently measured Artificial Analysis results, each retrieved on 2026-07-17 with its evaluation settings and model-specific citation.
- **2026-07-17 — Foundation tooling:** npm with Node.js 22, Tailwind CSS 3.4, a dev-only `tsx` runner, and GitHub Actions were selected. Production runtime dependencies remain limited to Next.js, React, and Zod as required.
- **2026-07-17 — Core table behavior:** category tabs change visible score columns but never change the site-wide Index or canonical rank. Filtering preserves those canonical ranks. Price sorting uses input price, then output price; missing values stay last in either direction. Search covers model name, provider, and model ID, and one inline detail panel is open at a time.
- **2026-07-17 — Polish and accessibility:** best markers are calculated from the full canonical dataset, not the filtered view. The table owns a bounded vertical and horizontal scroll region so its header and model identity can remain sticky reliably. Manual light/dark choices persist and override the OS preference; without a manual choice, the OS preference remains authoritative. Meaningful small text uses secondary ink to maintain AA contrast at small sizes.
- **2026-07-17 — Repository links:** header, footer, and correction links read `NEXT_PUBLIC_GITHUB_REPOSITORY_URL` and render only when a real repository URL is configured. No remote exists yet, so M3 does not fabricate a destination; the URL is expected to be supplied during M4 publishing.
- **2026-07-18 — Stat strip removed:** the stat strip is removed from the page structure.
- **2026-07-18 — Hero confirmed:** the leaderboard table remains the page hero; chrome recedes.
- **2026-07-18 — Typography constraint unchanged:** the system sans stack remains binding, with no display or serif faces.
- **2026-07-18 — Styling toolchain simplified:** Tailwind CSS and the project-level PostCSS/Autoprefixer setup were removed. The site uses plain global CSS through Next.js's built-in CSS pipeline.
- **2026-07-18 — Interface scales consolidated:** typography uses five interface tokens plus one hero and one section-heading treatment; radii use three tokens. Scores, the Index, and prices show one decimal, units move to headers/tooltips, and only the active sort arrow remains visible at rest.
- **2026-07-18 — Reasoning effort promoted:** reasoning effort is stored per score because it describes an evaluation run. Validation requires every score for a model to use the same value or all omit it, allowing one truthful label beside the model while preserving per-score provenance.
- **2026-07-18 — Frontier model refresh:** Claude Fable 5 and Muse Spark 1.1 were added with 15 live Artificial Analysis results retrieved on 2026-07-18. Muse Spark 1.1 has no published IFBench result, so that score remains missing. Gemini 3.5 Pro remains officially listed as coming soon; Gemini 3.1 Pro Preview stays in the leaderboard.
- **2026-07-20 — Scoped category ranking (supersedes the 2026-07-17 core-table decision at owner request):** each category tab now shows an Index calculated as the equal-weight mean of that category's available percent-scaled benchmarks and a canonical rank precomputed from the full dataset for that scope. The same 60% coverage gate, rounded up to a whole benchmark, applies independently in every scope. Filters and search hide rows without renumbering them; Overall remains the canonical site-wide ranking.
- **2026-07-22 — "Printed Index" visual redesign (owner-approved; amends §6 typography, palette, and bar geometry):** the visual identity moves from anonymous-dashboard to editorial print-reference. Typography: the system sans stack is replaced by build-time self-hosted fonts via `next/font` — Newsreader (display: masthead, section headings, model-record headings, tagline), IBM Plex Sans (interface), IBM Plex Mono (all numerals, ranks, provenance metadata, kickers, data chips). Runtime dependencies remain zero; fonts are static assets. Palette: warm paper neutrals with an oxblood accent replacing blue — light `#f6f4ee/#fdfcf8/#1c1917/#57534a/#e2ddd0` + accent `#a63a22`; dark `#131110/#1b1815/#f0ede6/#a39c8f/#2e2a25` + accent `#d96c4f` — contrast-validated (secondary ink ≥6:1 on its surfaces, bar fill vs track ≥3:1 in both themes, accent usable as a graphical color at ≥3:1). The palette is single-sourced via CSS `light-dark()` with static light fallbacks, so pre-2024 browsers degrade to a permanent light theme. Score bars are 4px (was 3px); the type scale gains 20px and 34px display steps; weight tokens map to Plex statics (400/500/600/700). The header is a masthead with a double rule and a dateline carrying the freshness stamp (moved from the table caption). Everything else in §6 is unchanged and still binding: one hue for magnitude, numerals in text ink, no meaning by color alone, tabular numerals, designed dark mode, 44px rows, hairlines, AA contrast, CVD validation for any new data color.
