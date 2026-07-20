# LM Board — UI/UX Redesign Plan

> **Status:** proposal for review — no code changed in this session.
> **Baseline:** working tree at commit `5890453` plus the uncommitted scoped-ranking feature (verified green: `validate:data`, `typecheck`; rendered and screenshotted via dev server in light, dark, mobile, and per-category tabs).

## Assumptions (context not provided — inferred from the repo)

- **Product:** a static, single-page curated leaderboard of frontier-LLM benchmark scores with per-score provenance (PLAN.md §1). Value proposition is trust and readability, not breadth.
- **Primary users:** developers, researchers, and model-selection decision-makers. Desktop-first for analysis; meaningful mobile traffic from shared links (URL state exists for exactly this). No auth, no writes — read-only audience.
- **Constraints (treated as binding, from PLAN.md §3/§6/§11):** keep Next.js 15 static export + plain CSS; zero new runtime dependencies; the validated palette, 5-size type scale, 3 radii, one-hue score bars, and system font stack are design law. Anything below that requires amending PLAN.md is explicitly flagged **[spec change]**.

---

## 1. Current state

### Stack

- Next.js 15.5.20 (App Router, `output: 'export'`), React 19, TypeScript, Zod 4. No UI libraries, no CSS tooling — one global stylesheet (`src/app/globals.css`, 1,709 lines) using CSS custom properties.
- Tokens exist for **color, type size, radius** (`globals.css:1–68`); theming via `data-theme` attribute + `prefers-color-scheme` with a pre-hydration script (`src/app/layout.tsx:10–17`).
- Source of truth for data shapes: `src/lib/schema.ts` (Zod, types inferred). Build fails on invalid data (`scripts/validate-data.ts`).

### Screen inventory (single route `/`)

| Region | Components |
|---|---|
| Header | `page.tsx` (wordmark, GitHub link, `ThemeToggle`) |
| Controls | `CategoryTabs`, `FilterBar` (search, provider multi-select, open-weights toggle) |
| Leaderboard | `LeaderboardTable`, `ScoreCell`, `Badge`, `Tooltip`, sort logic in `lib/useSort.ts`, URL state in `lib/urlState.ts` |
| Row details | `DetailPanel` (metadata strip + 8 provenance cards) |
| Caption | `Leaderboard.tsx:311–316` (freshness + counts) |
| Methodology / Footer | `Methodology`, `SiteFooter` |
| Meta | `layout.tsx` (full OG/Twitter/icons), `manifest.ts`, `robots.ts`, `sitemap.ts`, `public/og-image.png` |
| 404 | **none** — default unbranded Next.js page (no `src/app/not-found.tsx`) |

### What is already strong (do not touch)

- Semantics and a11y: real `<table>` + `aria-sort`, sr-only live region for sort state, keyboard-operable everything, `:focus-visible`, reduced-motion support, designed (not inverted) dark mode.
- Restraint: one blue for all magnitude, tabular numerals, hairlines over boxes, hover wash over zebra.
- Recent fixes landed: single normalized effort chip, freshness caption, URL-shareable state, scoped per-tab ranking (uncommitted), full metadata/OG.

### Audit findings

**Consistency (the main remaining gap — token drift in `globals.css`):**

- **16 distinct `font-weight` values** (400, 450, 500, 520, 550, 570, 590, 600, 620, 640, 650, 680, 700, 720, 750, 780) with no weight tokens; e.g. 720 at `globals.css:284`, 700×11 uses, 650×8 uses. Impossible to keep visually consistent by hand.
- **No spacing scale** — paddings/margins use ad-hoc values (7, 9, 11, 13, 14, 15, 25/28/30…px) throughout.
- **12 `!important`** declarations; 10 avoidable (e.g. `globals.css:626, 957, 963–964, 1037, 1056, 1166–1171, 1195` — specificity fights), 2 legitimate (reduced-motion overrides, `1706–1707`).
- **Two ad-hoc shadows** (`globals.css:460, 739`) plus a scroll-hint shadow (`640`) — no shadow tokens.
- **Palette declared four times** (`:root`, dark media query, two `data-theme` blocks, `globals.css:1–68`) — every color edit must be made in up to 4 places.

**Layout / visual:**

- **Score bars stretch to full column width on sparse tabs.** `.score-bar` is `width: 100%`; on Coding (2 benchmark columns) bars span ~400 px, and Math/Agentic (1 column) will be wider still — magnitude becomes hard to compare and the page looks stretched (verified in `?tab=coding` screenshot).
- **Index column header reads just "Index" on every tab** while its value changes meaning per scope; the scope is only in the aria-label (`LeaderboardTable.tsx:184–190`). Sighted users must infer from the active tab.
- **No visible page identity.** The h1 is sr-only (`Leaderboard.tsx:276–278`); the PLAN §6 tagline ("Curated benchmark scores for frontier language models") was never implemented — first-time visitors land on an unlabeled table (`page.tsx:24–37`).
- **Mobile tab strip clips** ("Agentic" cut off at 390 px) with no scroll affordance (`globals.css:307–314`, `overflow-x: auto` only).
- Large empty band between table and Methodology (`.methodology` margin+padding ≈ 170 px) — intentional breathing room, but reads as a gap on tall screens now that the caption ends the table region.

**States:**

- Static site, no async fetches → loading/error states are N/A **by architecture**, not omission. Filter empty state exists (`LeaderboardTable.tsx:228–235`). No disabled controls exist. This section is genuinely covered.

**Data display fidelity:**

- **[spec change] Sub-$1 prices lose real information at one decimal:** DeepSeek $0.435 renders "$0.4" (−8%), MiniMax $0.3/$1.2 (`LeaderboardTable.tsx:29–32`; rule set in PLAN §6). Buyers compare cheap models hardest.

**Leftovers / hygiene:**

- `scripts/migrate-reasoning-effort.ts` — one-shot migration, already applied; keeping it invites bit-rot.
- Uncommitted scoped-ranking feature (9 files) must land as its own commit before any redesign work.
- Deployment itself is the last unchecked M4 box (`vercel.json` ready; GitHub header/footer/corrections links render only when `NEXT_PUBLIC_GITHUB_REPOSITORY_URL` is set).
- Micro-nit: OG image says "LM Board" (spaced); the site wordmark renders "LMBoard" (unspaced, two-weight). Pick one.

---

## 2. Design direction

### Principles

1. **The table is the product; chrome recedes** (existing principle — reaffirmed, it's working).
2. **Every visual decision has one source of truth.** If a value appears twice, it's a token; if a rule needs `!important`, the selector structure is wrong.
3. **One fact, one place.** Achieved for effort labels; guardrail for all future UI.
4. **Trust is visible at a glance.** Identity, freshness, provenance, and *what a number means* (scope) must never require inference.
5. **Nothing stretches, clips, or truncates into noise** — at any width from 360 px to desktop, on every tab.

### The system they imply

- **Type scale (unchanged, binding):** 11/12/13/14/16 px + hero `clamp` + 28 px section heading. **New: 4 weight tokens** — `--weight-regular: 450`, `--weight-medium: 550`, `--weight-semibold: 650`, `--weight-bold: 750`. All 16 current values map onto these (mapping done per-element with a before/after screenshot check; ±30 from current value in every case, visually indistinguishable at these sizes).
- **Spacing scale (new):** `--space-1..8` = 4, 8, 12, 16, 24, 32, 48, 64 px. Existing values snap to nearest step (7→8, 9→8, 11→12, 13→12, 14→16, 15→16…). Component-internal micro-offsets (e.g. 2–3 px optical nudges) stay literal.
- **Color (unchanged, binding):** the validated palette as given. **New: declare once** — collapse the four palette blocks using CSS `light-dark()` with `color-scheme` switching (supported in all evergreen browsers since 2024); keep the current 4-block form only if pre-2024 browser support matters (open question #4).
- **Radii (unchanged, binding):** 6/12/999.
- **Shadows (new tokens):** `--shadow-overlay` (menus/tooltips) and `--shadow-scroll-hint` (sticky column edge) replacing the three literals.
- **Motion (unchanged):** single 120 ms ease, reduced-motion kill-switch. No new animation — premium here means stillness.
- **Score bars:** numeral + 3 px bar stays, but bar gets `max-width` (~110 px, right-aligned under the numeral) so sparse tabs don't produce arm-length bars and cross-column comparison stays honest.
- **State coverage:** hover/focus-visible on every interactive element (already true — keep as a checklist item for new work); no async states needed by architecture.

---

## 3. Prioritized improvements

### Quick wins

| # | Change | Impact | Effort |
|---|---|---|---|
| QW1 | Commit the pending scoped-ranking work (prerequisite baseline) | unblocks everything | XS |
| QW2 | Cap score-bar width on sparse tabs (`.score-bar` max-width) | high — Coding/Math/Agentic tabs currently look broken-stretched | XS |
| QW3 | Visible scope in the Index header ("Coding Index" when scoped) | high — removes the one remaining "what am I looking at" ambiguity | XS |
| QW4 | Tagline + visible identity in header (PLAN §6 debt) | high — unlabeled product today | S |
| QW5 | Weight tokens: 16 values → 4 (`--weight-*`) | med visually, high maintainability | M (mechanical, screenshot-diffed) |
| QW6 | Spacing tokens adopted across `globals.css` | same | M (mechanical) |
| QW7 | Remove the 10 avoidable `!important` via selector restructure | med — unblocks future styling sanity | S |
| QW8 | Shadow tokens (2) | low | XS |
| QW9 | Mobile tab-strip scroll affordance (edge fade or wrap) | med on mobile | XS |
| QW10 | Branded `not-found.tsx` (wordmark + link home, ~20 lines) | low | XS |
| QW11 | Delete `scripts/migrate-reasoning-effort.ts` (applied one-shot) | hygiene | XS |

### Structural

| # | Change | Impact | Effort |
|---|---|---|---|
| ST1 | **Deploy** (Vercel + `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_GITHUB_REPOSITORY_URL`) — the last M4 box; also lights up the GitHub/corrections links | highest — the product currently has zero users | S |
| ST2 | Palette single-sourcing via `light-dark()` (4 blocks → 1) | med maintainability | S **[needs decision]** |
| ST3 | Price precision: 2 decimals under $1 | med — data fidelity where users compare hardest | XS **[spec change]** |
| ST4 | Price-vs-Index scatter | v2 per PLAN §9 — out of scope for this plan; listed to keep it visible | M |

No rewrite and no new dependency is recommended anywhere: the stack is 5,500 lines total, disciplined, and the audit found zero problems that a library would solve better than the existing hand-rolled code.

---

## 4. Screen-by-screen changes (single page — by region)

- **Header** — *Changes:* add tagline line; unify wordmark treatment with OG image. *Stays:* wordmark, theme toggle, conditional GitHub link. *Components after:* unchanged set.
- **Controls (tabs + filters)** — *Changes:* mobile scroll affordance on tabs (QW9); token adoption only. *Stays:* all behavior, URL sync. *Components:* `CategoryTabs`, `FilterBar` unchanged APIs.
- **Leaderboard table** — *Changes:* bar max-width (QW2); scoped Index header text (QW3); token adoption. *Stays:* columns, sorting, sticky model column, best markers, chips. *Components:* `LeaderboardTable`, `ScoreCell` (one-line bar change), `Badge`, `Tooltip` unchanged.
- **Detail panel** — *Changes:* none functional; token adoption removes its 4 `!important`s. *Stays:* metadata strip, provenance cards.
- **Caption** — *Stays* as shipped (it resolved the freshness/identity-adjacent findings).
- **Methodology + footer** — *Changes:* tighten the top gap one spacing step; token adoption. *Stays:* copy (already scope-aware in pending commit), 3-card grid.
- **404** — *New:* minimal branded page (QW10).
- **Meta/head** — *Stays:* complete. Only the wordmark-spacing nit if OG is regenerated anyway.

---

## 5. Implementation phases (each leaves the app shippable)

1. **P0 — Baseline.** Commit the scoped-ranking work (+ QW11 script deletion). ✅ *Checkpoint:* clean tree, CI green, tabs re-rank in prod build (`?tab=coding` → Claude Fable 5 #1 at 72.4).
2. **P1 — Consistency layer (invisible refactor).** QW5–QW8: weight/spacing/shadow tokens, `!important` removal. Intentionally **zero visual change**. ✅ *Checkpoint:* before/after screenshots pixel-comparable; `grep` counts: ≤4 font-weight values, 0 avoidable `!important`; typecheck + build green.
3. **P2 — Clarity pass (visible fixes).** QW2, QW3, QW4, QW9, QW10. ✅ *Checkpoint:* fresh screenshots — all five tabs at desktop + 360 px show capped bars, scoped Index label, tagline, non-clipped tabs; 404 branded.
4. **P3 — Ship (ST1).** Vercel deploy with env vars; verify robots/sitemap/OG resolve against the real domain. ✅ *Checkpoint:* production URL live; link preview renders card; Lighthouse a11y ≥ 95; GitHub links visible.
5. **P4 — Approved spec changes only.** ST3 (price precision, with PLAN §6 edit) and ST2 (`light-dark()`) if approved. ✅ *Checkpoint:* validate + visual diff; PLAN decision log updated.

---

## 6. Open questions

1. **Tagline copy/placement** — PLAN's "Curated benchmark scores for frontier language models" under the wordmark, or a right-aligned header line? (Recommend: under wordmark, `--type-12` secondary ink.)
2. **Scoped Index header** — rename visibly per tab ("Coding Index"), or keep "Index" + add a small header note? (Recommend: rename — it's four characters of honesty.)
3. **Price precision under $1** — approve the PLAN §6 amendment? (Recommend: yes, 2 dp below $1.)
4. **`light-dark()` palette consolidation** — fine to require evergreen (2024+) browsers? If any pre-2024 support matters, skip ST2; everything else stands.
5. **Deployment inputs** — production domain for `NEXT_PUBLIC_SITE_URL` and the real GitHub repo URL (currently `.env.example` placeholders).
6. **Models with no recorded effort** (Gemini 3.1/3.5, Qwen, MiniMax, Mistral, Llama 4) intentionally show no chip — confirm that's the desired honest-absence behavior (recommend: yes).
