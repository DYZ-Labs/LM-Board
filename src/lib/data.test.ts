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

    expect(modelTwo).toBeDefined();
    expect(modelTen).toBeDefined();
    expect(sparseModel).toBeDefined();

    expect({
      overall: [modelTwo!.scopes.overall.rank, modelTen!.scopes.overall.rank],
      reasoning: [
        sparseModel!.scopes.reasoning.rank,
        modelTwo!.scopes.reasoning.rank,
        modelTen!.scopes.reasoning.rank,
      ],
      coding: [
        sparseModel!.scopes.coding.rank,
        modelTwo!.scopes.coding.rank,
        modelTen!.scopes.coding.rank,
      ],
      math: [
        modelTwo!.scopes.math.rank,
        modelTen!.scopes.math.rank,
        sparseModel!.scopes.math.rank,
      ],
      agentic: [
        modelTwo!.scopes.agentic.rank,
        modelTen!.scopes.agentic.rank,
        sparseModel!.scopes.agentic.rank,
      ],
    }).toEqual({
      overall: [1, 2],
      reasoning: [1, 2, 3],
      coding: [1, 2, 3],
      math: [1, 2, null],
      agentic: [1, 2, null],
    });

    expect(sparseModel!.scopes.overall).toEqual({
      index: null,
      rank: null,
      coverageCount: 2,
      coverageTotal: 4,
      coverageRatio: 0.5,
    });
    expect(sparseModel!.scopes.reasoning).toEqual({
      index: 99,
      rank: 1,
      coverageCount: 1,
      coverageTotal: 1,
      coverageRatio: 1,
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
    }).toEqual(sparseModel!.scopes.overall);
  });
});
