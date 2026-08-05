import { describe, expect, it } from "vitest";

import { MeasurementSchema, ModelSchema, PublisherSchema } from "./schema";

const pricedModel = {
  id: "priced-model",
  name: "Priced Model",
  lab: "Provider",
  releaseDate: "2026-08-01",
  openWeights: false,
  pricing: {
    input: 1.25,
    output: 5,
    source: {
      url: "https://provider.example/pricing",
      retrieved: "2026-08-03",
    },
  },
  url: "https://provider.example/models/priced-model",
};

describe("ModelSchema pricing provenance", () => {
  it("accepts a strict sourced price", () => {
    expect(ModelSchema.parse(pricedModel).pricing).toEqual(pricedModel.pricing);
  });

  it("rejects legacy unsourced pricing and unknown provenance fields", () => {
    expect(
      ModelSchema.safeParse({
        ...pricedModel,
        pricing: { input: 1.25, output: 5 },
      }).success,
    ).toBe(false);
    expect(
      ModelSchema.safeParse({
        ...pricedModel,
        pricing: {
          ...pricedModel.pricing,
          source: { ...pricedModel.pricing.source, publisher: "Provider" },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects non-HTTP source URLs and invalid calendar dates", () => {
    expect(
      ModelSchema.safeParse({
        ...pricedModel,
        pricing: {
          ...pricedModel.pricing,
          source: { url: "ftp://provider.example/pricing", retrieved: "2026-08-03" },
        },
      }).success,
    ).toBe(false);
    expect(
      ModelSchema.safeParse({
        ...pricedModel,
        pricing: {
          ...pricedModel.pricing,
          source: { url: "https://provider.example/pricing", retrieved: "2026-02-30" },
        },
      }).success,
    ).toBe(false);
  });
});

describe("publisher and measurement schemas", () => {
  const publisher = {
    id: "independent-publisher",
    name: "Independent Publisher",
    url: "https://publisher.example",
    type: "independent",
    runsOwnEvals: true,
  };
  const measurement = {
    modelId: "model",
    benchmarkId: "benchmark",
    publisherId: publisher.id,
    value: 82.5,
    source: {
      url: "https://publisher.example/results/model",
      retrieved: "2026-08-05",
    },
    harness: "Example harness",
  };

  it("accepts strict publisher and measurement records", () => {
    expect(PublisherSchema.parse(publisher)).toEqual(publisher);
    expect(MeasurementSchema.parse(measurement)).toEqual(measurement);
  });

  it("rejects selfReported and unknown publisher fields", () => {
    expect(
      MeasurementSchema.safeParse({ ...measurement, selfReported: false })
        .success,
    ).toBe(false);
    expect(PublisherSchema.safeParse({ ...publisher, rank: 1 }).success).toBe(
      false,
    );
  });
});
