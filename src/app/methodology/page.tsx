import type { Metadata } from "next";
import Link from "next/link";

import { FreshnessChip } from "@/components/FreshnessChip";
import { Methodology } from "@/components/Methodology";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteMasthead } from "@/components/SiteMasthead";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ToastRegion } from "@/components/Toast";
import { loadLeaderboardData } from "@/lib/data";
import { coverageThreshold } from "@/lib/index";
import { issuesUrl, repositoryUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How LM Board works: scores collected from published sources with a citation behind every number, averaged into an equal-weight Index, with a 60% coverage rule before a model is ranked.",
  alternates: {
    canonical: "/methodology",
  },
};

export default function MethodologyPage() {
  const data = loadLeaderboardData();
  const { minimumCoverageCount, percentBenchmarkCount } = coverageThreshold(
    data.benchmarks,
  );

  return (
    <>
      <a className="skip-link" href="#methodology">
        Skip to methodology
      </a>
      <main className="site-shell">
        <SiteMasthead
          id="top"
          actions={
            <>
              <Link className="btn" href="/">
                Leaderboard
              </Link>
              <FreshnessChip date={data.lastUpdated} />
              {repositoryUrl ? (
                <a
                  className="btn"
                  href={repositoryUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : null}
              <ThemeToggle />
            </>
          }
        />
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
      <ToastRegion />
    </>
  );
}
