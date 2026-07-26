import { ChangeStrip } from "@/components/ChangeStrip";
import { Leaderboard } from "@/components/Leaderboard";
import { ProvenanceRibbon } from "@/components/ProvenanceRibbon";
import { Readout } from "@/components/Readout";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteMasthead } from "@/components/SiteMasthead";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ToastRegion } from "@/components/Toast";
import { summarizeChanges } from "@/lib/changes";
import { loadLeaderboardData } from "@/lib/data";
import { coverageThreshold } from "@/lib/index";
import { repositoryUrl, siteUrl } from "@/lib/site";

export default function Home() {
  const data = loadLeaderboardData();
  const { minimumCoverageCount, percentBenchmarkCount } = coverageThreshold(
    data.benchmarks,
  );
  const leader =
    data.rows.find((row) => row.scopes.overall.rank === 1) ?? null;

  // Machine-readable provenance for the citation goal: a Dataset node naming
  // the measurement source, so the board is quotable by systems as well as by
  // people.
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "LM Board — frontier model benchmark leaderboard",
    description:
      "Curated benchmark scores for frontier AI models, each stored with its source URL and retrieval date.",
    url: siteUrl,
    license: "https://creativecommons.org/licenses/by/4.0/",
    dateModified: data.lastUpdated,
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "LM Board" },
    variableMeasured: data.benchmarks.map((benchmark) => benchmark.name),
    citation: "https://artificialanalysis.ai/",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <a className="skip-link" href="#leaderboard">
        Skip to leaderboard
      </a>
      <span className="scroll-rail" aria-hidden="true" />
      <main className="site-shell">
        <SiteMasthead variant="home" id="top" actions={<ThemeToggle />} />
        <Readout leader={leader} lastUpdated={data.lastUpdated} />
        <ProvenanceRibbon
          scoreCount={data.scoreCount}
          modelCount={data.rows.length}
          benchmarkCount={data.benchmarks.length}
        />
        <ChangeStrip summary={summarizeChanges(data)} />
        <Leaderboard
          data={data}
          minimumCoverageCount={minimumCoverageCount}
          percentBenchmarkCount={percentBenchmarkCount}
        />
        <SiteFooter repositoryUrl={repositoryUrl} />
      </main>
      <ToastRegion />
    </>
  );
}
