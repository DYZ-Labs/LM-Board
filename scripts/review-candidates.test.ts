import { describe, expect, it } from "vitest";

import type { CandidateFile } from "../src/lib/schema";
import {
  applyReviewDecision,
  formatCandidateForReview,
} from "./review-candidates";

const candidateFile: CandidateFile = {
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
      evidence: {
        quote: "| Terminal-Bench 2.1 | 80 |",
        printedBenchmarkName: "Terminal-Bench 2.1",
        printedConditions: "max effort",
        printedColumnHeader: "Model (max)",
      },
      extractedBy: "agent",
      review: "pending",
    },
  ],
};

describe("candidate review helpers", () => {
  it("shows every field required for a source check", () => {
    const display = formatCandidateForReview(
      candidateFile.candidates[0]!,
      1,
      1,
    );

    expect(display).toContain("Model: model");
    expect(display).toContain("Benchmark: terminal-bench-v2-1");
    expect(display).toContain("Value: 80");
    expect(display).toContain("Publisher: vendor");
    expect(display).toContain("Quote: | Terminal-Bench 2.1 | 80 |");
    expect(display).toContain("Printed benchmark: Terminal-Bench 2.1");
    expect(display).toContain("Printed conditions: max effort");
    expect(display).toContain("Column header: Model (max)");
    expect(display).toContain("Source: https://vendor.example/results");
  });

  it("records a decision and optional note without changing evidence", () => {
    const updated = applyReviewDecision(
      candidateFile,
      0,
      "accepted",
      "  Quote checked on page  ",
    );

    expect(updated.candidates[0]).toMatchObject({
      review: "accepted",
      reviewNote: "Quote checked on page",
      evidence: candidateFile.candidates[0]!.evidence,
    });
    expect(candidateFile.candidates[0]!.review).toBe("pending");
  });
});
