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
    title: "Find the best model for your budget — LM Board",
    description: truncateDescription(
      `Compare LM Index with listed input-token price for ${data.rows.length} frontier models and find the strongest options for your budget.`,
    ),
    path: "/value",
    image: "/og/value.png",
    imageAlt:
      "LM Board value view — LM Index versus listed input-token price, with the best-value line highlighted.",
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
              <p className="section-kicker">Model value</p>
              <h1>Find the best model for your budget</h1>
              <p>
                Up is smarter. Left is cheaper. The blue line shows models no
                cheaper option can match.
              </p>
            </div>
            <ScatterPlot
              payload={payload}
              category="overall"
              syncPointToUrl
              variant="value"
            />
          </section>
        </main>
        <SiteFooter current="value" repositoryUrl={repositoryUrl} />
      </div>
      <DeferredCommandPalette />
    </>
  );
}
