import Link from "next/link";

import { ThemeToggle } from "@/components/ThemeToggle";
import { repositoryUrl } from "@/lib/site";

type SiteMastheadProps = {
  /**
   * "home" keeps the in-page top link. The visible page h1 lives in Readout,
   * where it describes the product rather than repeating the brand. "link"
   * points home; "static" is plain text outside the router.
   */
  variant?: "home" | "link" | "static";
  current?: "leaderboard" | "choose" | "compare" | "methodology";
  id?: string;
};

export function SiteMasthead({
  variant = "link",
  current,
  id,
}: SiteMastheadProps) {
  const wordmark =
    variant === "home" ? (
      <a className="wordmark" href="#top" aria-label="LM Board home">
        LM Board
      </a>
    ) : variant === "link" ? (
      <Link
        className="wordmark"
        href="/"
        aria-label="LM Board home"
        prefetch={false}
      >
        LM Board
      </Link>
    ) : (
      <span className="wordmark">LM Board</span>
    );

  return (
    <header className="site-header" id={id}>
      <div className="site-identity">{wordmark}</div>
      {variant === "static" ? null : (
        <>
          {/* Navigation sits with the identity, actions sit at the far edge —
              the two clusters are different kinds of thing and reading them as
              one run-on string is what happens when they share a corner. */}
          <nav className="site-nav" aria-label="Sections">
            <Link
              href="/"
              prefetch={false}
              aria-current={current === "leaderboard" ? "page" : undefined}
            >
              Leaderboard
            </Link>
            <Link
              href="/choose"
              prefetch={false}
              aria-current={current === "choose" ? "page" : undefined}
            >
              Find
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
          </nav>
          <div className="header-actions">
            {repositoryUrl ? (
              <a
                className="site-nav-aside"
                href={repositoryUrl}
                target="_blank"
                rel="noreferrer"
              >
                GitHub
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
            <ThemeToggle />
          </div>
        </>
      )}
    </header>
  );
}
