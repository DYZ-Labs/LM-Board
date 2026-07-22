import { Leaderboard } from "@/components/Leaderboard";
import { SiteFooter } from "@/components/SiteFooter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { loadLeaderboardData } from "@/lib/data";
import { repositoryUrl } from "@/lib/site";

const datelineFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export default function Home() {
  const data = loadLeaderboardData();
  const lastUpdatedLabel = datelineFormatter.format(
    new Date(`${data.lastUpdated}T00:00:00Z`),
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
                LM Board
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
          <p className="masthead-meta">
            Updated{" "}
            <time dateTime={data.lastUpdated}>{lastUpdatedLabel}</time>
            <br />
            {data.rows.length} models · {data.scoreCount} cited scores
          </p>
        </header>
        <Leaderboard data={data} />
        <SiteFooter repositoryUrl={repositoryUrl} />
      </main>
    </>
  );
}
