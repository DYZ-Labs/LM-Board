import Link from "next/link";
import type { ReactNode } from "react";

type SiteMastheadProps = {
  /**
   * "home" renders the wordmark as the page <h1> and keeps the
   * #leaderboard-heading id that the board is labelled by. "link" points back
   * to the leaderboard. "static" renders plain text, for the global error
   * boundary, which sits outside the router.
   */
  variant?: "home" | "link" | "static";
  id?: string;
  actions?: ReactNode;
};

const TAGLINE = "Benchmark scores for frontier AI models";

export function SiteMasthead({
  variant = "link",
  id,
  actions,
}: SiteMastheadProps) {
  const wordmark =
    variant === "home" ? (
      <a className="wordmark" href="#top" aria-label="LM Board home">
        LM Board
      </a>
    ) : variant === "link" ? (
      <Link className="wordmark" href="/" aria-label="LM Board home">
        LM Board
      </Link>
    ) : (
      <span className="wordmark">LM Board</span>
    );

  return (
    <header className="site-header" id={id}>
      <div className="site-identity">
        {variant === "home" ? (
          <h1 id="leaderboard-heading">{wordmark}</h1>
        ) : (
          wordmark
        )}
        <p className="site-tagline">{TAGLINE}</p>
      </div>
      {actions ? (
        <nav className="header-actions" aria-label="Site controls">
          {actions}
        </nav>
      ) : null}
    </header>
  );
}
