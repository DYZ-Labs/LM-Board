import { describe, expect, it } from "vitest";

import { matchesSourceHost, validateDataIntegrity } from "./dataIntegrity";
import type { CandidateSource } from "./dataIntegrity";
import type {
  Benchmark,
  Candidate,
  Measurement,
  Model,
  Publisher,
} from "./schema";

const TODAY = new Date("2026-08-05T12:00:00Z");
const model: Model = {
  id: "model",
  name: "Model",
  lab: "Lab",
  releaseDate: "2026-07-28",
  openWeights: false,
  url: "https://example.com/model",
};
const independent: Publisher = {
  id: "independent",
  name: "Independent",
  url: "https://independent.example",
  sourceHosts: ["independent.example"],
  type: "independent",
  runsOwnEvals: true,
};
const otherIndependent: Publisher = {
  id: "other-independent",
  name: "Other Independent",
  url: "https://other-independent.example",
  sourceHosts: ["other-independent.example"],
  type: "independent",
  runsOwnEvals: true,
};
const vendor: Publisher = {
  id: "vendor",
  name: "Vendor",
  url: "https://vendor.example",
  sourceHosts: ["vendor.example"],
  type: "vendor",
  runsOwnEvals: true,
  vendorForLab: model.lab,
};
const publishers = [independent, otherIndependent, vendor];

describe("matchesSourceHost", () => {
  it.each([
    ["openai.com", "https://openai.com/index/gpt-5-6/", true],
    [
      "openai.com",
      "https://deploymentsafety.openai.com/gpt-5-6",
      false,
    ],
    ["openai.com", "https://evil-openai.com/index/x", false],
    [
      "huggingface.co/moonshotai",
      "https://huggingface.co/moonshotai/Kimi-K3",
      true,
    ],
    [
      "huggingface.co/moonshotai",
      "https://huggingface.co/moonshotai",
      true,
    ],
    [
      "huggingface.co/moonshotai",
      "https://huggingface.co/moonshotai-mirror/Kimi-K3",
      false,
    ],
    [
      "huggingface.co/moonshotai",
      "https://huggingface.co/deepseek-ai/X",
      false,
    ],
    [
      "huggingface.co/Qwen",
      "https://huggingface.co/qwen/Qwen3.5-397B-A17B",
      true,
    ],
    [
      "storage.googleapis.com/deepmind-media",
      "https://storage.googleapis.com/deepmind-media/gemini/x.pdf",
      true,
    ],
  ])("matches %s against %s as %s", (entry, url, expected) => {
    expect(matchesSourceHost(url, entry)).toBe(expected);
  });
});

function benchmark(id: string): Benchmark {
  return {
    id,
    name: id,
    category: "reasoning",
    description: `${id} description`,
    unit: "percent",
    sourceUrl: `https://example.com/${id}`,
  };
}

function measurement(
  benchmarkId: string,
  overrides: Partial<Measurement> = {},
): Measurement {
  const publisherId = overrides.publisherId ?? independent.id;
  const sourceHost =
    publisherId === vendor.id
      ? "vendor.example"
      : `${publisherId}.example`;

  return {
    modelId: model.id,
    benchmarkId,
    publisherId,
    value: 80,
    source: {
      url: `https://${sourceHost}/${benchmarkId}/score`,
      retrieved: "2026-07-28",
    },
    ...overrides,
  };
}

function validate(
  benchmarks: Benchmark[],
  measurements: Measurement[],
  options: {
    models?: Model[];
    publishers?: Publisher[];
    candidateSources?: CandidateSource[];
  } = {},
) {
  return validateDataIntegrity(
    options.models ?? [model],
    benchmarks,
    measurements,
    options.publishers ?? publishers,
    TODAY,
    options.candidateSources ?? [],
  );
}

describe("validateDataIntegrity errors", () => {
  it("rejects an active benchmark with no measurements", () => {
    expect(
      validate(
        [benchmark("measured"), benchmark("unmeasured")],
        [measurement("measured")],
      ).errors,
    ).toEqual(['Benchmark "unmeasured" has no score measurements']);
  });

  it("rejects Artificial Analysis as pricing provenance", () => {
    const pricedModel: Model = {
      ...model,
      pricing: {
        input: 1,
        output: 2,
        source: {
          url: "https://artificialanalysis.ai/models/model",
          retrieved: "2026-07-28",
        },
      },
    };

    expect(
      validate([benchmark("measured")], [measurement("measured")], {
        models: [pricedModel],
      }).errors,
    ).toContain(
      "models.json[0].pricing.source.url: pricing must use first-party documentation, not artificialanalysis.ai",
    );
  });

  it("rejects a pricing check that predates the model release", () => {
    const pricedModel: Model = {
      ...model,
      pricing: {
        input: 1,
        output: 2,
        source: {
          url: "https://example.com/pricing",
          retrieved: "2026-07-27",
        },
      },
    };

    expect(
      validate([benchmark("measured")], [measurement("measured")], {
        models: [pricedModel],
      }).errors,
    ).toContain(
      "models.json[0].pricing.source.retrieved: cannot predate model release 2026-07-28",
    );
  });

  it("allows one measurement per publisher and rejects a duplicate triple", () => {
    const measured = benchmark("measured");
    const distinctPublishers = validate(
      [measured],
      [
        measurement(measured.id),
        measurement(measured.id, { publisherId: otherIndependent.id }),
      ],
    );

    expect(
      distinctPublishers.errors.some((error) =>
        error.includes("duplicate measurement"),
      ),
    ).toBe(false);

    expect(
      validate(
        [measured],
        [measurement(measured.id), measurement(measured.id)],
      ).errors,
    ).toContain(
      "measurements.json[1]: duplicate measurement (model, measured, independent)",
    );
  });

  it("rejects an unknown publisher", () => {
    expect(
      validate(
        [benchmark("measured")],
        [measurement("measured", { publisherId: "missing" })],
      ).errors,
    ).toContain('measurements.json[0]: unknown publisherId "missing"');
  });

  it("requires every publisher type to use an allowed source host", () => {
    const independentMeasurement = measurement("measured", {
      source: {
        url: "https://results.example/measured",
        retrieved: "2026-08-05",
      },
    });

    expect(
      validate([benchmark("measured")], [independentMeasurement]).errors,
    ).toContain(
      'measurements.json[0].source.url: publisher "independent" rejected host "results.example"; allowed sourceHosts: "independent.example"',
    );
  });

  it("names every allowed entry when rejecting a publisher source", () => {
    const publisher = {
      ...vendor,
      sourceHosts: ["vendor.example", "huggingface.co/vendor"],
    };
    const vendorMeasurement = measurement("measured", {
      publisherId: vendor.id,
      source: {
        url: "https://huggingface.co/vendor-mirror/model-2",
        retrieved: "2026-08-05",
      },
    });

    expect(
      validate([benchmark("measured")], [vendorMeasurement], {
        publishers: [independent, otherIndependent, publisher],
      }).errors,
    ).toContain(
      'measurements.json[0].source.url: publisher "vendor" rejected host "huggingface.co"; allowed sourceHosts: "vendor.example", "huggingface.co/vendor"',
    );
  });

  it("allows a vendor publisher to report a rival model", () => {
    const otherLabModel = { ...model, lab: "Other Lab" };

    expect(
      validate(
        [benchmark("measured")],
        [measurement("measured", { publisherId: vendor.id })],
        { models: [otherLabModel] },
      ).errors,
    ).toEqual([]);
  });

  it("requires vendor publishers to identify their own lab", () => {
    const incompleteVendor = { ...vendor, vendorForLab: undefined };

    expect(
      validate(
        [benchmark("measured")],
        [measurement("measured", { publisherId: vendor.id })],
        { publishers: [independent, otherIndependent, incompleteVendor] },
      ).errors,
    ).toContain(
      'measurements.json[0]: vendor publisher "vendor" must declare vendorForLab',
    );
  });

  it("requires evidence everywhere after evidence-backed measurements begin", () => {
    const evidence = {
      quote: "| IFBench | 80 |",
      printedBenchmarkName: "IFBench",
      printedConditions: null,
      printedColumnHeader: "Model",
    };
    const result = validate(
      [benchmark("ifbench"), benchmark("other")],
      [measurement("ifbench", { evidence }), measurement("other")],
    );

    expect(result.errors).toContain(
      "measurements.json[1].evidence: required because measurements.json contains evidence-backed records",
    );
  });

  it("applies benchmark mapping rules retroactively to stored evidence", () => {
    const result = validate(
      [benchmark("ifbench")],
      [
        measurement("ifbench", {
          evidence: {
            quote: "| Terminal-Bench 2.1 | 80 |",
            printedBenchmarkName: "Terminal-Bench 2.1",
            printedConditions: null,
            printedColumnHeader: "Model",
          },
        }),
      ],
    );

    expect(result.errors).toContain(
      'measurements.json[0].evidence: printed benchmark maps to "terminal-bench-v2-1", not "ifbench"',
    );
  });

  it("rejects evidence whose printed benchmark is no longer accepted", () => {
    const result = validate(
      [benchmark("gpqa-diamond")],
      [
        measurement("gpqa-diamond", {
          evidence: {
            quote: "| GPQA | 80 |",
            printedBenchmarkName: "GPQA",
            printedConditions: null,
            printedColumnHeader: "Model",
          },
        }),
      ],
    );

    expect(
      result.errors.some((error) =>
        error.startsWith(
          "measurements.json[0].evidence: printed benchmark maps to reject",
        ),
      ),
    ).toBe(true);
  });

  it("checks reasoning effort across canonical scores only", () => {
    const benchmarks = [benchmark("one"), benchmark("two")];
    const result = validate(benchmarks, [
      measurement("one", { reasoningEffort: "high" }),
      measurement("one", {
        publisherId: vendor.id,
        reasoningEffort: "low",
      }),
      measurement("two", { reasoningEffort: "high" }),
    ]);

    expect(
      result.errors.some((error) => error.includes("reasoningEffort")),
    ).toBe(false);
  });

  it("rejects inconsistent reasoning effort across canonical scores", () => {
    const result = validate([benchmark("one"), benchmark("two")], [
      measurement("one", { reasoningEffort: "high" }),
      measurement("two", { reasoningEffort: "low" }),
    ]);

    expect(result.errors).toContain(
      'Canonical scores for model "model" must all use the same reasoningEffort or all omit it',
    );
  });
});

describe("validateDataIntegrity warnings", () => {
  it("reports a vendor-only cell without turning it into an error", () => {
    const result = validate(
      [benchmark("measured")],
      [measurement("measured", { publisherId: vendor.id })],
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain(
      "Vendor-only cell (model, measured): no independent or benchmark-author measurement",
    );
  });

  it("reports a cell whose newest retrieval is more than 90 days old", () => {
    const result = validate([benchmark("measured")], [
      measurement("measured", {
        source: {
          url: "https://independent.example/measured",
          retrieved: "2026-05-01",
        },
      }),
      measurement("measured", {
        publisherId: otherIndependent.id,
        source: {
          url: "https://other-independent.example/measured",
          retrieved: "2026-05-06",
        },
      }),
    ]);

    expect(result.warnings).toContain(
      "Stale cell (model, measured): newest retrieval 2026-05-06 is more than 90 days old",
    );
  });

  it("uses the newest retrieval when deciding whether a cell is stale", () => {
    const result = validate([benchmark("measured")], [
      measurement("measured", {
        source: {
          url: "https://independent.example/measured",
          retrieved: "2026-01-01",
        },
      }),
      measurement("measured", {
        publisherId: otherIndependent.id,
        source: {
          url: "https://other-independent.example/measured",
          retrieved: "2026-08-01",
        },
      }),
    ]);

    expect(
      result.warnings.some((warning) => warning.startsWith("Stale cell")),
    ).toBe(false);
  });

  it("reports publisher disagreement above five points", () => {
    const result = validate([benchmark("measured")], [
      measurement("measured", { value: 80 }),
      measurement("measured", {
        publisherId: otherIndependent.id,
        value: 86,
      }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain(
      'High-spread cell (model, measured): "independent" (80) and "other-independent" (86) differ by 6 points',
    );
  });

  it("sorts publisher disagreement warnings by largest spread first", () => {
    const result = validate(
      [benchmark("smaller"), benchmark("larger")],
      [
        measurement("smaller", { value: 80 }),
        measurement("smaller", {
          publisherId: otherIndependent.id,
          value: 86,
        }),
        measurement("larger", { value: 60 }),
        measurement("larger", {
          publisherId: otherIndependent.id,
          value: 80,
        }),
      ],
    );
    const disagreements = result.warnings.filter((warning) =>
      warning.startsWith("High-spread cell"),
    );

    expect(disagreements[0]).toContain("(model, larger)");
    expect(disagreements[1]).toContain("(model, smaller)");
  });

  it("reports pending candidate counts per source", () => {
    const pendingCandidate: Candidate = {
      ...measurement("measured"),
      evidence: {
        quote: "| IFBench | 80 |",
        printedBenchmarkName: "IFBench",
        printedConditions: null,
        printedColumnHeader: "Model",
      },
      extractedBy: "agent",
      review: "pending",
    };
    const acceptedCandidate = {
      ...pendingCandidate,
      review: "accepted" as const,
    };
    const result = validate(
      [benchmark("measured")],
      [measurement("measured")],
      {
        candidateSources: [
          {
            sourceSlug: "vendor-page",
            candidates: [
              pendingCandidate,
              { ...pendingCandidate },
              acceptedCandidate,
            ],
          },
        ],
      },
    );

    expect(result.warnings).toContain(
      'Pending candidates for source "vendor-page": 2',
    );
  });
});
