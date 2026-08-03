import type { Metadata } from "next";

import { DeferredCommandPalette } from "@/components/DeferredCommandPalette";
import { Methodology } from "@/components/Methodology";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteMasthead } from "@/components/SiteMasthead";
import { ToastRegion } from "@/components/Toast";
import { loadLeaderboardData } from "@/lib/data";
import { coverageThreshold } from "@/lib/index";
import { serializeJsonLd } from "@/lib/jsonLd";
import { pageMetadata, truncateDescription } from "@/lib/metadata";
import { issuesUrl, repositoryUrl } from "@/lib/site";
import { methodologyGraph } from "@/lib/structuredData";

import "@/styles/document.css";

export function generateMetadata(): Metadata {
  const data = loadLeaderboardData();
  const { minimumCoverageCount } = coverageThreshold(data.benchmarks);

  return pageMetadata({
    title: "Methodology — LM Board",
    description: truncateDescription(
      `How the Index is built: an equal-weight mean across ${data.benchmarks.length} benchmarks, a ${minimumCoverageCount}-of-${data.benchmarks.length} Overall evidence gate, and disclosed category estimates.`,
    ),
    path: "/methodology",
    image: "/og/methodology.png",
    imageAlt: `LM Board methodology — ${data.scoreCount} source-linked measured scores, an equal-weight Index, a ${minimumCoverageCount}-of-${data.benchmarks.length} Overall evidence gate, and disclosed estimates.`,
  });
}

export default function MethodologyPage() {
  const data = loadLeaderboardData();
  const { minimumCoverageCount, percentBenchmarkCount } = coverageThreshold(
    data.benchmarks,
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(methodologyGraph(data)),
        }}
      />
      <a className="skip-link" href="#methodology">
        Skip to methodology
      </a>
      {/* See page.tsx: masthead and footer outside <main>, or the route has no
          banner and no contentinfo landmark. */}
      <div className="site-frame">
        <SiteMasthead current="methodology" id="top" />
        <main className="site-shell">
          <Methodology
            benchmarks={data.benchmarks}
            percentBenchmarkCount={percentBenchmarkCount}
            minimumCoverageCount={minimumCoverageCount}
            issuesUrl={issuesUrl}
          />
        </main>
        <SiteFooter current="methodology" repositoryUrl={repositoryUrl} />
      </div>
      <DeferredCommandPalette />
      <ToastRegion />
    </>
  );
}
