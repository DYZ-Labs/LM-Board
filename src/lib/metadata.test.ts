import { describe, expect, it } from "vitest";

import { loadLeaderboardData } from "./data";
import {
  modelCardPath,
  modelPageMetadata,
  modelStanding,
  pageMetadata,
  truncateDescription,
} from "./metadata";
import { modelRecordFreshness } from "./site";

const data = loadLeaderboardData();

function cardFields(metadata: ReturnType<typeof pageMetadata>) {
  const openGraph = metadata.openGraph as {
    url?: string;
    images?: { url: string; alt: string; width: number; height: number }[];
    title?: string;
    description?: string;
    siteName?: string;
    type?: string;
    publishedTime?: string;
    modifiedTime?: string;
  };
  const twitter = metadata.twitter as {
    card?: string;
    images?: string[];
    title?: string;
    description?: string;
  };

  return { openGraph, twitter };
}

describe("pageMetadata", () => {
  it("returns a complete card so no route can inherit another page's url", () => {
    const metadata = pageMetadata({
      title: "Compare models — LM Board",
      description: "Side by side.",
      path: "/compare",
      image: "/og/compare.png",
      imageAlt: "Compare",
    });
    const { openGraph, twitter } = cardFields(metadata);

    expect(metadata.alternates?.canonical).toBe("/compare");
    expect(metadata.alternates?.types).toBeUndefined();
    expect(openGraph.url).toBe("/compare");
    expect(openGraph.siteName).toBe("LM Board");
    expect(openGraph.images?.[0]?.url).toMatch(/^\/og\/compare\.png\?v=/);
    expect(openGraph.images?.[0]?.width).toBe(1200);
    expect(openGraph.images?.[0]?.height).toBe(630);
    expect(twitter.card).toBe("summary_large_image");
    expect(twitter.images?.[0]).toBe(openGraph.images?.[0]?.url);
    expect(twitter.title).toBe("Compare models — LM Board");
    expect(twitter.description).toBe("Side by side.");
  });

  it("marks the title absolute so the layout template cannot double-brand it", () => {
    const metadata = pageMetadata({
      title: "LM Board — already branded",
      description: "x",
      path: "/",
      image: "/og/home.png",
      imageAlt: "x",
    });

    expect(metadata.title).toEqual({ absolute: "LM Board — already branded" });
  });

  it("versions the card by the dataset stamp so unfurler caches expire with the data", () => {
    const metadata = pageMetadata({
      title: "t",
      description: "d",
      path: "/",
      image: "/og/home.png",
      imageAlt: "a",
    });
    const { openGraph } = cardFields(metadata);

    expect(openGraph.images?.[0]?.url).toBe(
      `/og/home.png?v=${data.lastUpdated}`,
    );
  });

  it("appends a safely encoded cache key when the image already has a query", () => {
    const metadata = pageMetadata({
      title: "t",
      description: "d",
      path: "/",
      image: "/og/home.png?variant=dark",
      imageAlt: "a",
      imageVersion: "record 2026/07/27",
    });
    const { openGraph } = cardFields(metadata);

    expect(openGraph.images?.[0]?.url).toBe(
      "/og/home.png?variant=dark&v=record%202026%2F07%2F27",
    );
  });
});

describe("modelPageMetadata", () => {
  it("gives every one of the models its own card, url and twitter title", () => {
    for (const row of data.rows) {
      const metadata = modelPageMetadata(row);
      const { openGraph, twitter } = cardFields(metadata);

      expect(openGraph.images?.[0]?.url).toMatch(
        new RegExp(
          `^/og/model/${row.model.id}\\.png\\?v=${modelRecordFreshness(row).lastModified}$`,
        ),
      );
      expect(openGraph.url).toBe(`/model/${row.model.id}`);
      expect(metadata.alternates?.canonical).toBe(`/model/${row.model.id}`);
      expect(twitter.images?.[0]).toBe(openGraph.images?.[0]?.url);
      expect(twitter.title).toContain(row.model.name);
      expect(twitter.title).not.toBe(
        "LM Board — Frontier Model Benchmark Leaderboard",
      );
      expect(openGraph.images?.[0]?.alt).toContain(row.model.name);
      expect(openGraph.type).toBe("website");
      expect(openGraph.publishedTime).toBeUndefined();
      expect(openGraph.modifiedTime).toBeUndefined();
    }
  });

  it("does not borrow another model's newer retrieval for its card version", () => {
    const row = data.rows[0];
    const recordDate = "2026-07-15";
    const olderRecord = {
      ...row,
      model: {
        ...row.model,
        pricing: row.model.pricing
          ? {
              ...row.model.pricing,
              source: {
                ...row.model.pricing.source,
                retrieved: recordDate,
              },
            }
          : undefined,
      },
      scoresByBenchmark: Object.fromEntries(
        Object.entries(row.scoresByBenchmark).map(([id, score]) => [
          id,
          score
            ? {
                ...score,
                source: { ...score.source, retrieved: recordDate },
              }
            : null,
        ]),
      ),
    };
    const metadata = modelPageMetadata(olderRecord);
    const { openGraph } = cardFields(metadata);

    expect(openGraph.images?.[0]?.url).toContain(`?v=${recordDate}`);
    expect(openGraph.images?.[0]?.url).not.toContain(`?v=${data.lastUpdated}`);
  });

  it("carries a benchmark term in the title and keeps descriptions crawlable", () => {
    for (const row of data.rows) {
      const metadata = modelPageMetadata(row);

      expect(metadata.title).toEqual({
        absolute: `${row.model.name} benchmark scores — LM Board`,
      });
      expect((metadata.description ?? "").length).toBeLessThanOrEqual(155);
      expect(metadata.description).not.toBe("");
    }
  });

  it("leads the description with the standing, numerals first", () => {
    const leader = data.rows.find((row) => row.scopes.overall.rank === 1)!;

    expect(metadataDescription(leader)).toMatch(/^Overall Index \d/);
  });
});

function metadataDescription(row: Parameters<typeof modelPageMetadata>[0]) {
  return modelPageMetadata(row).description ?? "";
}

describe("modelStanding", () => {
  it("says why an unranked model is unranked rather than reporting a zero", () => {
    const unranked = data.rows.find(
      (row) => row.scopes.overall.index === null,
    );

    if (!unranked) {
      // Every model clears the bar on Overall today; the branch is still the one
      // that must never print a number it does not have.
      expect(
        modelStanding({
          ...data.rows[0],
          scopes: {
            ...data.rows[0].scopes,
            overall: {
              ...data.rows[0].scopes.overall,
              index: null,
              rank: null,
              coverageCount: 3,
            },
          },
        }),
      ).toBe(
        "Not ranked: 3 of 8 benchmarks measured, below the coverage bar the Index needs.",
      );
      return;
    }

    expect(modelStanding(unranked)).toMatch(/^Not ranked: /);
  });

  it("names the ranked field rather than assuming the whole board", () => {
    const row = data.rows.find((entry) => entry.scopes.overall.rank === 1)!;

    expect(modelStanding(row)).toContain(
      `of ${row.scopes.overall.rankedFieldSize}`,
    );
  });
});

describe("truncateDescription", () => {
  it("cuts on a word boundary and never mid-word", () => {
    const value = `${"word ".repeat(60)}tail`;
    const truncated = truncateDescription(value);

    expect(truncated.length).toBeLessThanOrEqual(155);
    expect(truncated.endsWith("…")).toBe(true);
    expect(truncated).not.toMatch(/wor…$/);
  });

  it("leaves a short description untouched", () => {
    expect(truncateDescription("short")).toBe("short");
  });
});

describe("modelCardPath", () => {
  it("matches the path the generator writes into public/og", () => {
    expect(modelCardPath("anthropic-claude-opus-5")).toBe(
      "/og/model/anthropic-claude-opus-5.png",
    );
  });
});

describe("modelRecordFreshness", () => {
  it("uses only the record's own score retrievals", () => {
    const row = data.rows[0];
    const dates = Object.values(row.scoresByBenchmark)
      .filter((score) => score != null)
      .map((score) => score.source.retrieved)
      .sort();

    expect(modelRecordFreshness(row)).toEqual({
      firstScoreRetrieved: dates[0],
      latestScoreRetrieved: dates.at(-1),
      pricingRetrieved: row.model.pricing?.source.retrieved ?? null,
      lastModified: [
        row.model.releaseDate,
        dates.at(-1),
        row.model.pricing?.source.retrieved,
      ]
        .filter((value): value is string => value !== undefined)
        .sort()
        .at(-1),
    });
  });

  it("uses pricing freshness when no score is stored", () => {
    const row = data.rows[0];
    const scoreless = {
      ...row,
      scoresByBenchmark: Object.fromEntries(
        Object.keys(row.scoresByBenchmark).map((id) => [id, null]),
      ),
    };

    expect(modelRecordFreshness(scoreless)).toEqual({
      firstScoreRetrieved: null,
      latestScoreRetrieved: null,
      pricingRetrieved: row.model.pricing?.source.retrieved ?? null,
      lastModified:
        row.model.pricing?.source.retrieved ?? row.model.releaseDate,
    });
  });

  it("falls back to release date when a record has neither scores nor pricing", () => {
    const row = data.rows[0];
    const bare = {
      ...row,
      model: { ...row.model, pricing: undefined },
      scoresByBenchmark: Object.fromEntries(
        Object.keys(row.scoresByBenchmark).map((id) => [id, null]),
      ),
    };

    expect(modelRecordFreshness(bare)).toEqual({
      firstScoreRetrieved: null,
      latestScoreRetrieved: null,
      pricingRetrieved: null,
      lastModified: row.model.releaseDate,
    });
  });
});
