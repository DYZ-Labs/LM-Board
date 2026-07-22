# Production Readiness Audit — LM Board

Audited 2026-07-22 on branch `redesign/printed-index` (clean working tree, 4 commits ahead of `main`). Verified locally: `npm run typecheck`, `npm run validate:data` (39 models, 8 benchmarks, 287 scores as of the 2026-07-22 back-catalog addition), and `npm run build` (9 static routes, ~109 kB first-load JS) all pass. `npm audit` reports 3 transitive advisories (details below). Deployment target assumed to be Vercel static hosting per `vercel.json` and `PLAN.md`.

## 1. Verdict

**This is deployable today.** It is a fully static export (`next.config.ts:4`) with no server, no database, no auth, and no secrets, so the classic outage/breach surface mostly does not exist, and the build fails closed if the data is invalid. Nothing found rises to Blocker severity. The gap to "production-grade" is a short list of safety nets and launch-checklist items: the ranking math that is the entire product has zero automated tests, production env vars fall back silently, there are no security headers, no error boundary, no linter, and no LICENSE for a repo that solicits public contributions. All are fixable in roughly a day of work.

## 2. Findings

### Blocker

None. No hardcoded credentials, no committed env files or build output (verified against `git ls-files`), no injection surface, no unprotected endpoints (there are no endpoints), and the build gates on data integrity.

### High

**H1 — The core ranking/index logic has zero automated tests, and CI cannot catch a regression in it.**
- Files: `src/lib/index.ts:31-58` (Index mean + 60% coverage gate), `src/lib/useSort.ts:76-136` (comparators, null handling, tiebreaks), `src/lib/urlState.ts` (shareable-URL parsing), `scripts/validate-data.ts` (the validator itself); `.github/workflows/ci.yml:29-33` runs only typecheck and build. No `*.test.*` files or test runner config exist anywhere in the repo.
- Why it matters: the site's whole value proposition is that its numbers are trustworthy ("Simple enough to audit", `src/components/Methodology.tsx:20`). A subtle regression — e.g. the `Math.ceil` coverage-gate boundary in `index.ts:48`, or null-score ordering in `useSort.ts:68-74` — would ship silently as wrong published rankings, the worst failure mode this product has, and nothing would flag it.
- Action: add Vitest with unit tests for `calculateLmBoardIndex` (gate boundary at exactly/below 60%, empty scope, non-percent benchmark exclusion), `sortLeaderboardRows` (nulls sort last in both directions, name tiebreak), and `urlState` round-tripping; add `npm test` to `package.json` and a test step to `ci.yml`.

### Medium

**M1 — Production site URL falls back silently; a misconfigured build succeeds with wrong canonical/OG/sitemap URLs.**
- Files: `src/lib/site.ts:9-11` (`NEXT_PUBLIC_SITE_URL` → Vercel env vars → `http://localhost:3000`), consumed by `src/app/layout.tsx:43` (`metadataBase`), `src/app/sitemap.ts`, `src/app/robots.ts`.
- Why it matters: on Vercel the platform vars usually rescue this, but any non-Vercel build (PLAN.md line 20 also names Netlify/GitHub Pages as options) or a CI-built artifact ships `http://localhost:3000` canonicals without any error. Silent SEO/social breakage is hard to notice.
- Action: set `NEXT_PUBLIC_SITE_URL` (and `NEXT_PUBLIC_GITHUB_REPOSITORY_URL`) in the production environment as part of the launch checklist, and consider making the build fail when `NODE_ENV=production` resolves `siteUrl` to localhost.

**M2 — `npm audit` flags high-severity transitive advisories, and nothing surfaces this on an ongoing basis.**
- Files: `package.json:12` pins `next` exactly to `15.5.20`; audit flags `sharp <0.35.0` (high, libvips CVE-2026-33327/33328/35590/35591) and `postcss` (moderate XSS) via `next`.
- Why it matters: practical exposure here is near zero — `sharp` never runs (static export, no `next/image` usage anywhere in `src/`) and postcss only processes the repo's own authored CSS at build time — but the advisories will keep accumulating unseen, and `next` 15.5.21 already exists with 16.x current.
- Action: bump `next` to the latest 15.5.x patch now, plan the 16.x major, and add a non-blocking `npm audit` step (or Dependabot/Renovate) so new advisories are at least visible.

**M3 — No security headers are configured.**
- Files: `vercel.json` (no `headers` block); the inline theme script at `src/app/layout.tsx:33-40,130` is the only script a CSP would need to allow.
- Why it matters: without `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `frame-ancestors`/`X-Frame-Options`, the site can be framed for clickjacking-style abuse and loses defense-in-depth that costs nothing on a static site. Note `headers()` in `next.config.ts` does not work with `output: "export"` — the headers must live in `vercel.json` (or the host's equivalent).
- Action: add a `headers` section to `vercel.json` with `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`; if adding a CSP, use a hash source for the one inline theme script (it is a constant string, so its hash is stable).

**M4 — No error boundary and no visibility into client-side failures.**
- Files: `src/app/` contains no `error.tsx` or `global-error.tsx`; the interactive layer is `src/components/Leaderboard.tsx` (client component driving all sorting/filtering/URL state).
- Why it matters: a runtime/hydration error in the client bundle degrades the page to Next's unstyled default error screen, and no one would know it happened — there is no error reporting, and (reasonably, for a static site) no logs to check.
- Action: add a branded `global-error.tsx`; set up an external uptime check on `/` and `/methodology`; optionally add a lightweight client error reporter. Server-side logging/health endpoints are genuinely N/A for this architecture.

**M5 — No linter exists, so an entire class of React bugs is unchecked.**
- Files: no ESLint config, dependency, or `lint` script anywhere (`package.json:5-10`); `next build` silently skips linting when no config is present.
- Why it matters: `src/components/Leaderboard.tsx` carries non-trivial hook logic (four `useEffect`s with dependency arrays, `Leaderboard.tsx:113-222`); without `react-hooks` lint rules, a stale-closure or missing-dependency bug introduced by a future contributor passes CI.
- Action: add `eslint` + `eslint-config-next`, a `lint` script, and a CI step; fix anything it reports.

**M6 — No LICENSE file in a repo that solicits public contributions.**
- Files: repo root (no LICENSE in `git ls-files`); `CONTRIBUTING.md` and the "Suggest a correction on GitHub" flow (`src/components/Methodology.tsx:75-83`) assume a public repo.
- Why it matters: with no license, default copyright applies — contributors have no clarity on what they are agreeing to and users cannot legally reuse the data or code. This becomes real the moment the repo goes public in M4.
- Action: choose a license (consider licensing code and the curated dataset separately, e.g. MIT + CC BY 4.0) and add it before publishing the repository.

### Cleanup

**C1 — `UI_UX_REDESIGN_PLAN.md` is an unreferenced working document.** 18 kB planning doc referenced by nothing in the repo (verified by grep; `PLAN.md`, by contrast, is load-bearing — README and CONTRIBUTING link to it). Delete it or fold its decisions into `PLAN.md`'s decision log.

**C2 — Sub-dollar prices render inconsistently between the table and the detail panel.** `src/components/LeaderboardTable.tsx:38-42` shows `$0.435` as "$0.44", while `src/components/DetailPanel.tsx:10-13,86` shows the same price as "$0.4". The data hits this today (`deepseek-v4-pro` input 0.435, `minimax-m3` input 0.3 in `data/models.json`). Extract one shared price formatter; while there, consolidate the seven duplicated `Intl` formatter instances across `LeaderboardTable.tsx`, `DetailPanel.tsx`, `ScoreCell.tsx`, and the two page files.

**C3 — Data integrity checks are implemented twice and have drifted.** `scripts/validate-data.ts:59-115` and `src/lib/data.ts:86-126` duplicate the duplicate-ID/unknown-reference/reasoning-effort checks, and the percent-range check exists only in the script. Today `npm run build` chains both so nothing slips through, but the duplication invites divergence. Extract the relationship checks into a shared module both call.

No other cruft found: no TODO/FIXME markers, no stray `console.log` in app code (the two in `scripts/validate-data.ts` are correct CLI output), no dead code, no unused dependencies (all four runtime deps and all devDeps are used), no committed artifacts.

## 3. Already solid

- **Orientation/docs:** README, PLAN.md, and CONTRIBUTING.md are accurate against the code as it exists, including the data workflow and required checks.
- **Configuration & secrets:** no secrets exist anywhere; `.gitignore` correctly excludes `.env*` (keeping `.env.example`), build output, and tsbuildinfo; the only env vars are intentionally-public `NEXT_PUBLIC_*` values.
- **Application security:** no injection surface (no server, no `dangerouslySetInnerHTML` with dynamic content — the one inline script at `layout.tsx:130` is a constant); `z.httpUrl()` in `src/lib/schema.ts:25` makes `javascript:` hrefs unrepresentable in the data; every `target="_blank"` link carries `rel="noreferrer"`; schemas are `.strict()` so unknown fields are rejected.
- **Error handling & resilience:** the system fails closed — malformed data breaks the build (both `validate-data.ts` and `loadLeaderboardData`), never production; the deployed site makes zero runtime calls to external services, so there is nothing to time out or retry.
- **CI mechanics:** the workflow itself is well-built — Node pinned via `.nvmrc`, `npm ci` against a committed lockfile, 10-minute timeout, least-privilege `permissions: contents: read`; the only gap is the missing test step (H1).
- **Performance & data:** 17 rows × 8 columns prerendered at build time, ~109 kB first load, fonts self-hosted via `next/font` (zero third-party requests, no `url()` refs in CSS); git history is the data audit trail; pagination/N+1/migration concerns do not apply.
- **Deployment:** static export + `vercel.json` + lockfile + `engines`/`.nvmrc` pinning means deploys are reproducible; rollback is Vercel's instant-rollback or a git revert of a data commit.

## 4. Could not verify

- **Vercel project configuration:** whether `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_GITHUB_REPOSITORY_URL` are set in the production environment, which Node version the build image uses, what production domain is attached, and which headers (e.g. HSTS) the platform adds by default. `PLAN.md:174-175` and `:202` confirm deployment and the public repo URL are still open M4 items.
- **GitHub repository settings:** whether branch protection makes the CI workflow a required check before merge — nothing in the repo can prove this.
- **Runtime behavior in a real browser:** this audit verified the build and read every source file but did not click through the deployed site; the interactive layer (sorting, filters, URL state, theme) should get a manual pass on the production URL at launch, per the checklist already in `CONTRIBUTING.md:49`.
