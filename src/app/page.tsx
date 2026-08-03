import type { Metadata } from "next";

import { ChangeStrip } from "@/components/ChangeStrip";
import { Leaderboard } from "@/components/Leaderboard";
import { ProvenanceRibbon } from "@/components/ProvenanceRibbon";
import { Readout } from "@/components/Readout";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteMasthead } from "@/components/SiteMasthead";
import { SourceClickTracker } from "@/components/SourceClickTracker";
import { ToastRegion } from "@/components/Toast";
import { summarizeChanges } from "@/lib/changes";
import { loadLeaderboardData } from "@/lib/data";
import { coverageThreshold } from "@/lib/index";
import { serializeJsonLd } from "@/lib/jsonLd";
import { toLeaderboardClientPayload } from "@/lib/leaderboardPayload";
import { pageMetadata, truncateDescription } from "@/lib/metadata";
import { repositoryUrl } from "@/lib/site";
import { homeGraph } from "@/lib/structuredData";

export function generateMetadata(): Metadata {
  const data = loadLeaderboardData();

  return pageMetadata({
    title: "LM Board - Benchmark Scores for Frontier AI Models",
    // Every count is read off the dataset, because "17 models" is what happens
    // when one of them is a literal.
    description: truncateDescription(
      `A source-linked Index of ${data.rows.length} frontier AI models across ${data.benchmarks.length} benchmarks, built from ${data.scoreCount} measured scores with publisher and retrieval details.`,
    ),
    path: "/",
    image: "/og/home.png",
    imageAlt: `LM Board — ${data.rows.length} frontier models ranked on ${data.benchmarks.length} benchmarks by ${data.scoreCount} cited scores.`,
  });
}

export default function Home() {
  const data = loadLeaderboardData();
  const { minimumCoverageCount, percentBenchmarkCount } = coverageThreshold(
    data.benchmarks,
  );
  const leader =
    data.rows.find((row) => row.scopes.overall.rank === 1) ?? null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(homeGraph(data)) }}
      />
      <a className="skip-link" href="#leaderboard">
        Skip to leaderboard
      </a>
      {/* The masthead and the footer sit outside <main>. Per HTML-AAM a
          <header>/<footer> with a `main` ancestor maps to `generic`, so while
          they were nested the page exposed no banner and no contentinfo
          landmark at all — and axe stayed silent, because its landmark rules
          only fire on landmarks that exist. .site-frame carries the rail the
          three of them share. */}
      <div className="site-frame">
        <SiteMasthead variant="home" current="leaderboard" id="top" />
        <main className="site-shell">
          {/* One DOM and layout unit. The former three individually-positioned
              grid children left Leaderboard auto-placeable into row one at
              desktop widths, so visual order could diverge from source order. */}
          <div className="hero-evidence">
            <Readout leader={leader} lastUpdated={data.lastUpdated} />
            <div className="hero-evidence-line">
              <ProvenanceRibbon
                scoreCount={data.scoreCount}
                modelCount={data.rows.length}
                benchmarkCount={data.benchmarks.length}
              />
              <ChangeStrip summary={summarizeChanges(data)} />
            </div>
          </div>
          <Leaderboard
            payload={toLeaderboardClientPayload(data)}
            minimumCoverageCount={minimumCoverageCount}
            percentBenchmarkCount={percentBenchmarkCount}
          />
        </main>
        <SiteFooter current="leaderboard" repositoryUrl={repositoryUrl} />
      </div>
      <ToastRegion />
      <SourceClickTracker />
    </>
  );
}
