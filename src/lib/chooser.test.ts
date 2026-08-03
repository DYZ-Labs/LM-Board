import { describe, expect, it } from "vitest";

import {
  CHOOSER_TASKS,
  DEFAULT_CHOOSER_STATE,
  buildChooserShortlist,
  canonicalizeChooserUrl,
  chooserStateFromSearchParams,
  chooserStateToUrl,
  expandChooserPayload,
  toChooserPayload,
  type ChooserModel,
  type ChooserState,
} from "./chooser";
import { loadLeaderboardData } from "./data";

function candidate(
  id: string,
  options: {
    index?: number | null;
    input?: number | null;
    output?: number;
    context?: number | null;
    open?: boolean;
    name?: string;
  } = {},
): ChooserModel {
  const index = options.index === undefined ? 80 : options.index;
  const scope = {
    index,
    rank: index === null ? null : 1,
    coverageCount: index === null ? 1 : 4,
    coverageTotal: 4,
    estimatedCount: index === null ? 0 : 1,
    rankedFieldSize: index === null ? 0 : 10,
  };
  return {
    id,
    name: options.name ?? id,
    lab: "Lab",
    openWeights: options.open ?? false,
    contextWindow: options.context === undefined ? 128000 : options.context,
    pricing:
      options.input === null
        ? null
        : {
            input: options.input ?? 1,
            output: options.output ?? 2,
            source: {
              url: `https://example.com/${id}/pricing`,
              retrieved: "2026-08-03",
            },
          },
    scopes: Object.fromEntries(CHOOSER_TASKS.map((task) => [task, { ...scope }])) as ChooserModel["scopes"],
  };
}

function state(overrides: Partial<ChooserState> = {}): ChooserState {
  return { ...DEFAULT_CHOOSER_STATE, ...overrides };
}

describe("chooser URL state", () => {
  it("round-trips every field, normalizes decimals, and preserves foreign parameters", () => {
    const input = new URL(
      "https://example.test/choose?task=coding&access=api&context=400k&input=2.00&output=10.500&utm_source=test",
    );
    const parsed = chooserStateFromSearchParams(input.searchParams);
    const output = chooserStateToUrl(input, parsed);

    expect(parsed).toEqual({
      task: "coding",
      access: "api",
      minContext: 400000,
      maxInputPrice: 2,
      maxOutputPrice: 10.5,
    });
    expect(output.searchParams.get("input")).toBe("2");
    expect(output.searchParams.get("output")).toBe("10.5");
    expect(output.searchParams.get("utm_source")).toBe("test");
  });

  it("omits defaults and discards invalid, negative, and non-finite values", () => {
    const input = new URL(
      "https://example.test/choose?task=stale&access=hosted&context=128000&input=-1&output=Infinity&campaign=x",
    );
    const output = canonicalizeChooserUrl(input);

    expect(chooserStateFromSearchParams(input.searchParams)).toEqual(
      DEFAULT_CHOOSER_STATE,
    );
    expect(output.search).toBe("?campaign=x");
  });

  it("keeps inclusive zero price caps", () => {
    const input = new URL("https://example.test/choose?input=0&output=0");
    expect(chooserStateFromSearchParams(input.searchParams)).toMatchObject({
      maxInputPrice: 0,
      maxOutputPrice: 0,
    });
  });
});

describe("chooser eligibility", () => {
  const models = [
    candidate("api", { input: 2, output: 4, context: 200000 }),
    candidate("open", { input: null, open: true, context: 400000 }),
    candidate("both", { input: 1, output: 3, open: true, context: 1000000 }),
    candidate("neither", { input: null, open: false, context: 1000000 }),
    candidate("unknown-context", { input: 1, context: null }),
    candidate("unranked", { input: 1, context: 400000, index: null }),
  ];

  it("defines any, API, and open access exactly", () => {
    expect(buildChooserShortlist(models, state()).counts.afterAccess).toBe(5);
    expect(
      buildChooserShortlist(models, state({ access: "api" })).counts.afterAccess,
    ).toBe(4);
    expect(
      buildChooserShortlist(models, state({ access: "open" })).counts.afterAccess,
    ).toBe(2);
  });

  it("excludes unknown context only when a floor is applied and keeps the boundary", () => {
    const result = buildChooserShortlist(
      models,
      state({ minContext: 400000 }),
    );
    expect(result.counts).toMatchObject({ afterAccess: 5, afterContext: 3 });
  });

  it("requires listed API pricing for either inclusive price cap", () => {
    const result = buildChooserShortlist(
      models,
      state({ maxInputPrice: 1, maxOutputPrice: 3 }),
    );
    expect(result.counts).toMatchObject({
      afterAccess: 5,
      afterContext: 5,
      afterPrice: 3,
      afterCoverage: 2,
      unrankedExcluded: 1,
    });
  });

  it("reports an empty result at each filtering stage without relaxing state", () => {
    const result = buildChooserShortlist(
      models,
      state({ access: "api", minContext: 1000000, maxInputPrice: 0 }),
    );
    expect(result.cards).toEqual([]);
    expect(result.counts).toEqual({
      total: 6,
      afterAccess: 4,
      afterContext: 1,
      afterPrice: 0,
      afterCoverage: 0,
      unrankedExcluded: 0,
    });
  });
});

describe("deterministic shortlist", () => {
  it("attaches multiple winner labels once and backfills to four in capability order", () => {
    const models = [
      candidate("leader", { index: 99, input: 0.5, context: 1000000, open: true }),
      candidate("second", { index: 98, input: 3, context: 200000 }),
      candidate("third", { index: 97, input: 4, context: 128000 }),
      candidate("fourth", { index: 96, input: 5, context: 128000 }),
      candidate("fifth", { index: 95, input: 6, context: 128000 }),
    ];
    const result = buildChooserShortlist(models, state());

    expect(result.cards.map((card) => card.model.id)).toEqual([
      "leader",
      "second",
      "third",
      "fourth",
    ]);
    expect(result.cards[0].labels).toEqual([
      "Capability leader",
      "Lowest input price",
      "Largest context",
      "Open-weights leader",
    ]);
    expect(result.cards.slice(1).every((card) =>
      card.labels.includes("Next-highest capability"),
    )).toBe(true);
    expect(result.cards.map((card) => card.gapFromLeader)).toEqual([0, 1, 2, 3]);
  });

  it("applies every objective tie-break deterministically", () => {
    const models = [
      candidate("zulu", { name: "Zulu", index: 90, input: 2, output: 1, context: 400000, open: true }),
      candidate("alpha", { name: "Alpha", index: 90, input: 1, output: 5, context: 400000, open: true }),
      candidate("beta", { name: "Beta", index: 89, input: 1, output: 4, context: 400000 }),
      candidate("huge", { name: "Huge", index: 88, input: 8, context: 1000000 }),
    ];
    const result = buildChooserShortlist(models, state());

    expect(result.capabilityLeader?.id).toBe("alpha");
    expect(
      result.cards.find((card) => card.labels.includes("Lowest input price"))?.model.id,
    ).toBe("beta");
    expect(
      result.cards.find((card) => card.labels.includes("Largest context"))?.model.id,
    ).toBe("huge");
    expect(
      result.cards.find((card) => card.labels.includes("Open-weights leader"))?.model.id,
    ).toBe("alpha");
  });
});

describe("chooser payload", () => {
  it("packs and expands the route projection without benchmark data or unrelated sources", () => {
    const data = loadLeaderboardData();
    const payload = toChooserPayload(data);
    const expanded = expandChooserPayload(payload);
    const first = data.rows[0];
    const projectedFirst = expanded.find((model) => model.id === first.model.id)!;

    expect(projectedFirst).toMatchObject({
      id: first.model.id,
      name: first.model.name,
      lab: first.model.lab,
      openWeights: first.model.openWeights,
      contextWindow: first.model.contextWindow ?? null,
      pricing: first.model.pricing ?? null,
    });
    for (const task of CHOOSER_TASKS) {
      expect(projectedFirst.scopes[task]).toEqual({
        index: first.scopes[task].index,
        rank: first.scopes[task].rank,
        coverageCount: first.scopes[task].coverageCount,
        coverageTotal: first.scopes[task].coverageTotal,
        estimatedCount: first.scopes[task].estimatedCount,
        rankedFieldSize: first.scopes[task].rankedFieldSize,
      });
    }

    const serialized = JSON.stringify(payload);
    const measured = Object.values(first.scoresByBenchmark).find((score) => score);
    expect(serialized).not.toContain("scoresByBenchmark");
    expect(serialized).not.toContain("settings");
    if (measured) expect(serialized).not.toContain(measured.source.url);
  });
});
