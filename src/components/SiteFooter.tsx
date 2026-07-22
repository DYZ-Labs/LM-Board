type SiteFooterProps = {
  repositoryUrl: string | null;
};

export function SiteFooter({ repositoryUrl }: SiteFooterProps) {
  return (
    <footer className="site-footer">
      <a className="wordmark" href="#top" aria-label="Back to LM Board top">
        LM Board
      </a>
      <p>
        An independent index of curated benchmark results. Not affiliated with
        the model providers or benchmark authors.
      </p>
      <nav aria-label="Footer navigation">
        <a href="#leaderboard">Leaderboard</a>
        <a href="#methodology">Methodology</a>
        {repositoryUrl ? (
          <a href={repositoryUrl} target="_blank" rel="noreferrer">
            GitHub
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </nav>
    </footer>
  );
}
