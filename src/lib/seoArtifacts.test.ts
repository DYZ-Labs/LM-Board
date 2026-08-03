import { describe, expect, it } from "vitest";

import { GET as llms } from "@/app/llms.txt/route";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

import { loadLeaderboardData } from "./data";
import { formatCount } from "./format";
import { modelRecordFreshness, siteUrl } from "./site";

const data = loadLeaderboardData();

describe("robots.txt contract", () => {
  it("allows llms.txt while blocking only exported page-payload duplicates", () => {
    const output = robots();
    const rules = output.rules as {
      allow: string[];
      disallow: string[];
    };

    expect(rules.allow).toContain("/llms.txt");
    expect(rules.disallow).toEqual([
      "/index.txt",
      "/404.txt",
      "/compare.txt",
      "/methodology.txt",
      "/model/*.txt$",
    ]);
    expect(rules.disallow).not.toContain("/*.txt$");
  });
});

describe("sitemap contract", () => {
  it("includes every indexable product surface", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain(`${siteUrl}/compare`);
    expect(urls).toContain(`${siteUrl}/methodology`);
    expect(urls).not.toContain(`${siteUrl}/value`);
  });

  it("uses each model record's own freshness date", () => {
    const entries = sitemap();

    for (const row of data.rows) {
      const entry = entries.find(
        (candidate) =>
          candidate.url === `${siteUrl}/model/${row.model.id}`,
      );

      expect(entry?.lastModified).toBe(
        modelRecordFreshness(row).lastModified,
      );
    }
  });
});

describe("llms.txt artifact", () => {
  it("states score, Index and evaluation ownership without inventing access dates", async () => {
    const response = llms();
    const text = await response.text();
    const artificialAnalysisCount =
      data.scoreCount - data.selfReportedCount;

    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(text).toContain("LM Board runs no evaluations.");
    expect(text).toContain(
      "It computes the equal-weight Index and ranks from those scores.",
    );
    if (data.selfReportedCount === 0) {
      expect(text).toContain(
        `Artificial Analysis publishes all ${formatCount(data.scoreCount)} measured benchmark scores; none are vendor-reported.`,
      );
    } else {
      expect(text).toContain(
        `Artificial Analysis publishes ${formatCount(artificialAnalysisCount)} of ${formatCount(data.scoreCount)} measured benchmark scores.`,
      );
      expect(text).toContain(
        `The remaining ${formatCount(data.selfReportedCount)} are marked vendor-reported.`,
      );
    }
    expect(text).toContain(`Newest score retrieval: ${data.lastUpdated}.`);
    expect(text).toContain(`dataset as of ${data.lastUpdated}`);
    expect(text).toContain(
      "Add the date you actually accessed the site when citing a retrieval date.",
    );
    expect(text).not.toMatch(/\bindependent index\b/i);
    expect(text).not.toContain(`retrieved ${data.lastUpdated}`);
    expect(text).not.toContain("Last updated");
  });

  it("contains one stable record link for every model", async () => {
    const text = await llms().text();

    for (const row of data.rows) {
      expect(text).toContain(`${siteUrl}/model/${row.model.id}`);
    }
    expect(text).not.toContain(`${siteUrl}/value`);
  });
});
