type SiteFooterProps = {
  repositoryUrl: string | null;
  pageLink?: { href: string; label: string };
};

export function SiteFooter({
  repositoryUrl,
  pageLink = { href: "/methodology", label: "Methodology" },
}: SiteFooterProps) {
  return (
    <footer className="site-footer">
      <a className="wordmark" href="#top" aria-label="Back to LM Board top">
        LM Board
      </a>
      <p>
        An independent index of curated benchmark results. Not affiliated with
        any model providers or benchmark authors.
      </p>
      <nav aria-label="Footer navigation">
        <a href={pageLink.href}>{pageLink.label}</a>
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
