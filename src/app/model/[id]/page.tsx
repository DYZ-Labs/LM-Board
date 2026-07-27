import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DeferredCommandPalette } from "@/components/DeferredCommandPalette";
import { ModelRecord } from "@/components/ModelRecord";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteMasthead } from "@/components/SiteMasthead";
import { SourceClickTracker } from "@/components/SourceClickTracker";
import { ToastRegion } from "@/components/Toast";
import { loadLeaderboardData } from "@/lib/data";
import { serializeJsonLd } from "@/lib/jsonLd";
import { modelPageMetadata } from "@/lib/metadata";
import { repositoryUrl } from "@/lib/site";
import { modelGraph } from "@/lib/structuredData";

import "@/styles/document.css";
import "@/styles/record.css";
import "@/styles/record-responsive.css";

// Every model page is prerendered; an unknown id is a 404 rather than a
// runtime render, which `output: "export"` could not serve anyway.
export const dynamicParams = false;

export function generateStaticParams() {
  return loadLeaderboardData().rows.map((row) => ({ id: row.model.id }));
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const row = loadLeaderboardData().rows.find((entry) => entry.model.id === id);

  if (!row) return { title: "Model not found" };

  return modelPageMetadata(row);
}

export default async function ModelPage({ params }: PageProps) {
  const { id } = await params;
  const data = loadLeaderboardData();
  const row = data.rows.find((entry) => entry.model.id === id);

  if (!row) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(modelGraph(row, data)),
        }}
      />
      <a className="skip-link" href="#record">
        Skip to the record
      </a>
      {/* See page.tsx: masthead and footer outside <main>, or the route has no
          banner and no contentinfo landmark. */}
      <div className="site-frame">
        <SiteMasthead id="top" />
        <main className="site-shell">
          <ModelRecord row={row} benchmarks={data.benchmarks} />
        </main>
        <SiteFooter current="model" repositoryUrl={repositoryUrl} />
      </div>
      <DeferredCommandPalette />
      <ToastRegion />
      <SourceClickTracker />
    </>
  );
}
