# LM Board — UI/UX Audit & Implementation Record

> The findings below preserve the historical pre-implementation audit baseline. The roadmap has since been implemented, reviewed by separate hostile visual/accessibility critics, and kept uncommitted on `codex/perfection-audit-plan`. Present-tense defect descriptions in §2 explain what the implementation changed; they no longer describe the current product.

## Current implementation status — 2026-07-27

All three roadmap phases and the supporting design-system foundations are implemented in the working tree:

- Shareable URL state, source inspectors, mobile evidence, sticky headers, stable deep-link first paint, typed analytics, per-route/per-model OG images, and compare skeleton behavior.
- Complete keyboard paths for the board, filters, plot, comparison, palette, dialogs, and every route; responsive cards and comparison scrolling at 320–1439px.
- Reduced-motion behavior, projection transitions, shape-aware focus, labeled record summaries, standardized external links, and route-aware navigation.
- Z-index/breakpoint invariants, contrast and error-palette guards, compressed leaderboard/compare/value client payloads, and enforced HTML/CSS/JS/request budgets.

Verification is intentionally recorded by the build and test commands rather than copied into this document as a number that will immediately drift. Run `npm run check` with `NEXT_PUBLIC_SITE_URL` set to the production origin, then run the Lighthouse and production-monitor commands in §Verification.

## Inferred product context and conversion goal

The prompt's `{{PRODUCT_CONTEXT}}` and `{{CONVERSION_GOAL}}` slots arrived unfilled. Both are inferred from the repo, and both are stated there explicitly rather than guessed — correct them if either is wrong, because the entire roadmap ordering follows from the second.

- **Product / audience** — `README.md:3`, `PLAN.md:8-14`: a static, curated leaderboard of frontier-LLM benchmark scores for practitioners and writers who need a defensible number to cite. 62 models × 8 benchmarks × 456 individually sourced scores. Thesis, `PLAN.md:10`: *"we don't run evals, we curate them. The product's value is careful aggregation with provenance."*
- **Conversion action** — `REDESIGN_PLAN.md:15`, recorded there as confirmed with the owner: **"Become the cited reference"** — optimize for first-view credibility, verifiability, linkability and screenshot travel, *not* signup or engagement time. `REDESIGN_PLAN.md:851` explicitly refuses email capture, modals, cookie banners and gamification. There is no signup, form, checkout or account anywhere in `src/` (`vercel.json` sets `form-action 'none'`), so the conversion action in practice is: **copy a shareable link · open a source citation · land on and cite a `/model/[id]` record.**

**Owner decisions taken during this audit:**

1. Narrow viewports keep the `profile` projection, but it gains numerals and a citation affordance — no viewport loses the provenance claim.
2. Analytics instrumentation lands in Phase 1 alongside the fixes, not as a separate Phase 0.
3. Per-page OG images are approved, including a build-time devDependency (`satori` + `@resvg/resvg-js`).

**Headline conclusion.** This is a coherent, unusually well-documented design system — the CSS carries its own rationale, the palette is contrast-tested against the shipped stylesheet, and reduced motion is a designed mode rather than a blanket kill. The problems are not taste problems. They are a small number of defects sitting **directly on the conversion path**, two of which make the product's central claim false: the 456 source citations are unreachable on touch, and the primary "Copy view" action silently discards the filters that motivated the share. That is what Phase 1 fixes.

---

# 1. Codebase snapshot

| Layer | State | Evidence |
|---|---|---|
| Framework | Next.js 15.5.21 App Router, React 19.1.8, `output: "export"` — fully static, no runtime server | `package.json`, `next.config.ts:4` |
| Styling | **Hand-rolled CSS. No Tailwind, no CSS Modules, no CSS-in-JS.** Route-split native cascade layers keep board, plot, record, document, palette, and responsive rules independently loadable | `src/styles/`, `src/app/globals.css` |
| Layer order | `tokens, base, motion, layout, components, projections, utilities` — declared once | `src/styles/index.css:16` |
| Tokens | 129 custom properties. Dual theme via `light-dark()` with a static dark fallback declared first, so pre-2024 browsers degrade to a complete dark theme | `src/styles/tokens.css:10-249` |
| Type | Archivo (the `wdth` axis is load-bearing, not decorative) + Geist Mono, `next/font/google`, latin only. 8 fixed steps + 3 `clamp()` display sizes, each with its own line-height and letter-spacing | `src/app/layout.tsx:12-24`, `tokens.css:86-133` |
| Motion | 4 springs solved offline as mass-spring-damper systems and compiled to `linear()` stops, each double-declared with a `cubic-bezier` fallback first. 8 keyframes. Scroll-driven animation and view transitions behind `@supports` | `tokens.css:191-236`, `src/styles/motion.css` |
| Reduced motion | A *designed* mode — `--dur-*` / `--ease-*` overridden at `:root` rather than rules disabled | `motion.css:157-197` |
| Data | Build-time only. Three JSON files → Zod → cross-file integrity check → per-scope Index + standard competition ranks. No fetch, no cache, no API | `src/lib/data.ts`, `src/lib/schema.ts`, `src/lib/index.ts` |
| State | The URL is the serialization target for projection, category, sort, density, query, providers, open weights, selected plot point, comparison, and expanded record state | `Leaderboard.tsx`, `src/lib/urlState.ts` |
| Tests | Vitest component/library suites, axe scans, real stylesheet contrast parsing, payload round-trips, metadata/JSON-LD/OG assertions, and operational-script tests | `src/**/*.test.ts(x)`, `scripts/**/*.test.ts` |
| Budgets | Enforced after the static build for homepage/compare/value HTML and Flight, homepage CSS and JS, critical requests, DOM, fonts, and content sentinels | `scripts/measure-budgets.ts`, `.github/workflows/ci.yml` |
| Analytics | Typed conversion events cover copy, source, expansion, projection/density, and palette navigation alongside pageviews | `src/lib/track.ts` and instrumented call sites |

## Routes — 6 product screens + generated artifacts

| Path | Source | Notes |
|---|---|---|
| `/` | `src/app/page.tsx` | Masthead → Readout → ProvenanceRibbon → ChangeStrip → Leaderboard → Footer, plus `Dataset` JSON-LD |
| `/model/[id]` | `src/app/model/[id]/page.tsx` | **62 static pages**, `dynamicParams = false`, `SoftwareApplication` + conditional `AggregateRating` JSON-LD |
| `/compare` | `src/app/compare/page.tsx` → `CompareGrid.tsx` | Static shell; selection read client-side from `?models=`, deduped and capped at 4 |
| `/value` | `src/app/value/page.tsx` → `ScatterPlot.tsx` | Index-versus-price view with a true efficient frontier and URL-addressable selected point |
| `/methodology` | `src/app/methodology/page.tsx` → `Methodology.tsx` | 5 ruled sections + a worked example that proves missing ≠ zero |
| `/404` | `src/app/not-found.tsx` | `robots: { index: false }` |
| `/feed.xml`, `/sitemap.xml` (65 URLs), `/robots.txt`, `/manifest.webmanifest`, `/icon.svg`, `global-error.tsx` | — | All `force-static`; the error boundary ships its own inline CSS by design |

No `opengraph-image.*`, no `loading.tsx`, no per-route `error.tsx`, no middleware, no API routes.

## The conversion path, traced component by component

```
/  → Readout — LCP element: leader name @ --t-h1, Index @ --t-readout (→156px)   Readout.tsx:32-55
   → ProvenanceRibbon — "456 cited scores · 62 models · 8 benchmarks ·
                          every number links to its source"              ProvenanceRibbon.tsx:26-44
   → ChangeStrip → "Change feed" (/feed.xml)                                 ChangeStrip.tsx:24-32
   → Leaderboard  (the client boundary; whole dataset crosses it)            Leaderboard.tsx:37
        ├─ CategoryTabs — real tablist, roving tabindex, Arrow/Home/End      CategoryTabs.tsx:58-82
        ├─ FilterBar — search · providers · open-weights · density ·
        │              projection · ★ COPY VIEW                             FilterBar.tsx:87-226
        ├─ LeaderboardTable — 62 rows, sortable, sticky model column      LeaderboardTable.tsx:172
        │     ├─ ScoreCell ×456 → ★ .source-chip → outbound citation        ScoreCell.tsx:69-81
        │     └─ model-trigger → DetailPanel → ★ Copy link / Full record    DetailPanel.tsx:32-50
        └─ CommandPalette (⌘K / /) → /model/[id]                          CommandPalette.tsx:157
   → /model/[id] — the citation surface: ★ Copy link · Compare · Official page
                                                                            ModelRecord.tsx:53-73
   → /compare?models=a,b,c → ★ Copy comparison                              CompareGrid.tsx:133-138

★ = a conversion action.  Findings A1, A2, A3, B1 and B2 all sit on a starred step.
```

## What is already excellent

Worth stating before the findings, because these should be preserved rather than refactored past:

- **The palette cannot silently regress.** `contrast.ts:71-87` parses the real `tokens.css` — the doc comment explains why a copy would be worse than no test — and `contrast.test.ts` asserts WCAG AA across both themes for every ink × surface pair, the focus ring on all five surfaces it can land on, and the ramp's monotonicity plus a <25° hue spread.
- **The magnitude ramp encodes luminance, not hue** — CVD-safe by construction, with the numeral always printed above it (`tokens.css:77-84`, `src/lib/ramp.ts:8-16`).
- **Missing data is never zero, anywhere** — in the maths (`index.ts:196-197`), in the sort (`useSort.ts:63-74` — nulls sort last regardless of direction), in the cell (`ScoreCell.tsx:32-38`), and in the copy (`Methodology.tsx:148-152`).
- **`Tooltip` is a disclosure, not a dialog**, and is genuinely WCAG 1.4.13-compliant: hoverable, dismissible via Escape with focus restore, persistent, with 240 ms hover intent, and it repositions on scroll rather than closing (`Tooltip.tsx:31-38, 106-145`).
- **`CategoryTabs` is a reference-quality tablist** — one tab stop, roving tabindex, wrapping arrows, Home/End, and a shared underline re-measured through a `ResizeObserver` so it survives font swap (`CategoryTabs.tsx:38-82`).
- **A 44×44 coarse-pointer halo** covers 13 control classes with two documented, correct exceptions (`utilities.css:62-137`).
- **Reduced motion is designed, not disabled** — colour and opacity feedback deliberately survives at 90–120 ms because removing it makes state changes harder to follow (`motion.css:157-160`).

---

# 2. Historical audit findings

Severity: **P0** = breaks a conversion action or makes a stated product claim false · **P1** = materially degrades a primary flow · **P2** = quality or consistency gap against the bar.

## 2.1 Flow — Take the artifact away (the conversion action itself)

### A1 · **P0** · "Copy view" ships a link that doesn't show what the sharer sees
`FilterBar.tsx:221-224` renders `CopyLinkButton` with no `href`, so it copies `window.location.href`. But the writeback effect at `Leaderboard.tsx:181-237` serializes only `tab`, `sort`, `direction`, `view`, `density` and the model hash. The three filter states — `query` (`:44`), `selectedLabs` (`:43`), `openWeightsOnly` (`:45`) — are **never written to the URL**.

Filter to "Anthropic · open weights", click Copy view, paste into a doc: the recipient gets the unfiltered 62-row board. The primary conversion action silently discards the exact state that motivated the share, and `CopyLinkButton`'s own doc comment (`:16-19`) claims the opposite — *"The URL that urlState.ts already maintains is fully shareable."*

**Files:** `Leaderboard.tsx:181-237`, `:43-45` · `src/lib/urlState.ts` · `FilterBar.tsx:221-224` · `CopyLinkButton.tsx:16-31`
**Dimension:** Conversion

### A2 · **P1** · All 62 model records share one OG card
`layout.tsx:85-99` sets a single static `/og-image.png` (1200×630, `public/og-image.png`). No `opengraph-image.*` file exists, and `next/og` cannot run under `output: "export"`. `generateMetadata` at `model/[id]/page.tsx:44-49` sets a per-model `title` and `description` but inherits the site-wide image. For a product whose conversion action is being cited and screenshotted, every shared record looks identical in every feed and chat unfurl.

**Files:** `src/app/layout.tsx:85-99` · `src/app/model/[id]/page.tsx:44-49` · `public/`
**Dimension:** Conversion

### A3 · **P1** · A shared comparison link first paints the word "Loading"
`/compare` is a static shell. `CompareGrid.tsx:28-38` reads `?models=` inside an effect — necessarily, since `useSearchParams` would force the route to client-render under `output: "export"` (rationale at `:18-22`) — so `ready` is `false` on first paint and `:161-166` renders bare centred text: `"Loading the comparison…"`. No skeleton, no `aria-busy`, no reserved height. The artifact someone was sent opens on a loading string, then jumps to a table.

**Files:** `CompareGrid.tsx:23-50, 161-166` · `projections.css:1050-1054`
**Dimension:** Performance as UX; Conversion

### A4 · P2 · `CopyLinkButton` has no pending state, and its failure is invisible on the button
`copy()` (`CopyLinkButton.tsx:28-43`) is async with no in-flight guard, so rapid clicks queue duplicate toasts. The success branch sets `copied` for 2000 ms (`:37`); the failure branch (`:38-42`) sets nothing, so the button gives no feedback at all when the clipboard is blocked. `.btn.is-error` exists in CSS for precisely this — border in `--warn` plus a `nudge` animation (`components.css:87-90`) — and is never applied by any component.

**Files:** `CopyLinkButton.tsx:26-50` · `components.css:87-90` · `motion.css:91-104`
**Dimension:** Interaction completeness

### A5 · P2 · `warn` toasts are permanent and undismissable
`Toast.tsx:34-39` schedules removal only for `tone === "pos"`; the comment says errors "stay until dismissed by the next action", but `ToastRegion` (`:52-66`) renders no close button and registers no Escape handler. The only `warn` producer today is the clipboard-blocked path (`CopyLinkButton.tsx:41`), so a user in an embedded or non-secure context gets an error banner pinned over the bottom-right of the board for the rest of the session.

**Files:** `Toast.tsx:28-66` · `components.css:552-596`
**Dimension:** Interaction completeness

## 2.2 Flow — Verify a number (the citation path)

### B1 · **P0** · The 456 source chips are unreachable by touch, and sit outside their own cell
Two independent defects in one rule block (`projections.css:556-594`):

1. **Unreachable on touch.** `.source-chip` is `opacity: 0; pointer-events: none` at rest, revealed only by `.score-cell:hover` or `:focus-within` (`:584-589`). It is **absent** from the coarse-pointer 44px halo list (`utilities.css:69-97`). A touch device has no hover, and the `<td>` is not focusable, so the only path to a citation on the board is a hardware-keyboard Tab.
2. **Mispositioned.** `bottom: calc(100% - var(--s-3))` (`:561`) places the chip *above* its own cell. At the default 36px row height (`--row-h`, `tokens.css:277`) a revealed chip overlaps the previous row's content.

This is the product's stated core affordance — `ScoreCell.tsx:67-68`, *"Provenance at the number rather than behind a click: the citation is the product"* — and the headline claim printed above the board, `ProvenanceRibbon.tsx:30`, *"every number links to its source."*

**Files:** `projections.css:556-594` · `utilities.css:69-97` · `ScoreCell.tsx:69-81` · `ProvenanceRibbon.tsx:30`
**Dimensions:** Conversion; Accessibility; Interaction completeness

### B2 · **P0** · Under 1440px the default board shows no benchmark numbers and no citations at all
`Leaderboard.tsx:156-166` switches the projection to `profile` whenever `window.innerWidth < PROFILE_BREAKPOINT`, and `PROFILE_BREAKPOINT` is **1440** (`urlState.ts:41`). In that projection `ScoreSpark.tsx:22-46` renders 8 bars inside a `<div aria-hidden="true">`, with values only in a `title` attribute and an `sr-only` `<ul>`. There is no numeral, no source link, and nothing tappable.

So every 1280–1439px laptop's *first view of the board* directly contradicts the ribbon printed immediately above it. Note also that `REDESIGN_PLAN.md` specifies this default at **1280px**, not 1440 — the code and the plan of record disagree.

**Files:** `Leaderboard.tsx:156-166` · `urlState.ts:36-41` · `ScoreSpark.tsx:22-59` · `projections.css:596-631`
**Dimensions:** Conversion; Accessibility

### B3 · **P1** · Sticky column headers pin *behind* the sticky command bar
`projections.css:171-174` sets `.board thead th { position: sticky; z-index: 20; top: var(--bar-h, 0px) }`. **`--bar-h` is never assigned anywhere in the repo** — verified: `projections.css:174` is its only occurrence — so it resolves to the `0px` fallback. Meanwhile `.command-bar` is `position: sticky; top: 0; z-index: 40` with `backdrop-filter: blur(14px) saturate(150%)` (`:15-32`).

Scroll the 62-row board and every column header pins to viewport-top *underneath* frosted glass — an illegible smear at exactly the moment you need to know which benchmark column you are reading.

**Files:** `projections.css:171-177`, `:15-38` · `Leaderboard.tsx:319`
**Dimensions:** Visual design; Interaction completeness

### B4 · P1 · The scatter plot has no keyboard or touch path to a data point
`ScatterPlot.tsx:182-195` renders `<circle>` elements with no `tabIndex`, carrying detail only in an SVG `<title>` child — mouse-hover only. Two consequences: `.plot-point:focus-visible` (`projections.css:1100-1104`) can never match, and `transition: r` (`:1097`) has no rule that changes `r`. Both are dead. The `sr-only` table (`:241-267`) is a genuine fallback for screen readers, but a sighted keyboard or touch user has no way to read any point.

**Files:** `ScatterPlot.tsx:180-197` · `projections.css:1090-1104`
**Dimensions:** Interaction completeness; Accessibility

### B5 · P2 · The 44px touch guarantee is spent on an element that isn't a control
`utilities.css:78, 130-136` gives `.spark-bar` a 44px-tall halo with a carefully reasoned comment about not stealing neighbours' taps. But the bars are non-interactive `<span>`s inside an `aria-hidden` wrapper (`ScoreSpark.tsx:24-44`) — no `onClick`, no `tabIndex`. The halo does nothing, while `.source-chip` — the most numerous real control on the page, 456 of them — is left off the list entirely.

**Files:** `utilities.css:62-137` · `ScoreSpark.tsx:24-44`
**Dimension:** Interaction completeness

### B6 · P2 · `.best-marker` is rendered but has no CSS rule
`ScoreCell.tsx:55` emits `<span className="best-marker">` wrapping the 4px `.best-dot` and its `sr-only` label. Verified: no rule for `.best-marker` exists anywhere in `src/styles/`. As an unstyled inline box it aligns on the text baseline inside `.score-value-line`, which is `display: flex; align-items: center` (`projections.css:534-540`) — so the best-score dot doesn't sit where it was designed to sit relative to the numeral it marks.

**Files:** `ScoreCell.tsx:52-59` · `projections.css:534-554`
**Dimension:** Visual design

## 2.3 Flow — Arrive and judge (home, the first five seconds)

### C1 · **P1** · The largest element on the page reflows after hydration
The server always renders `table` — deliberately, so every number is in the static HTML (`urlState.ts:27-33`) — and the client then flips sub-1440px viewports to `profile` in a mount effect (`Leaderboard.tsx:151-166`). Column count goes 12 → 5, and the table's `min-width` drops from a 1424px `calc()` to `0` (`projections.css:813-822`). That is an unreserved post-LCP reflow of the biggest element on the page, against a stated CLS budget of ≤0.02.

**Files:** `Leaderboard.tsx:123-179` · `urlState.ts:27-41` · `projections.css:809-822`
**Dimension:** Performance as UX

### C2 · P1 · The parallax fades the LCP element to 25% within 320px of scroll
`Readout.tsx:33` applies `.readout-parallax`; `motion.css:135-146` recedes it to `opacity: 0.25; transform: translateY(-24px) scale(0.94)` over `animation-range: 0 320px`. The leader's name and Index — the answer the product gives away for free, and documented as the LCP element at `Readout.tsx:14-16` — is the first thing removed on scroll, and on a phone it is nearly gone before the board's first row is in view.

**Files:** `motion.css:135-146` · `Readout.tsx:32-33` · `layout.css:95-115`
**Dimensions:** Motion; Conversion

### C3 · P2 · No `aria-current` anywhere in the codebase
Verified zero occurrences. `SiteFooter.tsx:31-41` renders Methodology / Compare / Changes / GitHub identically on all four route types, and the masthead's per-route "Leaderboard" button (`model/[id]/page.tsx:96-99`) gives no indication of where you are.

**Files:** `SiteFooter.tsx:31-41` · `SiteMasthead.tsx:46-50` · `model/[id]/page.tsx:96-112`
**Dimension:** Accessibility

### C4 · P2 · The board section borrows the site `<h1>` as its accessible name
`Leaderboard.tsx:307-311` is `aria-labelledby="leaderboard-heading"`, which resolves to the masthead wordmark `<h1>LM Board</h1>` (`SiteMasthead.tsx:40`). There is no heading for the board itself, so the landmark is announced as "LM Board" and the descriptive name lives one level down on the inner scroll region (`LeaderboardTable.tsx:187`) — whose comment (`:184-186`) correctly notes that two nested landmarks must not share one name, but resolves it by leaving the outer one weakly named.

**Files:** `Leaderboard.tsx:307-311` · `SiteMasthead.tsx:36-45` · `LeaderboardTable.tsx:180-190`
**Dimension:** Accessibility

### C5 · P2 · ⌘K works only on `/`
`CommandPalette` is mounted inside `Leaderboard` (`Leaderboard.tsx:372`), so on `/model/[id]`, `/compare`, `/methodology` and `/404` the shortcut does nothing — including on the 62 model records, which are the pages most likely to be entered directly from search. From a record there is no way to reach another model without going back to the board.

**Files:** `Leaderboard.tsx:372` · `CommandPalette.tsx:87-113`
**Dimension:** Interaction completeness

## 2.4 Screen — `/compare`

### D1 · P1 · The candidate picker is a worse re-implementation of the palette, 130 lines away
`CompareGrid.tsx:141-159` renders search results as bare `.btn`s in a `<ul>`: no `role="listbox"`, no `role="option"`, no `aria-activedescendant`, no arrow keys, no Escape, no active-descendant highlight. `CommandPalette.tsx:174-213` implements every one of those correctly for the identical job — filter a model list, pick one with the keyboard.

**Files:** `CompareGrid.tsx:118-159` · `CommandPalette.tsx:157-219`
**Dimensions:** Interaction completeness; Accessibility

### D2 · P2 · The disabled search field looks and behaves as enabled
`CompareGrid.tsx:129` sets `disabled` once 4 models are selected. The only disabled rule in the entire system is `.btn:disabled` (`components.css:64-68`). `.field` has `:hover` and `:focus-within` states (`:220-227`) but no disabled variant, so the field still lights its border on hover while inert; only the swapped placeholder (`:124-128`) signals the state.

**Files:** `CompareGrid.tsx:118-132` · `components.css:204-227`
**Dimension:** Interaction completeness

### D3 · P2 · Two inline layout styles escape the token system
`CompareGrid.tsx:117` sets `marginBottom` inline and `:144` sets `listStyle` / `padding` / `marginBottom` inline. Every other inline style in the codebase passes a CSS custom property — the sanctioned pattern — so these two are the only stylistic exceptions in 4,200 lines of components.

**Files:** `CompareGrid.tsx:117, 141-145`
**Dimension:** Visual design

## 2.5 Screens — `/methodology`, `/model/[id]`, `/404`

These are the strongest screens on the site. `Methodology.tsx` in particular is load-bearing for trust and its copy should not be touched. Findings here are consistency-level.

### E1 · P2 · Three different external-link treatments coexist
1. `ExternalIcon` + `.link-external` with the `.ext` hover translate — `ModelRecord.tsx:189`, `DetailPanel.tsx:128`, `Tooltip.tsx:167`.
2. A raw `↗` character (`&#8599;`) — `Methodology.tsx:299, 338`.
3. No visual marker at all, `sr-only` text only — `ProvenanceRibbon.tsx:34-42`, `SiteFooter.tsx:20-28`, `Methodology.tsx:112-119`.

Outbound source clicks are a conversion event on this product, so the affordance that signals "this leaves the site to the evidence" should be exactly one thing.

**Files:** `components.css:709-716` and the five files above
**Dimension:** Visual design

### E2 · P2 · A flex badge sits inside body prose
`Methodology.tsx:122` renders `<Badge tone="warn">Vendor</Badge>` mid-sentence. `.badge` is `display: inline-flex; line-height: 1.5; padding: 1px var(--s-3)` (`components.css:420-436`) inside a 15px / 1.6 paragraph, which disturbs the line box and the vertical rhythm — on the one page whose whole job is to read as continuous prose.

**Files:** `Methodology.tsx:120-124` · `components.css:420-436`
**Dimension:** Visual design

### E3 · P2 · The detail panel enters but never exits
`projections.css:664-670` animates `enter-up` on mount; the row unmounts instantly on collapse (`LeaderboardTable.tsx:454-460`). `.detail-panel` already carries `display: grid; grid-template-rows: 1fr` (`:665-666`) — the shape of a `0fr → 1fr` collapse that `REDESIGN_PLAN.md`'s migration map specified for this component and that was never wired up.

**Files:** `projections.css:658-670` · `LeaderboardTable.tsx:454-460`
**Dimension:** Motion

## 2.6 Cross-cutting — the design system

### F1 · P1 · Reduced motion shortens transforms instead of removing them
`motion.css:157-160` states the intent: *"Transform, parallax, stagger and ambient loops are removed."* Parallax, stagger and ambient loops genuinely are (`:182`, `:185-187`, `--dur-ambient: 0ms`). **Transform is not.**

The mechanism at `:189-196` neutralises `.mo-state`, `.mo-transform` and `.mo-reveal` — all four `.mo-*` classes are dead code (see F2), so they govern nothing. The transforms that actually run are inlined at call sites and are reached only by the token overrides, which shorten them rather than removing them. Under `prefers-reduced-motion: reduce` these all still animate, at 90 ms:

| Transform | File |
|---|---|
| `.btn:active { scale(0.98) }` | `components.css:60-62` |
| `.btn-icon:active { scale(0.92) }` | `components.css:115-117` |
| `.theme-toggle:hover svg { rotate(20deg) }` | `components.css:131-133` |
| `.tab:active { scale(0.985) }` | `components.css:178-180` |
| `.tab-underline { translateX() scaleX() }` | `components.css:187-201` |
| `.check:active input { scale(0.9) }` | `components.css:301-303` |
| `.disclosure[open] summary::after { rotate(225deg) }` | `components.css:400-403` |
| `.segmented button:active { scale(0.94) }` | `projections.css:104-106` |
| `.sort-button:active { translateY(1px) }` | `projections.css:226-228` |
| `.model-cell::before { scaleY(0→1) }` | `projections.css:290-308` |
| `.spark-bar:hover { scaleY(1.06) }` | `projections.css:626-631` |
| `.score-cell::after { scaleX() }` | `projections.css:516-528` |

**Files:** `motion.css:157-197` and the rules above
**Dimensions:** Motion; Accessibility

### F2 · P2 · Six unused tokens and five dead class families
Verified zero consumers for: `--ring-glow`, `--e-0`, `--t-h2`, `--r-5`, `--s-13`, `--ease-in-out-quint`; and `.mo-instant` / `.mo-state` / `.mo-reveal` / `.mo-transform` (`motion.css:19-46`), `.surface` (`components.css:9-14`), `.stack` (`utilities.css:42-45`), `.btn.is-error` plus its `nudge` keyframe (`components.css:87-90`, `motion.css:91-104`), `.badge-signal` (`components.css:448-451`, reachable via `Badge`'s `tone="signal"` but never passed).

Two of these are worse than untidiness: the dead `.mo-*` classes are *why* F1 exists, and `.btn.is-error` is exactly the missing failure state from A4.

**Files:** `tokens.css` · `motion.css:19-46, 91-104` · `components.css:9-14, 87-90, 448-451` · `utilities.css:42-45`
**Dimension:** Visual design

### F3 · P2 · `::view-transition-group(board)` has no subject
`motion.css:149-155` tunes a view transition for `view-transition-name: board`, which nothing in `src/` declares — verified zero occurrences. The projection switch at `Leaderboard.tsx:301-304` (table ⇄ profile ⇄ plot) is precisely the transition it was written for.

**Files:** `motion.css:149-155` · `Leaderboard.tsx:301-304`
**Dimension:** Motion

### F4 · P2 · z-index is the only scale with no tokens
Fourteen literals across four files: `-1` (`layout.css:108`), `1` and `2` (`base.css:52, 63`), `10` (`projections.css:284`), `20` (`:173`), `25` (`:559`), `30` (`:318`), `40` (`:17`), `60` (`layout.css:24`), `70` (`components.css:308`), `80` (`:494`), `200` (`:555`), `300` (`:601`), `1000` (`utilities.css:22`). The ordering is coherent, and every other scale in the system is tokenised — but B3 is precisely the class of bug an untokenised stacking order produces, and adding a layer today means reading four files.

**Dimension:** Visual design

### F5 · P2 · Breakpoints are duplicated across CSS and TS with nothing enforcing agreement
`PROFILE_BREAKPOINT = 1440` (`urlState.ts:41`) and `@media (min-width: 1440px)` (`projections.css:824`) must match; the comment at `urlState.ts:36-41` says so explicitly, and no test checks it. `560px` appears as two independent blocks (`layout.css:580`, `projections.css:843`). See also B2: the code and `REDESIGN_PLAN.md` already disagree on this number.

**Dimension:** Visual design

### F6 · P2 · One focus ring shape for every control
`base.css:151-155` applies `box-shadow: var(--ring); border-radius: var(--r-2)` to every `:focus-visible`. `--r-2` is 5px, so every focused pill — `.source-chip`, `.badge`, `.freshness`, `.field-clear`, `.count-pip`, `.tooltip-trigger`, all `--r-full` — gets a rounded-rectangle ring around a circle.

Separately, the comment at `:147-150` claims the ring is a `box-shadow` "so a scroll container cannot clip it". `box-shadow` is clipped by an ancestor's `overflow` exactly as `outline` is; the reason it survives inside `.board-scroll` is that that container is `overflow-y: clip` on the axis that matters (`projections.css:130`). The result is fine; the recorded rationale is wrong and will mislead the next change.

**Files:** `base.css:147-159` · `projections.css:127-142`
**Dimensions:** Visual design; Accessibility

### F7 · P2 · No skeletons, spinners, `aria-busy` or Suspense anywhere
Architecturally reasonable for a fully static export where all data is build-time. But two real pre-hydration windows exist and neither is handled: `urlStateReady` (`Leaderboard.tsx:52, 168`) gates URL writeback and is never surfaced, and `ready` (`CompareGrid.tsx:25`) surfaces only as the bare string in A3. There is no `.skeleton` primitive to reach for.

**Dimension:** Performance as UX

### F8 · P2 · The contrast guard can't see translucent tokens, and its size check is loose
`contrast.ts:77-78` matches only `light-dark(#hex, #hex)`, so `--signal-glow` (`tokens.css:69`) and the four shadow colours (`:166-169`) are outside its reach entirely. And `contrast.test.ts:20` asserts `Object.keys(tokens.light).length > 20` against an actual 26 — up to six tokens could silently fall out of the dual-value form without failing the suite.

**Files:** `src/lib/contrast.ts:71-87` · `src/lib/contrast.test.ts:20`
**Dimension:** Accessibility

### F9 · P2 · The palette is hand-duplicated in the error boundary with no test
`global-error.tsx:18-59` embeds ~40 lines of literal CSS with hardcoded dark-theme hexes (`#0b0d10`, `#e8ecf2`, `#4da3ff`, `#79838f`, `#a3adbb`, `#616b78`). The decision is deliberate, documented (`:11-17`) and correct — a boundary that depends on an external stylesheet fails exactly when the page is already failing. But nothing compares the copy to `tokens.css`, so it will drift silently.

**Files:** `src/app/global-error.tsx:11-59` · `tokens.css:18-48`
**Dimension:** Visual design

### F10 · P2 · `CommandPalette` asserts `aria-modal="true"` without a focus trap
`:169` claims modality, and the comment at `:164-165` claims "focus is held by the single input" — but `handleInputKeyDown` (`:125-155`) handles only Escape, Arrows and Enter. Tab escapes into the page behind the backdrop. Focus *restore* is correctly implemented (`:84, 98, 106`), so this is the one missing half.

**Files:** `CommandPalette.tsx:125-171`
**Dimension:** Accessibility

### F11 · P2 · The provider popover has no arrow-key navigation
`FilterBar.tsx:127-144` renders 12 provider checkboxes in a `<fieldset>` reachable only by sequential Tab, inside a popover with a 320px `max-height` scroll (`components.css:321-329`). Escape-to-close with focus restore to the summary is correctly implemented (`FilterBar.tsx:72-77`), and `CategoryTabs.tsx:58-82` is the roving-tabindex pattern this should adopt.

**Files:** `FilterBar.tsx:114-164` · `CategoryTabs.tsx:58-82`
**Dimension:** Accessibility

### F12 · P2 · Two infinite animations survive reduced motion at zero duration
`.readout::before` (`layout.css:113`) and `.live-dot` (`:235`) keep `animation: pulse-soft var(--dur-ambient) ease-in-out infinite` with `--dur-ambient: 0ms` (`motion.css:167`). Inert in practice, but it keeps both elements on the compositor's animation list rather than declaring `animation: none` the way `.stagger > *` correctly does (`:185-187`).

**Files:** `layout.css:105-115, 229-241` · `motion.css:167, 185-187`
**Dimension:** Motion

## 2.7 What is deliberately *not* a finding

Recorded so review doesn't re-litigate it:

- **Contrast is covered.** `contrast.test.ts` asserts WCAG AA across both themes against the shipped tokens. axe's `color-contrast` rule is disabled in `a11y.test.tsx:29-32` for an honest, documented jsdom reason — no layout, no stylesheet — not to hide a failure.
- **Touch targets are covered** for 13 control classes, with two correctly reasoned exceptions (`utilities.css:62-137`). B1 and B5 are gaps in the *list*, not in the mechanism.
- **Heading order is correct** on all five screens: home's `<h1>` is the wordmark with the readout as `<h2>`; the other four each supply their own `<h1>`.
- **Missing data handling is correct everywhere**, in the maths, the sort, the cells, and the copy.
- **The `sr-only` coverage is genuine**, not decorative — 30 call sites across 15 files, including full parallel tables for the spark and the plot.
- **`output: "export"` is not a defect.** `CompareGrid.tsx:18-22` and `urlState.ts:27-33` show the constraint is understood and worked with rather than around.

---

# 3. Implemented improvement roadmap

Ordered by conversion impact, then effort. Phase 1 is the conversion work; Phases 2 and 3 carry every surface to the full bar.

## Phase 1 — The conversion path

Fixes A1, A2, A3, B1, B2, B3, C1, D2, and installs measurement.

### 1.1 — Serialize search, provider and open-weights into the URL *(fixes A1)*

Add `queryFromUrl`, `labsFromUrl` and `openWeightsFromUrl` plus their writers to `src/lib/urlState.ts`, following the existing fail-closed shape of `viewFromUrl` / `densityFromUrl` (`:43-51`) and reusing `compareFromUrl`'s sanitize-dedupe-cap pattern (`:56-67`) for the lab list. Read them in `applyUrlState` (`Leaderboard.tsx:123-179`) and write them in the writeback effect (`:181-237`), preserving the minimal-URL policy — omit each param when it equals its default, the way `isDefaultSort` (`urlState.ts:123`) and `needsDirectionParameter` (`:127`) already do.

**Files:** `src/lib/urlState.ts` · `Leaderboard.tsx:123-237` · `src/lib/urlState.test.ts` · `Leaderboard.test.tsx`
**Dimension:** Conversion
**Effect:** the primary conversion action produces the board the sharer is actually looking at. Highest-leverage item in this plan and among the smallest.

### 1.2 — Make the citation reachable on every pointer type *(fixes B1)*

In `projections.css:556-594`: reposition `.source-chip` inside its own cell rather than above it (`bottom: calc(100% - var(--s-3))` → within-cell), and give the score a resting affordance instead of a fully hidden chip — the dotted `--line-interactive` underline `REDESIGN_PLAN.md` §Flow 3 specified, with the chip as hover/focus enrichment. The pattern already exists in the codebase: `.insufficient-label` uses `text-decoration: underline dotted var(--line-interactive)` (`projections.css:499`). Add `.source-chip` to the coarse-pointer halo list in `utilities.css:69-97`.

Leave `ScoreCell.tsx:69-81` alone — the anchor's `aria-label` is already correct and already ships 456 times, and the comment at `:74-76` explains why it doesn't repeat the model name.

**Files:** `projections.css:556-594` · `utilities.css:69-97` · possibly `ScoreCell.tsx:47-53`
**Dimension:** Conversion; Accessibility
**Effect:** the ribbon's headline claim becomes true on touch. Net-neutral on the 12 KiB CSS gzip budget (currently 10.8) since it edits existing rules.

### 1.3 — Give the profile projection numerals and a citation *(fixes B2)*

Owner-chosen approach: keep `profile` as the responsive default, but make it carry the provenance claim. In `ScoreSpark.tsx:22-59`, lift the bars out of the `aria-hidden` wrapper and render each as a real `<button>` with `aria-label={`${benchmark.name}: ${value}`}`, plus a per-row "N cited" control that opens the row's `DetailPanel` — which already carries all 8 sources with "View score source" links (`DetailPanel.tsx:121-137`) — by reusing `onToggleDetails` (`LeaderboardTable.tsx:366`).

This activates two rules that already ship and are dead today: `.spark-bar:focus-visible` (`projections.css:626-631`) and the 44px spark halo (`utilities.css:133-136`). Keep the `sr-only` `<ul>` as the AT path. Verify at 390px, where bars are 5px wide on a 1px gap (`projections.css:860-867`).

**Files:** `ScoreSpark.tsx` · `LeaderboardTable.tsx:426-428` · `projections.css:596-631, 843-867`
**Dimension:** Conversion; Accessibility
**Effect:** no viewport loses the provenance claim; two dead rules become load-bearing.

### 1.4 — Fix the sticky-header collision *(fixes B3)*

Measure `.command-bar`'s height with a `ResizeObserver` and publish it as `--bar-h` on the `.leaderboard` section — the consumer at `projections.css:174` is already correct and waiting for it. Reuse the observer pattern from `CategoryTabs.tsx:44-56`; a static token will not do, because the command bar wraps to two or three rows at narrow widths (`command-row` is `flex-wrap: wrap`, `projections.css:44`).

**Files:** `Leaderboard.tsx:306-343` · `projections.css:171-177`
**Dimension:** Visual design; Interaction completeness
**Effect:** column headers stay readable through all 62 rows — the most-used orientation cue on the board.

### 1.5 — Reserve the board's box across the projection flip *(fixes C1)*

Preferred: resolve the projection **before first paint** by extending the existing pre-hydration inline script (`layout.tsx:29-36`), which already sets `data-theme` with no flash, to also stamp a viewport-derived `data-view`. Fall back to reserving a `min-height` on `.board-shell` derived from the row count if the pre-paint route proves awkward under `output: "export"`. Re-run `npm run measure -- --check` afterwards and confirm CLS against the ≤0.02 budget.

**Files:** `src/app/layout.tsx:29-36` · `Leaderboard.tsx:151-166` · `projections.css:115-121`
**Dimension:** Performance as UX

### 1.6 — Instrument the conversion loop *(owner-chosen: Phase 1)*

Add `src/lib/track.ts` wrapping `track` from `@vercel/analytics` — already a dependency, same-origin, so the CSP in `vercel.json` needs no change (rationale already recorded at `layout.tsx:130-132`). Expose a closed union of event names so call sites cannot invent strings.

| Event | Call site |
|---|---|
| `copy_link` (with a `surface` discriminator) | `CopyLinkButton.tsx:34-42` |
| `source_click` | `ScoreCell.tsx:69`, `DetailPanel.tsx:122`, `ModelRecord.tsx:183` |
| `row_expand` | `LeaderboardTable.tsx:366` |
| `projection_switch`, `density_switch` | `FilterBar.tsx:192-219` |
| `palette_navigate` | `CommandPalette.tsx:148, 200-203` |

**Effect:** makes H1 (detail-open rate), H3 (outbound source-click rate) and H5 (return rate) measurable, and H2 partly measurable via projection × viewport. Without this, nothing in Phase 1 can be judged — today only H4 (Search Console) is observable.

### 1.7 — Per-page OG images *(fixes A2; owner-approved devDependency)*

Add `scripts/generate-og.ts` following the conventions of `scripts/measure-budgets.ts` and `scripts/validate-data.ts`; add `satori` + `@resvg/resvg-js` as devDependencies (precedent: `tsx` and `vitest` are already build-only); emit `public/og/{id}.png` for all 62 records; run it from `package.json`'s `build` script alongside `validate:data`. Source the card's content from `loadLeaderboardData()` and `formatScore` so it can never disagree with the page. Wire `openGraph.images` in `generateMetadata` (`model/[id]/page.tsx:44-49`), and add a `public/og/` byte budget to `scripts/measure-budgets.ts`.

**Effect:** 62 distinct share cards — the strongest remaining lever on H4 (referring domains, search presence) for a product whose conversion action is being cited.

### 1.8 — `/compare` opens on structure, not on "Loading" *(fixes A3, D2)*

Replace the bare string at `CompareGrid.tsx:161-166` with a skeleton grid: `MAX_COMPARE` placeholder columns × the real row labels, `aria-busy="true"`, reusing `.board-shell` and `.compare-grid` so nothing shifts when the real selection resolves one tick later. Add a `.field:has(input:disabled)` state to `components.css:204-227` so the max-4 field reads as inert.

**Files:** `CompareGrid.tsx:161-271` · `components.css:204-227` · `projections.css:1009-1054`
**Dimension:** Performance as UX; Interaction completeness

## Phase 2 — Interaction completeness

Every interactive element gets its full state matrix, and every control gets a keyboard path.

| # | Change | Files | Fixes |
|---|---|---|---|
| 2.1 | Add a close button and Escape to the toast region; add an in-flight guard to `copy()` and apply the already-authored `.btn.is-error` on the clipboard-blocked path | `Toast.tsx:28-66`, `CopyLinkButton.tsx:26-50`, `components.css:87-90` | A4, A5 |
| 2.2 | Make plot points focusable (`tabIndex`, `role="button"`, `aria-label`) with arrow-key traversal ordered by x; give `transition: r` a subject or drop it. Activates `.plot-point:focus-visible`, dead today | `ScatterPlot.tsx:180-197`, `projections.css:1090-1104` | B4 |
| 2.3 | Extract the listbox pattern from the palette into one shared primitive and adopt it in the compare picker, so both get `role="option"`, `aria-activedescendant`, arrows and Escape from one implementation | new component, `CommandPalette.tsx:174-213`, `CompareGrid.tsx:141-159` | D1 |
| 2.4 | Intercept Tab in the palette so `aria-modal="true"` is honest. Focus restore is already correct | `CommandPalette.tsx:125-171` | F10 |
| 2.5 | Mount `CommandPalette` on every route — `rows` and `benchmarks` come from `loadLeaderboardData()`, already called in each page | `Leaderboard.tsx:372`, the four page components | C5 |
| 2.6 | Roving tabindex across the provider checkboxes, adopting `CategoryTabs`' keyboard handler | `FilterBar.tsx:127-144`, `CategoryTabs.tsx:58-82` | F11 |
| 2.7 | `aria-current` on footer and masthead navigation | `SiteFooter.tsx:31-41`, `SiteMasthead.tsx`, per-route mastheads | C3 |
| 2.8 | Give the board section its own visually-hidden `<h2>` instead of borrowing the site `<h1>` | `Leaderboard.tsx:307-311` | C4 |
| 2.9 | Style or remove `.best-marker` | `ScoreCell.tsx:52-59`, `projections.css:534-554` | B6 |

## Phase 3 — Craft: motion, depth, typography

| # | Change | Files | Fixes |
|---|---|---|---|
| 3.1 | **Make reduced motion actually remove transforms.** Take the decision first: either delete the four dead `.mo-*` classes and add explicit `transition-property` overrides for the twelve live inlined transforms listed in F1, **or** adopt `.mo-*` at those call sites so reduced motion has one lever. *Recommend adopting* — it restores the single point of control the system was designed around | `motion.css:19-46, 161-197`, `components.css`, `projections.css` | F1 |
| 3.2 | Raise the parallax floor — take `opacity` to ~0.6 and lengthen `animation-range` past 320px, or scope the effect to taller viewports. The LCP element should recede, not vanish | `motion.css:141-146` | C2 |
| 3.3 | Wire the projection view transition — add `view-transition-name: board` to the board shell and wrap `handleViewChange` in `document.startViewTransition` behind a support check. `motion.css:150-155` already tunes it | `Leaderboard.tsx:301-304, 345-350`, `projections.css:115-121` | F3 |
| 3.4 | Shape-aware focus ring — let the ring inherit each element's own radius rather than forcing `--r-2`, so pills get pill rings. Correct the misleading `box-shadow` rationale while there | `base.css:147-159` | F6 |
| 3.5 | Detail-panel collapse — the `grid-template-rows: 0fr → 1fr` transition already half-implemented at `projections.css:665-666` | `projections.css:658-670`, `LeaderboardTable.tsx:454-460` | E3 |
| 3.6 | One external-link treatment — standardise on `ExternalIcon` + `.link-external`, replacing the raw `↗` and adding the marker to the marker-less cases | `Methodology.tsx:299, 338`, `ProvenanceRibbon.tsx:34-42`, `SiteFooter.tsx:20-28` | E1 |
| 3.7 | An in-prose badge variant, or plain emphasised text | `Methodology.tsx:120-124`, `components.css:420-436` | E2 |
| 3.8 | Move the two inline layout styles into `projections.css` | `CompareGrid.tsx:117, 141-145` | D3 |
| 3.9 | Prune the dead surface — six unused tokens, five dead class families, and the reduced-motion clauses for classes that no longer exist | `tokens.css`, `motion.css`, `components.css`, `utilities.css` | F2 |

---

# 4. Design-system foundations

What the system needs to sustain this bar as the product grows, beyond any single fix above.

| Foundation | What to add | Why |
|---|---|---|
| **A z-index token ladder** | `--z-ground`, `--z-content`, `--z-sticky-col`, `--z-thead`, `--z-chip`, `--z-bar`, `--z-rail`, `--z-popover`, `--z-tooltip`, `--z-toast`, `--z-modal`, `--z-skip` in `tokens.css`, replacing the 14 literals in F4 | B3 is exactly the bug an untokenised stacking order produces. Adding a layer today means reading four files to find out where it belongs. |
| **Breakpoint tokens + a conformance test** | Name the five widths in `tokens.css`, and add a test that parses `projections.css` and asserts `PROFILE_BREAKPOINT` matches the media query. `contrast.ts:71-87` already establishes the "parse the shipped stylesheet, never a copy" pattern — reuse `readTokens`' approach | F5, B2. The invariant is documented at `urlState.ts:36-41` and nothing enforces it — which is how the code came to disagree with `REDESIGN_PLAN.md` (1440 vs 1280) unnoticed. |
| **One reduced-motion lever** | Adopt `.mo-instant` / `.mo-state` / `.mo-reveal` / `.mo-transform` at call sites so `motion.css:189-196` governs every transition, instead of ~20 inlined `transition` shorthands governed only by token overrides | F1. The system was designed with this lever and the implementation bypassed it, so the reduced-motion contract silently doesn't hold. |
| **Disabled as a first-class state** | `--fg-disabled` exists (`tokens.css:61`) and is consumed by exactly one rule. Add `:disabled` / `:has(input:disabled)` / `aria-disabled` treatments for `.field`, `.check`, `.tab`, `.segmented button`, `.sort-button` | D2. `components.css:2` promises "every interactive class and its full state matrix"; disabled is the row that's missing. |
| **Loading as a first-class state** | A `.skeleton` primitive built from the existing ramp and line tokens, plus an `aria-busy` convention | F7, A3. There is no skeleton pattern to reach for today, and two real pre-hydration windows. |
| **A shared result-list primitive** | One listbox component consumed by both `CommandPalette` and `CompareGrid` | D1. Two implementations of one interaction, one of them inaccessible. |
| **Close the two holes in the palette guard** | Widen `contrast.ts:77-78` to `rgba()` pairs; replace `contrast.test.ts:20`'s `> 20` with an exact count; add a test that `global-error.tsx:18-59`'s hardcoded hexes still equal `tokens.css`'s dark values, using `readTokens` | F8, F9. This guard is the single best thing in the system — worth making airtight. |
| **Analytics as a typed seam** | `src/lib/track.ts` with a closed union of event names, so call sites cannot invent strings and the measurement layer stays reviewable | 1.6. Also keeps the CSP untouched, since Vercel's beacon is same-origin. |

---

# 5. Open questions

These need product or business input, not engineering.

1. **Real conversion data is unknowable from the code, and is currently unknowable from production too.** `@vercel/analytics` ships pageviews only — no `track()` call exists in `src/`. Source-click rate, detail-open rate, scroll depth and returning-visitor share are all unmeasured. Every priority in §3 is therefore reasoned from the stated goal (`REDESIGN_PLAN.md:15`) and from what the code demonstrably does — not from observed behaviour. Item 1.6 closes this; **the ordering of Phases 2 and 3 should be revisited once it has run for a few weeks.**
2. **Is a vendor publisher ever expected to become canonical?** Every current canonical score is independently published. The "Vendor" badge (`ScoreCell.tsx:60-65`), the record's "Self-reported measurement" badge (`ModelRecord.tsx:175-177`), and the methodology paragraph explaining both (`Methodology.tsx:120-124`) are dormant, never-rendered-in-production paths. If vendor scores are never coming, that's three code paths and a paragraph to delete; if they are, the treatment needs a real design review before it first appears.
3. **Should the tagline carry the provenance claim?** `SiteMasthead.tsx:16` reads "Benchmark scores for frontier AI models" on every route, while the actual differentiator — "every number links to its source" — appears only in the ribbon on `/` (`ProvenanceRibbon.tsx:30`) and in the footer. A visitor who lands directly on a `/model/[id]` record from search never sees the claim above the fold, and those 62 pages are the ones item 1.7 is designed to make more shareable.
4. **Is `compact` (36px rows) the right default on touch?** `DEFAULT_DENSITY` is `compact` (`urlState.ts:34`); `comfortable` is 46px (`tokens.css:271-273`). 36px is below the 44px activation area the system otherwise guarantees, which is why every row control needs a halo.
5. **Should `/compare` allow more than 4 models?** `MAX_COMPARE = 4` (`urlState.ts:54`). `.compare-grid` is `table-layout: fixed` (`projections.css:1010-1013`), so 5–6 is a layout question rather than an architectural one — and comparison URLs are a conversion artifact.
6. **Does the 1280-vs-1440 discrepancy reflect a changed intent, or a slip?** `REDESIGN_PLAN.md` specifies profile as the default under **1280px**; `urlState.ts:41` ships **1440**. Item 1.3 makes the difference far less consequential, but the plan of record and the code should agree, and F5's conformance test should encode whichever wins.

---

# Verification

Run after each phase, not only at the end.

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run measure -- --check   # HTML ≤720KiB/45KiB gz · CSS ≤60KiB/12KiB gz · fonts ≤280KiB · ≤2 preloads
```

CI additionally gates homepage HTML at 1 MiB (`.github/workflows/ci.yml:44-53`) and runs six content sentinels that would catch an empty board sneaking through on bytes alone (`scripts/measure-budgets.ts`).

**New automated coverage to add alongside the changes:**

- `src/lib/urlState.test.ts` — round-trip of `query` / `labs` / `openWeights`, including defaults staying out of the URL (1.1).
- `src/components/Leaderboard.test.tsx` — a filtered state survives a URL round-trip; the profile projection exposes a numeral and a source affordance per row (1.1, 1.3).
- `src/components/a11y.test.tsx` — re-run axe on the board in `profile` and on `/compare`'s skeleton; assert spark bars are focusable and that the palette traps Tab.
- **New files.** These components have zero tests today: `CommandPalette` (⌘K, `/`, Escape, arrow wrap, focus restore, Tab trap), `Tooltip` (hover intent, Escape, flip positioning, focus restore), `Toast` (auto-dismiss vs warn persistence, dismissal), `CopyLinkButton` (including the clipboard-failure branch), `FilterBar`'s provider popover, `ScatterPlot`, and the breakpoint + `global-error` palette conformance tests from §4.

**Manual pass** (`npm run dev`):

- Widths 390 / 768 / 1280 / 1440 / 1920 — projection default, header stickiness through a full 62-row scroll, and no horizontal page scroll at any width.
- A real touch device, or coarse-pointer emulation: tap a score's citation and a spark bar. Both must work with no hover available.
- `prefers-reduced-motion: reduce` in both light and dark. After 3.1, no transform should animate at all.
- Keyboard only, no mouse: `/` → palette → a model record → Compare → copy the link → back to the board; then Tab into the board's scroll region and sort a column.
- VoiceOver or NVDA on the spark cell and the scatter plot.
- **Paste a copied "view" link into a fresh window and confirm the board matches what was on screen.** This is the acceptance test for the whole plan.
