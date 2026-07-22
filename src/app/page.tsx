import { Leaderboard } from "@/components/Leaderboard";
import { Methodology } from "@/components/Methodology";
import { SiteFooter } from "@/components/SiteFooter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { loadLeaderboardData } from "@/lib/data";
import { MIN_INDEX_COVERAGE } from "@/lib/index";
import { issuesUrl, repositoryUrl } from "@/lib/site";

export default function Home() {
  const data = loadLeaderboardData();
  const percentBenchmarkCount = data.benchmarks.filter(
    (benchmark) => benchmark.unit === "percent",
  ).length;
  const minimumCoverageCount = Math.ceil(
    percentBenchmarkCount * MIN_INDEX_COVERAGE,
  );

  return (
    <>
      <a className="skip-link" href="#leaderboard">
        Skip to leaderboard
      </a>
      <main className="site-shell">
        <header className="site-header" id="top">
          <div className="site-identity">
            <h1 id="leaderboard-heading">
              <a className="wordmark" href="#top" aria-label="LM Board home">
                LM <span>Board</span>
              </a>
            </h1>
            <p>Curated benchmark scores for frontier language models</p>
          </div>
          <nav className="header-actions" aria-label="Site controls">
            {repositoryUrl ? (
              <a href={repositoryUrl} target="_blank" rel="noreferrer">
                GitHub
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
            <ThemeToggle />
          </nav>
        </header>
        <Leaderboard data={data} />
        <Methodology
          percentBenchmarkCount={percentBenchmarkCount}
          minimumCoverageCount={minimumCoverageCount}
          issuesUrl={issuesUrl}
        />
        <SiteFooter repositoryUrl={repositoryUrl} />
      </main>
    </>
  );
}
