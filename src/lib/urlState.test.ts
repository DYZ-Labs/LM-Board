import { describe, expect, it } from "vitest";

import type { LeaderboardRow, LeaderboardScope } from "./data";
import type { Benchmark } from "./schema";
import { DEFAULT_SORT } from "./useSort";
import {
  compareFromUrl,
  labsFromUrl,
  modelFragment,
  openWeightsFromUrl,
  parseBoardUrl,
  providersFromUrl,
  queryFromUrl,
  rowFromFragment,
  serializeBoardUrl,
  sortFromUrl,
} from "./urlState";

const bench = (id: string): Benchmark => ({
  id,
  name: id,
  category: "reasoning",
  description: id,
  unit: "percent",
  sourceUrl: "https://example.com",
});

const row = (id: string, name: string): LeaderboardRow => {
  const rowScope: LeaderboardScope = {
    index: 80,
    rank: 1,
    coverageCount: 1,
    coverageTotal: 1,
    coverageRatio: 1,
    estimatedCount: 0,
    rankedFieldSize: 1,
  };

  return {
    model: {
      id,
      name,
      lab: "Lab",
      releaseDate: "2026-07-22",
      openWeights: false,
      url: "https://example.com",
    },
    reasoningEffort: null,
    reasoningEffortLabel: null,
    scoresByBenchmark: {},
    rampByBenchmark: {},
    scopes: {
      overall: rowScope,
      reasoning: rowScope,
      coding: rowScope,
      math: rowScope,
      agentic: rowScope,
    },
  };
};

const rowWithLab = (
  id: string,
  name: string,
  lab: string,
  openWeights = false,
) => {
  const value = row(id, name);
  return { ...value, model: { ...value.model, lab, openWeights } };
};

describe("sortFromUrl", () => {
  const benchmarks = [bench("mmlu")];

  it("returns DEFAULT_SORT for unknown keys", () => {
    expect(sortFromUrl("unknown", "asc", benchmarks)).toBe(DEFAULT_SORT);
  });

  it("recognizes benchmark ids", () => {
    expect(sortFromUrl("mmlu", null, benchmarks)).toEqual({
      column: { kind: "benchmark", id: "mmlu" },
      direction: "desc",
    });
  });
});

describe("filter parsing", () => {
  const labs = ["Anthropic", "OpenAI", "Z.ai"];

  it("treats an absent or blank query as no filter", () => {
    expect(queryFromUrl(null)).toBe("");
    expect(queryFromUrl("   ")).toBe("");
    expect(queryFromUrl("  opus  ")).toBe("opus");
  });

  it("resolves provider names case-insensitively against the dataset", () => {
    expect(labsFromUrl("anthropic,Z.AI", labs)).toEqual(["Anthropic", "Z.ai"]);
  });

  it("drops providers that are not in the dataset", () => {
    // A filter that matches nothing would leave a visitor on an empty board
    // with no way to tell why, so an unknown name is ignored rather than applied.
    expect(labsFromUrl("Anthropic,NotALab", labs)).toEqual(["Anthropic"]);
    expect(labsFromUrl("NotALab", labs)).toEqual([]);
  });

  it("deduplicates repeated providers", () => {
    expect(labsFromUrl("OpenAI,openai,OpenAI", labs)).toEqual(["OpenAI"]);
  });

  it("treats anything but 1 as open-weights off", () => {
    expect(openWeightsFromUrl("1")).toBe(true);
    expect(openWeightsFromUrl("true")).toBe(false);
    expect(openWeightsFromUrl(null)).toBe(false);
  });

  it("distinguishes all, none and a canonical provider subset", () => {
    expect(providersFromUrl(null, labs)).toBeNull();
    expect(providersFromUrl("none", labs)).toEqual([]);
    expect(providersFromUrl("openai,ANTHROPIC", labs)).toEqual([
      "Anthropic",
      "OpenAI",
    ]);
    expect(
      providersFromUrl("openai,anthropic,z.ai", labs),
    ).toBeNull();
  });
});

describe("compareFromUrl", () => {
  const availableIds = ["alpha", "beta", "gamma", "delta"];

  it("drops stale ids before applying the four-model cap", () => {
    expect(
      compareFromUrl(
        "removed-one,removed-two,removed-three,removed-four,alpha",
        availableIds,
      ),
    ).toEqual(["alpha"]);
  });

  it("normalizes, deduplicates, and rejects malformed ids", () => {
    expect(
      compareFromUrl(" Alpha,alpha,not_valid,beta ", availableIds),
    ).toEqual(["alpha", "beta"]);
  });
});

describe("model fragments", () => {
  it("normalizes a model name", () => {
    expect(modelFragment("GPT-5.2 Pro")).toBe("gpt-5-2-pro");
  });

  it("matches rows by fragment or model id", () => {
    const rows = [
      row("gpt-pro", "GPT-5.2 Pro"),
      row("model-id", "Different Name"),
    ];

    expect(rowFromFragment("gpt-5-2-pro", rows)).toBe(rows[0]);
    expect(rowFromFragment("MODEL-ID", rows)).toBe(rows[1]);
  });

  it("returns null for malformed percent-encoding", () => {
    expect(rowFromFragment("%ZZ", [row("gpt-pro", "GPT-5.2 Pro")])).toBeNull();
  });
});

describe("board URL codec", () => {
  const benchmarks = [bench("reasoning-test")];
  const labs = ["Anthropic", "OpenAI", "Z.ai"];
  const rows = [
    rowWithLab("opus", "Claude Opus 5", "Anthropic", true),
    rowWithLab("gpt", "GPT-5.6 Sol", "OpenAI"),
  ];
  const context = { benchmarks, labs, rows };

  it("round-trips every owned field and preserves foreign state", () => {
    const source = new URL(
      "https://lm.test/?utm_source=x&tab=reasoning&sort=reasoning-test&direction=asc&view=plot&density=data&q=opus&labs=openai,anthropic&open=1#claude-opus-5",
    );
    const parsed = parseBoardUrl(source, context);
    const serialized = serializeBoardUrl(source, parsed, context);

    expect(serialized.searchParams.get("utm_source")).toBe("x");
    expect(serialized.searchParams.has("density")).toBe(false);
    expect(serialized.searchParams.get("labs")).toBe("Anthropic,OpenAI");
    expect(serialized.hash).toBe("#claude-opus-5");
    expect(parseBoardUrl(serialized, context)).toEqual(parsed);
  });

  it("writes explicit none and omits the canonical all-provider state", () => {
    const base = parseBoardUrl(new URL("https://lm.test/"), context);
    const none = serializeBoardUrl(
      new URL("https://lm.test/"),
      { ...base, providers: [] },
      context,
    );
    const all = serializeBoardUrl(
      none,
      { ...base, providers: [...labs] },
      context,
    );

    expect(none.searchParams.get("labs")).toBe("none");
    expect(all.searchParams.has("labs")).toBe(false);
  });

  it("removes only an owned model hash", () => {
    const base = parseBoardUrl(
      new URL("https://lm.test/#claude-opus-5"),
      context,
    );
    const collapsed = serializeBoardUrl(
      new URL("https://lm.test/#claude-opus-5"),
      { ...base, expandedModelId: null },
      context,
    );
    const foreign = serializeBoardUrl(
      new URL("https://lm.test/#leaderboard"),
      { ...base, expandedModelId: null },
      context,
    );

    expect(collapsed.hash).toBe("");
    expect(foreign.hash).toBe("#leaderboard");
  });
});
