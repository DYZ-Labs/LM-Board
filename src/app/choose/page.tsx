import type { Metadata } from "next";

import { Chooser } from "@/components/Chooser";
import { DeferredCommandPalette } from "@/components/DeferredCommandPalette";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteMasthead } from "@/components/SiteMasthead";
import { SourceClickTracker } from "@/components/SourceClickTracker";
import { ToastRegion } from "@/components/Toast";
import { toChooserPayload } from "@/lib/chooser";
import { loadLeaderboardData } from "@/lib/data";
import { serializeJsonLd } from "@/lib/jsonLd";
import { pageMetadata, truncateDescription } from "@/lib/metadata";
import { catalogFreshness, repositoryUrl } from "@/lib/site";
import { chooseGraph } from "@/lib/structuredData";

import "@/styles/document.css";
import "@/styles/record.css";
import "@/styles/chooser.css";

export function generateMetadata(): Metadata {
  const data = loadLeaderboardData();

  return pageMetadata({
    title: "Find models - LM Board",
    description: truncateDescription(
      `Generate a cited shortlist from ${data.rows.length} frontier models using task Index, API or open-weight access, context window, and first-party token prices.`,
    ),
    path: "/choose",
    image: "/og/choose.png",
    imageAlt:
      "LM Board guided model chooser — shortlist by task, access, context, and first-party API price.",
    imageVersion: catalogFreshness(data),
  });
}

export default function ChoosePage() {
  const data = loadLeaderboardData();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(chooseGraph(data)),
        }}
      />
      <a className="skip-link" href="#choose">
        Skip to model chooser
      </a>
      <div className="site-frame">
        <SiteMasthead current="choose" id="top" />
        <main className="site-shell">
          <Chooser payload={toChooserPayload(data)} />
        </main>
        <SiteFooter current="choose" repositoryUrl={repositoryUrl} />
      </div>
      <DeferredCommandPalette />
      <ToastRegion />
      <SourceClickTracker />
    </>
  );
}
