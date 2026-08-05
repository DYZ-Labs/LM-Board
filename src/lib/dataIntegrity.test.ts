import { describe, expect, it } from "vitest";

import { validateDataIntegrity } from "./dataIntegrity";
import type {
  Benchmark,
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
  type: "independent",
  runsOwnEvals: true,
};
const otherIndependent: Publisher = {
  id: "other-independent",
  name: "Other Independent",
  url: "https://other-independent.example",
  type: "independent",
  runsOwnEvals: true,
};
const vendor: Publisher = {
  id: "vendor",
  name: "Vendor",
  url: "https://vendor.example",
  type: "vendor",
  runsOwnEvals: true,
  vendorForLab: model.lab,
};
const publishers = [independent, otherIndependent, vendor];

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
  } = {},
) {
  return validateDataIntegrity(
    options.models ?? [model],
    benchmarks,
    measurements,
    options.publishers ?? publishers,
    TODAY,
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

  it("requires vendor measurements to use the publisher host", () => {
    const vendorMeasurement = measurement("measured", {
      publisherId: vendor.id,
      source: {
        url: "https://results.example/measured",
        retrieved: "2026-08-05",
      },
    });

    expect(
      validate([benchmark("measured")], [vendorMeasurement]).errors,
    ).toContain(
      'measurements.json[0].source.url: vendor publisher "vendor" must use host "vendor.example", not "results.example"',
    );
  });

  it("requires a vendor publisher to match the model lab", () => {
    const otherLabModel = { ...model, lab: "Other Lab" };

    expect(
      validate(
        [benchmark("measured")],
        [measurement("measured", { publisherId: vendor.id })],
        { models: [otherLabModel] },
      ).errors,
    ).toContain(
      'measurements.json[0]: vendor publisher "vendor" is for lab "Lab", not model "model" lab "Other Lab"',
    );
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
      "High-spread cell (model, measured): publisher measurements span 6 points (80 to 86)",
    );
  });
});
