import type { LeaderboardData, LeaderboardRow } from "@/lib/data";
import { coverageThreshold } from "@/lib/index";
import { modelRecordFreshness, siteUrl } from "@/lib/site";

/**
 * The graph keeps four kinds of ownership separate:
 *
 * - Artificial Analysis publishes the measured benchmark scores.
 * - A model provider publishes its model.
 * - LM Board computes the equal-weight Index and ranks.
 * - LM Board publishes this selected and arranged dataset; it runs no
 *   evaluations.
 *
 * `AggregateRating` is deliberately absent: benchmark values are not user
 * ratings. Offer availability is absent too; a listed token price does not
 * establish that a model is "InStock".
 */

const LM_BOARD_ORGANIZATION_ID = `${siteUrl}/#organization`;
const ARTIFICIAL_ANALYSIS_ID =
  "https://artificialanalysis.ai/#organization";
const WEBSITE_ID = `${siteUrl}/#website`;
const HOME_PAGE_ID = `${siteUrl}/#webpage`;
const DATASET_ID = `${siteUrl}/#dataset`;
const LEADERBOARD_ID = `${siteUrl}/#leaderboard`;
const LICENSE = "https://creativecommons.org/licenses/by/4.0/";
const ARTIFICIAL_ANALYSIS_URL = "https://artificialanalysis.ai/";
const LICENSE_SCOPE =
  "CC BY 4.0 covers LM Board contributors' selection, arrangement and annotations. Third-party benchmark measurements remain subject to their source terms.";

type JsonLdNode = Record<string, unknown>;

const reference = (id: string) => ({ "@id": id });

function lmBoardOrganization(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": LM_BOARD_ORGANIZATION_ID,
    name: "LM Board",
    url: siteUrl,
    logo: `${siteUrl}/icon-512.png`,
    description:
      "LM Board computes an equal-weight benchmark Index and ranks from source-linked scores. It runs no evaluations.",
  };
}

function artificialAnalysisOrganization(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": ARTIFICIAL_ANALYSIS_ID,
    name: "Artificial Analysis",
    url: ARTIFICIAL_ANALYSIS_URL,
    description: "Publisher of benchmark scores used by LM Board.",
  };
}

function website(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: siteUrl,
    name: "LM Board",
    publisher: reference(LM_BOARD_ORGANIZATION_ID),
    inLanguage: "en-US",
  };
}

function breadcrumbs(
  id: string,
  trail: { name: string; path: string }[],
): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    "@id": id,
    itemListElement: trail.map((crumb, position) => ({
      "@type": "ListItem",
      position: position + 1,
      name: crumb.name,
      item: `${siteUrl}${crumb.path === "/" ? "" : crumb.path}`,
    })),
  };
}

/** The board-level Dataset represents LM Board's selection, Index and ranks. */
function boardDataset(data: LeaderboardData): JsonLdNode {
  const artificialAnalysisCount =
    data.scoreCount - data.selfReportedCount;
  const ownership =
    data.selfReportedCount === 0
      ? `Artificial Analysis publishes all ${data.scoreCount} measured benchmark scores.`
      : `Artificial Analysis publishes ${artificialAnalysisCount} of ${data.scoreCount} measured benchmark scores; ${data.selfReportedCount} are vendor-reported.`;

  return {
    "@type": "Dataset",
    "@id": DATASET_ID,
    name: "LM Board — frontier model benchmark leaderboard",
    description: `LM Board's equal-weight Index and ranks for ${data.rows.length} frontier AI models across ${data.benchmarks.length} benchmarks, based on ${data.scoreCount} source-linked measured scores.`,
    url: siteUrl,
    license: LICENSE,
    usageInfo: LICENSE_SCOPE,
    isAccessibleForFree: true,
    dateModified: data.lastUpdated,
    temporalCoverage: `${data.oldestRetrieved}/${data.lastUpdated}`,
    creator: reference(LM_BOARD_ORGANIZATION_ID),
    publisher: reference(LM_BOARD_ORGANIZATION_ID),
    citation: ARTIFICIAL_ANALYSIS_URL,
    isBasedOn: data.benchmarks.map((benchmark) => benchmark.sourceUrl),
    measurementTechnique: `${ownership} LM Board runs no evaluations; Overall ranking requires measured coverage, after which complete category gaps may be estimated from measured percentile standing and disclosed as estimates.`,
    keywords: [
      "LLM benchmarks",
      "AI leaderboard",
      "language model evaluation",
      ...data.benchmarks.map((benchmark) => benchmark.name),
    ],
    variableMeasured: data.benchmarks.map((benchmark) => ({
      "@type": "PropertyValue",
      name: benchmark.name,
      description: benchmark.description,
      ...(benchmark.unit === "percent" ? { unitText: "percent" } : {}),
      url: benchmark.sourceUrl,
    })),
  };
}

/** The leaderboard itself, machine-readable and ordered by the Overall Index. */
function leaderboardList(data: LeaderboardData, limit = 20): JsonLdNode {
  const ranked = data.rows
    .filter((row) => row.scopes.overall.rank !== null)
    .sort(
      (left, right) =>
        (left.scopes.overall.rank ?? 0) - (right.scopes.overall.rank ?? 0),
    )
    .slice(0, limit);

  return {
    "@type": "ItemList",
    "@id": LEADERBOARD_ID,
    name: "Frontier models by Overall Index",
    numberOfItems: ranked.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: ranked.map((row, position) => ({
      "@type": "ListItem",
      position: position + 1,
      name: row.model.name,
      url: `${siteUrl}/model/${row.model.id}`,
    })),
  };
}

function homePage(data: LeaderboardData): JsonLdNode {
  return {
    "@type": "WebPage",
    "@id": HOME_PAGE_ID,
    url: siteUrl,
    name: "LM Board — Frontier Model Benchmark Leaderboard",
    description: `${data.rows.length} frontier AI models ranked across ${data.benchmarks.length} benchmarks, with a source and retrieval date for each measured score.`,
    isPartOf: reference(WEBSITE_ID),
    about: reference(DATASET_ID),
    mainEntity: reference(DATASET_ID),
    hasPart: reference(LEADERBOARD_ID),
    dateModified: data.lastUpdated,
    inLanguage: "en-US",
  };
}

export function homeGraph(data: LeaderboardData) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      lmBoardOrganization(),
      artificialAnalysisOrganization(),
      website(),
      homePage(data),
      boardDataset(data),
      leaderboardList(data),
    ],
  };
}

function providerId(lab: string) {
  return `${siteUrl}/#provider-${encodeURIComponent(lab.toLowerCase())}`;
}

function providerOrganization(row: LeaderboardRow): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": providerId(row.model.lab),
    name: row.model.lab,
  };
}

function modelEntity(row: LeaderboardRow): JsonLdNode {
  const { model } = row;
  const id = `${siteUrl}/model/${model.id}#model`;
  const provider = reference(providerId(model.lab));

  return {
    "@type": "SoftwareApplication",
    "@id": id,
    name: model.name,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    url: model.url,
    author: provider,
    publisher: provider,
    datePublished: model.releaseDate,
    ...(model.pricing
      ? {
          offers: [
            {
              "@type": "Offer",
              name: "Listed input-token price",
              price: model.pricing.input,
              priceCurrency: "USD",
              unitText: "USD per million input tokens",
              url: model.pricing.source.url,
              seller: provider,
            },
            {
              "@type": "Offer",
              name: "Listed output-token price",
              price: model.pricing.output,
              priceCurrency: "USD",
              unitText: "USD per million output tokens",
              url: model.pricing.source.url,
              seller: provider,
            },
          ],
        }
      : {}),
  };
}

function scoreDescription(row: LeaderboardRow, score: NonNullable<
  LeaderboardRow["scoresByBenchmark"][string]
>) {
  const ownership = score.selfReported
    ? `Vendor-reported by ${row.model.lab}.`
    : "Published by Artificial Analysis.";
  return [
    ownership,
    score.settings ? `Evaluation settings: ${score.settings}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * One model's selected score record. Every measured value retains its source,
 * retrieval date, available settings and publisher qualification.
 */
function modelDataset(row: LeaderboardRow, data: LeaderboardData): JsonLdNode {
  const url = `${siteUrl}/model/${row.model.id}`;
  const measured = data.benchmarks
    .map((benchmark) => ({
      benchmark,
      score: row.scoresByBenchmark[benchmark.id],
    }))
    .filter(
      (
        entry,
      ): entry is {
        benchmark: (typeof data.benchmarks)[number];
        score: NonNullable<
          LeaderboardRow["scoresByBenchmark"][string]
        >;
      } => entry.score != null,
    );
  const freshness = modelRecordFreshness(row);
  const citations = [
    ...new Set(measured.map((entry) => entry.score.source.url)),
  ];
  const artificialAnalysisCount = measured.filter(
    (entry) => !entry.score.selfReported,
  ).length;
  const vendorReportedCount = measured.length - artificialAnalysisCount;
  const ownership =
    vendorReportedCount === 0
      ? `Artificial Analysis publishes all ${measured.length} measured scores on this record.`
      : `Artificial Analysis publishes ${artificialAnalysisCount} of ${measured.length} measured scores on this record; ${vendorReportedCount} are vendor-reported.`;

  return {
    "@type": "Dataset",
    "@id": `${url}#dataset`,
    name: `${row.model.name} benchmark scores`,
    description: `${ownership} LM Board runs no evaluations; it computes the equal-weight Index and rank.`,
    url,
    license: LICENSE,
    usageInfo: LICENSE_SCOPE,
    isAccessibleForFree: true,
    creator: reference(LM_BOARD_ORGANIZATION_ID),
    publisher: reference(LM_BOARD_ORGANIZATION_ID),
    citation: citations,
    isPartOf: reference(DATASET_ID),
    mainEntityOfPage: reference(`${url}#webpage`),
    dateModified: freshness.lastModified,
    ...(freshness.firstScoreRetrieved &&
    freshness.latestScoreRetrieved
      ? {
          temporalCoverage: `${freshness.firstScoreRetrieved}/${freshness.latestScoreRetrieved}`,
        }
      : {}),
    about: reference(`${url}#model`),
    variableMeasured: measured.map(({ benchmark, score }) => ({
      "@type": "PropertyValue",
      name: benchmark.name,
      value: score.value,
      ...(benchmark.unit === "percent" ? { unitText: "percent" } : {}),
      url: score.source.url,
      description: scoreDescription(row, score),
      valueReference: [
        {
          "@type": "PropertyValue",
          name: "Source retrieval date",
          value: score.source.retrieved,
        },
        {
          "@type": "PropertyValue",
          name: "Score publisher",
          value: score.selfReported
            ? row.model.lab
            : "Artificial Analysis",
          url: score.selfReported
            ? row.model.url
            : ARTIFICIAL_ANALYSIS_URL,
        },
      ],
    })),
  };
}

export function modelGraph(row: LeaderboardRow, data: LeaderboardData) {
  const url = `${siteUrl}/model/${row.model.id}`;
  const webpageId = `${url}#webpage`;
  const breadcrumbId = `${url}#breadcrumb`;
  const freshness = modelRecordFreshness(row);

  return {
    "@context": "https://schema.org",
    "@graph": [
      lmBoardOrganization(),
      artificialAnalysisOrganization(),
      providerOrganization(row),
      website(),
      boardDataset(data),
      breadcrumbs(breadcrumbId, [
        { name: "LM Board", path: "/" },
        { name: row.model.name, path: `/model/${row.model.id}` },
      ]),
      {
        "@type": "WebPage",
        "@id": webpageId,
        url,
        name: `${row.model.name} benchmark scores`,
        isPartOf: reference(WEBSITE_ID),
        breadcrumb: reference(breadcrumbId),
        about: reference(`${url}#model`),
        mainEntity: reference(`${url}#dataset`),
        dateModified: freshness.lastModified,
        inLanguage: "en-US",
      },
      modelEntity(row),
      modelDataset(row, data),
    ],
  };
}

export function methodologyGraph(data: LeaderboardData) {
  const url = `${siteUrl}/methodology`;
  const webpageId = `${url}#webpage`;
  const articleId = `${url}#article`;
  const breadcrumbId = `${url}#breadcrumb`;
  const { minimumCoverageCount } = coverageThreshold(data.benchmarks);

  return {
    "@context": "https://schema.org",
    "@graph": [
      lmBoardOrganization(),
      artificialAnalysisOrganization(),
      website(),
      boardDataset(data),
      breadcrumbs(breadcrumbId, [
        { name: "LM Board", path: "/" },
        { name: "Methodology", path: "/methodology" },
      ]),
      {
        "@type": "WebPage",
        "@id": webpageId,
        url,
        name: "Methodology — LM Board",
        isPartOf: reference(WEBSITE_ID),
        breadcrumb: reference(breadcrumbId),
        about: reference(DATASET_ID),
        mainEntity: reference(articleId),
        dateModified: data.lastUpdated,
        inLanguage: "en-US",
      },
      {
        "@type": "TechArticle",
        "@id": articleId,
        headline: "How LM Board computes its frontier-model Index",
        description: `The score collection rules, equal-weight Index, ${minimumCoverageCount}-of-${data.benchmarks.length} Overall measured-coverage requirement, and disclosed category estimates.`,
        url,
        dateModified: data.lastUpdated,
        author: reference(LM_BOARD_ORGANIZATION_ID),
        publisher: reference(LM_BOARD_ORGANIZATION_ID),
        about: reference(DATASET_ID),
        mainEntityOfPage: reference(webpageId),
        inLanguage: "en-US",
      },
    ],
  };
}

export function compareGraph(data: LeaderboardData) {
  const url = `${siteUrl}/compare`;
  const webpageId = `${url}#webpage`;
  const breadcrumbId = `${url}#breadcrumb`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      lmBoardOrganization(),
      artificialAnalysisOrganization(),
      website(),
      boardDataset(data),
      breadcrumbs(breadcrumbId, [
        { name: "LM Board", path: "/" },
        { name: "Compare models", path: "/compare" },
      ]),
      {
        "@type": "WebPage",
        "@id": webpageId,
        name: "Compare frontier models side by side",
        url,
        description: `Compare up to four of ${data.rows.length} frontier models across the LM Index, ${data.benchmarks.length} benchmark scores, pricing, release dates, and weight availability.`,
        dateModified: data.lastUpdated,
        isPartOf: reference(WEBSITE_ID),
        breadcrumb: reference(breadcrumbId),
        about: reference(DATASET_ID),
        mainEntity: reference(DATASET_ID),
        inLanguage: "en-US",
      },
    ],
  };
}

export function valueGraph(data: LeaderboardData) {
  const url = `${siteUrl}/value`;
  const webpageId = `${url}#webpage`;
  const breadcrumbId = `${url}#breadcrumb`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      lmBoardOrganization(),
      artificialAnalysisOrganization(),
      website(),
      boardDataset(data),
      breadcrumbs(breadcrumbId, [
        { name: "LM Board", path: "/" },
        { name: "Find the best model for your budget", path: "/value" },
      ]),
      {
        "@type": "WebPage",
        "@id": webpageId,
        name: "Find the best frontier model for your budget",
        url,
        description: `Compare LM Board's LM Index with listed input-token price for ${data.rows.length} frontier models and identify the strongest options for a given budget.`,
        dateModified: data.lastUpdated,
        isPartOf: reference(WEBSITE_ID),
        breadcrumb: reference(breadcrumbId),
        about: reference(DATASET_ID),
        mainEntity: reference(DATASET_ID),
        inLanguage: "en-US",
      },
    ],
  };
}
