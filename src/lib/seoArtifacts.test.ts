import { describe, expect, it } from "vitest";

import { GET as feed } from "@/app/feed.xml/route";
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
      "/value.txt",
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
    expect(urls).toContain(`${siteUrl}/value`);
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
    expect(text).toContain(
      `- [Model data feed (Atom)](${siteUrl}/feed.xml)`,
    );
    expect(text).toContain(
      `- [Price versus performance and the efficient frontier](${siteUrl}/value)`,
    );
  });
});

describe("Atom artifact", () => {
  it("is explicitly a current per-model snapshot, not a change log", async () => {
    const response = feed();
    const xml = await response.text();

    expect(response.headers.get("content-type")).toBe(
      "application/atom+xml; charset=utf-8",
    );
    expect(xml).toContain("<title>LM Board — model data feed</title>");
    expect(xml).toContain(
      "<subtitle>One current entry per model, ordered by its newest score retrieval date; scoreless models use release date.</subtitle>",
    );
    expect(xml).toContain(`<id>${siteUrl}/feed.xml</id>`);
    expect(xml).toContain(
      "<rights>LM Board dataset arrangement: CC BY 4.0. Source measurements retain their own terms.</rights>",
    );
    expect(xml).not.toContain("score changes");
    expect(xml).not.toContain("what moved");
    expect((xml.match(/<entry>/g) ?? [])).toHaveLength(data.rows.length);
  });

  it("attributes feed authorship to LM Board and carries per-record dates", async () => {
    const xml = await feed().text();
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
    const expectedOrder = [...data.rows]
      .sort(
        (left, right) =>
          modelRecordFreshness(right).lastModified.localeCompare(
            modelRecordFreshness(left).lastModified,
          ) || left.model.name.localeCompare(right.model.name, "en"),
      )
      .map((row) => row.model.id);

    expect((xml.match(/<author>/g) ?? [])).toHaveLength(1);
    expect(xml).toContain("<name>LM Board</name>");
    expect(
      entries.map(
        (entry) =>
          entry.match(/<id>[^<]+\/model\/([^<]+)<\/id>/)?.[1],
      ),
    ).toEqual(expectedOrder);

    for (const row of data.rows) {
      const entry = entries.find((candidate) =>
        candidate.includes(
          `<id>${siteUrl}/model/${row.model.id}</id>`,
        ),
      );

      expect(entry).toBeDefined();
      expect(entry).toContain(
        `<updated>${modelRecordFreshness(row).lastModified}T00:00:00Z</updated>`,
      );
      expect(entry).not.toContain("<author>");
    }
  });
});
