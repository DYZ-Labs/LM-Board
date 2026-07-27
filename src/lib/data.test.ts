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
  const score = (
    modelId: string,
    benchmarkId: string,
    value: number,
    // Retrieval spread and self-reporting are fixture variables so the
    // dataset-window and provenance counts have something to be wrong about.
    { retrieved = "2026-07-22", selfReported = false } = {},
  ) => ({
    modelId,
    benchmarkId,
    value,
    source: {
      url: `https://example.com/scores/${modelId}/${benchmarkId}`,
      retrieved,
    },
    selfReported,
  });
  const scores = [
    ...benchmarks.map((benchmark) =>
      score("model-ten", benchmark.id, 80),
    ),
    ...benchmarks.map((benchmark) =>
      score("model-two", benchmark.id, 80),
    ),
    score("sparse-model", "reasoning-benchmark", 99, {
      retrieved: "2026-07-15",
    }),
    score("sparse-model", "coding-benchmark", 99),
    score("partial-model", "reasoning-benchmark", 60),
    score("partial-model", "coding-benchmark", 60),
    score("partial-model", "math-benchmark", 60, {
      retrieved: "2026-07-26",
      selfReported: true,
    }),
  ];

  return { models, benchmarks, scores };
});

vi.mock("../../data/models.json", () => ({ default: fixtures.models }));
vi.mock("../../data/benchmarks.json", () => ({
  default: fixtures.benchmarks,
}));
vi.mock("../../data/scores.json", () => ({ default: fixtures.scores }));

import { RANK_SCOPES } from "./categories";
import { summarizeChanges } from "./changes";
import { loadLeaderboardData } from "./data";
import {
  expandLeaderboardClientPayload,
  toLeaderboardClientPayload,
} from "./leaderboardPayload";

describe("loadLeaderboardData", () => {
  it("assembles the immutable dataset only once per build worker", () => {
    expect(loadLeaderboardData()).toBe(loadLeaderboardData());
  });

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
      rankedFieldSize: 3,
    });
    expect(sparseModel!.scopes.reasoning).toEqual({
      index: 99,
      rank: 1,
      coverageCount: 1,
      coverageTotal: 1,
      coverageRatio: 1,
      estimatedCount: 0,
      rankedFieldSize: 4,
    });
    expect(sparseModel!.scoresByBenchmark["reasoning-benchmark"]?.value).toBe(
      99,
    );
    expect(sparseModel!.scoresByBenchmark["math-benchmark"]).toBeNull();
    expect(sparseModel).not.toHaveProperty("index");
    expect(sparseModel).not.toHaveProperty("rank");
    expect(sparseModel).not.toHaveProperty("coverageCount");
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
      rankedFieldSize: 3,
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
      rankedFieldSize: 2,
    });
  });

  it("counts the ranked field a rank was measured against, per scope", () => {
    const data = loadLeaderboardData();
    const fieldSizes = Object.fromEntries(
      RANK_SCOPES.map((scope) => [
        scope,
        new Set(
          data.rows
            .filter((row) => row.scopes[scope].rank !== null)
            .map((row) => row.scopes[scope].rankedFieldSize),
        ),
      ]),
    );

    // One denominator per scope — every ranked row must agree on it.
    expect(
      Object.fromEntries(
        Object.entries(fieldSizes).map(([scope, sizes]) => [
          scope,
          [...sizes],
        ]),
      ),
    ).toEqual({
      overall: [3],
      reasoning: [4],
      coding: [4],
      math: [3],
      agentic: [2],
    });
    // A model that fails the gate still learns how big the field it missed is.
    expect(
      data.rows.find((row) => row.model.id === "sparse-model")!.scopes.agentic,
    ).toMatchObject({ rank: null, rankedFieldSize: 2 });
  });

  it("spans each benchmark over every measured score", () => {
    const data = loadLeaderboardData();

    expect(data.benchmarkDomains).toEqual({
      "reasoning-benchmark": { min: 60, max: 99 },
      "coding-benchmark": { min: 60, max: 99 },
      "math-benchmark": { min: 60, max: 80 },
      // Two models measured at 80 and one estimated below them: zero span,
      // because an estimate feeds the Index and never the measured field a bar
      // is scaled against. The bar encoding has to survive this rather than
      // divide by it.
      "agentic-benchmark": { min: 80, max: 80 },
    });
  });

  it("records the retrieval window and the provenance count", () => {
    const data = loadLeaderboardData();

    expect(data.oldestRetrieved).toBe("2026-07-15");
    expect(data.lastUpdated).toBe("2026-07-26");
    expect(data.selfReportedCount).toBe(1);
  });
});

describe("summarizeChanges", () => {
  it("reports the whole retrieval window, not only its last day", () => {
    const summary = summarizeChanges(loadLeaderboardData());

    expect(summary).toEqual({
      // The dataset spans eleven days; the single-day count is the sliver of
      // it the strip used to quote on its own.
      oldestRetrieved: "2026-07-15",
      newestRetrieved: "2026-07-26",
      refreshedScores: 1,
      recentModels: 4,
      providers: 4,
      lastUpdated: "2026-07-26",
      selfReportedCount: 1,
    });
  });
});

describe("leaderboard client payload", () => {
  it("round-trips the interactive data without repeated score keys", () => {
    const serverData = loadLeaderboardData();
    const payload = toLeaderboardClientPayload(serverData);
    const clientData = expandLeaderboardClientPayload(payload);
    const row = clientData.rows[0];
    const score = Object.values(row.scoresByBenchmark).find(
      (entry) => entry !== null,
    );
    const serverScore = Object.values(
      serverData.rows[0].scoresByBenchmark,
    ).find((entry) => entry !== null);

    expect(clientData).not.toHaveProperty("lastUpdated");
    expect(clientData).not.toHaveProperty("scoreCount");
    expect(clientData.benchmarks).toEqual(serverData.benchmarks);
    expect(clientData.labs).toEqual(serverData.labs);
    // Non-AA sources stay complete on the wire; the expansion below proves
    // that both complete references and the production `@slug` shorthand
    // resolve through the same path.
    expect(payload.sourceRefs).toContain(
      "https://example.com/scores/model-two/reasoning-benchmark",
    );
    expect(row.scopes).toEqual(serverData.rows[0].scopes);
    expect(row.rampByBenchmark).toEqual(
      serverData.rows[0].rampByBenchmark,
    );
    expect(score).toBeDefined();
    expect(score).toEqual({
      value: serverScore!.value,
      source: serverScore!.source,
      selfReported: serverScore!.selfReported,
    });
    expect(score).not.toHaveProperty("modelId");
    expect(score).not.toHaveProperty("benchmarkId");
    expect(score).not.toHaveProperty("reasoningEffort");
  });

  it("carries the benchmark domains as pairs aligned with the benchmarks", () => {
    const serverData = loadLeaderboardData();
    const payload = toLeaderboardClientPayload(serverData);

    expect(payload.domains).toEqual([
      [60, 99],
      [60, 99],
      [60, 80],
      [80, 80],
    ]);
    expect(payload.domains).toHaveLength(payload.benchmarks.length);
    expect(expandLeaderboardClientPayload(payload).benchmarkDomains).toEqual(
      serverData.benchmarkDomains,
    );
  });

  it("rebuilds the ranked field size and the scope leaders from the ranks", () => {
    const serverData = loadLeaderboardData();
    const payload = toLeaderboardClientPayload(serverData);
    const clientData = expandLeaderboardClientPayload(payload);

    // Neither is on the wire, so the only thing keeping them true is that they
    // are recomputed from the same ranks the server ranked with.
    expect(payload).not.toHaveProperty("rankedFieldSizes");
    expect(payload).not.toHaveProperty("leaders");
    expect(clientData.rows.map((row) => row.scopes)).toEqual(
      serverData.rows.map((row) => row.scopes),
    );

    const leadersFromServer = Object.fromEntries(
      RANK_SCOPES.map((scope) => {
        const row = serverData.rows.find(
          (entry) => entry.scopes[scope].rank === 1,
        );

        return [scope, row?.model.id ?? null];
      }),
    );

    expect(
      Object.fromEntries(
        RANK_SCOPES.map((scope) => [
          scope,
          clientData.leadersByScope[scope]?.modelId ?? null,
        ]),
      ),
    ).toEqual(leadersFromServer);
    // A tie at the top resolves the way the server-rendered headline resolves
    // it: the first row, not the first name.
    expect(clientData.leadersByScope.overall).toEqual({
      modelId: "model-ten",
      name: "Model 10",
      lab: "Lab Ten",
      index: 80,
      coverageCount: 4,
      coverageTotal: 4,
      estimatedCount: 0,
      rankedFieldSize: 3,
    });
    expect(clientData.leadersByScope.reasoning?.modelId).toBe("sparse-model");
  });
});
