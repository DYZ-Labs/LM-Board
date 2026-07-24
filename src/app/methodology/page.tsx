import type { Metadata } from "next";

import { Methodology } from "@/components/Methodology";
import { SiteFooter } from "@/components/SiteFooter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { loadLeaderboardData } from "@/lib/data";
import { MIN_INDEX_COVERAGE } from "@/lib/index";
import { issuesUrl, repositoryUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How LM Board works: scores collected from published sources with a citation behind every number, averaged into an equal-weight Index, with a 60% coverage rule before a model is ranked.",
  alternates: {
    canonical: "/methodology",
  },
};

const datelineFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export default function MethodologyPage() {
  const data = loadLeaderboardData();
  const percentBenchmarkCount = data.benchmarks.filter(
    (benchmark) => benchmark.unit === "percent",
  ).length;
  const minimumCoverageCount = Math.ceil(
    percentBenchmarkCount * MIN_INDEX_COVERAGE,
  );
  const lastUpdatedLabel = datelineFormatter.format(
    new Date(`${data.lastUpdated}T00:00:00Z`),
  );

  return (
    <>
      <a className="skip-link" href="#methodology">
        Skip to methodology
      </a>
      <main className="site-shell">
        <header className="site-header" id="top">
          <div className="site-identity">
            <a className="wordmark" href="/" aria-label="LM Board home">
              LM Board
            </a>
            <p>Benchmark scores for frontier AI models</p>
          </div>
          <nav className="header-actions" aria-label="Site controls">
            <a href="/">Leaderboard</a>
            {repositoryUrl ? (
              <a href={repositoryUrl} target="_blank" rel="noreferrer">
                GitHub
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
            <ThemeToggle />
          </nav>
          <p className="masthead-meta">
            Updated{" "}
            <time dateTime={data.lastUpdated}>{lastUpdatedLabel}</time>
            <br />
            {data.rows.length} models · {data.scoreCount} cited scores
          </p>
        </header>
        <Methodology
          benchmarks={data.benchmarks}
          percentBenchmarkCount={percentBenchmarkCount}
          minimumCoverageCount={minimumCoverageCount}
          issuesUrl={issuesUrl}
        />
        <SiteFooter
          repositoryUrl={repositoryUrl}
          pageLink={{ href: "/#leaderboard", label: "Leaderboard" }}
        />
      </main>
    </>
  );
}
