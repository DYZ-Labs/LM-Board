import Link from "next/link";

import { ExternalIcon } from "@/components/Icon";
import { issuesUrl } from "@/lib/site";

export type FooterCurrent =
  | "leaderboard"
  | "compare"
  | "methodology"
  | "model"
  | "not-found";

type SiteFooterProps = {
  repositoryUrl: string | null;
  current: FooterCurrent;
  /**
   * Ignored, and no longer passed by any route. It used to *replace* the
   * Methodology link, which is why `grep 'href="/methodology"'` returned
   * nothing on any of the 62 model records or on /compare. Kept in the type
   * only because `claims.test.tsx` still passes it to prove it is ignored.
   */
  pageLink?: { href: string; label: string };
};

export function SiteFooter({
  repositoryUrl,
  current,
}: SiteFooterProps) {
  return (
    // id + tabIndex so a "skip past the leaderboard" link has somewhere to
    // land: 541 of the board's 577 tab stops are inside the table.
    <footer className="site-footer" id="site-footer" tabIndex={-1}>
      <a className="wordmark" href="#top" aria-label="Back to LM Board top">
        LM Board
      </a>
      <p>
        LM Board runs no evaluations. Benchmark scores are published by{" "}
        <a
          className="link link-external"
          href="https://artificialanalysis.ai/"
          target="_blank"
          rel="noreferrer"
        >
          Artificial Analysis <ExternalIcon className="ext" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        {" "}or, where marked Vendor, by model providers. LM Board computes the
        Index and ranks from those published scores; every score retains its
        source and retrieval date.
      </p>
      {/* prefetch={false}: reaching the footer used to fetch 109 KB of RSC
          payload for two routes a leaderboard visitor rarely opens, on a static
          export where the transition it buys is already sub-frame. */}
      <nav aria-label="Footer navigation">
        <Link
          href="/"
          prefetch={false}
          aria-current={
            current === "leaderboard"
              ? "page"
              : current === "model"
                ? "location"
                : undefined
          }
        >
          Leaderboard
        </Link>
        <Link
          href="/compare"
          prefetch={false}
          aria-current={current === "compare" ? "page" : undefined}
        >
          Compare
        </Link>
        <Link
          href="/methodology"
          prefetch={false}
          aria-current={current === "methodology" ? "page" : undefined}
        >
          Methodology
        </Link>
        {repositoryUrl ? (
          <a
            className="link-external"
            href={repositoryUrl}
            target="_blank"
            rel="noreferrer"
          >
            GitHub <ExternalIcon className="ext" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
        {issuesUrl ? (
          <a
            className="link-external"
            href={issuesUrl}
            target="_blank"
            rel="noreferrer"
          >
            Corrections <ExternalIcon className="ext" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </nav>
    </footer>
  );
}
