# LM Board — Redesign Discovery & Plan: **"Observatory"**

## Context

LM Board (live at `checklmboard.xyz`) is a static, curated leaderboard of frontier-LLM benchmark scores — 62 models, 8 benchmarks, 456 individually sourced scores. Its thesis, from `PLAN.md:10`, is *"we don't run evals, we curate them"*: the product's value is provenance, not measurement.

The current visual identity ("Printed Index," adopted 2026-07-22, `PLAN.md:215`) is an editorial broadsheet — warm paper neutrals, oxblood accent, Newsreader serif, hairline rules, and near-zero motion. It is coherent and well built. It is also **invisible about the one thing that makes the product worth citing**: all 456 source citations sit behind a click, the page has no statement of what it is, and there is no magnitude encoding of any kind on the board.

This document specifies a complete redesign that (a) shares no recognizable identity with the current design, (b) is specified to exact values so it can be implemented without taste decisions, and (c) is architected around one confirmed goal: **become the thing people cite.**

### Decisions taken as input (confirmed with the owner this session)

| Question | Answer | Consequence for this plan |
|---|---|---|
| Conversion action | **Become the cited reference** | Optimize for first-view credibility, verifiability, linkability, and screenshot travel — not signup or engagement time |
| Inspiration | **Propose freely** | Directions generated from first principles; no external reference to honor |
| Motion runtime | **Zero-dep, CSS/WAAPI only** | Springs are specified as stiffness/damping/mass and compiled to CSS `linear()` stops. No library. `PLAN.md:22` §3 holds |
| Structural scope | **Full latitude, new routes allowed** | `/model/[id]`, `/compare`, and a plot projection are in scope. This reopens `PLAN.md:181` §9 and needs a decision-log entry |

> The prompt's `{{PRODUCT_CONTEXT}}` and `{{INSPIRATION}}` slots arrived unfilled. Product context was derived from the code and `PLAN.md`; inspiration was resolved by the question above.

### Scope note

This plan supersedes binding constraints recorded in `PLAN.md` §6 and §9. Landing it requires a decision-log entry amending: the typography constraint, the validated palette, the "one page" rule (already amended once on 2026-07-22), the bar geometry, and the v2 out-of-scope list. Everything in `PLAN.md` §6 that is a *principle* rather than a *value* is preserved and restated in §4.7: one hue for magnitude, numerals in text ink, no meaning by color alone, tabular numerals, designed (not inverted) dark mode, AA contrast, CVD validation for any new data color.

---

# Phase 1 — The codebase as it is

Every claim below traces to a file opened in this session. Coverage and gaps are itemized in **V2 Groundedness**.

## 1.1 Stack and rendering model

| Layer | Choice | Evidence |
|---|---|---|
| Framework | Next.js 15.5.21, App Router | `package.json:14` |
| Rendering | `output: "export"` — pure static, no server at runtime | `next.config.ts:4` |
| UI | React 19.1.8 / react-dom 19.1.8 | `package.json:15-16` |
| Types | TypeScript 5.9.3, `strict: true`, alias `@/*` → `./src/*` | `tsconfig.json:8,18` |
| Validation | Zod 4.4.3 — build-time only, not a UI dependency | `package.json:17`, `src/lib/schema.ts` |
| Styling | **One global stylesheet**, 1,923 lines, plain CSS custom properties | `src/app/globals.css` |
| Component library | **None** | no UI deps in `package.json` |
| Animation library | **None** | no deps; motion is CSS-only (§2.5) |
| Fonts | `next/font/google`, self-hosted at build | `src/app/layout.tsx:2-28` |
| Tests | Vitest 4, `environment: "node"` | `vitest.config.ts:5` |
| Lint | ESLint 9 + `next/core-web-vitals` + `next/typescript`, `--max-warnings=0` | `eslint.config.mjs`, `package.json:8` |
| Deploy | Vercel; `buildCommand: "npm test && npm run build"`, `cleanUrls: true` | `vercel.json:5,7` |

Tailwind and PostCSS were removed on 2026-07-18 (`PLAN.md:208`). There is no CSS preprocessing of any kind — Next's built-in pipeline consumes one plain CSS file.

## 1.2 Component inventory

Twelve components. All are in `src/components/`.

| Component | Path | Boundary | Rendered by |
|---|---|---|---|
| `SiteMasthead` | `SiteMasthead.tsx` | server | `app/page.tsx:27`, `app/methodology/page.tsx:46`, `app/not-found.tsx:16`, `app/global-error.tsx:19` |
| `ThemeToggle` | `ThemeToggle.tsx` | `"use client"` | `app/page.tsx:38`, `app/methodology/page.tsx:57` |
| `Leaderboard` | `Leaderboard.tsx` | `"use client"` | `app/page.tsx:50` |
| `CategoryTabs` | `CategoryTabs.tsx` | `"use client"` | `Leaderboard.tsx:274` |
| `FilterBar` | `FilterBar.tsx` | `"use client"` | `Leaderboard.tsx:275` |
| `LeaderboardTable` | `LeaderboardTable.tsx` | `"use client"` | `Leaderboard.tsx:289` |
| `ScoreCell` | `ScoreCell.tsx` | no directive (inside client tree) | `LeaderboardTable.tsx:322` |
| `Tooltip` | `Tooltip.tsx` | `"use client"` | `LeaderboardTable.tsx:202` |
| `DetailPanel` | `DetailPanel.tsx` | no directive | `LeaderboardTable.tsx:344` |
| `Badge` | `Badge.tsx` | no directive | `LeaderboardTable.tsx:289,304`, `ScoreCell.tsx:37`, `DetailPanel.tsx:117`, `Methodology.tsx:123` |
| `Methodology` | `Methodology.tsx` | no directive | `app/methodology/page.tsx:69` |
| `SiteFooter` | `SiteFooter.tsx` | no directive | `app/page.tsx:51`, `app/methodology/page.tsx:75` |

**The client boundary sits at `Leaderboard`** (`Leaderboard.tsx:1`). `app/page.tsx` is a server component that calls `loadLeaderboardData()` at build time and passes the *entire* dataset across the boundary as a prop — so the data is serialized into both the SSR HTML and the RSC hydration payload (`out/index.txt`). This is the origin of the double-payload finding in §2.9.

**Library layer** (`src/lib/`, 8 modules):

| Module | Responsibility |
|---|---|
| `schema.ts` | Zod schemas for `Model`/`Benchmark`/`Score`; all types inferred from them |
| `data.ts` | Load → validate → join → compute per-scope index and competition ranks; `loadLeaderboardData()` |
| `index.ts` | Index math: `MIN_INDEX_COVERAGE = 0.6`, percentile-based imputation of missing scores, `calculateLmBoardIndex()` |
| `dataIntegrity.ts` | Cross-file referential checks (dangling refs, duplicate pairs, effort consistency) |
| `useSort.ts` | `SortColumn`/`SortState`, comparators, `useSort()` hook, `DEFAULT_SORT = {index, desc}` |
| `urlState.ts` | `?tab` / `?sort` / `?direction` / `#model-fragment` encode & decode |
| `format.ts` | `formatPrice()` — 2dp under $1, 1dp above |
| `site.ts` | `siteUrl` / `repositoryUrl` / `issuesUrl` from env, with a fail-closed localhost guard |

## 1.3 Route and screen map

| Route | Source | Type |
|---|---|---|
| `/` | `src/app/page.tsx` | static; masthead → leaderboard → footer |
| `/methodology` | `src/app/methodology/page.tsx` | static; masthead → 5 method sections → footer |
| 404 | `src/app/not-found.tsx` | static |
| error boundary | `src/app/global-error.tsx` | renders its own `<html>`, outside the root layout |
| `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, `/icon.svg` | `sitemap.ts`, `robots.ts`, `manifest.ts`, `icon.svg` | generated, `force-static` |

**Two indexable pages exist today.** That is the single most important fact for a "become the cited reference" goal (see §4.5).

### The citation flow, as currently built

```
arrive at /  →  masthead (wordmark 34px, italic tagline 14px, dateline 12px muted)
             →  controls shell (5 category tabs · search · provider menu · open-weights · count)
             →  table, 62 rows in a bounded scroll box (max-height min(72vh,720px))
                  ├─ sort any column                 (LeaderboardTable.tsx:83-96)
                  ├─ hover a benchmark header → tooltip w/ description + source
                  │                                   (Tooltip.tsx, benchmark columns only)
                  └─ click a row → DetailPanel       (LeaderboardTable.tsx:252, 343)
                        └─ 8 provenance cards: value · settings · source link · retrieved date
                                                     (DetailPanel.tsx:102-147)
             →  footer (AA attribution, methodology link, GitHub link)
```

URL state is fully wired: `Leaderboard.tsx:113-196` hydrates from the URL on mount and writes back on every state change via `history.replaceState`, and `Leaderboard.tsx:198-213` scrolls the expanded row into view. **There is no UI affordance anywhere that tells a visitor this exists.**

## 1.4 Where styling decisions actually live

100% in `src/app/globals.css`. There are no inline styles except two computed values:
- `LeaderboardTable.tsx:131-133` — `--benchmark-count` custom property, feeding the table's `min-width` calc
- `LeaderboardTable.tsx:160` — `data-sparse` attribute for ≤2-benchmark tabs

Tokens are declared once in `:root` (`globals.css:1-72`) using `light-dark()` with static light-value fallbacks first (`globals.css:38-48`) so pre-2024 browsers degrade to a permanent light theme. Theme override is `data-theme` on `<html>`, set pre-hydration by an inline script (`layout.tsx:33-40`) and toggled by `ThemeToggle.tsx:36-47` with `localStorage` key `lmboard-theme`.

There are **no CSS cascade layers** (`@layer` count: 0) and **3 `!important` declarations**, all inside the `prefers-reduced-motion` block (`globals.css:1918-1920`) — legitimate.

## 1.5 Technical constraints that bound the redesign

1. **Static export.** No server, no runtime fetch, no ISR, no `next/image` optimization, and **no `next/og` runtime image generation** (it requires the edge runtime). Per-view OG images must be pre-generated at build time or not exist.
2. **Content Security Policy** (`vercel.json:20`) — `default-src 'none'`, `script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`, `font-src 'self'`, `connect-src 'self'`.
   - ✅ Inline `<style>` and `style=""` allowed → CSS custom properties set from JS are fine.
   - ✅ `data:` image URIs allowed → the SVG grain texture in §4.2 is CSP-legal.
   - ❌ No external fonts, no CDN, no third-party analytics beacon without amending the policy.
3. **Zero runtime dependencies** beyond next/react/zod (`PLAN.md:22`, confirmed by the owner this session). Dev dependencies are acceptable — `tsx`, `vitest`, `eslint` already exist.
4. **CI page-weight budget**: `out/index.html` ≤ 1,048,576 bytes (`.github/workflows/ci.yml:44-53`). Currently 392,202 (37.4%).
5. **No component test infrastructure.** Vitest runs in `environment: "node"` with no jsdom and no Testing Library — nothing can render a component today. The codebase audit flags this as SEV-02. Any interactive redesign work ships untested unless this is fixed first.
6. **Data-shape is frozen.** `PLAN.md:14` §2 marks curated-data/static-site/one-page as owner-sign-off decisions. The redesign changes presentation and adds routes; it must not change `schema.ts` or the Index math in `index.ts`.
7. **Vercel `outputDirectory: ".next"`** (`vercel.json:6`) — set empirically; do not "fix" it to `out`.

---

# Phase 2 — Fingerprint of the current design

This is the reference the redesign must diverge from. Every value is read from `src/app/globals.css` unless noted.

## 2.1 Palette — 9 semantic colors, no scales

| Token | Light | Dark | Line |
|---|---|---|---|
| `--page` | `#f6f4ee` | `#131110` | 49 |
| `--surface` | `#fdfcf8` | `#1b1815` | 50 |
| `--ink` | `#1c1917` | `#f0ede6` | 51 |
| `--ink-secondary` | `#57534a` | `#a39c8f` | 52 |
| `--ink-muted` | `#6f6862` | `#938c80` | 53 |
| `--rule` | `#e2ddd0` | `#2e2a25` | 54 |
| `--rule-strong` | `#8a8374` | `#757060` | 55 |
| `--accent` | `#a63a22` (oxblood) | `#d96c4f` (terracotta) | 56 |
| `--hover` | `rgba(166,58,34,.05)` | `rgba(217,108,79,.09)` | 57 |
| `--detail` | `rgba(166,58,34,.04)` | `rgba(217,108,79,.07)` | 58 |
| `--row-hover` | `#f2eee4` | `#251f19` | 59 |

Character: **warm** (every neutral is yellow-shifted; light `#f6f4ee` is bone/oat, dark `#131110` is a warm near-black). There are **no color scales** — no 50–900 ramps, no per-role tokens for success/warning/info, and **no data-visualization palette**.

## 2.2 Typography — 3 families, 7 fixed sizes, no fluid type

**Families** (`layout.tsx:8-28`):
- `--font-display`: **Newsreader** — serif, `axes: ["opsz"]`, normal + italic. Masthead wordmark, section headings, detail `h2`, Index cell, empty-state.
- `--font-ui`: **IBM Plex Sans** — 400/500/600/700 statics.
- `--font-mono`: **IBM Plex Mono** — 400/500/600/700 statics. Ranks, prices, benchmark scores, formulas, retrieval dates.

**Sizes** — 7 tokens, all fixed px, **zero `clamp()` in the file**:
`--type-11: 11px` · `--type-12: 12px` · `--type-14: 14px` · `--type-16: 16px` · `--type-20: 20px` · `--type-26: 26px` · `--type-34: 34px`

**Weights** — 4 tokens: 400 / 500 / 600 / 700.

**Line-heights** — untokenized and ad hoc: 1.05, 1.2, 1.25, 1.3, 1.4, 1.48, 1.5, 1.55, 1.6, 1.65, 1.7.

**Letter-spacing** — untokenized: `-0.015em`, `-0.01em`, `0`, `0.05em`, `0.055em`, `0.06em`, `0.08em`, `0.12em`.

The largest type on the site is the 34px wordmark. There is no display typography.

## 2.3 Spacing, radii, elevation

**Spacing** — 8 steps, 4px base, roughly doubling (lines 14-21):
`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64` px. Plus `--inset-optical: 2px` and `--control-height: 36px`.

**Radii** — exactly 3 (lines 22-24): `--radius-sm: 6px`, `--radius-lg: 12px`, `--radius-pill: 999px`.

**Elevation** — exactly 2 shadow tokens (lines 34-36):
```css
--shadow-overlay: 0 16px 36px rgba(28, 25, 23, 0.18);
--shadow-scroll-hint: 1px 0 0 var(--rule), 7px 0 12px -12px rgba(28, 25, 23, 0.6);
```
Both are used only for popovers and the sticky-column edge. `box-shadow` also appears as a *hairline separator* device on grid cells (`globals.css:1174-1176`, `1214-1216`): `1px 0 0 var(--rule), 0 1px 0 var(--rule)`. **No primary surface has depth.** The board is flat.

**Fixed column widths** (lines 29-33): rank 66 · model 250 · index 116 · benchmark 138 · price 140.

## 2.4 Layout patterns

- Single centered column: `.site-shell { width: min(100%, 1540px); padding: 32px 32px 64px }`
- Masthead: 2-column grid, **`border-bottom: 3px double var(--ink)`** (line 221) — the single most distinctive signature of the current design.
- Editorial rail grid, used by both the methodology sections and the footer: `grid-template-columns: minmax(150px, 0.4fr) minmax(0, 1.45fr)` with a 660px prose measure cap.
- Table: bounded scroll region, `max-height: min(72vh, 720px)`, `overflow: auto`, sticky `thead` (`top: 0; z-index: 20`) and sticky model column (`left: 0; z-index: 10`).
- Row height **56px** (line 873).
- Breakpoints: `1540px` (fluid table), `900px`, `560px`, plus `(pointer: coarse)` and `(prefers-reduced-motion)`.

## 2.5 Motion — the complete inventory

This is the entire animation surface of the product:

| What | Value | Line |
|---|---|---|
| Global interactive transition (`a, button, input, summary, label`) on `color`, `background-color`, `border-color`, `box-shadow`, `text-decoration-color` | **120ms `ease`** | 156-161 |
| Category tab underline `transform: scaleX()` | 160ms `ease` | 373 |
| Detail panel enter `@keyframes detail-panel-in` (opacity 0→1, translateY −4px→0) | 180ms `ease` | 1116-1131 |
| Sort indicator opacity | 120ms `ease` | 855 |
| Skip link transform | 120ms `ease` | 199 |
| `html { scroll-behavior: smooth }` | — | 91 |
| Reduced motion | everything → `0.01ms !important` | 1910-1922 |

**Totals: 3 durations (120 / 160 / 180ms). Exactly one easing function — `ease` — used 20 times. Zero `cubic-bezier()`. Zero `linear()`. One `@keyframes`. Zero springs, zero stagger, zero scroll-linked animation, zero layout animation, zero enter/exit choreography beyond a 4px nudge.**

## 2.6 Texture and materials — the null result

Measured across the full 1,923-line stylesheet:

| Technique | Occurrences |
|---|---|
| `gradient` (any) | **0** |
| `backdrop-filter` | **0** |
| `mix-blend-mode` | **0** |
| `filter` | **0** |
| noise / grain | **0** |
| `@layer` | **0** |
| `clamp()` | **0** |

Every surface is a flat fill separated by 1px hairlines. This is a deliberate print aesthetic, and it is the property the redesign can most cleanly invert.

## 2.7 UX audit of the citation flow

> **Evidence status.** Production is explicitly unmonitored (`README.md:71`) — there is no analytics, no session recording, no Search Console export, and no Core Web Vitals field data available in this repository. **Every claim in this section about visitor behavior is a hypothesis to validate, not a finding.** Structural facts (what the code does) are stated as facts; inferred effects are labelled `H#` and carry a validation method in §4.5.

**F1 — There is no value proposition above the board.** `app/page.tsx:21-53` renders masthead → leaderboard → footer. The differentiator — every number carries a source — appears only in the footer (`SiteFooter.tsx:16-27`) and on `/methodology`. A first-time visitor cannot distinguish this from any other leaderboard in the first screen.

**F2 — Provenance, the entire product thesis, is 100% hidden behind a click.** 456 scores each carry `source.url`, `source.retrieved`, and often `settings` (`schema.ts:57-72`). None of it renders on the table. The only in-table provenance signal is the `Vendor` badge on `selfReported` scores (`ScoreCell.tsx:36-41`) — and since every current score is independently measured by Artificial Analysis (`Methodology.tsx:110-113`), that badge is effectively never shown. *The board looks exactly like a board with no citations.*

**F3 — The Index is undefended at the point of use.** `Tooltip` is attached only to benchmark columns (`LeaderboardTable.tsx:201-208`). The Rank, Model, **Index**, and Price headers have none. A visitor sees `87.8` under a header that says `Index` with no unit, no scale, and no explanation without navigating to `/methodology`.

**F4 — "Insufficient data" is a dead end.** `LeaderboardTable.tsx:313-315` renders the literal string with no explanation of the 60% coverage gate and no link to the rule that produced it.

**F5 — The shareable-URL feature is invisible.** Fully implemented in `urlState.ts` + `Leaderboard.tsx:113-213`; zero UI surfaces it. Users must know to copy the address bar.

**F6 — Most visitors never see the whole board.** The table's `min-width` is `rank 66 + model 250 + index 116 + price 140 + 8 × 138` = **1,676px** (`globals.css:644-647`). Below the `1540px` breakpoint the columns stay fixed and the table scrolls horizontally behind a pinned model column. On a 1280px laptop roughly half the benchmark columns are off-screen; on a 390px phone the Overall tab is ~1,378px of sideways swiping (rank hidden, model 190, index 84 — `globals.css:1799-1808`).

**F7 — Nested scrolling.** `.table-scroll` is `max-height: min(72vh, 720px); overflow: auto` below 1540px, so the table scrolls *inside* a box while the page also scrolls, and the sticky header sticks to the inner box rather than the viewport.

**F8 — The row click target is ambiguous and asymmetric.** The whole `<tr>` carries `onClick` (`LeaderboardTable.tsx:252`) plus `cursor: pointer` (`globals.css:875`), while a nested `<button class="model-trigger">` calls `stopPropagation` (`LeaderboardTable.tsx:281-284`). Consequences: clicking a price or a score expands the row; text inside a row cannot be selected without triggering expansion; and the mouse affordance (whole row) has no keyboard equivalent (only the inner button is focusable).

**F9 — Freshness, the credibility signal for a leaderboard, is the smallest and lightest text on the page.** The dateline renders at `--type-12` in `--ink-muted`, right-aligned in the masthead (`globals.css:258-268`, `page.tsx:41-48`).

**F10 — The empty state offers no recovery action.** `LeaderboardTable.tsx:230-237` shows two lines of copy; the "Clear filters" button lives back up in the filter bar (`FilterBar.tsx:146-150`).

**F11 — Documentation/implementation drift: there is no magnitude encoding at all.** `PLAN.md:92` mandates a per-score bar, and the 2026-07-22 decision-log entry (`PLAN.md:215`) records it moving from 3px to 4px. Commit `831fa6c` deleted `.score-bar` / `.score-bar-fill` from both `ScoreCell.tsx` and `globals.css`; a grep for `score-bar` in the current stylesheet returns nothing. **456 numbers currently ship with zero visual encoding**, and the spec still says otherwise.

## 2.8 Accessibility baseline — measured

Contrast ratios computed from the exact token values (sRGB relative luminance, WCAG 2.x formula):

| Pair | Light | Dark | AA needed | Verdict |
|---|---|---|---|---|
| `--ink` on `--surface` | 17.04 | 15.12 | 4.5 | ✅ |
| `--ink-secondary` on `--surface` | 7.46 | 6.49 | 4.5 | ✅ |
| `--ink-muted` on `--surface` | 5.34 | 5.31 | 4.5 | ✅ |
| `--ink-muted` on `--row-hover` | 4.73 | 4.89 | 4.5 | ✅ (thin margin) |
| `--accent` on `--surface` | 6.29 | 5.23 | 4.5 | ✅ |
| `--rule-strong` on `--page` | 3.42 | 3.80 | 3.0 (1.4.11) | ✅ |
| `--rule` on `--page` | 1.23 | 1.32 | 3.0 if load-bearing | ⚠️ see below |
| Focus ring `--accent` on `--page` | 5.88 | 5.57 | 3.0 | ✅ |

**The color system passes AA.** That is a genuine strength and the redesign must not regress it.

Real issues, all traced to code:

- **A1 — Header control borders are 1.23:1.** `.header-actions > a` and `.theme-toggle` use `border: 1px solid var(--rule)` (`globals.css:286`). Not a strict 1.4.11 failure — the text label and the toggle's icon (at `--ink-secondary`, 7.46:1) carry identification — but the boundary is decorative-only, and the pattern breaks the moment a control loses its label.
- **A2 — Category tabs are the wrong widget.** `CategoryTabs.tsx:24,31` uses `role="group"` + `aria-pressed` on five mutually exclusive buttons. Functional and announced, but it produces 5 separate tab stops with no arrow-key navigation, where a `tablist`/`tab` with roving `tabindex` would produce 1.
- **A3 — The hover tooltip is announced as a dialog.** `Tooltip.tsx:74,86` sets `aria-haspopup="dialog"` and `role="dialog"` on a popup that opens on `mouseenter` (`Tooltip.tsx:55`). WCAG 1.4.13 is satisfied (dismissible via Escape at `:36-40`, hoverable via the `activeElement` check at `:57-59`), but a hover-opened dialog is incorrect semantics and will be read as a modal by some screen readers.
- **A4 — Focus rings can be clipped.** `:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }` (`globals.css:168-171`) on elements inside `.table-scroll { overflow: auto }` — a focused control near the container edge loses part of its 3px-offset ring.
- **A5 — Touch targets are only partly covered.** The `(pointer: coarse)` halo (`globals.css:1890-1908`) covers header links, the theme toggle, and tooltip triggers. It does **not** cover `.category-tab` (36px), `.provider-menu label` (36px), `.clear-filters` (36px), `.model-trigger` (**24px**), or `.sort-button` (**24px** — the most-used control on the page). WCAG 2.5.5 is AAA in 2.1 so this is not a stated-target failure, but 24px is well under any usable touch minimum.
- **A6 — Row expansion is mouse-only as an affordance.** See F8. Functionality is reachable by keyboard through `.model-trigger`; the row-wide click target is not.

Genuine strengths to carry forward: real `<table>` semantics with `aria-sort` (`LeaderboardTable.tsx:74-80`), an `aria-live` sort announcement (`Leaderboard.tsx:269-271`), a live result count (`FilterBar.tsx:142`), `tabIndex={0}` on the scroll region with `aria-describedby` (`LeaderboardTable.tsx:144-149`), Escape/outside-click handling in both popovers, skip links on both routes, screen-reader annotations on every external link, and a designed (not inverted) dark mode.

## 2.9 Performance baseline — measured from `out/`

| Asset | Raw | Gzip | Note |
|---|---|---|---|
| `out/index.html` | 392,202 B | 28,433 B | 37.4% of the 1 MiB CI budget |
| `out/methodology.html` | 43,667 B | — | |
| `out/index.txt` (RSC payload) | — | — | audit measured ~233 KB at 61 models; ships **in addition** to the HTML |
| CSS `b69c290…css` | 30,390 B | 5,990 B | globals.css via `layout.tsx` |
| CSS `efa93c2…css` | 15,916 B | 1,388 B | second copy via `global-error.tsx:5` |
| JS (all chunks) | ~805,000 B | — | framework 182,716 · chunk-255 173,762 · chunk-4bd1b696 173,019 · main 128,228 · polyfills 112,594 (legacy-only) · app/page 22,645 |
| **Fonts** | **~980 KB across 32 `.woff2`** | — | **7 preloaded on `/`** |

The dominant, and most fixable, asset cost is **three font families in static weights** — Newsreader (opsz variable + italic), IBM Plex Sans ×4, IBM Plex Mono ×4.

Client compute is negligible: 62 rows × 8 benchmarks, `bestScores` memoized over 496 cells (`Leaderboard.tsx:40-54`), filter+sort per keystroke on 62 rows.

## 2.10 Summary of the fingerprint

> Warm bone paper (`#f6f4ee`) and oxblood (`#a63a22`) · serif + humanist-sans + mono trio · 7 fixed type sizes topping out at 34px · 4px spacing scale, 3 radii, 2 shadows · flat surfaces with 1px hairlines, no gradient/grain/glass anywhere · a 3px double rule under the masthead · 56px rows in a bounded scroll box · one easing (`ease`) at three durations, color-only, 120ms.

---

# Phase 3 — Three art directions

## Direction A — **Observatory**

**Thesis.** The board becomes a scientific instrument read in a dark room. A cold graphite ground carries a single luminous signal hue; numbers are the largest objects on the page and magnitude is encoded as *light level*, not length. Surfaces are lifted by a specular top edge and an ambient shadow rather than separated by rules. Type is an industrial grotesk with a live width axis — headers compress instead of truncating — paired with a technical mono that carries every number. Where Printed Index says *"this was set in type,"* Observatory says *"this was measured."*

**Emotional register.** Precise, cool, nocturnal, high-signal. A trading terminal with taste.

**Signature elements**
1. **Luminance ramp as magnitude.** Each score cell carries a 2px baseline rule whose alpha maps to the value's percentile within its column — one hue, encoded once, with the numeral always printed above it.
2. **Specular material.** Every raised surface: `inset 0 1px 0 rgba(255,255,255,.055)` + a two-part ambient/contact shadow. Depth comes from light, not from borders.
3. **The readout.** The #1 model's Index rendered as a `clamp(64px, 10vw + 8px, 156px)` tabular numeral — the largest thing on the site by 4×, where the current design's largest object is a 34px wordmark.
4. **Atmosphere.** A single radial ground gradient plus a 3.5%-opacity SVG grain — the only two non-flat surfaces in the system, and both absent from the current design.
5. **Compression on scroll.** The masthead collapses into a sticky command bar driven by `animation-timeline: scroll()` — zero JS, pure progressive enhancement.

**Why it converts for "become the cited reference."** The citation loop is *screenshot → post → click through*. The audience (developers, researchers, model-selection buyers) works in dark tooling, and a dark, high-contrast, numeral-forward board is the one that survives being pasted into a dark-mode doc, a Slack thread, or an X post. `H-A` — to validate per §4.5.

**Divergence check vs §2.10:** temperature warm→cold ✅ · luminance paper-first→dark-first ✅ · type serif+humanist→grotesk+technical-mono ✅ · depth hairline→light ✅ · texture none→gradient+grain ✅ · motion color-only→spring-physics ✅ · display type 34px→156px ✅. **No shared axis.**

## Direction B — **Ledger Machine**

**Thesis.** Lean into the machine that produced the data. Everything monospaced on a strict character grid; the page is a printout that happens to be interactive. Color is near-absent — one phosphor accent on cold near-black — and hierarchy comes from density, rule weight, and inversion (white-on-ink blocks) rather than size. Radii are 0 everywhere. Full-bleed, edge to edge.

**Emotional register.** Austere, technical, uncompromising, faintly punk.

**Signature elements:** character-cell alignment on a fixed `1ch` grid · inverted header blocks · ASCII-derived sparklines (`▁▂▃▄▅▆▇`) as the magnitude encoding · zero radii · full-bleed with no centered rail · a `/raw` view that serves the board as fixed-width plain text.

**Why it might convert.** Maximum credibility with the exact audience; extremely memorable; the `/raw` view is a genuinely novel citation artifact.

**Divergence check:** type serif-trio→all-mono ✅ · radii 6/12/999→0 ✅ · layout centered-1540→full-bleed ✅ · palette warm→cold near-black ✅. Passes, **but** an austere mono-on-near-black system shares the current design's core move — *restraint expressed as flat surfaces plus rules* — more than the surface values suggest. **Risks:** monospace destroys the methodology prose (`Methodology.tsx` is ~1,100 words of explanation that is load-bearing for trust); the terminal aesthetic is heavily trodden in developer tools, so it reads as a genre rather than an identity; and it actively repels the non-technical half of the audience (journalists, PMs) who are the ones most likely to *cite* rather than merely read.

## Direction C — **Atlas**

**Thesis.** Stop presenting a table and present a *terrain*. Models occupy a coordinate space — capability × price, capability × recency — and the table is one projection of it. The language is cartographic: contour hairlines, plate tones, map-key legends, leader-line labels with collision avoidance, and motion that behaves like a camera (pan, zoom, shared-element transitions between projections).

**Emotional register.** Exploratory, spatial, generous, quietly beautiful.

**Signature elements:** a price-vs-Index scatter as the hero · contour-line texture on the ground plane · a map-key legend component · leader-line labels · a projection switcher (table ⇄ plot) with a shared-element transition · a cool graphite-blue ground (pushed away from the oat/paper neutral the cartographic reference would naturally suggest).

**Why it might convert.** A good scatter plot travels further than a table, and `PLAN.md:181` already names the price-vs-performance scatter as the #1 v2 candidate.

**Divergence check:** layout page→map ✅ · palette warm-oxblood→cool graphite-blue ✅ (only after deliberately rejecting the natural oat ground, which would have landed within 3% luminance of the current `--page`) · motion still→camera ✅. **Risks:** the identity is bet on a feature that doesn't exist yet, so nothing ships until the scatter ships; cartographic texture actively fights a dense data table; and label collision avoidance for 62 points is a real algorithmic problem with a zero-dependency budget.

## Recommendation: **Direction A — Observatory**, absorbing Atlas's scatter as a feature rather than an identity.

1. **It diverges on every axis at once.** B shares the current design's flat-surface-plus-rules DNA; C's divergence depends on a deliberate palette override against its own reference. A inverts temperature, luminance, type voice, depth model, texture, motion, and display scale simultaneously.
2. **It matches the confirmed conversion goal.** Dark, numeral-forward, high-contrast screenshots are the ones that travel in the channels where a leaderboard gets cited. (`H-A`, validated per §4.5.)
3. **It fixes the worst existing defect for free.** F11 — the board has *no* magnitude encoding today. Observatory's luminance ramp restores it as a native property of the direction rather than a bolted-on bar.
4. **It is achievable inside every constraint.** Gradients, grain (a CSP-legal `data:` SVG), specular shadows, spring motion via `linear()`, and scroll-linked compression are all pure CSS. No dependency, no build change, and the font payload *drops* (§4.7).
5. **It preserves what works.** The `light-dark()` + `data-theme` architecture, the `ThemeToggle` contract, real table semantics, and the AA-passing contrast discipline all survive — Observatory ships a *designed* light theme (cold porcelain), not a dark-only site.

The scatter from Atlas lands in Stage 7 as a second projection, where it is a feature that can slip without blocking the identity.

---

# Phase 4 — The Observatory specification

## 4.1 Design system — complete token set

### File architecture

Replace the single 1,923-line `globals.css` with cascade layers across six files. This permanently removes specificity fights and makes the token layer independently reviewable.

```
src/styles/
  index.css        @layer tokens, base, layout, components, projections, utilities;
                   @import "./tokens.css"      layer(tokens);
                   @import "./base.css"        layer(base);
                   @import "./layout.css"      layer(layout);
                   @import "./components.css"  layer(components);
                   @import "./projections.css" layer(projections);
                   @import "./utilities.css"   layer(utilities);
```
`src/app/globals.css` becomes a one-line `@import "../styles/index.css";` so `layout.tsx:6` and `global-error.tsx:5` are untouched.

### Color

**Fallback strategy.** Observatory is dark-first, so the static fallback inverts relative to today: declare **dark** values statically, then override with `light-dark()`. Pre-2024 browsers (no `light-dark()` support) degrade to a permanent dark theme, matching the design's default.

```css
:root {
  color-scheme: dark light;

  /* ---- static dark fallback (pre-light-dark() browsers) ---- */
  --bg-void:   #07080A;  --bg-base:    #0B0D10;  --bg-raised: #101317;
  --bg-overlay:#161A1F;  --bg-inset:   #08090C;
  --bg-hover:  #171B21;  --bg-active:  #1D222A;
  --fg-primary:#E8ECF2;  --fg-secondary:#A3ADBB; --fg-tertiary:#79838F;
  --fg-disabled:#4A525D;
  --line-subtle:#1A1E24; --line:#232830; --line-interactive:#616B78; --line-strong:#3A424D;
  --signal-300:#8CC7FF;  --signal-500:#4DA3FF;  --signal-600:#2E8AF0;
  --signal-glow: rgba(77,163,255,0.35);
  --warn:#E2A03F;        --pos:#4FBF8B;

  /* ---- single-sourced dual theme ---- */
  --bg-void:        light-dark(#E9EDF3, #07080A);
  --bg-base:        light-dark(#F4F6F9, #0B0D10);
  --bg-raised:      light-dark(#FFFFFF, #101317);
  --bg-overlay:     light-dark(#FFFFFF, #161A1F);
  --bg-inset:       light-dark(#EAEEF3, #08090C);
  --bg-hover:       light-dark(#EDF1F6, #171B21);
  --bg-active:      light-dark(#E2E8F0, #1D222A);
  --fg-primary:     light-dark(#0D1117, #E8ECF2);
  --fg-secondary:   light-dark(#454F5B, #A3ADBB);
  --fg-tertiary:    light-dark(#616C7A, #79838F);
  --fg-disabled:    light-dark(#98A2AF, #4A525D);
  --line-subtle:    light-dark(#EBEEF3, #1A1E24);
  --line:           light-dark(#D5DBE3, #232830);
  --line-interactive: light-dark(#7A8492, #616B78);
  --line-strong:    light-dark(#9AA4B2, #3A424D);
  --signal-300:     light-dark(#4DA3FF, #8CC7FF);
  --signal-500:     light-dark(#0A66C2, #4DA3FF);
  --signal-600:     light-dark(#08528F, #2E8AF0);
  --signal-glow:    light-dark(rgba(10,102,194,0.22), rgba(77,163,255,0.35));
  --warn:           light-dark(#8A5A00, #E2A03F);
  --pos:            light-dark(#0E7A4F, #4FBF8B);
}
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"]  { color-scheme: dark;  }
```

**Semantic role map** (roles are indirections onto the ramp, so a hue change is a one-line edit):

| Role | Token | Applied to |
|---|---|---|
| Page ground | `--bg-base` | `<body>` |
| Data surface | `--bg-raised` | table, cards, popovers |
| Recessed well | `--bg-inset` | search field, code, formula blocks |
| Primary text | `--fg-primary` | model names, scores, headings |
| Supporting text | `--fg-secondary` | descriptions, prose, labels |
| Metadata | `--fg-tertiary` | lab name, dates, counts |
| Divider (decorative) | `--line` | row separators, section rules |
| Control boundary | `--line-interactive` | any border that identifies a control |
| Signal / focus / active | `--signal-500` | focus ring, active tab, best marker, links |
| Magnitude ramp | `--score-1…5` | score baseline rules (below) |
| Caution | `--warn` | estimated values, self-reported marker |
| Confirmed | `--pos` | copy-success, verified state |

**Magnitude ramp** — the signal hue composited over `--bg-raised` at five fixed alphas. Contrast against the surface rises monotonically, so the ramp is legible as *light level*, and the numeral is always printed above it (never color-alone):

| Step | Percentile | Dark (α over `#101317`) | Light (α over `#FFFFFF`) |
|---|---|---|---|
| `--score-1` | 0–20 | `#16212E` (0.10) | `#E2EDF8` (0.12) |
| `--score-2` | 20–40 | `#1C3045` (0.20) | `#C4DAF0` (0.24) |
| `--score-3` | 40–60 | `#254466` (0.34) | `#9DC2E7` (0.40) |
| `--score-4` | 60–80 | `#305E90` (0.52) | `#6CA3DA` (0.60) |
| `--score-5` | 80–100 | `#4083CC` (0.78) | `#2F7DCB` (0.85) |

One hue, five luminance steps — satisfying `PLAN.md:103` ("one sequential hue for magnitude") and CVD-safe by construction, since the encoding is luminance rather than hue.

### Typography

**Families.** Two variable faces, both `latin` subset, both via `next/font/google` (verified present in the registry with the required axes):

```ts
// src/app/layout.tsx
const ui = Archivo({          // wght 100–900, wdth 62–125
  subsets: ["latin"], axes: ["wdth"], variable: "--font-ui", display: "swap",
});
const data = Geist_Mono({     // wght 100–900
  subsets: ["latin"], variable: "--font-data", display: "swap",
});
```
Newsreader, IBM Plex Sans, and IBM Plex Mono are removed. Archivo's **width axis** is a working tool, not decoration: benchmark column headers set at `wdth 84` fit `Terminal-Bench v2.1` in 108px without truncation, which is what makes the narrower table in §4.6 possible.

**Scale** — 8 fixed steps + 3 fluid:

| Token | Size | line-height | letter-spacing | Use |
|---|---|---|---|---|
| `--t-10` | 10px | 1.4 | 0.09em | axis ticks, legends |
| `--t-11` | 11px | 1.45 | 0.05em | badges, table meta |
| `--t-12` | 12px | 1.5 | 0.015em | secondary UI, captions |
| `--t-13` | 13px | 1.55 | 0.005em | **table cells, all controls** |
| `--t-15` | 15px | 1.6 | 0 | prose body |
| `--t-17` | 17px | 1.65 | −0.008em | lead prose |
| `--t-21` | 21px | 1.35 | −0.018em | h4, model name in detail |
| `--t-27` | 27px | 1.22 | −0.024em | h3 |
| `--t-h2` | `clamp(30px, 1.6vw + 20px, 42px)` | 1.12 | −0.03em | section headings |
| `--t-h1` | `clamp(40px, 4.2vw + 18px, 78px)` | 1.0 | −0.038em | page titles |
| `--t-readout` | `clamp(64px, 10vw + 8px, 156px)` | 0.86 | −0.05em | the Index hero numeral |

**Weights** — optically compensated, not flat. Large type takes *less* weight; small type takes more:
```css
--w-text: 400;  --w-medium: 480;  --w-strong: 580;  --w-bold: 680;  --w-display: 300;
```
**Widths** — `--wd-condensed: 84` · `--wd-normal: 100` · `--wd-wide: 112`.

**Numeric discipline** (carried forward from `PLAN.md:104`): every number uses `--font-data` with `font-variant-numeric: tabular-nums`; scores, Index, and prices render to one decimal; units live in headers and tooltips, never in cells.

### Spacing — 13 steps

```css
--s-1: 2px;  --s-2: 4px;  --s-3: 6px;   --s-4: 8px;   --s-5: 12px;
--s-6: 16px; --s-7: 20px; --s-8: 28px;  --s-9: 40px;  --s-10: 56px;
--s-11: 80px; --s-12: 112px; --s-13: 160px;
```
Layout rails: `--rail-max: 1680px` · `--gutter: clamp(16px, 3vw, 56px)` · `--measure: 68ch`.

### Radii

```css
--r-1: 3px;  --r-2: 5px;  --r-3: 8px;  --r-4: 14px;  --r-5: 22px;  --r-full: 999px;
```
Progressive enhancement — continuous corners where supported, with no fallback cost:
```css
@supports (corner-shape: squircle) {
  .surface, .popover, .chip { corner-shape: squircle; }
}
```

### Elevation and lighting

Six levels. Each combines a specular inner edge (top in dark, top in light too — light comes from above in both themes), a contact shadow, and an ambient shadow.

```css
/* dark */
--e-0: none;
--e-1: inset 0 1px 0 rgba(255,255,255,.045), 0 1px 1px rgba(0,0,0,.50);
--e-2: inset 0 1px 0 rgba(255,255,255,.055), 0 1px 2px rgba(0,0,0,.55), 0 4px 10px -4px rgba(0,0,0,.50);
--e-3: inset 0 1px 0 rgba(255,255,255,.060), 0 2px 4px rgba(0,0,0,.50), 0 10px 24px -8px rgba(0,0,0,.55);
--e-4: inset 0 1px 0 rgba(255,255,255,.070), 0 4px 8px rgba(0,0,0,.50), 0 18px 40px -12px rgba(0,0,0,.65);
--e-5: inset 0 1px 0 rgba(255,255,255,.080), 0 8px 16px rgba(0,0,0,.50), 0 32px 72px -16px rgba(0,0,0,.70);

/* light overrides */
--e-1: inset 0 1px 0 rgba(255,255,255,.90), 0 1px 1px rgba(13,17,23,.05);
--e-2: inset 0 1px 0 rgba(255,255,255,.90), 0 1px 2px rgba(13,17,23,.06), 0 4px 10px -4px rgba(13,17,23,.08);
--e-3: inset 0 1px 0 rgba(255,255,255,.90), 0 2px 4px rgba(13,17,23,.06), 0 10px 24px -8px rgba(13,17,23,.10);
--e-4: inset 0 1px 0 rgba(255,255,255,.90), 0 4px 8px rgba(13,17,23,.07), 0 18px 40px -12px rgba(13,17,23,.12);
--e-5: inset 0 1px 0 rgba(255,255,255,.90), 0 8px 16px rgba(13,17,23,.08), 0 32px 72px -16px rgba(13,17,23,.16);

--ring: 0 0 0 2px var(--bg-base), 0 0 0 4px var(--signal-500);
--ring-glow: 0 0 0 2px var(--bg-base), 0 0 0 4px var(--signal-500), 0 0 16px var(--signal-glow);
```

**Assignment:** `--e-0` table rows · `--e-1` chips, inline score wells · `--e-2` the board surface and cards · `--e-3` sticky header and command bar · `--e-4` popovers, menus, tooltips · `--e-5` the command palette.

## 4.2 Texture and materials — implementable recipes

**M1 — Atmospheric ground.** The only full-page gradient. Fixed attachment so it does not repaint on scroll. `light-dark()` is valid inside gradient stops, so both themes live in one declaration — no duplicated rule, no media query:
```css
:root {
  --ground-1: light-dark(#FFFFFF, #131A24);
  --ground-2: light-dark(#F4F6F9, #0B0D10);
  --ground-3: light-dark(#E9EDF3, #07080A);
}
body {
  background:
    radial-gradient(120% 78% at 50% -12%,
      var(--ground-1) 0%, var(--ground-2) 52%, var(--ground-3) 100%) fixed;
}
```
The static pre-`light-dark()` fallback follows the same pattern as the palette in §4.1: declare the dark hex values first, then the `light-dark()` versions.

**M2 — Grain.** A 379-byte `data:` SVG, CSP-legal under `img-src 'self' data:`. No blend mode — a fixed low-opacity layer, which avoids forcing the page into a single blending group.
```css
body::before {
  content: ""; position: fixed; inset: 0; z-index: 1; pointer-events: none;
  opacity: 0.035; /* light theme: 0.022 */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch' seed='7'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)'/%3E%3C/svg%3E");
  background-repeat: repeat;
}
```
*Budget note:* `feTurbulence` rasterizes once, ~5–15 ms on a low-end device. If it shows up in the paint profile, swap for a pre-rendered 128×128 PNG (≈4 KB) — visually identical, zero filter cost.

**M3 — Specular surface.** Every raised plane:
```css
.surface {
  background: var(--bg-raised);
  border: 1px solid var(--line-subtle);
  border-radius: var(--r-4);
  box-shadow: var(--e-2);
}
```

**M4 — Fading rules.** Row separators are gradients, not solid hairlines — they dissolve at the edges so the table reads as a field rather than a grid:
```css
.board tbody tr:not(:last-child) > * {
  background-image: linear-gradient(90deg, transparent 0%, var(--line) 4%, var(--line) 96%, transparent 100%);
  background-size: 100% 1px; background-position: 0 100%; background-repeat: no-repeat;
}
```

**M5 — Glass command bar.** The sticky header, with an opaque fallback:
```css
.command-bar {
  background: color-mix(in srgb, var(--bg-raised) 78%, transparent);
  box-shadow: var(--e-3);
}
@supports (backdrop-filter: blur(1px)) {
  .command-bar { backdrop-filter: blur(14px) saturate(150%); }
}
@supports not (backdrop-filter: blur(1px)) {
  .command-bar { background: var(--bg-raised); }
}
```
*Budget:* at most **two** `backdrop-filter` elements composited at once (command bar + one open popover). Never animate `backdrop-filter`.

**M6 — Signal bloom.** Behind the readout numeral only:
```css
.readout::before {
  content: ""; position: absolute; inset: -20% -10%; z-index: -1;
  background: radial-gradient(closest-side, var(--signal-glow), transparent 70%);
  filter: blur(48px); opacity: .55;
}
```

**M7 — The score baseline.** The magnitude encoding (replacing the deleted bar, F11):
```css
.score { position: relative; }
.score::after {
  content: ""; position: absolute; left: var(--s-2); right: var(--s-2); bottom: 5px;
  height: 2px; border-radius: 1px;
  background: var(--score-step);           /* --score-1…5, set per cell */
  transform: scaleX(var(--score-fill));    /* 0–1, = value/100 */
  transform-origin: right center;          /* grows from the right, under the right-aligned numeral */
}
```
Two encodings of one hue — length *and* luminance — with the numeral always printed. `--score-step` and `--score-fill` are set as inline custom properties from `ScoreCell.tsx`.

## 4.3 Motion and physics

**Runtime: none.** Springs are solved offline as mass-spring-damper systems (x(0)=0, v(0)=0, target 1) and compiled to CSS `linear()` stops. The parameters below are the *source of truth*; the `linear()` strings are their compiled output, generated at a 0.5% settle threshold with a 12 ms stability window.

### Spring classes

```css
:root {
  /* snap — stiffness 945, damping 55.3, mass 1 → ζ 0.90, 190ms, no overshoot */
  --dur-snap: 190ms;
  --ease-snap: linear(0, 0.0598, 0.1903, 0.342, 0.488, 0.6154, 0.72, 0.8021,
    0.8641, 0.9095, 0.9418, 0.964, 0.979, 0.9887, 0.9947, 1);

  /* glide — stiffness 214, damping 25.2, mass 1 → ζ 0.86, 340ms */
  --dur-glide: 340ms;
  --ease-glide: linear(0, 0.0246, 0.0859, 0.1688, 0.2621, 0.3581, 0.4515, 0.5387,
    0.618, 0.6882, 0.7492, 0.8013, 0.8451, 0.8813, 0.9108, 0.9345, 0.9533,
    0.9679, 0.9791, 0.9875, 0.9936, 1);

  /* settle — stiffness 184, damping 27.1, mass 1 → ζ 1.00 (critically damped), 560ms */
  --dur-settle: 560ms;
  --ease-settle: linear(0, 0.0376, 0.1238, 0.2307, 0.3416, 0.4471, 0.5424, 0.6257,
    0.6968, 0.7563, 0.8054, 0.8455, 0.878, 0.904, 0.9248, 0.9413, 0.9543,
    0.9645, 0.9725, 0.9788, 0.9836, 0.9874, 0.9903, 0.9926, 0.9943, 1);

  /* bounce — stiffness 175, damping 14.6, mass 1 → ζ 0.55, 480ms, +12.5% overshoot */
  --dur-bounce: 480ms;
  --ease-bounce: linear(0, 0.0221, 0.081, 0.1664, 0.2688, 0.3803, 0.4941, 0.605,
    0.7089, 0.8028, 0.885, 0.9543, 1.0107, 1.0545, 1.0866, 1.1081, 1.1204,
    1.125, 1.1232, 1.1166, 1.1065, 1.094, 1.0802, 1.0659, 1.0519, 1.0387,
    1.0267, 1.0162, 1.0072, 1);

  /* non-spring easings */
  --ease-out-quart:  cubic-bezier(0.165, 0.84, 0.44, 1);
  --ease-out-expo:   cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out-quint: cubic-bezier(0.86, 0, 0.07, 1);
  --dur-instant: 90ms;
  --dur-ambient: 4000ms;
}
```
`linear()` is Baseline 2024 (Chrome 113+, Safari 17.2+, Firefox 112+). Older browsers fall back automatically because an unparsable `linear()` invalidates the declaration and the shorthand's earlier `cubic-bezier` value wins:
```css
.panel { transition: transform var(--dur-glide) var(--ease-out-quart); }  /* fallback */
.panel { transition: transform var(--dur-glide) var(--ease-glide); }      /* enhanced */
```

### Interaction classes

| Class | Duration | Easing | Properties | Examples |
|---|---|---|---|---|
| **Instant feedback** | 90ms | `--ease-out-quart` | `color`, `background-color`, `opacity` | hover tint, focus ring, link underline |
| **State change** | 190ms | `--ease-snap` | `transform`, `opacity` | sort direction flip, tab switch, checkbox, theme toggle icon |
| **Reveal** | 340ms | `--ease-glide` | `transform`, `opacity`, `clip-path` | row expand, tooltip, provider menu, toast |
| **Transform** | 560ms | `--ease-settle` | `transform`, `opacity` | projection switch (table ⇄ profile ⇄ plot), route transition |
| **Confirm** | 480ms | `--ease-bounce` | `transform` | copy-link success, added-to-compare |
| **Ambient** | 4000ms | `linear`, infinite | `opacity`, `transform` | readout bloom pulse, live-dot |

### Orchestration

**Stagger.** Children enter on an index-derived delay, capped so a 62-row table never takes 1.7 s to appear:
```css
.stagger > * {
  animation: enter var(--dur-glide) var(--ease-glide) backwards;
  animation-delay: calc(min(var(--i, 0), 11) * 28ms);   /* cap: 12 items = 308ms */
}
@keyframes enter { from { opacity: 0; transform: translateY(6px); } }
```
`--i` is set inline from the map index in `LeaderboardTable.tsx`. Rows past index 11 appear with no delay.

**Scroll-linked** (pure CSS, pure enhancement — no JS, no-op where unsupported):
```css
@supports (animation-timeline: scroll()) {
  .masthead {
    animation: compress linear both;
    animation-timeline: scroll(root block);
    animation-range: 0 240px;
  }
  @keyframes compress {
    to { --readout-scale: 0.38; opacity: 0.999; transform: translateY(-8px); }
  }
  .board-row { animation: settle-in linear both; animation-timeline: view(); animation-range: entry 0% entry 40%; }
}
```
Used for exactly three things: masthead → command-bar compression, the readout's parallax, and a 2px scroll-progress rail on the left edge. Firefox and older Safari simply get the resting state.

**View transitions** for the projection switch, also pure enhancement:
```css
@supports (view-transition-name: none) {
  ::view-transition-group(board) { animation-duration: var(--dur-settle); animation-timing-function: var(--ease-settle); }
}
```

### Reduced motion — designed, not disabled

Replaces today's blanket `*{transition-duration:.01ms!important}` (`globals.css:1910-1922`), which removes even the feedback that helps comprehension:
```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-snap: 90ms; --dur-glide: 120ms; --dur-settle: 120ms;
    --dur-bounce: 0ms; --dur-ambient: 0ms;
    --ease-snap: linear; --ease-glide: linear; --ease-settle: linear;
  }
  html { scroll-behavior: auto; }
  .stagger > * { animation-delay: 0ms !important; }
  *, *::before, *::after { animation-timeline: none !important; }   /* kills scroll-linked + parallax */
  .readout::before, .live-dot { animation: none !important; }        /* kills ambient loops */
  /* Opacity and color transitions survive at 90–120ms: state changes stay legible. */
}
```

### Frame budget (binding rules)

1. Only `transform`, `opacity`, and `filter` are ever animated. **`box-shadow` is never animated** — elevation changes animate the `opacity` of an `::after` pseudo-element that carries the shadow.
2. No `width`/`height`/`top`/`left` animation anywhere.
3. `will-change` is applied only on `:hover`/`:focus-within` intent, never at rest.
4. Row-expand animates `grid-template-rows: 0fr → 1fr` plus opacity — no `height: auto` measurement, no layout thrash.
5. At most 2 concurrent `backdrop-filter` elements.

## 4.4 Micro-interaction matrix

`ring` = `box-shadow: var(--ring)`. All timings from §4.3.

| Class | Rest | Hover | Press | Focus-visible | Selected / Active | Loading | Disabled | Success | Error |
|---|---|---|---|---|---|---|---|---|---|
| **Primary action** | `--bg-active`, `--fg-primary`, `--e-1`, `--r-2` | bg → `--bg-hover`, 90ms | `scale(.975)`, `--dur-snap` | `ring` + `--ring-glow`, 90ms | — | label swaps for a 3-dot pulse (`--dur-ambient`), width locked | `--fg-disabled`, `--e-0`, `cursor: not-allowed` | icon morphs to check, `--ease-bounce` | `--warn` border 1px + 2px shake (`translateX ±2px`, `--dur-snap`) |
| **Ghost / secondary** | transparent, `--fg-secondary`, 1px `--line-interactive` | `--fg-primary`, border → `--signal-600` | `scale(.98)` | `ring` | — | as above | `--fg-disabled` | — | — |
| **Icon button** (theme toggle, tooltip trigger) | 32×32, `--r-2`, `--fg-tertiary` | bg `--bg-hover`, `--fg-primary` | `scale(.92)`, `--dur-snap` | `ring` | `--signal-500` | — | — | icon cross-fades + `rotate(180deg)`, `--dur-snap` | — |
| **Category tab** | `--fg-secondary`, `--t-13`, `--w-medium` | `--fg-primary`, bg `--bg-hover` | `scale(.985)` | `ring` inset | `--fg-primary`, `--w-strong`; 2px `--signal-500` underline that **slides** between tabs via a shared `::after` on the tablist (`translateX` + `scaleX`, `--dur-snap`) | — | — | — | — |
| **Text input** (search) | `--bg-inset`, 1px `--line-interactive`, `--r-2` | border `--line-strong` | — | border `--signal-500` + `ring`, 90ms | has value: clear "×" fades in, 90ms | trailing spinner | — | — | 1px `--warn` + helper text |
| **Checkbox** | 15px, 1px `--line-interactive`, `--r-1` | border `--signal-600` | `scale(.9)` | `ring` | fill `--signal-500`; checkmark draws via `stroke-dashoffset` 16→0, `--dur-snap` | — | `--fg-disabled` | — | — |
| **Disclosure / menu** | summary as ghost button | as ghost | — | `ring` | chevron `rotate(180deg)` `--dur-snap`; panel: `opacity 0→1` + `translateY(-6px)→0` + `scale(.98)→1`, `--dur-glide`; items stagger 28ms ×8 | — | — | — | — |
| **Sort header** | `--fg-tertiary`, `--t-11`, `wdth 84`, uppercase 0.05em; arrow at `opacity: 0` | `--fg-secondary`; arrow `opacity: .5`, 90ms | `translateY(1px)` | `ring` inset; arrow `opacity: 1` | `--fg-primary`, arrow `opacity: 1` `--signal-500`; direction flip = `rotateX(180deg)`, `--dur-snap`; column tinted `--bg-hover` | — | — | — | — |
| **Table row** | `--e-0` | bg `--bg-hover`, 90ms; a 2px `--signal-500` left rail scales in (`scaleY 0→1`, `--dur-snap`); disclosure chevron `--fg-primary` | `scale(.998)` on the row's inner wrapper | `ring` inset on the focusable cell | expanded: bg `--bg-active`, rail persists, chevron `rotate(90deg)`, panel opens `grid-template-rows: 0fr→1fr` + opacity, `--dur-glide` | skeleton shimmer, `--dur-ambient` | — | — | — |
| **Score cell** | numeral `--fg-primary`; baseline rule at `--score-N` | baseline `scaleY(1.5)` (2→3px), `--dur-snap`; source chip fades in at 90ms | — | `ring` inset; chip pinned open | best-in-column: `--w-bold` + 4px `--signal-500` dot | — | missing: `—` at `--fg-tertiary` | — | — |
| **Link (inline)** | `--fg-primary`, 1px underline `--line-interactive`, offset 0.22em | underline → `--signal-500`, thickness 1→2px, 90ms | — | `ring` | visited: no change (data links) | — | — | — | — |
| **Link (external)** | as above + 10px ↗ at `--fg-tertiary` | ↗ `translate(1px,-1px)`, `--dur-snap` | — | `ring` | — | — | — | — | — |
| **Badge / chip** | `--bg-inset`, 1px `--line-subtle`, `--r-full`, `--t-11` | *(non-interactive: no hover)* | — | — | `Vendor` → `--warn` text + border; `Open weights` → `--pos`; effort → `--fg-tertiary` | — | — | — | — |
| **Tooltip / popover** | hidden | opens after 240ms hover intent | — | opens instantly on focus | `opacity 0→1` + `translateY(-6px)→0` + `scale(.985)→1`, `--dur-glide`, `--e-4`; exits at 60% duration | — | — | — | — |
| **Toast** | absent | — | — | receives focus if actionable | enters `translateY(12px)→0` + opacity, `--ease-bounce`; auto-dismisses at 4000ms with a progress hairline; pauses on hover/focus | — | — | `--pos` icon | `--warn` icon, no auto-dismiss |

**Global focus rule.** One ring everywhere, legible on every surface because it carries its own 2px inner spacer in the page ground:
```css
:focus-visible { outline: none; box-shadow: var(--ring); border-radius: var(--r-2); }
.table-scroll :focus-visible { box-shadow: var(--ring); }  /* inset ring — never clipped by overflow (fixes A4) */
```

## 4.5 Conversion architecture

**Goal: become the cited reference.** The loop is: *arrive → judge credibility in ~5 s → find what I came for → verify a number → take a citable artifact away → come back when it's stale.* Below, each flow gets a redesigned hierarchy, the friction it removes, and the hypothesis it tests.

> No analytics exist today (`README.md:71`). **Stage 0 of the roadmap installs measurement before any of these hypotheses can be judged.** Under the CSP, a first-party solution is required: either add a `connect-src` entry for a chosen provider, or use Vercel Web Analytics, which is same-origin and needs no CSP change.

### Flow 1 — Arrive and judge (the first screen)

**Now:** wordmark → tagline → dateline → controls → table. No claim, no proof, no magnitude.

**Redesigned hierarchy:**
1. **The readout** — the current #1 model's name at `--t-h1` and its Index at `--t-readout` (up to 156px) with the signal bloom behind it. The board's own top answer, given away instantly.
2. **The provenance ribbon** — one line at `--t-13`, directly under the readout:
   `456 cited scores · 62 models · 8 benchmarks · every number links to its source · measured independently by Artificial Analysis`
   Counts come from `data.scoreCount`, `data.rows.length`, `data.benchmarks.length` — already computed in `loadLeaderboardData()` (`data.ts:222-228`).
3. **The freshness chip** — `Updated 3 days ago` at `--t-12` with a `--pos` live-dot, promoted from `--ink-muted` 12px in the corner. Derived from `data.lastUpdated` (`data.ts:216-220`).
4. **Command bar** — search, tabs, filters, density, projection switch. Sticky; compresses on scroll.
5. **The board.**

*Removes:* F1 (no value proposition), F9 (freshness buried).
**H1** — Making provenance the first claim rather than a footer note increases scroll depth past the fold and row-expansion rate. *Measure:* scroll-depth ≥50% and detail-open rate, 4 weeks pre/post.

### Flow 2 — Find what I came for

**Now:** 1,676px table with sideways scroll below 1540px (F6), nested inside a 720px scroll box (F7).

**Redesigned:**
- **Projections**, switchable and URL-encoded as `?view=`:
  - `table` — all 8 benchmark columns. Retuned to fit: `rank 52 + model 220 + index 92 + 8 × 108 + price 116 = 1,344px`, versus 1,676px today. Fits a 1440px viewport with the standard gutter, thanks to Archivo at `wdth 84` in the headers.
  - `profile` *(default under 1280px)* — `rank 52 + model 260 + index 96 + spark 152 + price 120 = 680px`. The spark is 8 vertical bars (12px + 4px gap) using the `--score-N` ramp; each bar is focusable and reveals benchmark + value. **Never the sole encoding** — the full numeric table is one click away and an `sr-only` definition list carries every value.
  - `plot` *(Stage 7)* — price vs Index scatter.
- **Density switch** — Comfortable 46px / **Compact 36px (default)** / Data 28px rows, replacing today's fixed 56px. Compact raises visible rows on a 720px-tall board from ~12 to ~19.
- **Kill the nested scroll.** `.table-scroll` loses `max-height`; the page becomes the scroll container and the header sticks to the viewport. The board's real length becomes visible.
- **Command palette** (`⌘K` / `/`) — jump to any model, benchmark, or provider.

*Removes:* F6, F7.
**H2** — Eliminating horizontal scroll below 1280px reduces mobile bounce. *Measure:* bounce and rows-viewed by viewport bucket.

### Flow 3 — Verify a number

**Now:** the entire citation layer is invisible until a row is expanded (F2), and the Index has no in-place explanation (F3).

**Redesigned:**
- **Source affordance in the cell.** Every score gets a 1px dotted underline in `--line-interactive`; hover/focus reveals a source chip — `AA · 5d ago ↗` — that links straight out. The citation becomes visible at the number.
- **`Tooltip` extended to every column.** Rank, Model, **Index**, and Price get definitions; the Index tooltip states the formula, the equal weighting, and the 60% gate inline, with a link to `/methodology`. *Removes F3.*
- **"Insufficient data" becomes a link.** Replaces the bare string with `Insufficient data · 4 of 8 measured` where the label opens the coverage-rule tooltip. *Removes F4.*
- **Estimated values become visible.** `index.ts:100-137` imputes missing scores at the model's percentile, and `row.estimatedCount` is already computed — today it appears only in the detail panel's "Index coverage" line (`DetailPanel.tsx:87-96`). Surface it as a `--warn` chip on the Index cell: `2 est.`
- **Row expansion becomes unambiguous.** Remove `onClick` from `<tr>` (`LeaderboardTable.tsx:252`); the disclosure button becomes the only trigger, sized to 36px, with the whole model *cell* as its hit area. Text in the row becomes selectable and the mouse/keyboard affordances converge. *Removes F8, part of A5, A6.*

**H3** — Surfacing citations at the number increases outbound source clicks and time-to-trust. *Measure:* outbound `source.url` click rate per session.

### Flow 4 — Take a citable artifact away

This is the conversion action itself. Today: nothing (F5).

- **"Copy link to this view"** in the command bar — copies the URL that `urlState.ts` already maintains, with a `--ease-bounce` confirm and a toast. Zero new state.
- **Per-row permalink** — `Copy link to GPT-5.6 Sol` in the row's overflow menu, producing `/model/openai-gpt-5-6-sol`.
- **`/model/[id]` — 62 new statically generated pages.** `generateStaticParams()` over `models.json`; each page is a permanent, linkable, citable record: rank in all five scopes, every score with source and retrieval date and settings, price, context, weights, release date, and a `Dataset`/`Article` JSON-LD block. **This takes the site from 2 indexable pages to 64** and is the single strongest lever on inbound links and search presence.
- **`/compare?models=a,b,c`** — a static shell that reads models from the query client-side and renders head-to-head. Highly shareable, no new build output.
- **Per-page OG images**, pre-generated at build time by a script into `public/og/{id}.png`, wired through `generateMetadata`. Requires a devDependency (e.g. `satori` + `resvg`); `next/og` is unavailable under `output: "export"`. **Flag for owner sign-off** — it is a build-time-only dependency, consistent with the existing `tsx`/`vitest` precedent.
- Add all new routes to `sitemap.ts`.

**H4** — 64 indexable pages and explicit share affordances increase referring domains and organic entrances. *Measure:* Search Console impressions/pages-indexed and referring domains, 8 weeks.

### Flow 5 — Come back

- **Freshness chip** in the command bar on every route (Flow 1.3).
- **"What changed"** — a diff strip on `/`, computed at build time from git history of `data/scores.json`: *3 models added · 24 scores updated since 2026-07-19.* No new data model, no runtime cost.
- **`/feed.xml`** — a static feed emitted at build from the same diff. The lowest-effort return mechanism that needs no email capture and no CSP change.

**H5** — Visible change-since-last-visit increases return rate. *Measure:* returning-visitor share.

### What is deliberately *not* added

No email capture, no modal, no cookie banner (nothing is set), no engagement gamification. For a reference work, the credibility cost of those exceeds their conversion value.

## 4.6 Component-by-component migration map

### Existing components

| Component | Path | Change |
|---|---|---|
| `SiteMasthead` | `src/components/SiteMasthead.tsx` | **Rewrite.** Loses the 3px double rule. Splits into `SiteMasthead` (identity + nav) and the new `Readout`. Keeps the `home`/`link`/`static` variant contract — `global-error.tsx` depends on `static` rendering without router context. |
| `ThemeToggle` | `src/components/ThemeToggle.tsx` | **Keep logic, restyle.** `localStorage` key, `matchMedia` sync, and the pre-hydration script (`layout.tsx:33-40`) are unchanged. Icon gains the `rotate(180deg)` + cross-fade from §4.4. |
| `Leaderboard` | `src/components/Leaderboard.tsx` | **Extend.** Adds `view` (table/profile/plot), `density`, and `compare[]` to state and to the URL round-trip in `urlState.ts`. The three effects at `:113-213` keep their shape. |
| `CategoryTabs` | `src/components/CategoryTabs.tsx` | **Rewrite semantics.** `role="group"` + `aria-pressed` → `role="tablist"` / `role="tab"` with roving `tabindex` and Left/Right/Home/End handling. Adds the sliding underline. *Fixes A2.* |
| `FilterBar` | `src/components/FilterBar.tsx` | **Restyle + extend.** Keeps the `<details>` popover and its Escape/outside-click effects (`:35-60`). Gains density and projection controls, and the copy-link action. |
| `LeaderboardTable` | `src/components/LeaderboardTable.tsx` | **Heaviest change.** Remove `<tr onClick>` (`:252`). New column widths. `--i` stagger property per row. Tooltips on all headers. Density and projection branches. `compactBenchmarkLabels` (`:30-39`) is superseded by Archivo's width axis but kept as the `sr-only`-safe fallback. |
| `ScoreCell` | `src/components/ScoreCell.tsx` | **Rewrite.** Restores magnitude encoding (M7) via `--score-step`/`--score-fill` inline properties — this is the fix for F11. Adds the hover source chip. The `unit` prop, dropped in `831fa6c`, comes back. |
| `Tooltip` | `src/components/Tooltip.tsx` | **Rewrite semantics + restyle.** `role="dialog"`/`aria-haspopup="dialog"` → a disclosure pattern (`aria-expanded` + `aria-controls`, no `role`). Adds 240ms hover intent. Keeps Escape and outside-click. *Fixes A3.* |
| `DetailPanel` | `src/components/DetailPanel.tsx` | **Restyle + slim.** Becomes a preview of `/model/[id]` with a "Full record ↗" link. Grid uses `grid-template-rows: 0fr → 1fr` for the expand animation. |
| `Badge` | `src/components/Badge.tsx` | **Extend.** Add a `tone` prop (`neutral` \| `warn` \| `pos` \| `signal`) replacing the current caller-supplied class names, so badge color derives from the role map rather than from CSS selectors. |
| `Methodology` | `src/components/Methodology.tsx` | **Restyle only.** The editorial rail becomes a two-column instrument layout; prose measure moves from 660px to `--measure` (68ch). No copy changes — the copy is load-bearing for trust. |
| `SiteFooter` | `src/components/SiteFooter.tsx` | **Restyle.** The Artificial Analysis attribution link is a compliance requirement (`PLAN.md:219`) and must remain, underlined, on every route. |

### New components

| Component | Path | Purpose |
|---|---|---|
| `Readout` | `src/components/Readout.tsx` | The #1-model hero: name, Index at `--t-readout`, bloom, delta-since-last-update |
| `ProvenanceRibbon` | `src/components/ProvenanceRibbon.tsx` | The counts + "every number links to its source" claim |
| `FreshnessChip` | `src/components/FreshnessChip.tsx` | Relative "updated N days ago" + live dot |
| `CommandBar` | `src/components/CommandBar.tsx` | Sticky glass container for search/tabs/filters/density/projection/share |
| `CommandPalette` | `src/components/CommandPalette.tsx` | `⌘K` model/benchmark/provider jump |
| `ProjectionSwitch` | `src/components/ProjectionSwitch.tsx` | table ⇄ profile ⇄ plot |
| `DensitySwitch` | `src/components/DensitySwitch.tsx` | comfortable / compact / data |
| `ScoreSpark` | `src/components/ScoreSpark.tsx` | 8-bar micro-chart for profile view (+ `sr-only` value list) |
| `SourceChip` | `src/components/SourceChip.tsx` | In-cell provenance reveal |
| `CopyLinkButton` | `src/components/CopyLinkButton.tsx` | Clipboard + bounce confirm |
| `Toast` / `ToastRegion` | `src/components/Toast.tsx` | `aria-live="polite"` confirmations |
| `ModelRecord` | `src/components/ModelRecord.tsx` | Body of `/model/[id]` |
| `CompareGrid` | `src/components/CompareGrid.tsx` | Body of `/compare` |
| `ScatterPlot` | `src/components/ScatterPlot.tsx` | Price vs Index, inline SVG (Stage 7) |
| `ChangeStrip` | `src/components/ChangeStrip.tsx` | "What changed since…" |

### New routes and lib work

| Path | Purpose |
|---|---|
| `src/app/model/[id]/page.tsx` | 62 static records via `generateStaticParams()` + `generateMetadata()` |
| `src/app/compare/page.tsx` | Static shell reading `?models=` client-side |
| `src/app/feed.xml/route.ts` | `force-static` change feed |
| `src/lib/urlState.ts` | Extend with `view`, `density`, `compare` — keep the existing default-omission behavior so canonical URLs stay clean |
| `src/lib/percentile.ts` | Export the ramp-step function; reuse `percentileOf` logic already in `index.ts:64-74` rather than reimplementing |
| `src/lib/changes.ts` | Build-time diff of `data/scores.json` against the previous commit |
| `scripts/generate-og.ts` | Build-time OG images (devDependency — needs sign-off) |
| `src/styles/*.css` | The six-file layered system (§4.1) |

**Unchanged, deliberately:** `src/lib/schema.ts`, `src/lib/index.ts`, `src/lib/dataIntegrity.ts`, `src/lib/data.ts`, `src/lib/format.ts`, `src/lib/site.ts`, `scripts/validate-data.ts`, `data/*`. The redesign touches presentation only; the Index math and the data contract are `PLAN.md` §2 load-bearing decisions.

## 4.7 Accessibility and performance budgets

### Accessibility — WCAG 2.1 AA, verified by construction

**Contrast** (computed from §4.1 values; all pass):

| Pair | Dark | Light | Required |
|---|---|---|---|
| `--fg-primary` on `--bg-raised` | 15.71 | 18.92 | 4.5 |
| `--fg-secondary` on `--bg-raised` | 8.21 | 8.33 | 4.5 |
| `--fg-tertiary` on `--bg-raised` | 4.84 | 5.34 | 4.5 |
| `--fg-tertiary` on `--bg-active` | 4.15 | 4.33 | 4.5 → **use only at ≥`--t-15`/bold, or on `--bg-raised`** |
| `--signal-500` on `--bg-raised` | 7.09 | 5.69 | 4.5 |
| `--warn` on `--bg-raised` | 8.28 | 5.93 | 4.5 |
| `--pos` on `--bg-raised` | 8.12 | 5.36 | 4.5 |
| `--line-interactive` on `--bg-raised` | 3.44 | 3.79 | 3.0 (1.4.11) |
| `--line-interactive` on `--bg-base` | 3.60 | 3.50 | 3.0 |
| Focus ring `--signal-500`, worst surface | 6.08 | 4.88 | 3.0 |

`--line` (1.26–1.39) is decorative-only: it separates rows whose content is text, and it never identifies a control. Every control boundary uses `--line-interactive`. *This is the fix for A1.*

**Non-color encoding** (carried from `PLAN.md:106`): every score prints its numeral; the magnitude ramp is luminance, not hue (CVD-safe by construction); best-in-column is bold + dot + `sr-only` text (`ScoreCell.tsx:33`); `Vendor`, `Open weights`, and `est.` are text labels, not colors.

**Focus visibility:** one `box-shadow` ring, inset inside scroll containers so it is never clipped (*fixes A4*). Never removed without replacement.

**Keyboard paths** — each flow fully operable:
- Board: `Tab` to the table region (`tabIndex={0}` preserved) → arrow keys move cell-to-cell (`aria-activedescendant` grid pattern) → `Enter` expands → `Escape` collapses and restores focus.
- Tabs: one tab stop, `←`/`→`/`Home`/`End` (*fixes A2*).
- Filters: `Tab` to summary → `Enter` opens → arrows through options → `Escape` closes and restores focus to the summary (already implemented at `FilterBar.tsx:47-51`; preserve it).
- Palette: `⌘K` or `/` opens, `↑`/`↓`/`Enter`/`Escape`, focus trapped while open, returned on close.
- Skip links on all four routes.

**Touch targets — 44×44 CSS px minimum for every interactive element**, achieved by real size where layout allows and by the existing `(pointer: coarse)` halo pattern (`globals.css:1890-1908`) elsewhere. Extends the halo to `.category-tab`, `.sort-button`, `.model-trigger`, `.provider-menu label`, and `.clear-filters` — the five controls it misses today (*fixes A5*).

**Announcements:** keep the sort live region (`Leaderboard.tsx:269-271`) and the result count (`FilterBar.tsx:142`); add `aria-live="polite"` for projection and density changes and for copy confirmations.

**Motion:** `prefers-reduced-motion` handled as a designed mode (§4.3), not a blanket disable. No parallax, no autoplay, no flashing above 3 Hz anywhere.

**Verification gates:** axe-core zero violations on all four route types; manual keyboard walkthrough per flow; VoiceOver pass on the board and one model record; automated contrast test asserting every token pair in the table above.

### Performance budgets

| Metric | Budget | Today | How it's met |
|---|---|---|---|
| `out/index.html` raw | ≤ 600 KB (CI limit stays 1 MiB) | 392 KB | tighten the CI check to the working budget |
| `out/index.html` gzip | ≤ 45 KB | 28.4 KB | headroom for new markup |
| CSS raw / gzip | ≤ 46 KB / ≤ 9 KB | 30.4 KB / 6.0 KB | layered files, one bundle |
| **Font payload** | **≤ 280 KB, ≤ 2 preloads** | **~980 KB, 7 preloads** | 3 static families (32 files) → 2 variable families (2 files) |
| New client JS | ≤ +12 KB gzip | — | no library; palette/projection are CSS-only |
| LCP (mobile, 4G, low-end) | ≤ 1.6 s | unmeasured | LCP element is the readout — text, no image, font preloaded |
| INP p75 | ≤ 120 ms | unmeasured | 62-row filter/sort only; no layout-animating properties |
| CLS | ≤ 0.02 | unmeasured | `size-adjust` fallback metrics from `next/font`; readout reserves its box via `clamp` + fixed `line-height` |
| Animation frame budget | ≥ 58 fps | n/a | transform/opacity/filter only; ≤ 2 `backdrop-filter` |
| Grain paint | ≤ 15 ms one-time | n/a | 379-byte data URI; PNG swap if exceeded |

The font change is the headline win: dropping Newsreader (opsz + italic), IBM Plex Sans ×4, and IBM Plex Mono ×4 for two `latin`-subset variable faces should cut the largest asset class by roughly 70%. **Measure post-build and record the actual figure** — the estimate is not a claim.

**CI additions:** assert font-directory total bytes; assert gzip sizes for HTML and CSS; a post-build content smoke check (grep `out/index.html` for a known model name and the score count) — this also closes audit finding SEV-02's second half.

## 4.8 Phased implementation roadmap

Each stage is independently shippable and leaves `main` green.

**Stage 0 — Instrumentation and safety net** *(prerequisite; nothing else is measurable without it)*
Add Vercel Web Analytics (same-origin, no CSP change) or a chosen provider plus a `connect-src` entry. Add jsdom + Testing Library to devDependencies and write the URL-state round-trip tests the audit asks for (SEV-02) — the redesign will rewrite `Leaderboard.tsx`'s consumers, and there is no safety net today. Capture before-screenshots of all four route types in both themes at 390/768/1280/1600px. Record baseline Core Web Vitals.

**Stage 1 — Token foundation** *(no layout change)*
Introduce `src/styles/` with cascade layers; move existing rules across unchanged; swap the palette, type scale, spacing, radii, and elevation tokens to §4.1. Swap the fonts. Ship: the site is Observatory-colored and Observatory-set, with the old layout. Verify contrast tests and the font budget.

**Stage 2 — Material and layout**
Ground gradient, grain, specular surfaces, fading rules, glass command bar, squircle enhancement. Masthead → `Readout` + `ProvenanceRibbon` + `FreshnessChip`. Remove the double rule. Kill the nested scroll container.

**Stage 3 — Motion layer**
Spring tokens, interaction classes, stagger, scroll-linked compression, view transitions, designed reduced-motion. All additive; each behavior degrades to a resting state.

**Stage 4 — Board reconstruction**
`LeaderboardTable` rewrite: new column widths (1,344px table view), density switch, profile projection with `ScoreSpark`, `ScoreCell` magnitude restoration (**closes F11**), removal of `<tr onClick>` (**closes F8**), tooltips on every header (**closes F3**), the coverage-rule link (**closes F4**), and the estimated-value chip. `CategoryTabs` and `Tooltip` semantics fixed (**closes A2, A3**). Extend `urlState.ts` for `view` and `density`.

**Stage 5 — Citation surfaces**
`SourceChip` in-cell provenance (**closes F2**), `CopyLinkButton` + `Toast` (**closes F5**), per-row permalinks, `CommandPalette`, `ChangeStrip`, `/feed.xml`.

**Stage 6 — New routes**
`/model/[id]` ×62 with JSON-LD and sitemap entries; `/compare`. Build-time OG generation **if** the devDependency is approved; otherwise a single static OG per route type.

**Stage 7 — The plot projection**
`ScatterPlot` (price vs Index) as the third projection, with the shared-element transition. The Atlas idea, absorbed as a feature.

**Stage 8 — Hardening**
axe-core gate in CI; contrast unit test; font/gzip/content budgets in CI; VoiceOver pass; low-end-device profiling; `PLAN.md` decision-log entry recording every constraint this plan amends.

---

# Verification

## V1 — Divergence: old vs new, side by side

| Dimension | Printed Index (current) | Observatory (new) | Diverges? |
|---|---|---|---|
| Ground color (light) | `#f6f4ee` warm bone | `#F4F6F9` cold porcelain | ✅ hue family inverted |
| Ground color (dark) | `#131110` warm near-black | `#0B0D10` cold graphite | ✅ |
| Accent | `#a63a22` oxblood / `#d96c4f` terracotta | `#0A66C2` / `#4DA3FF` signal blue | ✅ opposite side of the wheel |
| Default theme | light-first (static light fallback) | **dark-first** (static dark fallback) | ✅ inverted |
| Color tokens | 9, no scales | 22 + a 5-step magnitude ramp + semantic role map | ✅ |
| Display family | Newsreader (serif) | **removed** | ✅ |
| UI family | IBM Plex Sans (humanist, 4 statics) | Archivo (industrial grotesk, variable wght+**wdth**) | ✅ |
| Mono family | IBM Plex Mono (4 statics) | Geist Mono (variable) | ✅ |
| Font files / preloads | 32 files / 7 preloads | 2 files / 2 preloads | ✅ |
| Type scale | 7 fixed px, **0 `clamp()`** | 8 fixed + **3 fluid `clamp()`** | ✅ |
| Largest type | 34px wordmark | 156px Index readout | ✅ 4.6× |
| Weight system | flat 400/500/600/700 | optically compensated 300/400/480/580/680 | ✅ |
| Width axis | none | `wdth` 84/100/112, load-bearing in headers | ✅ new capability |
| Spacing scale | 8 steps (4→64) | 13 steps (2→160) | ✅ |
| Radii | 3 (6/12/999) | 6 (3/5/8/14/22/999) + squircle | ✅ |
| Elevation | 2 shadows, no depth on primary surfaces | 6 levels, specular + contact + ambient | ✅ |
| Gradients | **0** | ground radial + bloom + fading rules | ✅ |
| Grain / noise | **0** | 379-byte SVG at 3.5% / 2.2% | ✅ |
| Glass | **0** | command bar `blur(14px) saturate(150%)` | ✅ |
| Signature layout mark | 3px `double` rule under masthead | removed; replaced by the readout + bloom | ✅ |
| Page container | centered `min(100%, 1540px)` | `--rail-max: 1680px` + `clamp()` gutter, full-bleed ground | ✅ |
| Row height | 56px fixed | 46/**36**/28px, user-switchable | ✅ |
| Table min-width | 1,676px | 1,344px (table) / 680px (profile) | ✅ |
| Scroll model | nested box, `max-height: min(72vh,720px)` | page-level scroll, viewport-sticky header | ✅ |
| Magnitude encoding | **none** (bars deleted in `831fa6c`) | 2px baseline, length × 5-step luminance ramp | ✅ |
| Easing functions | **1** (`ease`, 20 uses) | 4 springs (`linear()`) + 3 cubic-beziers | ✅ |
| Durations | 3 (120/160/180ms) | 6 classes (90/190/340/480/560/4000ms) | ✅ |
| Spring physics | none | ζ 0.55–1.00, k 175–945, compiled offline | ✅ |
| Stagger | none | 28ms, capped at 12 | ✅ |
| Scroll-linked motion | none | `animation-timeline: scroll()` + `view()` | ✅ |
| Reduced motion | blanket `0.01ms !important` | designed mode, opacity retained at 90–120ms | ✅ |
| CSS architecture | 1 file, 1,923 lines, 0 layers | 6 files, 6 cascade layers | ✅ |
| Indexable routes | 2 | 64 (+`/compare`, `/feed.xml`) | ✅ |
| Provenance visibility | 0 signals on the board | in-cell source chip on all 456 scores | ✅ |

**No dimension retains a recognizable identity.** The only carried-forward elements are *principles*, not appearance: real table semantics, one hue for magnitude, numerals in text ink, no meaning by color alone, AA contrast, designed dark mode, and the `light-dark()` + `data-theme` architecture.

## V2 — Groundedness

**Read in full this session:** all 12 files in `src/components/`; all 8 in `src/lib/` except `dataIntegrity.ts` (first 40 lines); all of `src/app/` (`layout.tsx`, `page.tsx`, `globals.css` all 1,923 lines, `methodology/page.tsx`, `not-found.tsx`, `global-error.tsx`, `icon.svg`, `manifest.ts`, `robots.ts`, `sitemap.ts`); `package.json`, `next.config.ts`, `tsconfig.json`, `vercel.json`, `eslint.config.mjs`, `vitest.config.ts`, `.env.example`, `.github/workflows/ci.yml`; `data/benchmarks.json` in full; `README.md`, `PLAN.md`, `audit-lmboard.md` in full; `CONTRIBUTING.md` in part.

**Measured, not assumed:** all contrast ratios (computed from hex via the WCAG relative-luminance formula); all `out/` file sizes and gzip figures (`wc -c`, `gzip -c`); font file count and preload count (`ls`, `grep` over `out/index.html`); the motion inventory (`grep` counts for `gradient`, `backdrop-filter`, `mix-blend`, `@keyframes`, `!important`, `@layer`, `clamp(`, durations, easings — all reported as returned); the table's 1,676px min-width (arithmetic from the width tokens at `globals.css:29-33`); typeface availability and axes (queried from `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`); all four spring curves (solved numerically, then compiled to `linear()`); the grain data URI (generated and byte-counted).

**Not read, and therefore not claimed:** `scripts/discovery/core.ts` and its tests (~1,900 lines — irrelevant to UI; characterized only via `audit-lmboard.md`); `data/models.json` beyond the first 80 lines plus computed aggregates; `data/scores.json` beyond its record count; `PRODUCTION_READINESS.md` beyond targeted greps; `src/lib/*.test.ts`.

**Stated as hypothesis, not fact:** every claim in §2.7 and §4.5 about visitor behavior. Production is unmonitored (`README.md:71`); there is no analytics, session recording, or field CWV data in this repository. Structural facts about what the code does are stated as facts and cited by line.

**Estimates flagged as estimates:** the post-migration font payload (~70% reduction) and the grain rasterization cost (5–15 ms). Both carry an explicit instruction to measure and record the real figure.

## V3 — Completeness: no adjective standing in for a value

| Thing an engineer must build | Where the exact value is |
|---|---|
| Every color | §4.1 — 22 tokens as hex, both themes, plus a 5-step ramp with composited results |
| Every type size, line-height, tracking, weight, width | §4.1 — 11 sizes, 5 weights, 3 widths, per-token line-height and letter-spacing |
| Typeface names and axes | §4.1 — Archivo (`axes: ["wdth"]`), Geist Mono; both verified present in the `next/font/google` registry |
| Spacing, radii | §4.1 — 13 spacing steps, 6 radii, all px |
| Every shadow | §4.1 — 6 levels × 2 themes, full `box-shadow` strings |
| Gradient stops | §4.2 — exact colors and positions, both themes |
| Grain | §4.2 — the complete 379-byte data URI, plus opacity per theme |
| Glass | §4.2 — `blur(14px) saturate(150%)`, `color-mix` value, `@supports` fallback |
| Magnitude encoding | §4.2 M7 — height, offsets, transform-origin, custom-property contract |
| Spring physics | §4.3 — stiffness, damping, mass, ζ, and the compiled `linear()` stops for all four classes |
| Durations per interaction | §4.3 — 90/190/340/480/560/4000ms, mapped to named classes |
| Stagger | §4.3 — 28ms, capped at index 11 (308ms) |
| Scroll-linked behavior | §4.3 — `animation-timeline`, `animation-range: 0 240px`, `@supports` guard |
| Reduced motion | §4.3 — the exact override block |
| Every interactive state | §4.4 — 15 component classes × 9 states |
| Focus ring | §4.1/§4.4 — `--ring` string, plus the inset variant for scroll containers |
| Layout arithmetic | §4.5 — 1,344px table (52+220+92+8×108+116), 680px profile (52+260+96+152+120) |
| Row heights | §4.5 — 46 / 36 / 28px |
| Every file to touch | §4.6 — 12 existing components with the change stated, 15 new, 4 new routes, 4 lib modules |
| Contrast compliance | §4.7 — 10 measured pairs, both themes, with the one conditional-use case called out |
| Performance budgets | §4.7 — 11 metrics with numeric budgets and today's measurement where one exists |
| Ship order | §4.8 — 9 stages, each independently shippable |

---

## Before implementation begins

This document is a specification, not a change. No source file has been modified. Two prerequisites gate Stage 0:

1. **Amend `PLAN.md`.** Add a decision-log entry recording the constraints this plan supersedes — §6 typography (the serif/humanist/mono trio), §6 palette (the validated warm/oxblood set), §6 bar geometry, §6 radii and type-scale limits, §9 out-of-scope routes, and the motion policy — along with the owner approval date and the four decisions captured in **Context**. `PLAN.md` §2 marks these as requiring owner sign-off, and the decision log is the project's established mechanism for that.
2. **Confirm the one dependency question.** Build-time OG image generation (§4.5, Stage 6) needs a devDependency such as `satori` + `resvg`, because `next/og` is unavailable under `output: "export"`. Everything else in this plan is zero-dependency. If the answer is no, Stage 6 ships one static OG image per route type instead of 64.

Implementation then begins at **Stage 0 — instrumentation and safety net**, which is a hard prerequisite: none of the hypotheses in §4.5 can be judged without measurement, and `Leaderboard.tsx`'s consumers are rewritten in Stage 4 with no component test coverage in place today.

## Verification of the implementation (per stage)

- `npm run lint && npm run typecheck && npm test && npm run build` green at every stage (Vercel's `buildCommand` already gates deploys on tests).
- Screenshot diff against the Stage 0 baseline at 390 / 768 / 1280 / 1600px, both themes, all four route types. Use real viewport emulation — headless Chrome's `--screenshot --window-size` clamps to ~500px minimum width and produces false mobile-overflow reports.
- Contrast unit test asserting every pair in §4.7 (pure function over the token map, runs in the existing node-environment Vitest).
- axe-core zero violations per route.
- Keyboard walkthrough of all five flows in §4.5; VoiceOver pass on the board and one model record.
- Post-build budget assertions in CI: HTML gzip, CSS gzip, font-directory bytes, and a content smoke check for a known model name plus the score count.
