import { describe, expect, it } from "vitest";

import type { LeaderboardRow, LeaderboardScope } from "./data";
import type { Model, Score } from "./schema";
import {
  defaultDirectionFor,
  nextDirectionFor,
  sortLeaderboardRows,
  type SortColumn,
  type SortDirection,
} from "./useSort";

const score = (modelId: string, value: number): Score => ({
  modelId,
  benchmarkId: "bench",
  value,
  source: { url: "https://example.com", retrieved: "2026-07-22" },
  selfReported: false,
});

const scope = (index: number | null, rank: number | null): LeaderboardScope => ({
  index,
  rank,
  coverageCount: index === null ? 0 : 1,
  coverageTotal: 1,
  coverageRatio: index === null ? 0 : 1,
  estimatedCount: 0,
});

const row = ({
  id,
  name = id,
  index = null,
  rank = null,
  benchmarkScore = null,
  pricing,
}: {
  id: string;
  name?: string;
  index?: number | null;
  rank?: number | null;
  benchmarkScore?: number | null;
  pricing?: NonNullable<Model["pricing"]>;
}): LeaderboardRow => {
  const rowScope = scope(index, rank);

  return {
    model: {
      id,
      name,
      lab: "Lab",
      releaseDate: "2026-07-22",
      openWeights: false,
      pricing,
      url: "https://example.com",
    },
    reasoningEffort: null,
    reasoningEffortLabel: null,
    scoresByBenchmark: {
      bench: benchmarkScore === null ? null : score(id, benchmarkScore),
    },
    scopes: {
      overall: rowScope,
      reasoning: rowScope,
      coding: rowScope,
      math: rowScope,
      agentic: rowScope,
    },
    index,
    coverageCount: rowScope.coverageCount,
    coverageTotal: rowScope.coverageTotal,
    coverageRatio: rowScope.coverageRatio,
    estimatedCount: rowScope.estimatedCount,
    rank,
  };
};

const ids = (rows: readonly LeaderboardRow[]) =>
  rows.map((leaderboardRow) => leaderboardRow.model.id);

describe("sortLeaderboardRows", () => {
  it("sorts null indexes last in both directions", () => {
    const rows = [
      row({ id: "missing" }),
      row({ id: "high", index: 90 }),
      row({ id: "low", index: 70 }),
    ];

    expect(
      ids(
        sortLeaderboardRows(rows, {
          column: { kind: "index" },
          direction: "asc",
        }),
      ),
    ).toEqual(["low", "high", "missing"]);
    expect(
      ids(
        sortLeaderboardRows(rows, {
          column: { kind: "index" },
          direction: "desc",
        }),
      ),
    ).toEqual(["high", "low", "missing"]);
  });

  it("sorts null benchmark scores last in both directions", () => {
    const rows = [
      row({ id: "missing" }),
      row({ id: "high", benchmarkScore: 90 }),
      row({ id: "low", benchmarkScore: 70 }),
    ];

    for (const [direction, expected] of [
      ["asc", ["low", "high", "missing"]],
      ["desc", ["high", "low", "missing"]],
    ] as const) {
      expect(
        ids(
          sortLeaderboardRows(rows, {
            column: { kind: "benchmark", id: "bench" },
            direction,
          }),
        ),
      ).toEqual(expected);
    }
  });

  it("falls back to the name collator for equal values", () => {
    const rows = [
      row({ id: "ten", name: "Model 10", index: 80 }),
      row({ id: "two", name: "Model 2", index: 80 }),
    ];

    expect(
      ids(
        sortLeaderboardRows(rows, {
          column: { kind: "index" },
          direction: "desc",
        }),
      ),
    ).toEqual(["two", "ten"]);
  });

  it("sorts price by input and then output", () => {
    const rows = [
      row({ id: "input-one-output-eight", pricing: { input: 1, output: 8 } }),
      row({ id: "input-one-output-four", pricing: { input: 1, output: 4 } }),
      row({ id: "input-two", pricing: { input: 2, output: 1 } }),
    ];

    expect(
      ids(
        sortLeaderboardRows(rows, {
          column: { kind: "price" },
          direction: "asc",
        }),
      ),
    ).toEqual([
      "input-one-output-four",
      "input-one-output-eight",
      "input-two",
    ]);
    expect(
      ids(
        sortLeaderboardRows(rows, {
          column: { kind: "price" },
          direction: "desc",
        }),
      ),
    ).toEqual([
      "input-two",
      "input-one-output-eight",
      "input-one-output-four",
    ]);
  });
});

describe("sort directions", () => {
  it.each<[SortColumn, SortDirection]>([
    [{ kind: "rank" }, "asc"],
    [{ kind: "model" }, "asc"],
    [{ kind: "price" }, "asc"],
    [{ kind: "index" }, "desc"],
    [{ kind: "benchmark", id: "bench" }, "desc"],
  ])("uses the default for $column.kind", (column, expected) => {
    expect(defaultDirectionFor(column)).toBe(expected);
  });

  it("toggles the current column and defaults a new column", () => {
    expect(
      nextDirectionFor(
        { column: { kind: "index" }, direction: "desc" },
        { kind: "index" },
      ),
    ).toBe("asc");
    expect(
      nextDirectionFor(
        { column: { kind: "index" }, direction: "desc" },
        { kind: "model" },
      ),
    ).toBe("asc");
    expect(
      nextDirectionFor(
        { column: { kind: "benchmark", id: "a" }, direction: "desc" },
        { kind: "benchmark", id: "b" },
      ),
    ).toBe("desc");
  });
});
