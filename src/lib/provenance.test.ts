import { describe, expect, it } from "vitest";

import { resolveMeasurements } from "./provenance";
import type { Measurement, Publisher } from "./schema";

const publishers: Publisher[] = [
  {
    id: "independent-a",
    name: "Independent A",
    url: "https://independent-a.example",
    type: "independent",
    runsOwnEvals: true,
  },
  {
    id: "independent-b",
    name: "Independent B",
    url: "https://independent-b.example",
    type: "independent",
    runsOwnEvals: true,
  },
  {
    id: "independent-c",
    name: "Independent C",
    url: "https://independent-c.example",
    type: "independent",
    runsOwnEvals: true,
  },
  {
    id: "benchmark-author",
    name: "Benchmark Author",
    url: "https://benchmark.example",
    type: "benchmark-author",
    runsOwnEvals: true,
  },
  {
    id: "vendor",
    name: "Vendor",
    url: "https://vendor.example",
    type: "vendor",
    runsOwnEvals: true,
    vendorForLab: "Vendor Lab",
  },
];

function measurement(
  publisherId: string,
  value: number,
  retrieved = "2026-08-01",
): Measurement {
  return {
    modelId: "model",
    benchmarkId: "benchmark",
    publisherId,
    value,
    source: {
      url: `https://${publisherId}.example/results`,
      retrieved,
    },
  };
}

describe("resolveMeasurements", () => {
  it("resolves a single measurement without alternates or spread", () => {
    const [score] = resolveMeasurements(
      [measurement("independent-a", 80)],
      publishers,
    );

    expect(score).toMatchObject({
      publisherId: "independent-a",
      value: 80,
      publisher: publishers[0],
      alternates: [],
      spread: null,
      unverified: false,
      selfReported: false,
    });
  });

  it("prefers an independent measurement over a vendor measurement", () => {
    const [score] = resolveMeasurements(
      [
        measurement("vendor", 95, "2026-08-05"),
        measurement("independent-a", 85, "2026-07-01"),
      ],
      publishers,
    );

    expect(score.publisherId).toBe("independent-a");
    expect(score.alternates[0]?.publisherId).toBe("vendor");
    expect(score.spread).toBe(10);
  });

  it("orders every publisher type by the published precedence", () => {
    const [score] = resolveMeasurements(
      [
        measurement("vendor", 95),
        measurement("benchmark-author", 90),
        measurement("independent-a", 85),
      ],
      publishers,
    );

    expect([
      score.publisherId,
      ...score.alternates.map(({ publisherId }) => publisherId),
    ]).toEqual(["independent-a", "benchmark-author", "vendor"]);
  });

  it("prefers the newest measurement when publisher types match", () => {
    const [score] = resolveMeasurements(
      [
        measurement("independent-a", 80, "2026-08-01"),
        measurement("independent-b", 82, "2026-08-02"),
      ],
      publishers,
    );

    expect(score.publisherId).toBe("independent-b");
    expect(score.alternates[0]?.publisherId).toBe("independent-a");
  });

  it("breaks a full three-way tie by publisherId", () => {
    const [score] = resolveMeasurements(
      [
        measurement("independent-b", 82),
        measurement("independent-c", 84),
        measurement("independent-a", 80),
      ],
      publishers,
    );

    expect(score.publisherId).toBe("independent-a");
    expect(score.alternates.map(({ publisherId }) => publisherId)).toEqual([
      "independent-b",
      "independent-c",
    ]);
  });

  it("marks a vendor-only cell unverified", () => {
    const [score] = resolveMeasurements(
      [measurement("vendor", 95)],
      publishers,
    );

    expect(score.unverified).toBe(true);
    expect(score.selfReported).toBe(true);
    expect(score.spread).toBeNull();
  });
});
