import { describe, expect, it } from "vitest";

import { validateDataIntegrity } from "./dataIntegrity";
import type { Benchmark, Model, Score } from "./schema";

const model: Model = {
  id: "model",
  name: "Model",
  lab: "Lab",
  releaseDate: "2026-07-28",
  openWeights: false,
  url: "https://example.com/model",
};

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

function score(benchmarkId: string): Score {
  return {
    modelId: model.id,
    benchmarkId,
    value: 80,
    source: {
      url: `https://example.com/${benchmarkId}/score`,
      retrieved: "2026-07-28",
    },
    selfReported: false,
  };
}

describe("validateDataIntegrity", () => {
  it("rejects an active benchmark with no score measurements", () => {
    expect(
      validateDataIntegrity(
        [model],
        [benchmark("measured"), benchmark("unmeasured")],
        [score("measured")],
      ),
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
      validateDataIntegrity(
        [pricedModel],
        [benchmark("measured")],
        [score("measured")],
      ),
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
      validateDataIntegrity(
        [pricedModel],
        [benchmark("measured")],
        [score("measured")],
      ),
    ).toContain(
      "models.json[0].pricing.source.retrieved: cannot predate model release 2026-07-28",
    );
  });
});
