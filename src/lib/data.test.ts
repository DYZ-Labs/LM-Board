import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => {
  const models = [
    {
      id: "model-ten",
      name: "Model 10",
      lab: "Lab Ten",
      releaseDate: "2026-07-22",
      openWeights: false,
      url: "https://example.com/models/model-ten",
    },
    {
      id: "model-two",
      name: "Model 2",
      lab: "Lab Two",
      releaseDate: "2026-07-22",
      openWeights: false,
      url: "https://example.com/models/model-two",
    },
    {
      id: "sparse-model",
      name: "Sparse Model",
      lab: "Sparse Lab",
      releaseDate: "2026-07-22",
      openWeights: true,
      url: "https://example.com/models/sparse-model",
    },
    {
      id: "partial-model",
      name: "Partial Model",
      lab: "Partial Lab",
      releaseDate: "2026-07-22",
      openWeights: false,
      url: "https://example.com/models/partial-model",
    },
  ];
  const benchmarks = [
    {
      id: "reasoning-benchmark",
      name: "Reasoning Benchmark",
      category: "reasoning",
      description: "Reasoning fixture",
      unit: "percent",
      sourceUrl: "https://example.com/benchmarks/reasoning",
    },
    {
      id: "coding-benchmark",
      name: "Coding Benchmark",
      category: "coding",
      description: "Coding fixture",
      unit: "percent",
      sourceUrl: "https://example.com/benchmarks/coding",
    },
    {
      id: "math-benchmark",
      name: "Math Benchmark",
      category: "math",
      description: "Math fixture",
      unit: "percent",
      sourceUrl: "https://example.com/benchmarks/math",
    },
    {
      id: "agentic-benchmark",
      name: "Agentic Benchmark",
      category: "agentic",
      description: "Agentic fixture",
      unit: "percent",
      sourceUrl: "https://example.com/benchmarks/agentic",
    },
  ];
  const score = (modelId: string, benchmarkId: string, value: number) => ({
    modelId,
    benchmarkId,
    value,
    source: {
      url: `https://example.com/scores/${modelId}/${benchmarkId}`,
      retrieved: "2026-07-22",
    },
    selfReported: false,
  });
  const scores = [
    ...benchmarks.map((benchmark) =>
      score("model-ten", benchmark.id, 80),
    ),
    ...benchmarks.map((benchmark) =>
      score("model-two", benchmark.id, 80),
    ),
    score("sparse-model", "reasoning-benchmark", 99),
    score("sparse-model", "coding-benchmark", 99),
    score("partial-model", "reasoning-benchmark", 60),
    score("partial-model", "coding-benchmark", 60),
    score("partial-model", "math-benchmark", 60),
  ];

  return { models, benchmarks, scores };
});

vi.mock("../../data/models.json", () => ({ default: fixtures.models }));
vi.mock("../../data/benchmarks.json", () => ({
  default: fixtures.benchmarks,
}));
vi.mock("../../data/scores.json", () => ({ default: fixtures.scores }));

import { loadLeaderboardData } from "./data";

describe("loadLeaderboardData", () => {
  it("assembles canonical ranks independently for every scope", () => {
    const data = loadLeaderboardData();
    const rows = new Map(data.rows.map((row) => [row.model.id, row]));
    const modelTwo = rows.get("model-two");
    const modelTen = rows.get("model-ten");
    const sparseModel = rows.get("sparse-model");
    const partialModel = rows.get("partial-model");

    expect(modelTwo).toBeDefined();
    expect(modelTen).toBeDefined();
    expect(sparseModel).toBeDefined();
    expect(partialModel).toBeDefined();

    expect({
      overall: [
        modelTwo!.scopes.overall.rank,
        modelTen!.scopes.overall.rank,
        partialModel!.scopes.overall.rank,
        sparseModel!.scopes.overall.rank,
      ],
      reasoning: [
        sparseModel!.scopes.reasoning.rank,
        modelTwo!.scopes.reasoning.rank,
        modelTen!.scopes.reasoning.rank,
        partialModel!.scopes.reasoning.rank,
      ],
      coding: [
        sparseModel!.scopes.coding.rank,
        modelTwo!.scopes.coding.rank,
        modelTen!.scopes.coding.rank,
        partialModel!.scopes.coding.rank,
      ],
      math: [
        modelTwo!.scopes.math.rank,
        modelTen!.scopes.math.rank,
        partialModel!.scopes.math.rank,
        sparseModel!.scopes.math.rank,
      ],
      agentic: [
        modelTwo!.scopes.agentic.rank,
        modelTen!.scopes.agentic.rank,
        partialModel!.scopes.agentic.rank,
        sparseModel!.scopes.agentic.rank,
      ],
    }).toEqual({
      // Identical indexes share a rank, and the next distinct index skips the
      // ranks the tie consumed.
      overall: [1, 1, 3, null],
      reasoning: [1, 2, 2, 4],
      coding: [1, 2, 2, 4],
      math: [1, 1, 3, null],
      agentic: [1, 1, null, null],
    });

    expect(sparseModel!.scopes.overall).toEqual({
      index: null,
      rank: null,
      coverageCount: 2,
      coverageTotal: 4,
      coverageRatio: 0.5,
      estimatedCount: 0,
    });
    expect(sparseModel!.scopes.reasoning).toEqual({
      index: 99,
      rank: 1,
      coverageCount: 1,
      coverageTotal: 1,
      coverageRatio: 1,
      estimatedCount: 0,
    });
    expect(sparseModel!.scoresByBenchmark["reasoning-benchmark"]?.value).toBe(
      99,
    );
    expect(sparseModel!.scoresByBenchmark["math-benchmark"]).toBeNull();
    expect({
      index: sparseModel!.index,
      rank: sparseModel!.rank,
      coverageCount: sparseModel!.coverageCount,
      coverageTotal: sparseModel!.coverageTotal,
      coverageRatio: sparseModel!.coverageRatio,
      estimatedCount: sparseModel!.estimatedCount,
    }).toEqual(sparseModel!.scopes.overall);
  });

  it("estimates the gaps of a model that clears the coverage gate", () => {
    const data = loadLeaderboardData();
    const partialModel = data.rows.find(
      (row) => row.model.id === "partial-model",
    );

    expect(partialModel).toBeDefined();
    // Three measured 60s plus an estimated agentic score, not a bare 60.
    expect(partialModel!.scopes.overall).toEqual({
      index: 65,
      rank: 3,
      coverageCount: 3,
      coverageTotal: 4,
      coverageRatio: 0.75,
      estimatedCount: 1,
    });
    // An estimate feeds the Index only; it never becomes a published score.
    expect(partialModel!.scoresByBenchmark["agentic-benchmark"]).toBeNull();
    // ...and it never lifts a model over the gate it failed.
    expect(partialModel!.scopes.agentic).toEqual({
      index: null,
      rank: null,
      coverageCount: 0,
      coverageTotal: 1,
      coverageRatio: 0,
      estimatedCount: 0,
    });
  });
});
