import { describe, expect, it } from "vitest";

import {
  buildBenchmarkDistributions,
  calculateLmBoardIndex,
  estimateMissingScores,
  percentileOf,
} from "./index";
import type { Benchmark, Publisher, Score } from "./schema";

const publisher: Publisher = {
  id: "publisher",
  name: "Publisher",
  url: "https://example.com",
  type: "independent",
  runsOwnEvals: true,
};

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

const score = (
  benchmarkId: string,
  value: number,
  modelId = "m",
): Score => ({
  modelId,
  benchmarkId,
  publisherId: publisher.id,
  value,
  source: { url: "https://example.com", retrieved: "2026-07-22" },
  publisher,
  provenance: "independent",
  alternates: [],
  spread: null,
  unverified: false,
});

const noEstimates = new Map<string, number>();

describe("percentileOf", () => {
  it("uses the midpoint occupied by tied values", () => {
    expect(percentileOf([10, 20, 20, 20, 30], 20)).toBe(0.5);
    expect(percentileOf([10, 20, 30], 5)).toBe(0);
    expect(percentileOf([10, 20, 30], 40)).toBe(1);
  });
});

describe("calculateLmBoardIndex", () => {
  it("averages percent benchmarks only", () => {
    const result = calculateLmBoardIndex(
      [score("a", 80), score("b", 100), score("raw", 500)],
      [bench("a"), bench("b"), bench("raw", "score")],
      noEstimates,
    );

    expect(result).toEqual({
      value: 90,
      scoredCount: 2,
      totalCount: 2,
      coverage: 1,
      estimatedCount: 0,
    });
  });

  describe("coverage gate", () => {
    const benchmarks = ["a", "b", "c", "d", "e"].map((id) => bench(id));

    it("qualifies at exactly 60% coverage", () => {
      const result = calculateLmBoardIndex(
        [score("a", 80), score("b", 90), score("c", 70)],
        benchmarks,
        noEstimates,
      );

      expect(result.value).toBe(80);
      expect(result.coverage).toBe(0.6);
    });

    it("returns null one score below the gate", () => {
      const result = calculateLmBoardIndex(
        [score("a", 80), score("b", 90)],
        benchmarks,
        noEstimates,
      );

      expect(result.value).toBeNull();
      expect(result.coverage).toBe(0.4);
    });

    it("judges coverage on measured scores, ignoring estimates", () => {
      const result = calculateLmBoardIndex(
        [score("a", 80), score("b", 90)],
        benchmarks,
        new Map([
          ["c", 70],
          ["d", 70],
          ["e", 70],
        ]),
      );

      expect(result.value).toBeNull();
      expect(result.estimatedCount).toBe(0);
    });

    it("allows a complete estimated category Index after broader qualification", () => {
      const result = calculateLmBoardIndex(
        [score("a", 80), score("b", 90)],
        benchmarks,
        new Map([
          ["c", 70],
          ["d", 70],
          ["e", 70],
        ]),
        { allowCompleteEstimatedIndex: true },
      );

      expect(result).toEqual({
        value: 76,
        scoredCount: 2,
        totalCount: 5,
        coverage: 0.4,
        estimatedCount: 3,
      });
    });

    it("rejects an incomplete fallback Index", () => {
      const result = calculateLmBoardIndex(
        [score("a", 80), score("b", 90)],
        benchmarks,
        new Map([
          ["c", 70],
          ["d", 70],
        ]),
        { allowCompleteEstimatedIndex: true },
      );

      expect(result.value).toBeNull();
      expect(result.estimatedCount).toBe(0);
    });
  });

  it("fills gaps with estimates once a model clears the gate", () => {
    const result = calculateLmBoardIndex(
      [score("a", 80), score("b", 80), score("c", 80), score("d", 80)],
      ["a", "b", "c", "d", "e"].map((id) => bench(id)),
      new Map([["e", 40]]),
    );

    expect(result).toEqual({
      value: 72,
      scoredCount: 4,
      totalCount: 5,
      coverage: 0.8,
      estimatedCount: 1,
    });
  });

  it("averages what it has when a gap cannot be estimated", () => {
    const result = calculateLmBoardIndex(
      [score("a", 80), score("b", 80), score("c", 80), score("d", 80)],
      ["a", "b", "c", "d", "e"].map((id) => bench(id)),
      noEstimates,
    );

    expect(result.value).toBe(80);
    expect(result.estimatedCount).toBe(0);
  });

  it("returns an empty result for an empty benchmark list", () => {
    expect(calculateLmBoardIndex([], [], noEstimates)).toEqual({
      value: null,
      scoredCount: 0,
      totalCount: 0,
      coverage: 0,
      estimatedCount: 0,
    });
  });
});

describe("buildBenchmarkDistributions", () => {
  it("collects measured values per percent benchmark, ascending", () => {
    const distributions = buildBenchmarkDistributions(
      [
        score("a", 30, "p1"),
        score("a", 10, "p2"),
        score("a", 20, "p3"),
        score("raw", 500, "p1"),
      ],
      [bench("a"), bench("b"), bench("raw", "score")],
    );

    expect(distributions.get("a")).toEqual([10, 20, 30]);
    expect(distributions.get("b")).toEqual([]);
    expect(distributions.has("raw")).toBe(false);
  });
});

describe("estimateMissingScores", () => {
  const benchmarks = ["a", "b", "c", "d", "e"].map((id) => bench(id));
  // "m" sits at the 75th percentile of a, b, c and d, and has no score on e.
  const population = [
    ...["a", "b", "c", "d"].flatMap((id) => [
      score(id, 0, "p1"),
      score(id, 80, "m"),
    ]),
    score("e", 10, "p1"),
    score("e", 20, "p2"),
    score("e", 30, "p3"),
    score("e", 40, "p4"),
    score("e", 50, "p5"),
  ];
  const distributions = buildBenchmarkDistributions(population, benchmarks);
  const modelScores = population.filter((entry) => entry.modelId === "m");

  it("fills a gap at the model's percentile in the missing benchmark", () => {
    const estimates = estimateMissingScores(
      modelScores,
      benchmarks,
      distributions,
    );

    expect([...estimates]).toEqual([["e", 40]]);
  });

  it("interpolates between adjacent observations", () => {
    // "m" sits at the 75th percentile of x, and y was only ever measured at 10
    // and 50 — three quarters of the way between them is 40.
    const pair = [bench("x"), bench("y")];
    const estimates = estimateMissingScores(
      [score("x", 100, "m")],
      pair,
      buildBenchmarkDistributions(
        [
          score("x", 0, "p1"),
          score("x", 100, "m"),
          score("y", 10, "p1"),
          score("y", 50, "p2"),
        ],
        pair,
      ),
    );

    expect(estimates.get("y")).toBeCloseTo(40, 10);
  });

  it("estimates nothing for a model with no measured scores", () => {
    expect(estimateMissingScores([], benchmarks, distributions).size).toBe(0);
  });

  it("estimates nothing for a benchmark nobody has been measured on", () => {
    const estimates = estimateMissingScores(
      [score("a", 80, "m")],
      [bench("a"), bench("unmeasured")],
      buildBenchmarkDistributions(
        [score("a", 0, "p1"), score("a", 80, "m")],
        [bench("a"), bench("unmeasured")],
      ),
    );

    expect(estimates.has("unmeasured")).toBe(false);
  });
});
