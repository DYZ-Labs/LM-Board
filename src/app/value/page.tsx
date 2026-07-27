import type { Metadata } from "next";

import { DeferredCommandPalette } from "@/components/DeferredCommandPalette";
import { ScatterPlot } from "@/components/ScatterPlot";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteMasthead } from "@/components/SiteMasthead";
import { loadLeaderboardData } from "@/lib/data";
import { serializeJsonLd } from "@/lib/jsonLd";
import { pageMetadata, truncateDescription } from "@/lib/metadata";
import { repositoryUrl } from "@/lib/site";
import { valueGraph } from "@/lib/structuredData";
import { toPlotPayload } from "@/lib/visualization";

import "@/styles/document.css";

export function generateMetadata(): Metadata {
  const data = loadLeaderboardData();

  return pageMetadata({
    title: "Price versus performance — LM Board",
    description: truncateDescription(
      `Compare listed input-token price with the Overall Index for ${data.rows.length} frontier models, including the efficient frontier and model-level evidence.`,
    ),
    path: "/value",
    image: "/og/value.png",
    imageAlt:
      "LM Board value view — provider-listed input-token price versus Overall Index, with the efficient frontier highlighted.",
  });
}

export default function ValuePage() {
  const data = loadLeaderboardData();
  const payload = toPlotPayload(data.rows, "overall");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(valueGraph(data)),
        }}
      />
      <a className="skip-link" href="#value">
        Skip to price versus performance
      </a>
      <div className="site-frame">
        <SiteMasthead current="value" id="top" />
        <main className="site-shell">
          <section className="longform value-page" id="value">
            <div className="longform-intro">
              <p className="section-kicker">Value view</p>
              <h1>Price versus performance</h1>
              <p>
                Listed input-token price against the Overall Index. Higher Index
                and lower price are better; the efficient frontier marks models
                for which no cheaper model has an equal or higher Index.
              </p>
            </div>
            <ScatterPlot payload={payload} category="overall" syncPointToUrl />
          </section>
        </main>
        <SiteFooter current="value" repositoryUrl={repositoryUrl} />
      </div>
      <DeferredCommandPalette />
    </>
  );
}
