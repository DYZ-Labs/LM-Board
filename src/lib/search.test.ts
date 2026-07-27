import { describe, expect, it } from "vitest";

import { loadLeaderboardData } from "@/lib/data";
import {
  compareMatches,
  matchesModelQuery,
  matchesTarget,
  scoreModel,
  scoreTarget,
  tokenizeQuery,
  type SearchTarget,
} from "@/lib/search";

const rows = loadLeaderboardData().rows;

function names(query: string): string[] {
  return rows
    .filter((row) => matchesModelQuery(query, row))
    .map((row) => row.model.name);
}

/** Exactly what the palette does: score, then standing on the board. */
function ranked(query: string): string[] {
  return rows
    .map((row) => ({
      name: row.model.name,
      rank: row.scopes.overall.rank,
      ...scoreModel(query, row),
    }))
    .filter((entry) => entry.score > 0)
    .sort(compareMatches)
    .map((entry) => entry.name);
}

describe("matchesModelQuery", () => {
  // Every one of these returned zero hits from the shipped
  // `${name} ${lab} ${id}`.includes(query) matcher.
  it.each([
    ["gpt5", "GPT-5"],
    ["gpt 5", "GPT-5"],
    ["opus5", "Claude Opus 5"],
    ["anthropic opus", "Claude Opus 5"],
    ["gemini pro", "Gemini 2.5 Pro"],
    ["glm 5", "GLM-5"],
    ["open ai", "GPT-5"],
    ["kimi k3", "Kimi K3"],
  ])("resolves %j", (query, expected) => {
    const hits = names(query);

    expect(hits.length).toBeGreaterThan(0);
    expect(hits).toContain(expected);
  });

  it("returns nothing for a query no model answers", () => {
    expect(names("zzzznomatch")).toEqual([]);
  });

  it("keeps every token load-bearing", () => {
    // "anthropic" and "gpt" cannot both hit one candidate, so an OR would have
    // returned the whole OpenAI and Anthropic catalogues.
    expect(names("anthropic gpt")).toEqual([]);
  });

  it("treats an empty query as no filter", () => {
    expect(names("")).toHaveLength(rows.length);
    expect(names("   ")).toHaveLength(rows.length);
  });

  it("does not match a lab against a different lab's model", () => {
    expect(names("anthropic")).not.toContain("GPT-5");
  });
});

describe("scoreTarget", () => {
  const opus5: SearchTarget = {
    name: "Claude Opus 5",
    lab: "Anthropic",
    id: "anthropic-claude-opus-5",
  };

  it("ranks a name prefix above a word start above a lab hit", () => {
    const prefix = scoreTarget("claude", opus5).score;
    const word = scoreTarget("opus", opus5).score;
    const lab = scoreTarget("anthropic", opus5).score;

    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(lab);
  });

  it("puts the newest Opus first for 'opus', not sixth", () => {
    // File order put Claude Opus 5 sixth, below four older builds.
    expect(ranked("opus 5")[0]).toBe("Claude Opus 5");
  });

  it("returns match ranges over the original name", () => {
    const { ranges } = scoreTarget("opus", opus5);

    expect(ranges).toEqual([[7, 11]]);
    expect(opus5.name.slice(7, 11)).toBe("Opus");
  });

  it("spans separators the query omitted", () => {
    const target: SearchTarget = {
      name: "GPT-5.6 Sol",
      lab: "OpenAI",
      id: "openai-gpt-5-6-sol",
    };
    const { ranges } = scoreTarget("gpt5", target);

    expect(ranges).toEqual([[0, 5]]);
    expect(target.name.slice(0, 5)).toBe("GPT-5");
  });

  it("merges overlapping ranges from separate tokens", () => {
    const { ranges } = scoreTarget("claude opus claud", opus5);

    expect(ranges).toEqual([
      [0, 6],
      [7, 11],
    ]);
  });

  it("forgives one edit in a token of four or more characters", () => {
    expect(matchesTarget("clade", opus5)).toBe(true);
    expect(matchesTarget("anthropc", opus5)).toBe(true);
  });

  it("does not fuzzy-match a three-character token", () => {
    // "ops" is one edit from "opus", but at three characters a typo is
    // indistinguishable from a different word.
    expect(matchesTarget("ops", opus5)).toBe(false);
  });

  it("scores nothing for an empty query", () => {
    expect(scoreTarget("", opus5)).toEqual({ score: 0, ranges: [] });
  });

  it("folds diacritics and full-width digits", () => {
    const target: SearchTarget = {
      name: "Café ５",
      lab: "Lab",
      id: "lab-cafe-5",
    };

    expect(matchesTarget("cafe 5", target)).toBe(true);
  });
});

describe("tokenizeQuery", () => {
  it("splits on every separator, not just whitespace", () => {
    expect(tokenizeQuery("  GPT-5.6 / Sol ")).toEqual(["gpt", "5", "6", "sol"]);
  });

  it("is empty for a query with nothing searchable in it", () => {
    expect(tokenizeQuery("  -- ")).toEqual([]);
  });
});
