import { describe, expect, it } from "vitest";

import {
  CandidateFileSchema,
  CandidateSchema,
  MeasurementSchema,
  ModelSchema,
  PublisherSchema,
} from "./schema";

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
    sourceHosts: ["publisher.example"],
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

  it("requires at least one non-empty source host entry", () => {
    expect(
      PublisherSchema.safeParse({ ...publisher, sourceHosts: [] }).success,
    ).toBe(false);
    expect(
      PublisherSchema.safeParse({ ...publisher, sourceHosts: ["   "] })
        .success,
    ).toBe(false);
  });
});

describe("CandidateSchema", () => {
  const candidate = {
    modelId: "moonshot-kimi-k3",
    benchmarkId: "terminal-bench-v2-1",
    publisherId: "moonshot",
    value: 88.3,
    source: {
      url: "https://huggingface.co/moonshotai/Kimi-K3",
      retrieved: "2026-08-05",
    },
    harness: "Kimi Code",
    reasoningEffort: "max",
    evidence: {
      quote:
        "| Terminal-Bench 2.1 | 88.3 | 88.0 | 88.8 | 84.6 | 83.4 | 82.7 |",
      printedBenchmarkName: "Terminal-Bench 2.1",
      printedConditions:
        "reasoning effort max, temperature = 1.0, top-p = 1.0",
      printedColumnHeader: "Kimi K3 (max)",
    },
    extractedBy: "agent",
    review: "pending",
  } as const;

  it("accepts a strict candidate with verbatim evidence", () => {
    expect(CandidateSchema.parse(candidate)).toEqual(candidate);
  });

  it("requires evidence on candidates while allowing legacy measurements", () => {
    const withoutEvidence = Object.fromEntries(
      Object.entries(candidate).filter(([key]) => key !== "evidence"),
    );

    expect(CandidateSchema.safeParse(withoutEvidence).success).toBe(false);
    expect(MeasurementSchema.safeParse(withoutEvidence).success).toBe(false);
    expect(
      MeasurementSchema.safeParse({
        modelId: candidate.modelId,
        benchmarkId: candidate.benchmarkId,
        publisherId: candidate.publisherId,
        value: candidate.value,
        source: candidate.source,
      }).success,
    ).toBe(true);
  });

  it("rejects empty or structurally altered evidence", () => {
    expect(
      CandidateSchema.safeParse({
        ...candidate,
        evidence: { ...candidate.evidence, quote: "   " },
      }).success,
    ).toBe(false);
    expect(
      CandidateSchema.safeParse({
        ...candidate,
        evidence: { ...candidate.evidence, normalizedQuote: "tidied" },
      }).success,
    ).toBe(false);
  });

  it("accepts a review decision and rejects unknown workflow fields", () => {
    expect(
      CandidateSchema.safeParse({
        ...candidate,
        review: "rejected",
        reviewNote: "Column header does not identify a curated model",
      }).success,
    ).toBe(true);
    expect(
      CandidateSchema.safeParse({ ...candidate, approved: true }).success,
    ).toBe(false);
  });

  it("allows a noted empty page and requires every record to match its source", () => {
    expect(
      CandidateFileSchema.safeParse({
        source: candidate.source,
        note: "No parseable comparison table was found; no values were inferred.",
        candidates: [],
      }).success,
    ).toBe(true);
    expect(
      CandidateFileSchema.safeParse({
        source: candidate.source,
        candidates: [
          {
            ...candidate,
            source: { ...candidate.source, retrieved: "2026-08-04" },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
