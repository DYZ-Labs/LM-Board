import { describe, expect, it } from "vitest";

import type { CandidateFile, Measurement } from "../src/lib/schema";
import { buildPromotionPlan } from "./promote-candidates";

function candidateFile(review: "pending" | "accepted" | "rejected"): CandidateFile {
  return {
    source: {
      url: "https://vendor.example/results",
      retrieved: "2026-08-05",
    },
    candidates: [
      {
        modelId: "model",
        benchmarkId: "terminal-bench-v2-1",
        publisherId: "vendor",
        value: 80,
        source: {
          url: "https://vendor.example/results",
          retrieved: "2026-08-05",
        },
        harness: "Vendor harness",
        evidence: {
          quote: "| Terminal-Bench 2.1 | 80 |",
          printedBenchmarkName: "Terminal-Bench 2.1",
          printedConditions: null,
          printedColumnHeader: "Model",
        },
        extractedBy: "agent",
        review,
        reviewNote: "Human decision",
      },
    ],
  };
}

describe("buildPromotionPlan", () => {
  it("refuses partial promotion while the source has a pending record", () => {
    expect(() => buildPromotionPlan([], candidateFile("pending"))).toThrow(
      "Promotion refused: source still has 1 pending candidate(s)",
    );
  });

  it("promotes accepted records with evidence and strips workflow fields", () => {
    const plan = buildPromotionPlan([], candidateFile("accepted"));

    expect(plan.additions).toEqual([
      {
        modelId: "model",
        benchmarkId: "terminal-bench-v2-1",
        publisherId: "vendor",
        value: 80,
        source: {
          url: "https://vendor.example/results",
          retrieved: "2026-08-05",
        },
        harness: "Vendor harness",
        evidence: {
          quote: "| Terminal-Bench 2.1 | 80 |",
          printedBenchmarkName: "Terminal-Bench 2.1",
          printedConditions: null,
          printedColumnHeader: "Model",
        },
      },
    ]);
    expect(plan.additions[0]).not.toHaveProperty("review");
    expect(plan.additions[0]).not.toHaveProperty("reviewNote");
    expect(plan.additions[0]).not.toHaveProperty("extractedBy");
  });

  it("omits rejected records and refuses duplicate triples", () => {
    const existing: Measurement = {
      modelId: "other-model",
      benchmarkId: "terminal-bench-v2-1",
      publisherId: "vendor",
      value: 79,
      source: {
        url: "https://vendor.example/old-results",
        retrieved: "2026-08-01",
      },
    };
    expect(
      buildPromotionPlan([existing], candidateFile("rejected")).additions,
    ).toEqual([]);

    const duplicate = { ...existing, modelId: "model" };
    expect(() =>
      buildPromotionPlan([duplicate], candidateFile("accepted")),
    ).toThrow("duplicate measurement (model, terminal-bench-v2-1, vendor)");
  });

  it("refuses a mixed legacy/evidence dataset and remapped evidence", () => {
    const legacy: Measurement = {
      modelId: "legacy-model",
      benchmarkId: "terminal-bench-v2-1",
      publisherId: "vendor",
      value: 70,
      source: {
        url: "https://vendor.example/legacy-results",
        retrieved: "2026-08-01",
      },
    };

    expect(() =>
      buildPromotionPlan([legacy], candidateFile("accepted")),
    ).toThrow("would mix evidence-backed and legacy measurements");

    const remapped = candidateFile("accepted");
    remapped.candidates[0] = {
      ...remapped.candidates[0]!,
      benchmarkId: "ifbench",
    };
    expect(() => buildPromotionPlan([], remapped)).toThrow(
      'printed benchmark does not map to "ifbench"',
    );
  });
});
