import Link from "next/link";

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
        An independent index of curated benchmark results. Benchmark scores are
        independently measured by{" "}
        <a
          className="link link-external"
          href="https://artificialanalysis.ai/"
          target="_blank"
          rel="noreferrer"
        >
          Artificial Analysis
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        . Not affiliated with any model providers or benchmark authors.
      </p>
      <nav aria-label="Footer navigation">
        <Link href={pageLink.href}>{pageLink.label}</Link>
        <Link href="/compare">Compare</Link>
        <a href="/feed.xml">Changes</a>
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
