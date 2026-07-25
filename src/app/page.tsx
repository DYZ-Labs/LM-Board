import { Leaderboard } from "@/components/Leaderboard";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteMasthead } from "@/components/SiteMasthead";
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
        <SiteMasthead
          variant="home"
          id="top"
          actions={
            <>
              {repositoryUrl ? (
                <a href={repositoryUrl} target="_blank" rel="noreferrer">
                  GitHub
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : null}
              <ThemeToggle />
            </>
          }
          meta={
            <>
              Updated{" "}
              <time dateTime={data.lastUpdated}>{lastUpdatedLabel}</time>
              <br />
              {data.rows.length} models · {data.scoreCount} cited scores
            </>
          }
        />
        <Leaderboard data={data} />
        <SiteFooter repositoryUrl={repositoryUrl} />
      </main>
    </>
  );
}
