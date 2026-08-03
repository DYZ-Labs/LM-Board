import { describe, expect, it } from "vitest";

import { ModelSchema } from "./schema";

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
