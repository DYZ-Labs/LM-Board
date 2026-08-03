import type { Metadata } from "next";

import { CompareGrid } from "@/components/CompareGrid";
import { DeferredCommandPalette } from "@/components/DeferredCommandPalette";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteMasthead } from "@/components/SiteMasthead";
import { ToastRegion } from "@/components/Toast";
import { toComparePayload } from "@/lib/compare";
import { loadLeaderboardData } from "@/lib/data";
import { serializeJsonLd } from "@/lib/jsonLd";
import { pageMetadata, truncateDescription } from "@/lib/metadata";
import { repositoryUrl } from "@/lib/site";
import { compareGraph } from "@/lib/structuredData";

import "@/styles/document.css";
import "@/styles/record.css";
import "@/styles/record-responsive.css";

export function generateMetadata(): Metadata {
  const board = loadLeaderboardData();

  return pageMetadata({
    title: "Compare models — LM Board",
    description: truncateDescription(
      `Compare up to four of ${board.rows.length} frontier models side by side across LM Index, ${board.benchmarks.length} benchmarks, pricing, and weights.`,
    ),
    path: "/compare",
    image: "/og/compare.png",
    imageAlt: `LM Board — compare any of ${board.rows.length} frontier models on ${board.benchmarks.length} benchmarks.`,
  });
}

export default function ComparePage() {
  const board = loadLeaderboardData();
  const payload = toComparePayload(board);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(compareGraph(board)),
        }}
      />
      <a className="skip-link" href="#compare">
        Skip to the comparison
      </a>
      {/* See page.tsx: masthead and footer outside <main>, or the route has no
          banner and no contentinfo landmark. */}
      <div className="site-frame">
        <SiteMasthead current="compare" id="top" />
        <main className="site-shell">
          <CompareGrid payload={payload} />
        </main>
        <SiteFooter current="compare" repositoryUrl={repositoryUrl} />
      </div>
      <DeferredCommandPalette />
      <ToastRegion />
    </>
  );
}
