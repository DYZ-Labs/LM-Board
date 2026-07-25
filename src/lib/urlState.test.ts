import { describe, expect, it } from "vitest";

import type { LeaderboardRow, LeaderboardScope } from "./data";
import type { Benchmark } from "./schema";
import { DEFAULT_SORT } from "./useSort";
import {
  modelFragment,
  rowFromFragment,
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
    scopes: {
      overall: rowScope,
      reasoning: rowScope,
      coding: rowScope,
      math: rowScope,
      agentic: rowScope,
    },
    index: rowScope.index,
    coverageCount: rowScope.coverageCount,
    coverageTotal: rowScope.coverageTotal,
    coverageRatio: rowScope.coverageRatio,
    estimatedCount: rowScope.estimatedCount,
    rank: rowScope.rank,
  };
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
