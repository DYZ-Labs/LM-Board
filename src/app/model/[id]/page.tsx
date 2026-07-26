import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ModelRecord } from "@/components/ModelRecord";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteMasthead } from "@/components/SiteMasthead";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ToastRegion } from "@/components/Toast";
import { loadLeaderboardData } from "@/lib/data";
import { formatScore } from "@/lib/format";
import { repositoryUrl, siteUrl } from "@/lib/site";

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

  const index = row.scopes.overall.index;
  const standing =
    index === null
      ? "Not enough benchmark coverage to be ranked."
      : `Overall Index ${formatScore(index)}${row.scopes.overall.rank ? `, ranked #${row.scopes.overall.rank}` : ""}.`;

  return {
    title: row.model.name,
    description: `${row.model.name} from ${row.model.lab}: benchmark scores with a source citation behind every number. ${standing}`,
    alternates: { canonical: `/model/${row.model.id}` },
    openGraph: {
      type: "article",
      url: `/model/${row.model.id}`,
      title: `${row.model.name} — LM Board`,
      description: standing,
    },
  };
}

export default async function ModelPage({ params }: PageProps) {
  const { id } = await params;
  const data = loadLeaderboardData();
  const row = data.rows.find((entry) => entry.model.id === id);

  if (!row) notFound();

  const index = row.scopes.overall.index;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: row.model.name,
    applicationCategory: "Language model",
    url: `${siteUrl}/model/${row.model.id}`,
    sameAs: row.model.url,
    author: { "@type": "Organization", name: row.model.lab },
    datePublished: row.model.releaseDate,
    ...(index === null
      ? {}
      : {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(index.toFixed(1)),
            bestRating: 100,
            worstRating: 0,
            ratingCount: row.coverageCount,
          },
        }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <a className="skip-link" href="#record">
        Skip to the record
      </a>
      <main className="site-shell">
        <SiteMasthead
          id="top"
          actions={
            <>
              <Link className="btn" href="/">
                Leaderboard
              </Link>
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
        <ModelRecord row={row} benchmarks={data.benchmarks} />
        <SiteFooter
          repositoryUrl={repositoryUrl}
          pageLink={{ href: "/#leaderboard", label: "Leaderboard" }}
        />
      </main>
      <ToastRegion />
    </>
  );
}
