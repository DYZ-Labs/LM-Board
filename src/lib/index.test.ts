import { describe, expect, it } from "vitest";

import { calculateLmBoardIndex } from "./index";
import type { Benchmark, Score } from "./schema";

const bench = (
  id: string,
  unit: Benchmark["unit"] = "percent",
): Benchmark => ({
  id,
  name: id,
  category: "reasoning",
  description: id,
  unit,
  sourceUrl: "https://example.com",
});

const score = (benchmarkId: string, value: number): Score => ({
  modelId: "m",
  benchmarkId,
  value,
  source: { url: "https://example.com", retrieved: "2026-07-22" },
  selfReported: false,
});

describe("calculateLmBoardIndex", () => {
  it("averages percent benchmarks only", () => {
    const result = calculateLmBoardIndex(
      [score("a", 80), score("b", 100), score("raw", 500)],
      [bench("a"), bench("b"), bench("raw", "score")],
    );

    expect(result).toEqual({
      value: 90,
      scoredCount: 2,
      totalCount: 2,
      coverage: 1,
    });
  });

  describe("coverage gate", () => {
    const benchmarks = ["a", "b", "c", "d", "e"].map((id) => bench(id));

    it("qualifies at exactly 60% coverage", () => {
      const result = calculateLmBoardIndex(
        [score("a", 80), score("b", 90), score("c", 70)],
        benchmarks,
      );

      expect(result.value).toBe(80);
      expect(result.coverage).toBe(0.6);
    });

    it("returns null one score below the gate", () => {
      const result = calculateLmBoardIndex(
        [score("a", 80), score("b", 90)],
        benchmarks,
      );

      expect(result.value).toBeNull();
      expect(result.coverage).toBe(0.4);
    });
  });

  it("returns an empty result for an empty benchmark list", () => {
    expect(calculateLmBoardIndex([], [])).toEqual({
      value: null,
      scoredCount: 0,
      totalCount: 0,
      coverage: 0,
    });
  });
});
