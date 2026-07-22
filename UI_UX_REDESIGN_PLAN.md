# LM Board — UI/UX Redesign Plan

> **Status (2026-07-22):** P0–P2 of this plan (hygiene, token layer, clarity fixes) are implemented and landed on `redesign/printed-index`, together with the approved spec changes ST3 (sub-$1 price precision) and ST4 (Index column hidden in single-benchmark scopes). On top of that baseline the owner approved the **"Printed Index"** visual redesign (editorial direction: Newsreader display, IBM Plex Sans/Mono, warm-paper palette with an oxblood accent, `light-dark()` palette single-sourcing) — see the 2026-07-22 decision-log entry in `PLAN.md`. Deploy (P3/ST1) remains the last open M4 box.
> **Baseline of the audit below:** clean tree at `46d8c46` (scoped per-category ranking is now committed). Every finding below was re-verified against this commit: full source read, plus rendered verification via dev server + headless Chrome at 1440 px, 390 px, and 360 px, light and dark, across all five tabs, with the detail panel, provider menu, and empty state exercised. Zero console errors in any view.

## Assumptions (context was not provided — inferred from the repo)

- **Product:** a static, single-page curated leaderboard of frontier-LLM benchmark scores where every number carries provenance (PLAN.md §1–2). The value proposition is trust and readability, not breadth.
- **Primary users:** developers, researchers, and model-pickers. Desktop-first for analysis; real mobile traffic arrives via shared URLs (the URL-state feature exists for exactly this).
- **Constraints (treated as binding, from PLAN.md §3/§6/§11):** Next.js 15 static export + plain CSS; zero new runtime dependencies; the validated palette, 5-size type scale, 3 radii, one-hue score bars, and system font stack are design law. Anything that would amend PLAN.md is flagged **[spec change]**.

---

## 1. Current state

### Stack

- Next.js 15.5.20 (App Router, `output: 'export'`), React 19, TypeScript, Zod 4. No UI libraries, no CSS tooling — one global stylesheet (`src/app/globals.css`, 1,709 lines) on CSS custom properties.
- Tokens exist for **color, type size, radius** (`src/app/globals.css:1-68`). None exist for font-weight, spacing, or shadows — that gap is the main audit theme below.
- Theming: `data-theme` attribute + `prefers-color-scheme`, with a pre-hydration script that prevents theme flash (`src/app/layout.tsx:10-17`).
- Data shapes: Zod schemas in `src/lib/schema.ts`; build fails on invalid data (`scripts/validate-data.ts`).

### Screen inventory (single route `/`)

| Region | Components |
|---|---|
| Header | `src/app/page.tsx:24-37` (wordmark, conditional GitHub link, `ThemeToggle`) |
| Controls | `CategoryTabs` (5 tabs), `FilterBar` (search, provider multi-select, open-weights toggle, result count, clear) |
| Leaderboard | `LeaderboardTable` + `ScoreCell` + `Badge` + `Tooltip`; sorting in `src/lib/useSort.ts`; shareable URL state in `src/lib/urlState.ts` |
| Row details | `DetailPanel` (7-cell metadata strip + 8 provenance cards) |
| Caption | `src/components/Leaderboard.tsx:311-316` (freshness + counts) |
| Methodology / Footer | `Methodology` (3-card grid), `SiteFooter` |
| Meta | `layout.tsx` (full OG/Twitter/icons), `manifest.ts`, `robots.ts`, `sitemap.ts` |
| 404 | **none** — default unbranded Next.js page (no `src/app/not-found.tsx`) |

### What is already strong (verified rendered — do not touch)

- **A11y is genuinely good:** real `<table>` + `aria-sort`, sr-only live region announcing sort, keyboard-operable everything, skip link, `:focus-visible` outlines, dialog-pattern tooltips with Escape/outside-click/focus-return, reduced-motion kill switch, designed (not inverted) dark mode.
- **Responsive holds 360 px → desktop.** Verified with viewport emulation: no horizontal body scroll at 390 or 360; tabs wrap at ≤560 px (`globals.css:1546-1550`); table scrolls internally with sticky model column, visible scroll instruction, and a peeking cut-off column as a natural affordance; provider menu becomes a bottom sheet; detail panel reflows to 2-col/1-col grids. The prior plan's "mobile tab clip" finding is **stale — already fixed** in `5890453`.
- **States are covered by architecture:** static site → no async loading/error states exist to miss; filter empty state exists and renders well (`LeaderboardTable.tsx:228-235`); no disabled controls exist by design.
- Restraint: one blue for all magnitude, tabular numerals, hairlines over boxes, hover wash over zebra, 120 ms single-ease motion.

### Audit findings

**Consistency — token drift in `globals.css` (the main remaining gap):**

- **16 distinct `font-weight` values** (400, 450, 500, 520, 550, 570, 590, 600, 620, 640, 650, 680, 700, 720, 750, 780) with no weight tokens. Usage counts: 700×11, 650×8, 600×4, then a long tail of one-offs (e.g. 590 at `globals.css:1224`, 620 at `globals.css:1083`, 780 at `globals.css:976`). Impossible to keep consistent by hand.
- **No spacing scale** — ad-hoc paddings/margins throughout (7, 9, 11, 13, 14, 15, 20, 22, 25, 28, 30 px…), e.g. `padding: 25px 28px 30px` at `globals.css:1061`.
- **12 `!important`** declarations; 10 are avoidable specificity fights (`globals.css:626, 957, 963-964, 1037, 1056, 1166, 1170-1171, 1195`), 2 legitimate (reduced-motion, `globals.css:1706-1707`).
- **3 literal shadows, no tokens:** two near-identical overlay shadows (`0 16px 38px rgba(0,0,0,.14)` at `globals.css:460` vs `0 16px 36px rgba(0,0,0,.2)` at `globals.css:739`) plus the scroll-hint shadow (`globals.css:640`).
- **Palette declared four times** (`:root`, dark media query, two `data-theme` blocks — `globals.css:1-68`); every color edit touches up to 4 places. `--control-border: #898781` is identical in all four.

**Layout / visual (all confirmed in rendered screenshots):**

- **Sparse tabs look broken at desktop.** Benchmark columns are `width: auto` at ≥1024 (`globals.css:1377-1379`), so on Math/Agentic (1 benchmark) the lone column is ~800 px wide: the score numeral right-aligns at the far edge, an ~800 px void separates it from the Index column, and the bar track (`width: 100%`, `globals.css:1000-1002`) spans the full column. Coding (2 benchmarks) shows the same at ~390 px per bar. Magnitude comparison across tabs becomes dishonest and the page reads unfinished.
- **Single-benchmark tabs display the same number twice per row** — the scoped Index of one benchmark *is* that benchmark's score (e.g. Math: "32.3 … 32.3 ·" per row). Inherent to a 1-benchmark mean; needs a product decision (open question 3).
- **The Index header reads "Index" on every tab** while its meaning changes per scope; the scope lives only in the aria-label (`LeaderboardTable.tsx:182-190`). Sighted users must infer from the active tab.
- **No visible page identity.** The h1 is sr-only (`Leaderboard.tsx:276-278`); the header is just the wordmark and theme toggle. PLAN §6's tagline ("Curated benchmark scores for frontier language models") exists only in metadata (`layout.tsx:8`) — first-time visitors land on an unlabeled table.
- **Model names truncate at desktop despite free space** — "Nemotron 3 Ultra 5…" ellipsizes in the fixed 18% model column while sparse tabs have hundreds of empty pixels (same root cause as the column-width issue; one fix covers both).
- Large whitespace band (~120 px) between the table caption and Methodology (`globals.css:1198-1201` margin+padding) — breathing room that reads as a gap now that the caption ends the table region. One spacing step tighter would do.

**Data-display fidelity:**

- **[spec change] Sub-$1 prices lose real information at one decimal** (`LeaderboardTable.tsx:29-32`; rule set in PLAN §6): DeepSeek V4 Pro $0.435/$0.87 renders "$0.4 / $0.9" (−8%); MiniMax M3 $0.3/$1.2. Buyers compare cheap models hardest.

**Leftovers / hygiene:**

- `scripts/migrate-reasoning-effort.ts` — applied one-shot migration; keeping it invites bit-rot.
- `README.md:62-63` — stray `# LM-Board` / `# LM-Board` lines left at the end of the file.
- Deployment is the last unchecked M4 box; `.env.example` still holds placeholder URLs, so the GitHub header/footer/correction links render nowhere.
- Micro-nits: OG image/title say "LM Board" while the rendered wordmark is "LMBoard" (`page.tsx:25-27`); the effort chip is a fixed `60px` pill (`globals.css:904-905`) that variable-length labels ("reasoning") only just fit.

---

## 2. Design direction

### Principles

1. **The table is the product; chrome recedes** (existing principle — it's working; reaffirmed).
2. **Every visual decision has one source of truth.** If a value appears twice it's a token; if a rule needs `!important` the selector structure is wrong.
3. **Trust is visible at a glance.** Identity, freshness, provenance, and *what a number means* (scope) must never require inference.
4. **Nothing stretches, clips, or duplicates into noise** — on every tab, at any width from 360 px to desktop. A sparse tab must look as deliberate as a dense one.
5. **Premium here means stillness** — no new animation, no decoration; polish comes from rhythm and alignment.

### The system these imply

- **Type scale (unchanged, binding):** 11/12/13/14/16 px + 28 px section heading. **New — 4 weight tokens:** `--weight-regular: 450`, `--weight-medium: 550`, `--weight-semibold: 650`, `--weight-bold: 700`. The three dominant values (700, 650, 600→650) stay visually put; the 13 stragglers snap to the nearest token (max deviation 80, most ≤50, verified per-element with before/after screenshots).
- **Spacing scale (new):** `--space-1..8` = 4, 8, 12, 16, 24, 32, 48, 64 px. Existing values snap to the nearest step (7→8, 9→8, 11→12, 13→12, 14→16, 15→16, 25/28/30→24/32). Deliberate 1–3 px optical nudges stay literal.
- **Color (unchanged, binding):** the validated palette exactly as in PLAN §6, with the derived tints (`--hover`, `--detail`, `--row-hover`, `--control-border`) kept as roles. **New: declare once** — collapse the four palette blocks via CSS `light-dark()` + `color-scheme` (evergreen browsers since 2024) **[needs decision — open question 5]**; if declined, keep 4 blocks but generate light/dark pairs adjacently with a comment convention.
- **Radii (unchanged, binding):** 6 / 12 / 999.
- **Shadows (new tokens):** `--shadow-overlay` (one value for menu + tooltip, unifying the two near-identical literals) and `--shadow-scroll-hint` (current value, named).
- **Motion (unchanged):** single 120 ms ease + reduced-motion kill switch. No additions.
- **Score cells:** numeral + 3 px bar stays; bar gets `max-width: ~132px; margin-left: auto` so bar length means the same thing on every tab. Sparse tabs additionally hand column slack to the model column (see QW2) so numerals sit near their neighbors, not at the far edge.
- **State coverage:** already complete (hover/focus-visible everywhere, empty state, no async states by architecture) — becomes a checklist for any new work rather than a gap to close.

---

## 3. Prioritized improvements

### Quick wins

| # | Change | Impact | Effort |
|---|---|---|---|
| QW1 | **Sparse-tab layout fix:** `.score-bar` max-width + right-align; add `data-sparse` (≤2 benchmarks) to the table so `.benchmark-column` gets a fixed width and `.model-column` absorbs the slack at ≥1024 (`globals.css:1377`, `LeaderboardTable.tsx:158-161`) | High — Math/Agentic/Coding currently look broken; also fixes Nemotron name truncation | S |
| QW2 | Visible scope in the Index header — "Coding Index" when scoped (`LeaderboardTable.tsx:182-190`) | High — removes the last "what am I looking at" ambiguity | XS |
| QW3 | Tagline + visible identity in the header (PLAN §6 debt; copy exists at `layout.tsx:8`) | High — the product is currently unlabeled | S |
| QW4 | Weight tokens: 16 values → 4 (`--weight-*`) | Medium visually, high maintainability | M (mechanical, screenshot-diffed) |
| QW5 | Spacing tokens adopted across `globals.css` | Same | M (mechanical) |
| QW6 | Remove the 10 avoidable `!important` via selector restructure | Medium — restores styling sanity | S |
| QW7 | Shadow tokens (2) | Low | XS |
| QW8 | Branded `not-found.tsx` (wordmark + link home, ~20 lines) | Low | XS |
| QW9 | Hygiene: delete `scripts/migrate-reasoning-effort.ts`; strip `README.md:62-63`; let the effort chip size to content | Low | XS |
| QW10 | Tighten the caption→Methodology band by one spacing step (`globals.css:1198-1201`) | Low | XS |

### Structural

| # | Change | Impact | Effort |
|---|---|---|---|
| ST1 | **Deploy** (Vercel; set `NEXT_PUBLIC_SITE_URL` + `NEXT_PUBLIC_GITHUB_REPOSITORY_URL`) — last M4 box; also lights up the GitHub/corrections links everywhere | Highest — the product currently has zero users | S |
| ST2 | Palette single-sourcing via `light-dark()` (4 blocks → 1) | Medium maintainability | S **[needs decision]** |
| ST3 | Price precision: 2 decimals under $1 (`LeaderboardTable.tsx:29-32`, `DetailPanel.tsx:10-13`) | Medium — data fidelity where users compare hardest | XS **[spec change]** |
| ST4 | Single-benchmark tabs: resolve the Index/score duplication (hide Index column in 1-benchmark scopes, or keep for uniformity) | Medium | S **[needs decision]** |
| ST5 | Price-vs-Index scatter — v2 per PLAN §9; listed only to keep it visible | — | M (later) |

No rewrite and no new dependency is recommended anywhere: the frontend is ~3,900 lines of disciplined code, and nothing found here is a problem a library solves better than the existing hand-rolled code.

---

## 4. Screen-by-screen changes (single page — by region)

- **Header** — *Changes:* add tagline under the wordmark; unify wordmark treatment with the OG image ("LM Board" vs "LMBoard"). *Stays:* wordmark link, theme toggle, conditional GitHub link. *Components after:* unchanged set.
- **Controls (tabs + filters)** — *Changes:* token adoption only. *Stays:* all behavior, tab wrap at ≤560, URL sync, provider bottom-sheet. *Components:* `CategoryTabs`, `FilterBar`, unchanged APIs.
- **Leaderboard table** — *Changes:* sparse-tab column strategy + bar cap (QW1); scoped Index header text (QW2); ST3/ST4 if approved; token adoption. *Stays:* columns, sorting, sticky header + model column, best markers, effort chips, mobile rank badge. *Components:* `LeaderboardTable` (data attribute + header label), `ScoreCell` (bar cap), `Badge`, `Tooltip` unchanged.
- **Detail panel** — *Changes:* none functional; token adoption removes its 4 `!important`s. *Stays:* metadata strip, 8 provenance cards — this region is the product's proof of trust and already its best surface.
- **Caption** — *Stays* as shipped; spacing-step tighten below it (QW10).
- **Methodology + footer** — *Changes:* top-gap tighten; token adoption. *Stays:* copy (already scope-aware), 3-card grid, footer stack.
- **404** — *New:* minimal branded page (QW8).
- **Meta/head** — *Stays:* complete. Wordmark-spacing nit only if the OG image is regenerated anyway.

---

## 5. Implementation phases (each leaves the app shippable)

1. **P0 — Hygiene.** QW9 (delete applied migration script, README tail, chip sizing). ✅ *Checkpoint:* `validate:data` + `typecheck` + `build` green; tree clean.
2. **P1 — Consistency layer (invisible refactor).** QW4–QW7: weight/spacing/shadow tokens, `!important` removal. Intentionally **zero visual change**. ✅ *Checkpoint:* before/after screenshots pixel-comparable at 1440/390 in both themes; `grep -o 'font-weight: [0-9]*' | sort -u` ≤ 4 values; `grep -c '!important'` = 2; build green.
3. **P2 — Clarity pass (visible fixes).** QW1, QW2, QW3, QW8, QW10. ✅ *Checkpoint:* fresh screenshots of all five tabs at 1440/390/360 in both themes — capped right-aligned bars, no far-edge numerals on sparse tabs, scoped Index label, visible tagline, branded 404; no horizontal body scroll anywhere.
4. **P3 — Ship (ST1).** Vercel deploy with real env vars; verify robots/sitemap/OG resolve on the production domain. ✅ *Checkpoint:* production URL live; social link preview renders; GitHub/corrections links visible; Lighthouse a11y ≥ 95.
5. **P4 — Approved spec changes only.** ST3 (price precision + PLAN §6 amendment), ST2 (`light-dark()`), ST4 (Index column on 1-benchmark tabs) — whichever are approved, each with a PLAN decision-log entry. ✅ *Checkpoint:* validate + visual diff; decision log updated.

Phases are ordered so P1's refactor is verifiable before P2 changes pixels, and everything user-visible lands before the deploy checkpoint. Recommended sequencing within a session: P0+P1 as one PR, P2 as one PR, P3 as ops, P4 per-decision.

---

## 6. Open questions

1. **Tagline copy/placement** — "Curated benchmark scores for frontier language models" under the wordmark (recommended: `--type-12`, secondary ink), or a right-aligned header line?
2. **Scoped Index header** — rename visibly per tab ("Coding Index"), or keep "Index" with a small note? (Recommend: rename — four characters of honesty.)
3. **Single-benchmark tabs (Math, Agentic)** — hide the Index column there (rank already encodes it; removes the duplicated number), or keep it for cross-tab consistency? (Recommend: keep the column but I'd like your call — hiding changes information architecture.)
4. **Price precision under $1** — approve the PLAN §6 amendment to 2 decimals below $1? (Recommend: yes.)
5. **`light-dark()` palette consolidation** — acceptable to require evergreen (2024+) browsers? If pre-2024 support matters, skip ST2; everything else stands.
6. **Deployment inputs** — the production domain for `NEXT_PUBLIC_SITE_URL` and the real GitHub repo URL (currently placeholders in `.env.example`).
7. **Models with no recorded effort** (Gemini 3.1/3.5, Qwen, MiniMax, Mistral, Llama 4, Kimi… wherever data lacks it) intentionally show no chip — confirm honest absence is the desired behavior. (Recommend: yes.)
